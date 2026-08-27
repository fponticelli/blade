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
 *   rd-source-op = op ( ":" detail )? ( ";" op )*
 *
 * Nothing here evaluates data. Path collection, classification and the prose
 * note are static properties of the expression AST, so they hold for every
 * render - and every one of them is therefore memoised against the AST node
 * that produced it, in `WeakMap`s that die with the template. Rebuilding them
 * per element per render made the cost of tracking proportional to the number
 * of loop iterations rather than to the size of the template; the evaluator
 * already learned that lesson one level down (see `evaluator/index.ts`).
 *
 * The only genuinely per-render input is the alias map, which renames a
 * component prop or loop variable in the caller's terms. Everything cached here
 * is therefore cached in its *alias-free* form, and alias resolution runs over
 * the cached result. When the alias map itself repeats - which it does for
 * every iteration of a loop unless concrete indices were asked for - the
 * finished attribute values are cached too, and a tracked element costs a
 * handful of map lookups after its first render.
 *
 * Alias maps are treated as immutable. They are produced by `loopAliases` and
 * `componentAliases`, are typed `ReadonlyMap`, and are used as cache keys: a
 * caller that mutates one after passing it in will read stale provenance.
 */

import type {
  AttributeNode,
  ElementNode,
  ExprAst,
  PathItem,
  PathNode,
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

/**
 * One expression's contribution to an element's provenance.
 *
 * `op` and `note` are lazy: the two attributes they feed are off by default
 * while `rd-source` is on, and classifying an expression or writing its note
 * costs several more AST walks than collecting its paths. Reading either
 * property computes it (memoised); leaving it alone costs nothing.
 */
export interface SourceExpression {
  readonly paths: readonly string[];
  readonly op: SourceOp;
  readonly note: string;
}

export const SOURCE_OP_NONE: SourceOp = { category: 'none' };

/** Operators that derive a new value rather than select or compare one. */
const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '%']);

// =============================================================================
// Memoisation
// =============================================================================

/**
 * One segment of a note: either fixed prose, or a placeholder for a data path
 * that has to be resolved through the caller's aliases at render time.
 */
type NoteSegment = string | { readonly path: string };

/** Stands in for "no aliases" so the absent case can key a `WeakMap`. */
const NO_ALIASES: PathAliases = new Map();

/** Stands in for "no caller op table", i.e. classify against the built-ins. */
const BUILTIN_OP_TABLE: SourceOpTable = {};

interface SourceTrackingCaches {
  readonly elementExpressions: WeakMap<ElementNode, readonly ExprAst[]>;
  readonly paths: WeakMap<ExprAst, readonly string[]>;
  readonly classifications: WeakMap<SourceOpTable, WeakMap<ExprAst, SourceOp>>;
  readonly notes: WeakMap<ExprAst, readonly NoteSegment[]>;
  readonly elements: WeakMap<
    ElementNode,
    WeakMap<
      PathAliases,
      WeakMap<SourceOpTable, Map<string, ElementSourceTracking | null>>
    >
  >;
  readonly loopAliases: WeakMap<
    PathAliases,
    WeakMap<ExprAst, Map<string, PathAliases | undefined>>
  >;
  readonly componentAliases: WeakMap<
    object,
    WeakMap<PathAliases, PathAliases | undefined>
  >;
}

function createCaches(): SourceTrackingCaches {
  return {
    elementExpressions: new WeakMap(),
    paths: new WeakMap(),
    classifications: new WeakMap(),
    notes: new WeakMap(),
    elements: new WeakMap(),
    loopAliases: new WeakMap(),
    componentAliases: new WeakMap(),
  };
}

let caches = createCaches();

/** Hit and miss counts for one cache. A miss is one run of the real work. */
export interface CacheCounts {
  readonly hits: number;
  readonly misses: number;
}

/**
 * What every memo in this module has done since the last reset.
 *
 * Exported as a diagnostic, and used by the tests that hold the line on cost:
 * misses must stay proportional to the size of the template, never to the
 * number of rows rendered through it.
 */
export interface SourceTrackingCacheStats {
  /** Per-element expression collection (`collectElementExpressions`). */
  readonly elementExpressions: CacheCounts;
  /** Per-expression path collection (`collectPaths`). */
  readonly paths: CacheCounts;
  /** Per-expression classification (`classifyExpression`). */
  readonly classifications: CacheCounts;
  /** Per-expression note construction (`describeExpression`). */
  readonly notes: CacheCounts;
  /** Finished attribute values for an element (`buildElementSourceTracking`). */
  readonly elements: CacheCounts;
  /** Loop alias maps (`loopAliases`). */
  readonly loopAliases: CacheCounts;
  /** Component alias maps (`componentAliases`). */
  readonly componentAliases: CacheCounts;
}

interface MutableCounts {
  hits: number;
  misses: number;
}

const counters: Readonly<
  Record<keyof SourceTrackingCacheStats, MutableCounts>
> = {
  elementExpressions: { hits: 0, misses: 0 },
  paths: { hits: 0, misses: 0 },
  classifications: { hits: 0, misses: 0 },
  notes: { hits: 0, misses: 0 },
  elements: { hits: 0, misses: 0 },
  loopAliases: { hits: 0, misses: 0 },
  componentAliases: { hits: 0, misses: 0 },
};

/** A snapshot, so a caller cannot watch the counters move under it. */
export function sourceTrackingCacheStats(): SourceTrackingCacheStats {
  return {
    elementExpressions: { ...counters.elementExpressions },
    paths: { ...counters.paths },
    classifications: { ...counters.classifications },
    notes: { ...counters.notes },
    elements: { ...counters.elements },
    loopAliases: { ...counters.loopAliases },
    componentAliases: { ...counters.componentAliases },
  };
}

/**
 * Drops every memo and zeroes the counters.
 *
 * The caches are weak and need no maintenance; this exists so a measurement
 * starts from a known state, and so a host that swaps its whole template set
 * can release the derived data without waiting for the collector.
 */
export function resetSourceTrackingCaches(): void {
  caches = createCaches();
  for (const key of Object.keys(counters) as (keyof typeof counters)[]) {
    counters[key].hits = 0;
    counters[key].misses = 0;
  }
}

/** Get-or-create one level of a nested weak cache. */
function level<K extends object, V>(
  map: WeakMap<K, V>,
  key: K,
  create: () => V
): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

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
 *
 * The result is memoised against the node and shared with every caller, so it
 * must not be modified. Paths are in the expression's own terms; use
 * `resolvePath` to put them in the caller's.
 */
export function collectPaths(expr: ExprAst): readonly string[] {
  const cached = caches.paths.get(expr);
  if (cached !== undefined) {
    counters.paths.hits++;
    return cached;
  }
  counters.paths.misses++;
  const paths = collectPathsUncached(expr);
  caches.paths.set(expr, paths);
  return paths;
}

function collectPathsUncached(expr: ExprAst): readonly string[] {
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
      case 'function':
        // A `@let` arrow reads data through its body. The parameters shadow
        // nothing that could be a path, so the body's paths are the function's.
        visit(node.body);
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

/**
 * Resolve and de-duplicate a whole expression's paths through a component.
 *
 * With no aliases in force there is nothing to rewrite, and the memoised list
 * is handed back as it is - copying it per element per render is exactly the
 * per-iteration cost this module exists to avoid.
 */
function resolvePaths(
  paths: readonly string[],
  aliases?: PathAliases
): readonly string[] {
  if (!aliases || aliases.size === 0) return paths;
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
    case 'function':
      return findOp(expr.body, category, table);
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
    case 'function':
      return hasArithmetic(expr.body);
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
 *
 * Answering this walks the expression up to five times, so the answer is
 * memoised per node and per op table - the table is part of the question.
 */
export function classifyExpression(
  expr: ExprAst,
  table?: SourceOpTable
): SourceOp {
  const byExpr = level(
    caches.classifications,
    table ?? BUILTIN_OP_TABLE,
    () => new WeakMap<ExprAst, SourceOp>()
  );
  const cached = byExpr.get(expr);
  if (cached !== undefined) {
    counters.classifications.hits++;
    return cached;
  }
  counters.classifications.misses++;
  const op = classifyExpressionUncached(expr, table);
  byExpr.set(expr, op);
  return op;
}

function classifyExpressionUncached(
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
 * The note for an expression, as fixed prose with holes where its data paths
 * go. Building it walks the whole expression, so it is built once per node;
 * only the holes depend on the aliases in force, and filling them is a lookup
 * per path rather than a second walk.
 */
function noteTemplate(expr: ExprAst): readonly NoteSegment[] {
  const cached = caches.notes.get(expr);
  if (cached !== undefined) {
    counters.notes.hits++;
    return cached;
  }
  counters.notes.misses++;
  const segments = buildNoteTemplate(expr);
  caches.notes.set(expr, segments);
  return segments;
}

function buildNoteTemplate(expr: ExprAst): readonly NoteSegment[] {
  const segments: NoteSegment[] = [];
  let pending = '';

  const text = (value: string): void => {
    pending += value;
  };

  const hole = (path: string): void => {
    if (pending !== '') {
      segments.push(pending);
      pending = '';
    }
    segments.push({ path });
  };

  const list = (nodes: readonly ExprAst[], parenthesize: boolean): void => {
    nodes.forEach((node, index) => {
      if (index > 0) text(', ');
      write(node, parenthesize);
    });
  };

  const write = (node: ExprAst, parenthesize = false): void => {
    switch (node.kind) {
      case 'literal':
        text(describeLiteral(node.value));
        return;
      case 'path':
        hole(serializePath(node.segments, node.isGlobal));
        return;
      case 'wildcard':
        hole(serializePath(node.path.segments, node.path.isGlobal));
        return;
      case 'call': {
        text(humanize(node.callee));
        if (node.args.length === 0) return;
        text(' of ');
        // A lone argument reads better bare; once arguments are separated by
        // commas an unbracketed operation becomes ambiguous.
        list(node.args, node.args.length > 1);
        return;
      }
      case 'binary': {
        // Nested operations keep their brackets, so a note can be read back as
        // the expression it describes.
        if (parenthesize) text('(');
        write(node.left, true);
        text(` ${node.operator} `);
        write(node.right, true);
        if (parenthesize) text(')');
        return;
      }
      case 'unary':
        text(node.operator);
        write(node.operand, true);
        return;
      case 'ternary': {
        if (parenthesize) text('(');
        write(node.condition);
        text(' ? ');
        write(node.truthy);
        text(' : ');
        write(node.falsy);
        if (parenthesize) text(')');
        return;
      }
      case 'array':
        text('[');
        list(node.elements, false);
        text(']');
        return;
      case 'member':
        write(node.object, true);
        text(serializePath(node.path));
        return;
      case 'function':
        text(`(${node.params.join(', ')}) => `);
        write(node.body);
        return;
    }
  };

  write(expr);
  if (pending !== '') segments.push(pending);
  return segments;
}

/** A path as a note names it: through the aliases, several joined by commas. */
function describePath(path: string, aliases?: PathAliases): string {
  if (!aliases || aliases.size === 0) return path;
  return resolvePath(path, aliases).join(', ');
}

function renderNote(
  segments: readonly NoteSegment[],
  aliases?: PathAliases
): string {
  let out = '';
  for (const segment of segments) {
    out +=
      typeof segment === 'string'
        ? segment
        : describePath(segment.path, aliases);
  }
  return out;
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
  return renderNote(noteTemplate(expr), aliases);
}

// =============================================================================
// Wire format
// =============================================================================

export interface BuildSourceExpressionOptions {
  readonly aliases?: PathAliases;
  readonly opTable?: SourceOpTable;
}

/**
 * Everything one expression contributes to its element's attributes.
 *
 * `op` and `note` are computed on access, not up front: the element builder
 * discards both unless the corresponding attribute was asked for, and they are
 * the expensive halves of the answer.
 */
export function buildSourceExpression(
  expr: ExprAst,
  options: BuildSourceExpressionOptions = {}
): SourceExpression {
  const { aliases, opTable } = options;
  return {
    paths: resolvePaths(collectPaths(expr), aliases),
    get op(): SourceOp {
      return classifyExpression(expr, opTable);
    },
    get note(): string {
      return describeExpression(expr, aliases);
    },
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
 *
 * The answer depends only on the node, so it is memoised and shared: callers
 * must not modify the returned array.
 */
export function collectElementExpressions(
  node: ElementNode
): readonly ExprAst[] {
  const cached = caches.elementExpressions.get(node);
  if (cached !== undefined) {
    counters.elementExpressions.hits++;
    return cached;
  }
  counters.elementExpressions.misses++;
  const exprs = collectElementExpressionsUncached(node);
  caches.elementExpressions.set(node, exprs);
  return exprs;
}

function collectElementExpressionsUncached(
  node: ElementNode
): readonly ExprAst[] {
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
 *
 * The answer is a function of the node, the alias map, the op table and the
 * requested attributes - never of the data - so it is cached against exactly
 * those four. A loop that renders one row template a thousand times reuses one
 * alias map (see `loopAliases`) and therefore builds its rows' attributes once.
 */
export function buildElementSourceTracking(
  node: ElementNode,
  options: ElementSourceTrackingOptions
): ElementSourceTracking | null {
  const byAliases = level(
    caches.elements,
    node,
    () =>
      new WeakMap<
        PathAliases,
        WeakMap<SourceOpTable, Map<string, ElementSourceTracking | null>>
      >()
  );
  const byTable = level(
    byAliases,
    options.aliases ?? NO_ALIASES,
    () =>
      new WeakMap<SourceOpTable, Map<string, ElementSourceTracking | null>>()
  );
  const byShape = level(
    byTable,
    options.opTable ?? BUILTIN_OP_TABLE,
    () => new Map<string, ElementSourceTracking | null>()
  );

  const shape = `${options.includeOp ? '1' : '0'}${options.includeNote ? '1' : '0'} ${options.prefix}`;
  const cached = byShape.get(shape);
  if (cached !== undefined || byShape.has(shape)) {
    counters.elements.hits++;
    return cached ?? null;
  }
  counters.elements.misses++;
  const tracking = buildElementSourceTrackingUncached(node, options);
  byShape.set(shape, tracking);
  return tracking;
}

function buildElementSourceTrackingUncached(
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
 *
 * Cached against the prop list and the caller's aliases, so a component
 * rendered once per row of a loop derives its aliases once.
 */
export function componentAliases(
  props: readonly { readonly name: string; readonly value: ExprAst }[],
  callerAliases?: PathAliases
): PathAliases | undefined {
  const byCaller = level(
    caches.componentAliases,
    props,
    () => new WeakMap<PathAliases, PathAliases | undefined>()
  );
  const key = callerAliases ?? NO_ALIASES;
  const cached = byCaller.get(key);
  if (cached !== undefined || byCaller.has(key)) {
    counters.componentAliases.hits++;
    return cached;
  }
  counters.componentAliases.misses++;
  const aliases = componentAliasesUncached(props, callerAliases);
  byCaller.set(key, aliases);
  return aliases;
}

function componentAliasesUncached(
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
 *
 * The index-free answer is the same for every iteration, so it is cached and
 * every row of a loop shares one map - which in turn lets the row's elements
 * share their finished attribute values. An indexed answer is different for
 * every row by construction: caching those would pin one map per row for the
 * life of the template, so they are built fresh and not retained.
 */
export function loopAliases(
  itemsExpr: ExprAst,
  itemVar: string,
  iterationType: 'of' | 'in',
  callerAliases?: PathAliases,
  index?: number
): PathAliases | undefined {
  if (itemsExpr.kind !== 'path') return callerAliases;

  if (index !== undefined) {
    counters.loopAliases.misses++;
    return buildLoopAliases(
      itemsExpr,
      itemVar,
      iterationType,
      callerAliases,
      index
    );
  }

  const byExpr = level(
    caches.loopAliases,
    callerAliases ?? NO_ALIASES,
    () => new WeakMap<ExprAst, Map<string, PathAliases | undefined>>()
  );
  const byVar = level(
    byExpr,
    itemsExpr,
    () => new Map<string, PathAliases | undefined>()
  );
  const key = `${iterationType} ${itemVar}`;
  const cached = byVar.get(key);
  if (cached !== undefined || byVar.has(key)) {
    counters.loopAliases.hits++;
    return cached;
  }
  counters.loopAliases.misses++;
  const aliases = buildLoopAliases(
    itemsExpr,
    itemVar,
    iterationType,
    callerAliases,
    index
  );
  byVar.set(key, aliases);
  return aliases;
}

function buildLoopAliases(
  itemsExpr: PathNode,
  itemVar: string,
  iterationType: 'of' | 'in',
  callerAliases?: PathAliases,
  index?: number
): PathAliases {
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
