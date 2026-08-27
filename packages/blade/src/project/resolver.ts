/**
 * Component Resolver for Blade Projects
 *
 * Resolves component references to their definitions, supporting
 * both project components (auto-loaded) and template-passed components.
 */

import type {
  ComponentInfo,
  ComponentDefinition,
  ComponentNode,
  JsonSchema,
  ProjectContext,
  ProjectConfig,
  Diagnostic,
  RootNode,
  SourceLocation,
  TemplateNode,
} from '../ast/types.js';
import { walkNodes } from '../ast/visitor.js';
import { createDiagnostic } from '../validation/index.js';
import { DEFAULT_ENTRY } from './discovery.js';

/**
 * Everything a {@link ProjectContext} needs to be honest.
 *
 * One object rather than a positional list, because the three fields that used
 * to be missing were missing *structurally*: `createProjectContext` hard-coded
 * `entry: 'index.blade'`, `schema: undefined` and `samples: new Map()` with no
 * parameter that could say otherwise. `compileProject` therefore reported the
 * wrong entry whenever it was given one, and the schema-driven validation in
 * `validation/index.ts`, which is gated on the context's schema, could never
 * run for any project at all.
 */
export interface ProjectContextInit {
  readonly rootPath: string;
  /** @default 'index.blade' */
  readonly entry?: string;
  readonly schema?: JsonSchema | undefined;
  /** Sample name to parsed payload. */
  readonly samples?: ReadonlyMap<string, unknown>;
  readonly components: Map<string, ComponentInfo>;
  /** Components passed by the host, which shadow discovered ones. */
  readonly templateComponents?: ReadonlyMap<string, ComponentDefinition>;
}

/**
 * Creates a project context.
 *
 * @param init - The project's root, entry, schema, samples and components
 * @returns The project context
 */
export function createProjectContext(init: ProjectContextInit): ProjectContext {
  const config: ProjectConfig = {
    rootPath: init.rootPath,
    entry: init.entry ?? DEFAULT_ENTRY,
    schema: init.schema,
    samples: init.samples ?? new Map(),
  };

  return {
    config,
    components: init.components,
    templateComponents: init.templateComponents ?? new Map(),
    warnings: [],
    errors: [],
  };
}

/**
 * Resolves a component by tag name.
 *
 * Resolution priority:
 * 1. Template-passed components (closest scope) - handled separately by template system
 * 2. Project components (auto-loaded)
 *
 * Note: This resolver only handles project components. Template-passed components
 * are resolved by the existing template component mechanism before this is called.
 *
 * @param tagName - The component tag name (e.g., 'Button' or 'Components.Form.Input')
 * @param context - The project context with discovered components
 * @returns The component info if found, undefined otherwise
 */
export function resolveComponent(
  tagName: string,
  context: ProjectContext
): ComponentInfo | undefined {
  // Check if this component is shadowed by a template component
  if (context.templateComponents.has(tagName)) {
    // Template components take priority - return undefined to let
    // the template system handle it
    return undefined;
  }

  // Look up in project components
  return context.components.get(tagName);
}

/**
 * Every component usage in a template, keyed by tag name and in document order.
 *
 * Runs on `ast/visitor.ts`. The three copies this replaces took `unknown`,
 * cast to `Record<string, unknown>` and dispatched on string literals, so none
 * of them descended into fragment children or slot fallback content: a
 * component used only inside a `<slot>` fallback was never resolved and never
 * prop-checked.
 *
 * One traversal answers every question the project compiler asks about
 * component usage - which names occur, where the first one is, and where all of
 * them are. It used to run this walk once per referenced component, twice, so a
 * project with 25 components over 3000 nodes paid 75,000 node visits where 3000
 * would do - on every keystroke burst, because the preview recompiles as you
 * type.
 *
 * @param root - The compiled root node
 * @returns Usages by tag name; a name with no usages is absent
 */
export function collectComponentUsages(
  root: RootNode
): Map<string, ComponentNode[]> {
  const usages = new Map<string, ComponentNode[]>();
  const collect = (nodes: readonly TemplateNode[]): void => {
    walkNodes(nodes, node => {
      if (node.kind !== 'component') return;
      const existing = usages.get(node.name);
      if (existing) existing.push(node);
      else usages.set(node.name, [node]);
    });
  };

  collect(root.children);
  // A `<template:Name>` body is template code like any other, and the
  // components it calls have to resolve too.
  for (const definition of root.components.values()) {
    collect(definition.body);
  }
  return usages;
}

/**
 * Collects all component references from an AST.
 *
 * @param root - The compiled root node
 * @returns Set of component tag names referenced in the template
 */
export function collectComponentReferences(root: RootNode): Set<string> {
  return new Set(collectComponentUsages(root).keys());
}

/**
 * Creates a diagnostic for a missing component.
 *
 * @param tagName - The component tag name that wasn't found
 * @param location - Source location of the component usage
 * @param projectRoot - The project root path for helpful suggestions
 * @returns A diagnostic with actionable information
 */
export function createMissingComponentDiagnostic(
  tagName: string,
  location: SourceLocation,
  projectRoot: string
): Diagnostic {
  const segments = tagName.split('.');
  const filename = segments[segments.length - 1]!.toLowerCase() + '.blade';
  const expectedPath =
    segments.length > 1
      ? segments
          .slice(0, -1)
          .map(s => s.toLowerCase())
          .join('/') +
        '/' +
        filename
      : filename;

  return createDiagnostic(
    'error',
    `Component '${tagName}' not found.\n` +
      `  Expected at: ./${expectedPath}\n` +
      `  Searched in: ${projectRoot}/\n` +
      `\n` +
      `  Tip: Create the component file or check the spelling.`,
    location,
    'UNKNOWN_COMPONENT'
  );
}
