/**
 * Definition Provider for Blade Language Server
 *
 * Go-to-definition and find-references for variables and components.
 *
 * Both were fully implemented and unit-tested, and neither was reachable: the
 * server declared `definitionProvider` and `referencesProvider` and answered
 * both requests with `null` behind a "will be implemented" comment, so F12 on a
 * component tag reported "No definition found" instead of falling through to
 * VS Code's word search. Being unreachable also hid a bug - references built a
 * `RegExp` from a word that may itself begin with `$`, producing `\\$$user\\b`,
 * a mid-pattern end anchor that matches nothing. References now come from the
 * expression AST, whose positions are absolute and exact, rather than from a
 * regular expression over the raw text.
 */

import type { ExprAst, TemplateNode } from '@bladets/template';
import { expressionsOf, walkExpressions, walkNodes } from '@bladets/template';
import type { BladeDocument, Position, Range } from '../types.js';
import type { ProjectLspContext } from '../project-context.js';
import {
  getWordAtOffset,
  offsetOfPosition,
  positionOfOffset,
} from '../document.js';
import { resolveContext } from '../analyzer/context.js';
import { findVariableAtOffset } from '../analyzer/scope.js';
import { pathToFileURL } from 'url';

/**
 * Location result for definition lookup
 */
export interface DefinitionLocation {
  uri: string;
  range: Range;
}

/**
 * Find definition for the symbol at the given position
 *
 * @param doc - The document to search in
 * @param position - Cursor position
 * @param projectContext - Optional project context for cross-file navigation
 */
export function findDefinition(
  doc: BladeDocument,
  position: Position,
  projectContext?: ProjectLspContext | null
): DefinitionLocation | null {
  const offset = offsetOfPosition(doc, position);
  const context = resolveContext(doc, offset);
  const wordInfo = getWordAtOffset(doc.content, offset);
  if (!wordInfo) return null;

  const name = stripSigil(wordInfo.word);

  // A component tag, wherever the cursor is inside it.
  const tagName = context.tagName;
  if (tagName && isComponentName(tagName)) {
    return (
      findLocalComponent(doc, tagName) ??
      findProjectComponentDefinition(tagName, projectContext)
    );
  }

  // A variable, resolved in the scope in force at the cursor rather than
  // anywhere in the document: a `@for` item shadows a prop of the same name.
  if (context.kind === 'expression' || context.kind === 'expression-path') {
    const variable = findVariableAtOffset(doc.scope, name, offset);
    if (variable) {
      return { uri: doc.uri, range: rangeOf(variable.location) };
    }
  }

  // A PascalCase word outside a tag: still a component reference.
  if (isComponentName(name)) {
    return (
      findLocalComponent(doc, name) ??
      findProjectComponentDefinition(name, projectContext)
    );
  }

  return null;
}

/** A component defined by a `<template:Name>` in this very document. */
function findLocalComponent(
  doc: BladeDocument,
  name: string
): DefinitionLocation | null {
  const definition = doc.components.get(name);
  return definition
    ? { uri: doc.uri, range: rangeOf(definition.location) }
    : null;
}

/**
 * Find definition for a project component (cross-file navigation)
 *
 * @param componentName - The component tag name (e.g., "Button" or "Form.Input")
 * @param projectContext - The project context with discovered components
 * @returns Definition location or null if not found
 */
function findProjectComponentDefinition(
  componentName: string,
  projectContext: ProjectLspContext | undefined | null
): DefinitionLocation | null {
  const componentInfo = projectContext?.components.get(componentName);
  if (!componentInfo || !componentInfo.filePath) {
    return null;
  }

  // The component is the whole file, so its definition is the file's start.
  return {
    uri: pathToFileURL(componentInfo.filePath).href,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
}

/**
 * Gets the component definition location for a given component name.
 * Exported for use in LSP server.
 *
 * @param componentName - The component tag name
 * @param projectContext - The project context
 * @returns Definition location or null
 */
export function getComponentDefinition(
  componentName: string,
  projectContext: ProjectLspContext
): DefinitionLocation | null {
  return findProjectComponentDefinition(componentName, projectContext);
}

/**
 * Find all references to the symbol at the given position.
 *
 * @param doc - The document to search
 * @param position - Cursor position
 * @param includeDeclaration - Whether to include the declaration itself
 */
export function findReferences(
  doc: BladeDocument,
  position: Position,
  includeDeclaration: boolean = true
): DefinitionLocation[] {
  const offset = offsetOfPosition(doc, position);
  const wordInfo = getWordAtOffset(doc.content, offset);
  if (!wordInfo) return [];

  const name = stripSigil(wordInfo.word);
  const references: DefinitionLocation[] = [];

  if (isComponentName(name)) {
    for (const usage of doc.scope.componentUsages) {
      if (usage.componentName === name) {
        references.push({ uri: doc.uri, range: rangeOf(usage.location) });
      }
    }
    const definition = doc.components.get(name);
    if (includeDeclaration && definition) {
      references.push({ uri: doc.uri, range: rangeOf(definition.location) });
    }
    return references;
  }

  for (const location of variableReferences(doc, name)) {
    references.push({ uri: doc.uri, range: location });
  }

  if (includeDeclaration) {
    const variable = findVariableAtOffset(doc.scope, name, offset);
    if (variable) {
      const declaration = rangeOf(variable.location);
      if (!references.some(ref => sameStart(ref.range, declaration))) {
        references.push({ uri: doc.uri, range: declaration });
      }
    }
  }

  return references;
}

/**
 * Every place an expression reads the name.
 *
 * The span reported is the name itself, not the whole path: highlighting
 * `user.address.city` when the cursor is on `user` renames the wrong thing.
 */
function variableReferences(doc: BladeDocument, name: string): Range[] {
  const ranges: Range[] = [];

  const visit = (expr: ExprAst): void => {
    if (expr.kind !== 'path' || expr.isGlobal) return;
    const first = expr.segments[0];
    if (first?.kind !== 'key' || first.key !== name) return;

    // A path may be written `$user.name` or, inside `${...}`, `user.name`.
    const start = expr.location.start.offset;
    const hasSigil = doc.content[start] === '$';
    const from = hasSigil ? start + 1 : start;
    ranges.push({
      start: positionOfOffset(doc, from),
      end: positionOfOffset(doc, from + name.length),
    });
  };

  const scan = (node: TemplateNode): void => {
    for (const expr of expressionsOf(node)) {
      walkExpressions(expr, current => {
        visit(current);
      });
    }
  };

  walkNodes(doc.ast ?? [], scan);
  for (const [, definition] of doc.components) {
    walkNodes(definition.body, scan);
  }

  return ranges;
}

function sameStart(a: Range, b: Range): boolean {
  return (
    a.start.line === b.start.line && a.start.character === b.start.character
  );
}

function stripSigil(word: string): string {
  return word.startsWith('$') ? word.slice(1) : word;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** A source location as a zero-based LSP range. */
function rangeOf(location: {
  start: { line: number; column: number };
  end: { line: number; column: number };
}): Range {
  return {
    start: {
      line: location.start.line - 1,
      character: location.start.column - 1,
    },
    end: { line: location.end.line - 1, character: location.end.column - 1 },
  };
}
