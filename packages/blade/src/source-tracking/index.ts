/**
 * Source Tracking
 *
 * Turns expressions into the `rd-source` / `rd-source-op` / `rd-source-note`
 * wire format documented in Section 9 of the specification. That format is a
 * contract with consumers such as ReDoc3, which parses it to build a
 * provenance registry over paginated output:
 *
 *   rd-source    = expression ( ";" expression )*
 *   expression   = path ( "," path )*
 *   rd-source-op = op ( ";" op )*
 *   op           = category [ ":" detail ]
 *
 * Nothing here evaluates data. Classification and path collection are static
 * properties of the expression AST, so they hold for every render.
 */

import type {
  AttributeNode,
  ElementNode,
  ExprAst,
  PathItem,
  TemplateNode,
} from '../ast/types.js';
import { helperMetadata } from '../helpers/metadata.js';

// =============================================================================
// Types
// =============================================================================

export type SourceOpCategory =
  | 'none'
  | 'calculated'
  | 'system'
  | 'format'
  | 'aggregate';

export interface SourceOp {
  readonly category: SourceOpCategory;
  readonly detail?: string;
}

/** Op lookup by helper name, for helpers outside the built-in registry. */
export type SourceOpTable = Readonly<Record<string, SourceOp>>;

/**
 * Maps a name visible inside a component to the caller paths that fed it.
 * A single prop can be fed by several paths (`total=${subtotal + tax}`).
 */
export type PathAliases = ReadonlyMap<string, readonly string[]>;

/** One expression's contribution to an element's provenance. */
export interface SourceExpression {
  readonly paths: readonly string[];
  readonly op: SourceOp;
  readonly note: string;
}

export const SOURCE_OP_NONE: SourceOp = { category: 'none' };

/** Operators that derive a new value rather than select or compare one. */
const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '%']);

// =============================================================================
// Paths
// =============================================================================

/**
 * Render path segments in the notation consumers expect: dots between keys,
 * brackets for indices and wildcards. Globals keep their `$.` marker so they
 * are never mistaken for a data path.
 */
export function serializePath(
  segments: readonly PathItem[],
  isGlobal = false
): string {
  let out = '';
  for (const segment of segments) {
    if (segment.kind === 'key') {
      out += out === '' ? segment.key : `.${segment.key}`;
    } else if (segment.kind === 'index') {
      out += `[${segment.index}]`;
    } else {
      out += '[*]';
    }
  }
  return isGlobal ? `$.${out}` : out;
}

/**
 * Every data path an expression reads, in evaluation order, de-duplicated.
 *
 * Branches of a ternary are both included: the condition and both arms all
 * take part in producing the value, and which arm wins is data-dependent.
 */
export function collectPaths(expr: ExprAst): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  const push = (path: string): void => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    paths.push(path);
  };

  const visit = (node: ExprAst | undefined): void => {
    if (!node) return;
    switch (node.kind) {
      case 'path':
        push(serializePath(node.segments, node.isGlobal));
        return;
      case 'wildcard':
        push(serializePath(node.path.segments, node.path.isGlobal));
        return;
      case 'call':
        node.args.forEach(visit);
        return;
      case 'binary':
        visit(node.left);
        visit(node.right);
        return;
      case 'unary':
        visit(node.operand);
        return;
      case 'ternary':
        visit(node.condition);
        visit(node.truthy);
        visit(node.falsy);
        return;
      case 'array':
        node.elements.forEach(visit);
        return;
      case 'member':
        // The trailing segments index into a computed result, not into data,
        // so only the object contributes a path.
        visit(node.object);
        return;
      case 'literal':
        return;
    }
  };

  visit(expr);
  return paths;
}

/**
 * Rewrite a path that was written inside a component into the caller's terms.
 *
 * Only the leading segment is aliased - it is the prop name - and any trailing
 * segments are carried onto each caller path. A name with no alias is returned
 * unchanged rather than dropped: a local name is weaker provenance than a
 * caller path, but it is still provenance.
 */
export function resolvePath(path: string, aliases?: PathAliases): string[] {
  if (!aliases || aliases.size === 0) return [path];

  // The prop name is the path up to the first `.` or `[`.
  const boundary = path.search(/[.[]/);
  const head = boundary === -1 ? path : path.slice(0, boundary);
  const tail = boundary === -1 ? '' : path.slice(boundary);

  const resolved = aliases.get(head);
  if (!resolved || resolved.length === 0) return [path];
  return resolved.map(base => `${base}${tail}`);
}

/** Resolve and de-duplicate a whole expression's paths through a component. */
function resolvePaths(
  paths: readonly string[],
  aliases?: PathAliases
): string[] {
  if (!aliases || aliases.size === 0) return [...paths];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    for (const resolved of resolvePath(path, aliases)) {
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      out.push(resolved);
    }
  }
  return out;
}

// =============================================================================
// Classification
// =============================================================================

/**
 * Op for a helper, preferring a caller-supplied table so custom helpers can be
 * classified without patching the built-in registry.
 */
function helperOp(name: string, table?: SourceOpTable): SourceOp | undefined {
  return table?.[name] ?? helperMetadata[name]?.sourceOp;
}

/** First op of the given category found anywhere in the expression. */
function findOp(
  expr: ExprAst | undefined,
  category: SourceOpCategory,
  table?: SourceOpTable
): SourceOp | undefined {
  if (!expr) return undefined;
  switch (expr.kind) {
    case 'call': {
      const op = helperOp(expr.callee, table);
      if (op?.category === category) return op;
      for (const arg of expr.args) {
        const found = findOp(arg, category, table);
        if (found) return found;
      }
      return undefined;
    }
    case 'binary':
      return (
        findOp(expr.left, category, table) ??
        findOp(expr.right, category, table)
      );
    case 'unary':
      return findOp(expr.operand, category, table);
    case 'ternary':
      return (
        findOp(expr.condition, category, table) ??
        findOp(expr.truthy, category, table) ??
        findOp(expr.falsy, category, table)
      );
    case 'array': {
      for (const element of expr.elements) {
        const found = findOp(element, category, table);
        if (found) return found;
      }
      return undefined;
    }
    case 'member':
      return findOp(expr.object, category, table);
    default:
      return undefined;
  }
}

/** Whether the expression derives a new value through arithmetic. */
function hasArithmetic(expr: ExprAst | undefined): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case 'binary':
      return (
        ARITHMETIC_OPERATORS.has(expr.operator) ||
        hasArithmetic(expr.left) ||
        hasArithmetic(expr.right)
      );
    case 'unary':
      return expr.operator === '-' || hasArithmetic(expr.operand);
    case 'ternary':
      return (
        hasArithmetic(expr.condition) ||
        hasArithmetic(expr.truthy) ||
        hasArithmetic(expr.falsy)
      );
    case 'call':
      return expr.args.some(hasArithmetic);
    case 'array':
      return expr.elements.some(hasArithmetic);
    case 'member':
      return hasArithmetic(expr.object);
    default:
      return false;
  }
}

/**
 * Classify what was done to the data on the way to the page.
 *
 * The order is deliberate and matches Section 9.3: the outermost format helper
 * wins because it is what the reader actually sees, then aggregation, then a
 * system value, then arithmetic. A plain selection is `none`.
 *
 * Comparisons and logical operators are not arithmetic here. They steer which
 * value is shown; they do not derive the value itself.
 */
export function classifyExpression(
  expr: ExprAst,
  table?: SourceOpTable
): SourceOp {
  if (expr.kind === 'call') {
    const op = helperOp(expr.callee, table);
    if (op?.category === 'format') return op;
  }

  const aggregate = findOp(expr, 'aggregate', table);
  if (aggregate) return aggregate;

  const system = findOp(expr, 'system', table);
  if (system) return system;

  const format = findOp(expr, 'format', table);
  if (format) return format;

  const calculated = findOp(expr, 'calculated', table);
  if (calculated) return calculated;

  if (hasArithmetic(expr)) return { category: 'calculated' };

  return SOURCE_OP_NONE;
}

// =============================================================================
// Notes
// =============================================================================

/** `formatCurrency` -> `format currency`, so notes read as prose. */
function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function describeLiteral(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null || value === undefined) return 'nil';
  return String(value);
}

/**
 * A human-readable account of how a value was produced, for `rd-source-note`.
 *
 * Paths are resolved through the same aliases as `rd-source`, so a note never
 * names a component prop or loop variable that the source attribute reports as
 * a caller path - a note that disagrees with the paths beside it is worse than
 * no note.
 */
export function describeExpression(
  expr: ExprAst,
  aliases?: PathAliases
): string {
  const describePath = (path: string): string =>
    resolvePath(path, aliases).join(', ');

  const describe = (node: ExprAst, parenthesize = false): string => {
    switch (node.kind) {
      case 'literal':
        return describeLiteral(node.value);
      case 'path':
        return describePath(serializePath(node.segments, node.isGlobal));
      case 'wildcard':
        return describePath(
          serializePath(node.path.segments, node.path.isGlobal)
        );
      case 'call': {
        // A lone argument reads better bare; once arguments are separated by
        // commas an unbracketed operation becomes ambiguous.
        const bracket = node.args.length > 1;
        const args = node.args.map(arg => describe(arg, bracket)).join(', ');
        return args
          ? `${humanize(node.callee)} of ${args}`
          : humanize(node.callee);
      }
      case 'binary': {
        // Nested operations keep their brackets, so a note can be read back as
        // the expression it describes.
        const text = `${describe(node.left, true)} ${node.operator} ${describe(node.right, true)}`;
        return parenthesize ? `(${text})` : text;
      }
      case 'unary':
        return `${node.operator}${describe(node.operand, true)}`;
      case 'ternary': {
        const text = `${describe(node.condition)} ? ${describe(node.truthy)} : ${describe(node.falsy)}`;
        return parenthesize ? `(${text})` : text;
      }
      case 'array':
        return `[${node.elements.map(element => describe(element)).join(', ')}]`;
      case 'member':
        return `${describe(node.object, true)}${serializePath(node.path)}`;
    }
  };

  return describe(expr);
}

// =============================================================================
// Wire format
// =============================================================================

export interface BuildSourceExpressionOptions {
  readonly aliases?: PathAliases;
  readonly opTable?: SourceOpTable;
}

/** Everything one expression contributes to its element's attributes. */
export function buildSourceExpression(
  expr: ExprAst,
  options: BuildSourceExpressionOptions = {}
): SourceExpression {
  return {
    paths: resolvePaths(collectPaths(expr), options.aliases),
    op: classifyExpression(expr, options.opTable),
    note: describeExpression(expr, options.aliases),
  };
}

export function formatSourceOp(op: SourceOp): string {
  return op.detail ? `${op.category}:${op.detail}` : op.category;
}

/** `rd-source` value: paths joined by `,` within an expression, `;` between. */
export function formatSourceValue(
  expressions: readonly SourceExpression[]
): string {
  return expressions
    .filter(expression => expression.paths.length > 0)
    .map(expression => expression.paths.join(','))
    .join(';');
}

/**
 * `rd-source-op` value: one op per expression that contributed paths, so the
 * positions line up with `rd-source`.
 */
export function formatSourceOpValue(
  expressions: readonly SourceExpression[]
): string {
  return expressions
    .filter(expression => expression.paths.length > 0)
    .map(expression => formatSourceOp(expression.op))
    .join(';');
}

/**
 * `rd-source-note` value: one note for the whole element. Notes are joined
 * with `+` rather than `;` because consumers never split this attribute and a
 * semicolon here would read as a separator that is not one.
 */
export function formatSourceNoteValue(
  expressions: readonly SourceExpression[]
): string {
  return expressions
    .filter(expression => expression.paths.length > 0)
    .map(expression => expression.note)
    .join(' + ');
}

// =============================================================================
// Element-level tracking
// =============================================================================

/**
 * Collects the expressions an element renders *itself*.
 *
 * Walks the element's own attributes and then its content in document order,
 * descending through local control flow but stopping at nested elements,
 * components and slots - those render their own opening tags and own their own
 * provenance. Without that boundary every ancestor would re-claim every
 * descendant's sources and the outermost element would list the whole payload.
 */
export function collectElementExpressions(node: ElementNode): ExprAst[] {
  const exprs: ExprAst[] = [];

  for (const attr of node.attributes as readonly AttributeNode[]) {
    if (attr.kind === 'expr') {
      exprs.push(attr.expr);
    } else if (attr.kind === 'mixed') {
      for (const segment of attr.segments) {
        if (segment.kind === 'expr') exprs.push(segment.expr);
      }
    }
  }

  const visit = (nodes: readonly TemplateNode[]): void => {
    for (const child of nodes) {
      switch (child.kind) {
        case 'text':
          for (const segment of child.segments) {
            if (segment.kind === 'expr') exprs.push(segment.expr);
          }
          break;
        case 'if':
          for (const branch of child.branches) {
            exprs.push(branch.condition);
            visit(branch.body);
          }
          if (child.elseBranch) visit(child.elseBranch);
          break;
        case 'for':
          exprs.push(child.itemsExpr);
          visit(child.body);
          break;
        case 'match':
          exprs.push(child.value);
          for (const matchCase of child.cases) {
            if (matchCase.kind === 'expression')
              exprs.push(matchCase.condition);
            visit(matchCase.body);
          }
          if (child.defaultCase) visit(child.defaultCase);
          break;
        case 'let':
          if (!('kind' in child.value && child.value.kind === 'function')) {
            exprs.push(child.value as ExprAst);
          }
          break;
        case 'fragment':
          visit(child.children);
          break;
        default:
          // element, component, slot, comment, doctype: not ours to claim.
          break;
      }
    }
  };

  visit(node.children);
  return exprs;
}

/** Attribute name for a source tracking base under the configured prefix. */
export function sourceAttributeName(
  prefix: string,
  base: 'source' | 'source-op' | 'source-note'
): string {
  return prefix + base;
}

/** True when the template already annotates this element by hand. */
export function hasAuthoredSource(node: ElementNode, prefix: string): boolean {
  const name = sourceAttributeName(prefix, 'source');
  return node.attributes.some(attr => attr.name === name);
}

export interface ElementSourceTracking {
  readonly source: string;
  readonly op: string | null;
  readonly note: string | null;
}

export interface ElementSourceTrackingOptions {
  readonly prefix: string;
  readonly includeOp?: boolean;
  readonly includeNote?: boolean;
  readonly aliases?: PathAliases;
  readonly opTable?: SourceOpTable;
}

/**
 * The source tracking attribute values for one element, or null when it
 * renders no expressions or the author already annotated it by hand.
 *
 * Shared by every renderer so the string, DOM and reactive outputs agree.
 */
export function buildElementSourceTracking(
  node: ElementNode,
  options: ElementSourceTrackingOptions
): ElementSourceTracking | null {
  if (hasAuthoredSource(node, options.prefix)) return null;

  const exprs = collectElementExpressions(node);
  if (exprs.length === 0) return null;

  const built = exprs.map(expr =>
    buildSourceExpression(expr, {
      aliases: options.aliases,
      opTable: options.opTable,
    })
  );

  const source = formatSourceValue(built);
  if (source === '') return null;

  return {
    source,
    op: options.includeOp ? formatSourceOpValue(built) : null,
    note: options.includeNote ? formatSourceNoteValue(built) : null,
  };
}

/**
 * Aliases for a component call: each prop name mapped to the caller paths that
 * fed it, already resolved through the caller's own aliases so provenance
 * composes through any depth of nesting.
 */
export function componentAliases(
  props: readonly { readonly name: string; readonly value: ExprAst }[],
  callerAliases?: PathAliases
): PathAliases | undefined {
  const aliases = new Map<string, readonly string[]>();
  for (const prop of props) {
    const paths = collectPaths(prop.value).flatMap(path =>
      resolvePath(path, callerAliases)
    );
    if (paths.length > 0) aliases.set(prop.name, Array.from(new Set(paths)));
  }
  return aliases.size > 0 ? aliases : undefined;
}

/**
 * Aliases for a loop body: the item variable stands for one element of the
 * iterated array, so `item.name` is reported as `items[*].name`.
 *
 * Pass `index` to name the element being rendered instead of the pattern -
 * `items[7].name`. The two answer different questions. `[*]` identifies the
 * template node, which is what a click-to-select editor wants; the concrete
 * index identifies the value, which is what a provenance registry needs to
 * join a rendered cell back to the datum that produced it. Concrete collapses
 * to pattern with `path.replace(/\[\d+\]/g, '[*]')`; the reverse is impossible,
 * so the caller that wants both should ask for the index.
 *
 * Indices compose without further work: the inner loop resolves its own
 * iterable through these aliases first, so `invoice.lines[2].taxes[0].rate`
 * falls out of each level substituting only its own index.
 *
 * `in` iteration binds the variable to a *key*, not to an element, so it takes
 * no index either way.
 *
 * Only a plain path iterable can be named this way; anything computed has no
 * stable address in the source data, and the loop variable is left alone.
 */
export function loopAliases(
  itemsExpr: ExprAst,
  itemVar: string,
  iterationType: 'of' | 'in',
  callerAliases?: PathAliases,
  index?: number
): PathAliases | undefined {
  if (itemsExpr.kind !== 'path') return callerAliases;

  const base = serializePath(itemsExpr.segments, itemsExpr.isGlobal);
  const resolved = resolvePath(base, callerAliases);
  const aliases = new Map<string, readonly string[]>(callerAliases);
  const element = index === undefined ? '[*]' : `[${index}]`;
  aliases.set(
    itemVar,
    iterationType === 'of'
      ? resolved.map(path => `${path}${element}`)
      : resolved
  );
  return aliases;
}
