// Compiler module

import type {
  CompiledTemplate,
  TemplateNode,
  ComponentDefinition,
  PathItem,
} from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { parseTemplate } from '../parser/index.js';

export interface CompileOptions {
  loader?: TemplateLoader;
  maxLoadDepth?: number;
  validate?: boolean;
  strict?: boolean;
  includeSourceMap?: boolean;
  includeMetadata?: boolean;
  maxExpressionDepth?: number;
  maxFunctionDepth?: number;
}

export interface TemplateLoader {
  load(name: string): Promise<CompiledTemplate> | CompiledTemplate;
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
