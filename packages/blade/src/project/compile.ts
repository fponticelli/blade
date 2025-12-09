/**
 * Project-based Template Compilation for Blade
 *
 * Compiles a Blade project with auto-loaded components, dot-notation namespacing,
 * and component reference validation.
 */

import { readFileSync } from 'fs';
import { join, relative } from 'path';
import type {
  ProjectResult,
  ProjectOptions,
  RootNode,
  Diagnostic,
  ComponentInfo,
} from '../ast/types.js';
import { compile } from '../compiler/index.js';
import { discoverComponents } from './discovery.js';
import {
  createProjectContext,
  collectComponentReferences,
  createMissingComponentDiagnostic,
} from './resolver.js';
import { parseComponentProps, createMissingPropDiagnostic } from './props.js';

const DEFAULT_ENTRY = 'index.blade';

/**
 * Compiles a Blade project from a directory.
 *
 * @param projectPath - Path to the project root (must contain index.blade)
 * @param options - Optional compilation options
 * @returns The compilation result with AST, context, warnings, and errors
 * @throws Error if the project root doesn't exist or has no index.blade
 */
export function compileProject(
  projectPath: string,
  options?: ProjectOptions
): ProjectResult {
  const entry = options?.entry ?? DEFAULT_ENTRY;
  const entryPath = join(projectPath, entry);

  // Discover all components in the project
  const components = discoverComponents(projectPath);

  // Create the project context
  const context = createProjectContext(projectPath, components);

  // Read and compile the entry file
  const source = readFileSync(entryPath, 'utf-8');
  const compiled = compile(source, { validate: true });

  // Collect component references from the AST
  const references = collectComponentReferences(compiled.root);

  // Check for missing components
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  // Parse props for all components (lazily)
  const componentPropsCache = new Map<
    string,
    ReturnType<typeof parseComponentProps>
  >();

  function getComponentProps(comp: ComponentInfo) {
    if (!componentPropsCache.has(comp.tagName)) {
      const source = readFileSync(comp.filePath, 'utf-8');
      const propsResult = parseComponentProps(source);
      componentPropsCache.set(comp.tagName, propsResult);

      // Add any warnings from props parsing
      for (const warning of propsResult.warnings) {
        warnings.push({
          level: 'warning',
          message: `[${comp.tagName}] ${warning.message}`,
          location: {
            start: { line: warning.line, column: warning.column, offset: 0 },
            end: { line: warning.line, column: warning.column, offset: 0 },
          },
        });
      }
    }
    return componentPropsCache.get(comp.tagName)!;
  }

  for (const tagName of references) {
    // Skip HTML elements (all lowercase)
    if (tagName === tagName.toLowerCase()) {
      continue;
    }

    // Check if component exists in project
    const component = components.get(tagName);
    if (!component) {
      // Find the location of the component usage in the AST
      const location = findComponentLocation(compiled.root, tagName);
      errors.push(
        createMissingComponentDiagnostic(
          tagName,
          location ?? { start: { line: 1, column: 1 } },
          projectPath
        )
      );
      continue;
    }

    // Validate required props
    const propsResult = getComponentProps(component);
    const componentUsages = findAllComponentUsages(compiled.root, tagName);

    for (const usage of componentUsages) {
      const providedProps = new Set(usage.props.map(p => p.name));

      for (const propDef of propsResult.props) {
        if (propDef.required && !providedProps.has(propDef.name)) {
          errors.push(
            createMissingPropDiagnostic(propDef.name, tagName, usage.location, {
              file: relative(projectPath, component.filePath),
              line: propDef.location.start.line,
            })
          );
        }
      }
    }
  }

  // Add any parse/validation errors from the compiler
  for (const diagnostic of compiled.diagnostics) {
    if (diagnostic.level === 'error') {
      errors.push({
        level: 'error',
        message: diagnostic.message,
        location: {
          start: {
            line: diagnostic.location.start.line,
            column: diagnostic.location.start.column,
            offset: diagnostic.location.start.offset ?? 0,
          },
          end: {
            line:
              diagnostic.location.end?.line ?? diagnostic.location.start.line,
            column:
              diagnostic.location.end?.column ??
              diagnostic.location.start.column,
            offset: diagnostic.location.end?.offset ?? 0,
          },
        },
      });
    } else {
      warnings.push({
        level: 'warning',
        message: diagnostic.message,
        location: {
          start: {
            line: diagnostic.location.start.line,
            column: diagnostic.location.start.column,
            offset: diagnostic.location.start.offset ?? 0,
          },
          end: {
            line:
              diagnostic.location.end?.line ?? diagnostic.location.start.line,
            column:
              diagnostic.location.end?.column ??
              diagnostic.location.start.column,
            offset: diagnostic.location.end?.offset ?? 0,
          },
        },
      });
    }
  }

  return {
    ast: compiled.root,
    context: {
      ...context,
      warnings,
      errors,
    },
    warnings,
    errors,
    success: errors.length === 0,
  };
}

/**
 * Finds the source location of a component usage in the AST.
 */
function findComponentLocation(
  ast: RootNode,
  tagName: string
): { start: { line: number; column: number } } | undefined {
  function visit(
    node: unknown
  ): { start: { line: number; column: number } } | undefined {
    if (!node || typeof node !== 'object') return undefined;

    const n = node as Record<string, unknown>;

    // Check if this is the component we're looking for
    if (n['kind'] === 'component' && n['name'] === tagName) {
      const loc = n['location'] as
        | { start: { line: number; column: number } }
        | undefined;
      return loc ? { start: loc.start } : undefined;
    }

    // Recurse into children
    if (Array.isArray(n['children'])) {
      for (const child of n['children']) {
        const result = visit(child);
        if (result) return result;
      }
    }

    // Check branches in conditionals
    if (n['kind'] === 'if' && Array.isArray(n['branches'])) {
      for (const branch of n['branches'] as unknown[]) {
        if (branch && typeof branch === 'object') {
          const b = branch as Record<string, unknown>;
          if (Array.isArray(b['body'])) {
            for (const child of b['body']) {
              const result = visit(child);
              if (result) return result;
            }
          }
        }
      }
      if (Array.isArray(n['elseBranch'])) {
        for (const child of n['elseBranch']) {
          const result = visit(child);
          if (result) return result;
        }
      }
    }

    // Check body in loops
    if (n['kind'] === 'for' && Array.isArray(n['body'])) {
      for (const child of n['body']) {
        const result = visit(child);
        if (result) return result;
      }
    }

    // Check cases in match
    if (n['kind'] === 'match' && Array.isArray(n['cases'])) {
      for (const c of n['cases'] as unknown[]) {
        if (c && typeof c === 'object') {
          const mc = c as Record<string, unknown>;
          if (Array.isArray(mc['body'])) {
            for (const child of mc['body']) {
              const result = visit(child);
              if (result) return result;
            }
          }
        }
      }
      if (Array.isArray(n['defaultCase'])) {
        for (const child of n['defaultCase']) {
          const result = visit(child);
          if (result) return result;
        }
      }
    }

    return undefined;
  }

  if (Array.isArray(ast.children)) {
    for (const child of ast.children) {
      const result = visit(child);
      if (result) return result;
    }
  }

  return undefined;
}

interface ComponentUsage {
  props: Array<{ name: string }>;
  location: { start: { line: number; column: number } };
}

/**
 * Finds all usages of a component in the AST.
 */
function findAllComponentUsages(
  ast: RootNode,
  tagName: string
): ComponentUsage[] {
  const usages: ComponentUsage[] = [];

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;

    const n = node as Record<string, unknown>;

    // Check if this is the component we're looking for
    if (n['kind'] === 'component' && n['name'] === tagName) {
      const loc = n['location'] as
        | { start: { line: number; column: number } }
        | undefined;
      const props = (n['props'] as Array<{ name: string }>) ?? [];
      usages.push({
        props,
        location: loc ?? { start: { line: 1, column: 1 } },
      });
    }

    // Recurse into children
    if (Array.isArray(n['children'])) {
      for (const child of n['children']) {
        visit(child);
      }
    }

    // Check branches in conditionals
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

    // Check body in loops
    if (n['kind'] === 'for' && Array.isArray(n['body'])) {
      for (const child of n['body']) {
        visit(child);
      }
    }

    // Check cases in match
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

  return usages;
}
