// Compiler module
// Browser-safe: No Node.js dependencies (fs, path)

import type {
  ComponentDefinition,
  CompileResult,
  Diagnostic,
  JsonSchema,
  RootNode,
  SourceLocation,
  TemplateNode,
  ValidTemplate,
} from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { expressionsOf, walkExpressions, walkNodes } from '../ast/visitor.js';
import type { AnyExpr } from '../ast/visitor.js';
import type { HelperRegistry } from '../evaluator/index.js';
import { parseTemplate } from '../parser/index.js';
import type { ParseError } from '../parser/index.js';
import { serializePath } from '../source-tracking/index.js';
import { validateNodes, createDiagnostic } from '../validation/index.js';
import type { RenderTargetKind } from '../validation/index.js';
import type { ComponentRegistry } from '../validation/index.js';

/** Default value of {@link CompileOptions.maxExpressionNodes}. */
export const DEFAULT_MAX_EXPRESSION_NODES = 1000;

export interface CompileOptions {
  /**
   * Refuse anything questionable: soft findings (unknown helper, unknown
   * schema property) become errors, and `compile` throws a {@link CompileError}
   * instead of returning a failed result.
   */
  strict?: boolean;
  /**
   * The helper registry the template will be rendered with. Calls to anything
   * outside it are reported. Without it no helper call is checked - the
   * compiler has no other way to know what the host will register.
   */
  helpers?: HelperRegistry;
  /**
   * Components the host will supply at render time, in addition to the ones
   * the template defines inline with `<template:Name>`. A component in neither
   * place cannot render, so it is a compile error.
   */
  components?: ComponentRegistry;
  /** Schema describing the render data, for top-level path checks. */
  schema?: JsonSchema;
  /** Nesting depth of one expression. Parse-time limit. */
  maxExpressionDepth?: number;
  /** Nesting depth of template nodes. Parse-time limit. */
  maxNodeDepth?: number;
  /**
   * AST nodes in one expression.
   * @default DEFAULT_MAX_EXPRESSION_NODES
   */
  maxExpressionNodes?: number;
  /**
   * The renderer this template is being compiled for.
   *
   * Declaring `'string'` refuses `on:` event bindings at build time: a string
   * carries characters, and no sequence of characters is a function, so a
   * handler compiled for a string render is a button that does nothing. The
   * default is `'dom'`, which allows them - a template that says nothing is
   * more likely to be mounted than serialised.
   *
   * @default 'dom'
   */
  target?: RenderTargetKind;
}

/**
 * Thrown by {@link compileOrThrow}, and by {@link compile} in strict mode.
 *
 * Carries every diagnostic, not just the first: a caller that wants to print
 * them all should not have to compile twice.
 */
export class CompileError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const errors = diagnostics.filter(d => d.level === 'error');
    super(
      `Template failed to compile with ${errors.length} error${
        errors.length === 1 ? '' : 's'
      }: ${errors.map(formatDiagnostic).join('; ')}`
    );
    this.name = 'CompileError';
    this.diagnostics = diagnostics;
  }
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const { line, column } = diagnostic.location.start;
  return `${diagnostic.message} (line ${line}, column ${column})`;
}

// =============================================================================
// Metadata
// =============================================================================

interface MetadataCollector {
  globalsUsed: Set<string>;
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;
  componentsUsed: Set<string>;
}

/**
 * Every expression the template holds, in document order.
 *
 * Component definition bodies and prop defaults are included: they are
 * template code, reachable from nowhere else, and the metadata is supposed to
 * describe the whole compiled unit.
 */
function allExpressions(
  nodes: readonly TemplateNode[],
  components: ReadonlyMap<string, ComponentDefinition>
): AnyExpr[] {
  const out: AnyExpr[] = [];
  const collect = (roots: readonly TemplateNode[]): void => {
    walkNodes(roots, node => {
      out.push(...expressionsOf(node));
    });
  };

  collect(nodes);
  for (const definition of components.values()) {
    collect(definition.body);
    for (const declaration of definition.props) {
      if (declaration.defaultValue) out.push(declaration.defaultValue);
    }
  }
  return out;
}

/**
 * Static analysis metadata: what the template *can* read.
 *
 * The renderer reports what a render *did* read in the same notation, so
 * subtracting one from the other answers "which fields went untouched". That
 * only holds if this set is a genuine superset, which is why this walks on
 * `ast/visitor.ts` rather than on a private switch: the private one omitted
 * the `array` and `member` expression kinds, so `${[x, y]}` and `${up(z)[0]}`
 * contributed nothing and the difference could come out negative.
 */
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

  walkNodes(nodes, node => {
    if (node.kind === 'component') metadata.componentsUsed.add(node.name);
  });
  for (const definition of components.values()) {
    walkNodes(definition.body, node => {
      if (node.kind === 'component') metadata.componentsUsed.add(node.name);
    });
  }

  for (const expr of allExpressions(nodes, components)) {
    walkExpressions(expr, current => {
      switch (current.kind) {
        case 'path': {
          if (current.isGlobal) {
            const first = current.segments[0];
            if (first?.kind === 'key') metadata.globalsUsed.add(first.key);
          }
          // Same serializer the renderer uses, so the static set and the
          // runtime set share one notation and can be subtracted.
          const path = serializePath(current.segments, current.isGlobal);
          if (path) metadata.pathsAccessed.add(path);
          break;
        }
        case 'call':
          metadata.helpersUsed.add(current.callee);
          break;
        default:
          break;
      }
    });
  }

  return metadata;
}

/** AST nodes in one expression tree. */
function countExpressionNodes(expr: AnyExpr): number {
  let count = 0;
  walkExpressions(expr, () => {
    count += 1;
  });
  return count;
}

/**
 * Enforces {@link CompileOptions.maxExpressionNodes}.
 *
 * Expression *size* is a compile-time property - it is a property of the
 * template, not of the data - so it is bounded here rather than at render
 * time, where it was declared for years and never checked.
 */
function checkExpressionSize(
  expressions: readonly AnyExpr[],
  limit: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const expr of expressions) {
    const size = countExpressionNodes(expr);
    if (size > limit) {
      diagnostics.push(
        createDiagnostic(
          'error',
          `Expression has ${size} AST nodes, which exceeds the maximum of ${limit}`,
          expr.location,
          'EXPRESSION_TOO_LARGE'
        )
      );
    }
  }
  return diagnostics;
}

/**
 * The span a parse error points at.
 *
 * A parser error names one position; the span is that character. A zero-width
 * span at 1:1 - which is what a defaulted location produced - renders in an
 * editor as a squiggle over nothing at the top of the file.
 */
function parseErrorLocation(error: ParseError): SourceLocation {
  const start = {
    line: error.line,
    column: error.column,
    offset: error.offset,
  };
  return ast.location(start, {
    line: error.line,
    column: error.column + 1,
    offset: error.offset + 1,
  });
}

// =============================================================================
// Compilation
// =============================================================================

/**
 * Compiles a template source string.
 *
 * The result is discriminated on `ok`: a template that produced an error
 * diagnostic is a {@link PartialTemplate}, which no renderer factory accepts.
 * Its tree is still exposed, for tooling that wants to work inside a document
 * that does not parse.
 *
 * @param source - Template source
 * @param options - Optional compile configuration
 * @returns Either the valid template or the diagnostics that stopped it
 * @throws {CompileError} In strict mode, when any diagnostic is an error
 *
 * @example
 * ```typescript
 * const result = compile('<div>${name}</div>');
 * if (!result.ok) throw new CompileError(result.diagnostics);
 * const render = createStringRenderer(result.template);
 * ```
 */
export function compile(
  source: string,
  options?: CompileOptions
): CompileResult {
  const parseResult = parseTemplate(source, {
    maxExpressionDepth: options?.maxExpressionDepth,
    maxNodeDepth: options?.maxNodeDepth,
  });

  // The root spans the whole document, so a diagnostic hung on it points at
  // real text rather than at a zero-width span in the corner of the file.
  const location = ast.location(
    { line: 1, column: 1, offset: 0 },
    { line: 1, column: source.length + 1, offset: source.length }
  );

  const metadata = collectMetadata(parseResult.value, parseResult.components);

  const root: RootNode = ast.root.node({
    children: parseResult.value,
    components: parseResult.components,
    props: parseResult.props,
    metadata: ast.root.metadata({
      globalsUsed: Array.from(metadata.globalsUsed),
      pathsAccessed: Array.from(metadata.pathsAccessed),
      helpersUsed: Array.from(metadata.helpersUsed),
      componentsUsed: Array.from(metadata.componentsUsed),
    }),
    location,
  });

  const diagnostics: Diagnostic[] = parseResult.errors.map(error =>
    createDiagnostic(
      'error',
      error.message,
      parseErrorLocation(error),
      'PARSE_ERROR'
    )
  );

  // Semantic checks run on every compile. They used to be behind an opt-in
  // flag that gated only *some* of them, so which checks ran depended on which
  // caller you were.
  const semantic = validateNodes(parseResult.value, parseResult.components, {
    helpers: options?.helpers,
    components: options?.components,
    schema: options?.schema,
    strict: options?.strict,
    target: options?.target,
  });
  diagnostics.push(...semantic.errors, ...semantic.warnings);

  diagnostics.push(
    ...checkExpressionSize(
      allExpressions(parseResult.value, parseResult.components),
      options?.maxExpressionNodes ?? DEFAULT_MAX_EXPRESSION_NODES
    )
  );

  const result: CompileResult = diagnostics.some(d => d.level === 'error')
    ? {
        ok: false,
        partial: ast.root.partial({ root, diagnostics }),
        diagnostics,
      }
    : { ok: true, template: ast.root.valid({ root, diagnostics }) };

  if (options?.strict && !result.ok) {
    throw new CompileError(result.diagnostics);
  }

  return result;
}

/**
 * Compiles a template, throwing if it does not compile cleanly.
 *
 * For callers that have nothing useful to do with a partial tree.
 *
 * @param source - Template source
 * @param options - Optional compile configuration
 * @returns The valid template
 * @throws {CompileError} When any diagnostic is an error
 */
export function compileOrThrow(
  source: string,
  options?: CompileOptions
): ValidTemplate {
  const result = compile(source, options);
  if (!result.ok) throw new CompileError(result.diagnostics);
  return result.template;
}
