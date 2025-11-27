/**
 * Component Resolver for Blade Projects
 *
 * Resolves component references to their definitions, supporting
 * both project components (auto-loaded) and template-passed components.
 */

import type {
  ComponentInfo,
  ComponentDefinition,
  ProjectContext,
  ProjectConfig,
  Diagnostic,
  SourceLocation,
} from '../ast/types.js';

/**
 * Creates a project context from discovered components.
 *
 * @param rootPath - The root directory of the project
 * @param components - Map of discovered components
 * @param templateComponents - Optional template-passed components that shadow project components
 * @returns The project context
 */
export function createProjectContext(
  rootPath: string,
  components: Map<string, ComponentInfo>,
  templateComponents?: ReadonlyMap<string, ComponentDefinition>
): ProjectContext {
  const config: ProjectConfig = {
    rootPath,
    entry: 'index.blade',
    schema: undefined,
    samples: new Map(),
  };

  return {
    config,
    components,
    templateComponents: templateComponents ?? new Map(),
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
 * Collects all component references from an AST.
 *
 * @param ast - The root AST node
 * @returns Set of component tag names referenced in the template
 */
export function collectComponentReferences(ast: {
  children: readonly unknown[];
}): Set<string> {
  const references = new Set<string>();

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;

    const n = node as Record<string, unknown>;

    // Check if this is a component node (kind: 'component' with name field)
    if (n['kind'] === 'component' && typeof n['name'] === 'string') {
      references.add(n['name'] as string);
    }

    // Recurse into children
    if (Array.isArray(n['children'])) {
      for (const child of n['children']) {
        visit(child);
      }
    }

    // Check branches in conditionals (kind: 'if')
    if (n['kind'] === 'if' && Array.isArray(n['branches'])) {
      for (const branch of n['branches'] as unknown[]) {
        if (branch && typeof branch === 'object') {
          const b = branch as Record<string, unknown>;
          if (Array.isArray(b['body'])) {
            for (const child of b['body']) {
              visit(child);
            }
          }
        }
      }
      if (Array.isArray(n['elseBranch'])) {
        for (const child of n['elseBranch']) {
          visit(child);
        }
      }
    }

    // Check body in loops (kind: 'for')
    if (n['kind'] === 'for' && Array.isArray(n['body'])) {
      for (const child of n['body']) {
        visit(child);
      }
    }

    // Check cases in match expressions (kind: 'match')
    if (n['kind'] === 'match' && Array.isArray(n['cases'])) {
      for (const c of n['cases'] as unknown[]) {
        if (c && typeof c === 'object') {
          const mc = c as Record<string, unknown>;
          if (Array.isArray(mc['body'])) {
            for (const child of mc['body']) {
              visit(child);
            }
          }
        }
      }
      if (Array.isArray(n['defaultCase'])) {
        for (const child of n['defaultCase']) {
          visit(child);
        }
      }
    }
  }

  if (Array.isArray(ast.children)) {
    for (const child of ast.children) {
      visit(child);
    }
  }

  return references;
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
  location: { start: { line: number; column: number } },
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

  const fullLocation: SourceLocation = {
    start: {
      line: location.start.line,
      column: location.start.column,
      offset: 0,
    },
    end: {
      line: location.start.line,
      column: location.start.column,
      offset: 0,
    },
  };

  return {
    level: 'error',
    message:
      `Component '${tagName}' not found.\n` +
      `  Expected at: ./${expectedPath}\n` +
      `  Searched in: ${projectRoot}/\n` +
      `\n` +
      `  Tip: Create the component file or check the spelling.`,
    location: fullLocation,
  };
}
