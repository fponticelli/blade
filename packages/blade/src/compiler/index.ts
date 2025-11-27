// Compiler module

import type {
  CompiledTemplate,
  TemplateNode,
  ComponentDefinition,
  PathItem,
  ComponentInfo,
} from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { parseTemplate } from '../parser/index.js';
import { discoverComponents } from '../project/discovery.js';
import {
  collectComponentReferences,
  createMissingComponentDiagnostic,
} from '../project/resolver.js';
import {
  parseComponentProps,
  createMissingPropDiagnostic,
} from '../project/props.js';
import { readFile } from 'fs/promises';
import { relative } from 'path';

export interface CompileOptions {
  validate?: boolean;
  strict?: boolean;
  includeSourceMap?: boolean;
  includeMetadata?: boolean;
  maxExpressionDepth?: number;
  maxFunctionDepth?: number;
  /**
   * Path to the project root directory.
   * When specified, enables project component resolution from the filesystem.
   * Components in the project directory will be auto-discovered and available
   * for validation (e.g., missing component errors, prop validation).
   */
  projectRoot?: string;
}

interface MetadataCollector {
  globalsUsed: Set<string>;
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;
  componentsUsed: Set<string>;
}

function collectMetadata(
  nodes: readonly TemplateNode[],
  components: ReadonlyMap<string, ComponentDefinition>
): MetadataCollector {
  const metadata: MetadataCollector = {
    globalsUsed: new Set(),
    pathsAccessed: new Set(),
    helpersUsed: new Set(),
    componentsUsed: new Set(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visitExpr(expr: any): void {
    if (!expr || !expr.kind) return;

    switch (expr.kind) {
      case 'path': {
        if (expr.isGlobal) {
          const globalName =
            expr.segments[0]?.kind === 'key' ? expr.segments[0].key : '';
          if (globalName) {
            metadata.globalsUsed.add(globalName);
          }
        }
        const pathStr = expr.segments
          .map((seg: PathItem) => {
            if (seg.kind === 'key') return seg.key;
            if (seg.kind === 'index') return `[${seg.index}]`;
            if (seg.kind === 'star') return '[*]';
            return '';
          })
          .join('.');
        if (pathStr) {
          metadata.pathsAccessed.add(pathStr);
        }
        break;
      }
      case 'call':
        metadata.helpersUsed.add(expr.callee);
        expr.args.forEach(visitExpr);
        break;
      case 'binary':
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case 'unary':
        visitExpr(expr.operand);
        break;
      case 'ternary':
        visitExpr(expr.condition);
        visitExpr(expr.truthy);
        visitExpr(expr.falsy);
        break;
      case 'wildcard':
        visitExpr(expr.path);
        break;
      case 'function':
        visitExpr(expr.body);
        break;
    }
  }

  function visitNode(node: TemplateNode): void {
    switch (node.kind) {
      case 'text':
        node.segments.forEach(seg => {
          if (seg.kind === 'expr') {
            visitExpr(seg.expr);
          }
        });
        break;
      case 'element':
        node.attributes.forEach(attr => {
          if (attr.kind === 'expr') {
            visitExpr(attr.expr);
          } else if (attr.kind === 'mixed') {
            attr.segments.forEach(seg => {
              if (seg.kind === 'expr') {
                visitExpr(seg.expr);
              }
            });
          }
        });
        node.children.forEach(visitNode);
        break;
      case 'component':
        metadata.componentsUsed.add(node.name);
        node.props.forEach(prop => {
          visitExpr(prop.value);
        });
        node.children.forEach(visitNode);
        break;
      case 'if':
        node.branches.forEach(branch => {
          visitExpr(branch.condition);
          branch.body.forEach(visitNode);
        });
        if (node.elseBranch) {
          node.elseBranch.forEach(visitNode);
        }
        break;
      case 'for':
        visitExpr(node.itemsExpr);
        node.body.forEach(visitNode);
        break;
      case 'match':
        visitExpr(node.value);
        node.cases.forEach(c => {
          if (c.kind === 'expression') {
            visitExpr(c.condition);
          }
          c.body.forEach(visitNode);
        });
        if (node.defaultCase) {
          node.defaultCase.forEach(visitNode);
        }
        break;
      case 'let':
        visitExpr(node.value);
        break;
      case 'fragment':
        node.children.forEach(visitNode);
        break;
      case 'slot':
        if (node.fallback) {
          node.fallback.forEach(visitNode);
        }
        break;
    }
  }

  nodes.forEach(visitNode);

  components.forEach(comp => {
    comp.body.forEach(visitNode);
  });

  return metadata;
}

interface ValidationDiagnostic {
  level: 'error' | 'warning';
  message: string;
  location: ReturnType<typeof ast.loc>;
}

function validate(
  nodes: readonly TemplateNode[],
  components: ReadonlyMap<string, ComponentDefinition>,
  options?: CompileOptions
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  function validateNode(node: TemplateNode): void {
    switch (node.kind) {
      case 'element': {
        // Check if element name looks like a component (camelCase or PascalCase with more than one capital)
        // but doesn't start with a capital letter
        const tag = node.tag;
        const hasInternalCapital = /[a-z][A-Z]/.test(tag);
        if (hasInternalCapital && tag[0] && tag[0] === tag[0].toLowerCase()) {
          diagnostics.push({
            level: 'error',
            message: `Component name must start with a capital letter: ${tag}`,
            location: node.location,
          });
        }
        node.children.forEach(validateNode);
        break;
      }
      case 'component': {
        // Check if component name starts with capital letter
        if (node.name[0] && node.name[0] === node.name[0].toLowerCase()) {
          diagnostics.push({
            level: 'error',
            message: `Component name must start with a capital letter: ${node.name}`,
            location: node.location,
          });
        }

        // Check if component is defined and has required props
        if (options?.validate) {
          const compDef = components.get(node.name);
          if (compDef) {
            // Check for missing required props
            const providedProps = new Set(node.props.map(p => p.name));
            for (const propDef of compDef.props) {
              if (propDef.required && !providedProps.has(propDef.name)) {
                diagnostics.push({
                  level: 'error',
                  message: `Missing required prop '${propDef.name}' for component '${node.name}'`,
                  location: node.location,
                });
              }
            }
          }
        }

        node.children.forEach(validateNode);
        break;
      }
      case 'if':
        node.branches.forEach(branch => {
          branch.body.forEach(validateNode);
        });
        if (node.elseBranch) {
          node.elseBranch.forEach(validateNode);
        }
        break;
      case 'for':
        node.body.forEach(validateNode);
        break;
      case 'match':
        node.cases.forEach(c => {
          c.body.forEach(validateNode);
        });
        if (node.defaultCase) {
          node.defaultCase.forEach(validateNode);
        }
        break;
      case 'fragment':
        node.children.forEach(validateNode);
        break;
      case 'slot':
        if (node.fallback) {
          node.fallback.forEach(validateNode);
        }
        break;
    }
  }

  nodes.forEach(validateNode);

  return diagnostics;
}

/**
 * Validates component references against project components.
 * Checks for missing components and missing required props.
 */
async function validateProjectComponents(
  rootNode: { children: readonly TemplateNode[] },
  templateComponents: ReadonlyMap<string, ComponentDefinition>,
  projectRoot: string
): Promise<
  Array<{
    level: 'error' | 'warning';
    message: string;
    location: ReturnType<typeof ast.loc>;
  }>
> {
  const diagnostics: Array<{
    level: 'error' | 'warning';
    message: string;
    location: ReturnType<typeof ast.loc>;
  }> = [];

  // Try to discover project components
  let projectComponents: Map<string, ComponentInfo>;
  try {
    projectComponents = await discoverComponents(projectRoot);
  } catch {
    // If discovery fails (e.g., no index.blade), just return empty - no project validation
    return diagnostics;
  }

  // Collect component references from the AST
  const references = collectComponentReferences(rootNode);

  // Cache for parsed component props
  const propsCache = new Map<
    string,
    Awaited<ReturnType<typeof parseComponentProps>>
  >();

  async function getComponentProps(comp: ComponentInfo) {
    if (!propsCache.has(comp.tagName)) {
      const source = await readFile(comp.filePath, 'utf-8');
      propsCache.set(comp.tagName, parseComponentProps(source));
    }
    return propsCache.get(comp.tagName)!;
  }

  for (const tagName of references) {
    // Skip HTML elements (lowercase) and template-defined components
    if (tagName === tagName.toLowerCase()) continue;
    if (templateComponents.has(tagName)) continue;

    // Check if component exists in project
    const component = projectComponents.get(tagName);
    if (!component) {
      const location = findComponentLocationInNodes(rootNode.children, tagName);
      const diag = createMissingComponentDiagnostic(
        tagName,
        location ?? { start: { line: 1, column: 1 } },
        projectRoot
      );
      diagnostics.push({
        level: diag.level,
        message: diag.message,
        location: ast.loc({
          line: diag.location.start.line,
          column: diag.location.start.column,
          offset: diag.location.start.offset,
        }),
      });
      continue;
    }

    // Validate required props
    const propsResult = await getComponentProps(component);
    const usages = findAllComponentUsagesInNodes(rootNode.children, tagName);

    for (const usage of usages) {
      const providedProps = new Set(usage.props.map(p => p.name));

      for (const propDef of propsResult.props) {
        if (propDef.required && !providedProps.has(propDef.name)) {
          const diag = createMissingPropDiagnostic(
            propDef.name,
            tagName,
            usage.location,
            {
              file: relative(projectRoot, component.filePath),
              line: propDef.location.start.line,
            }
          );
          diagnostics.push({
            level: diag.level,
            message: diag.message,
            location: ast.loc({
              line: diag.location.start.line,
              column: diag.location.start.column,
              offset: diag.location.start.offset,
            }),
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Finds the source location of a component usage in the AST nodes.
 */
function findComponentLocationInNodes(
  nodes: readonly TemplateNode[],
  tagName: string
): { start: { line: number; column: number } } | undefined {
  for (const node of nodes) {
    if (node.kind === 'component' && node.name === tagName) {
      return { start: node.location.start };
    }
    if ('children' in node && Array.isArray(node.children)) {
      const result = findComponentLocationInNodes(node.children, tagName);
      if (result) return result;
    }
    if (node.kind === 'if') {
      for (const branch of node.branches) {
        const result = findComponentLocationInNodes(branch.body, tagName);
        if (result) return result;
      }
      if (node.elseBranch) {
        const result = findComponentLocationInNodes(node.elseBranch, tagName);
        if (result) return result;
      }
    }
    if (node.kind === 'for') {
      const result = findComponentLocationInNodes(node.body, tagName);
      if (result) return result;
    }
    if (node.kind === 'match') {
      for (const c of node.cases) {
        const result = findComponentLocationInNodes(c.body, tagName);
        if (result) return result;
      }
      if (node.defaultCase) {
        const result = findComponentLocationInNodes(node.defaultCase, tagName);
        if (result) return result;
      }
    }
  }
  return undefined;
}

interface ComponentUsageInfo {
  props: readonly { name: string }[];
  location: { start: { line: number; column: number } };
}

/**
 * Finds all usages of a component in the AST nodes.
 */
function findAllComponentUsagesInNodes(
  nodes: readonly TemplateNode[],
  tagName: string
): ComponentUsageInfo[] {
  const usages: ComponentUsageInfo[] = [];

  function visit(nodeList: readonly TemplateNode[]): void {
    for (const node of nodeList) {
      if (node.kind === 'component' && node.name === tagName) {
        usages.push({
          props: node.props,
          location: { start: node.location.start },
        });
      }
      if ('children' in node && Array.isArray(node.children)) {
        visit(node.children);
      }
      if (node.kind === 'if') {
        for (const branch of node.branches) {
          visit(branch.body);
        }
        if (node.elseBranch) {
          visit(node.elseBranch);
        }
      }
      if (node.kind === 'for') {
        visit(node.body);
      }
      if (node.kind === 'match') {
        for (const c of node.cases) {
          visit(c.body);
        }
        if (node.defaultCase) {
          visit(node.defaultCase);
        }
      }
    }
  }

  visit(nodes);
  return usages;
}

export async function compile(
  source: string,
  options?: CompileOptions
): Promise<CompiledTemplate> {
  // Parse the template with options
  const parseResult = parseTemplate(source, {
    maxExpressionDepth: options?.maxExpressionDepth,
  });

  const location = ast.loc({
    line: 1,
    column: 1,
    offset: 0,
    endLine: 1,
    endColumn: source.length + 1,
    endOffset: source.length,
  });

  // Collect metadata from the AST
  const metadata = collectMetadata(parseResult.value, parseResult.components);

  const rootNode = ast.root.node({
    children: parseResult.value,
    components: parseResult.components,
    metadata: ast.root.metadata({
      globalsUsed: Array.from(metadata.globalsUsed),
      pathsAccessed: Array.from(metadata.pathsAccessed),
      helpersUsed: Array.from(metadata.helpersUsed),
      componentsUsed: Array.from(metadata.componentsUsed),
    }),
    location,
  });

  // Convert parse errors to diagnostics
  const diagnostics: Array<{
    level: 'error' | 'warning';
    message: string;
    location: ReturnType<typeof ast.loc>;
  }> = parseResult.errors.map(err => ({
    level: 'error' as const,
    message: err.message,
    location: ast.loc({
      line: err.line,
      column: err.column,
      offset: err.offset,
    }),
  }));

  // Run validation
  const validationDiagnostics = validate(
    parseResult.value,
    parseResult.components,
    options
  );
  diagnostics.push(...validationDiagnostics);

  // If projectRoot is specified, validate project components
  if (options?.projectRoot) {
    const projectDiagnostics = await validateProjectComponents(
      rootNode,
      parseResult.components,
      options.projectRoot
    );
    diagnostics.push(...projectDiagnostics);
  }

  // Generate source map if requested
  const result: CompiledTemplate = {
    root: rootNode,
    diagnostics,
  };

  if (options?.includeSourceMap) {
    // Generate a basic source map
    // Note: This is a placeholder implementation that provides the required structure
    // A full implementation would generate proper VLQ mappings based on AST locations
    (
      result as {
        sourceMap?: {
          version: number;
          sources: string[];
          names: string[];
          mappings: string;
        };
      }
    ).sourceMap = {
      version: 3,
      sources: ['template'],
      names: [],
      mappings: '',
    };
  }

  return result;
}
