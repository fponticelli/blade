/**
 * Definition Provider for Blade Language Server
 * Provides Go to Definition functionality for variables, components, and helpers
 */

import type {
  BladeDocument,
  DocumentScope,
  ScopeVariable,
  Position,
  Range,
} from '../types.js';
import { isInsideExpression, getWordAtOffset, getOffset } from '../document.js';

/**
 * Location result for definition lookup
 */
export interface DefinitionLocation {
  uri: string;
  range: Range;
}

/**
 * Find definition for the symbol at the given position
 */
export function findDefinition(
  doc: BladeDocument,
  position: Position
): DefinitionLocation | null {
  const offset = getOffset(doc.content, position.line, position.character);

  // Check if we're inside an expression
  if (isInsideExpression(doc.content, offset)) {
    return findExpressionDefinition(doc, offset);
  }

  // Check for component tag definition
  const componentDef = findComponentDefinition(doc, offset);
  if (componentDef) {
    return componentDef;
  }

  return null;
}

/**
 * Find definition for a symbol inside an expression
 */
function findExpressionDefinition(
  doc: BladeDocument,
  offset: number
): DefinitionLocation | null {
  const wordInfo = getWordAtOffset(doc.content, offset);
  if (!wordInfo) {
    return null;
  }

  // Look for variable definition in scope
  const variable = findVariableByName(doc.scope, wordInfo.word);
  if (variable) {
    return {
      uri: doc.uri,
      range: {
        start: {
          line: variable.location.start.line - 1,
          character: variable.location.start.column - 1,
        },
        end: {
          line: variable.location.end.line - 1,
          character: variable.location.end.column - 1,
        },
      },
    };
  }

  return null;
}

/**
 * Find definition for a component usage
 */
function findComponentDefinition(
  doc: BladeDocument,
  offset: number
): DefinitionLocation | null {
  const wordInfo = getWordAtOffset(doc.content, offset);
  if (!wordInfo) {
    return null;
  }

  // Check if it's a PascalCase name (component)
  if (!/^[A-Z]/.test(wordInfo.word)) {
    return null;
  }

  // Look for component definition in the document's components
  const componentDef = doc.components.get(wordInfo.word);
  if (componentDef) {
    return {
      uri: doc.uri,
      range: {
        start: {
          line: componentDef.location.start.line - 1,
          character: componentDef.location.start.column - 1,
        },
        end: {
          line: componentDef.location.end.line - 1,
          character: componentDef.location.end.column - 1,
        },
      },
    };
  }

  return null;
}

/**
 * Find a variable by name in the scope
 */
function findVariableByName(
  scope: DocumentScope,
  name: string
): ScopeVariable | null {
  // Search through all scope entries
  for (const [, variables] of scope.variables) {
    for (const v of variables) {
      if (v.name === name) {
        return v;
      }
    }
  }
  return null;
}

/**
 * Find all references to a symbol at the given position
 */
export function findReferences(
  doc: BladeDocument,
  position: Position,
  _includeDeclaration: boolean = true
): DefinitionLocation[] {
  const offset = getOffset(doc.content, position.line, position.character);
  const wordInfo = getWordAtOffset(doc.content, offset);

  if (!wordInfo) {
    return [];
  }

  const references: DefinitionLocation[] = [];

  // Check if it's a component reference
  if (/^[A-Z]/.test(wordInfo.word)) {
    // Find all usages of this component
    for (const usage of doc.scope.componentUsages) {
      if (usage.componentName === wordInfo.word) {
        references.push({
          uri: doc.uri,
          range: {
            start: {
              line: usage.location.start.line - 1,
              character: usage.location.start.column - 1,
            },
            end: {
              line: usage.location.end.line - 1,
              character: usage.location.end.column - 1,
            },
          },
        });
      }
    }
  }

  // Find variable references (simple text search for now)
  const regex = new RegExp(`\\$${wordInfo.word}\\b`, 'g');
  let match;
  while ((match = regex.exec(doc.content)) !== null) {
    const pos = offsetToPosition(doc.content, match.index);
    references.push({
      uri: doc.uri,
      range: {
        start: pos,
        end: {
          line: pos.line,
          character: pos.character + match[0].length,
        },
      },
    });
  }

  return references;
}

/**
 * Convert offset to position
 */
function offsetToPosition(content: string, offset: number): Position {
  const lines = content.slice(0, offset).split('\n');
  return {
    line: lines.length - 1,
    character: (lines[lines.length - 1] ?? '').length,
  };
}
