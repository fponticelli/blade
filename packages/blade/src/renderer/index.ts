// Renderer
//
// ONE traversal of the template AST, parameterised by an output sink.
//
// There used to be three: a string renderer, a DOM renderer and a reactive
// converter in `@bladets/tempo`, eleven node kinds each. Thirty implementations
// of the same eleven semantics, and the duplication was not confined to
// dispatch - attribute handling, component prop evaluation and defaults, loop
// iteration, slot resolution and source-tracking emission each existed three
// times as near-identical blocks. Five divergences shipped as a direct result:
// `$!` raw interpolation was silently escaped in the DOM, static attribute
// values were escaped twice in the string output but not in the DOM, and so on.
//
// Everything that decides *what* to render lives here and only here: the AST
// walk, the scope rules, the loop and component and slot semantics, the choice
// of escaper for a position, and the resource accounting. A {@link RenderTarget}
// decides only how a finished piece of output is represented. A semantic fix
// applied here is applied to every sink at once and cannot drift again.

import type {
  AttributeNode,
  ComponentDefinition,
  ExprAttributeNode,
  MixedAttributeNode,
  ComponentNode,
  CompiledTemplate,
  ElementNode,
  EventAttributeNode,
  ForNode,
  IfNode,
  LetNode,
  MatchNode,
  SlotNode,
  SourceLocation,
  TemplateNode,
  TextNode,
  ExprAst,
} from '../ast/types.js';
import {
  isEventHandlerAttribute,
  isUrlAttribute,
  isVoidElement,
  namespaceForTag,
  type Namespace,
} from '../ast/html.js';
import type {
  Bindings,
  EvaluationContext,
  HelperRegistry,
  RenderWarning,
  Scope,
} from '../evaluator/index.js';
import {
  callValue,
  createBindings,
  evaluate,
  extendBindings,
  isCallable,
  isTemplateFunction,
} from '../evaluator/index.js';
import { producesJsonSource } from '../helpers/metadata.js';
import type { CompileOptions } from '../compiler/index.js';
import { compileOrThrow } from '../compiler/index.js';
import {
  buildElementSourceTracking,
  componentAliases,
  loopAliases,
  sourceAttributeName,
  type ElementSourceTracking,
  type PathAliases,
  type SourceOpTable,
} from '../source-tracking/index.js';
import { RenderError, ResourceLimitError } from './errors.js';
import { DEFAULT_RESOURCE_LIMITS, type ResourceLimits } from './limits.js';
import {
  BLOCKED_URL,
  escapeContextForElementText,
  escapeCssValue,
  sanitizeUrlAttribute,
  stripUrlControlCharacters,
  type EscapeContext,
} from './escape.js';
import { OutputBudget } from './target.js';
import type {
  AttributeBinding,
  AttributePart,
  ElementSpec,
  EventBinding,
  RenderPosition,
  RenderTarget,
  RenderedAttribute,
  TemplateEventHandler,
} from './target.js';
import { EAGER, constant } from './reactive.js';
import type { Dyn, DynScope, Reactivity } from './reactive.js';
import { StringTarget } from './string-target.js';
import { DomTarget } from './dom-target.js';

// The renderer is the package's rendering surface: everything a host needs to
// drive a render, or to write a target of its own, is reachable from here.
export * from './errors.js';
export * from './limits.js';
export * from './escape.js';
export * from './target.js';
export * from './reactive.js';
export * from './decode.js';
// The element facts a sink needs to turn an `ElementSpec` into a node: how a
// tag and an attribute are spelled in the namespace the traversal resolved.
// Exported here rather than left inside `ast/html.ts` because an out-of-tree
// target - the reactive one in `@bladets/tempo` - has to answer exactly the
// same question as `DomTarget`, and answering it a second time is how `<clipPath>`
// came to be created as `<clippath>`.
export {
  canonicalAttributeName,
  canonicalTagName,
  type Namespace,
} from '../ast/html.js';
export { StringTarget } from './string-target.js';
export { DomTarget } from './dom-target.js';

// =============================================================================
// Source Tracking Configuration
// =============================================================================

/**
 * Valid HTML attribute name prefix pattern.
 * Must start with letter or underscore, followed by alphanumeric, hyphens, or underscores.
 * Empty string is also valid (handled separately).
 */
const VALID_PREFIX_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Validates that a source tracking prefix produces valid HTML attribute names.
 * Empty string is valid (results in unprefixed attributes like "source", "source-op").
 * Non-empty prefix must start with letter/underscore and contain only alphanumeric,
 * hyphens, and underscores.
 *
 * @param prefix - The prefix to validate
 * @throws Error if the prefix is invalid
 *
 * @example
 * ```typescript
 * validateSourceTrackingPrefix('rd-');        // Valid (default)
 * validateSourceTrackingPrefix('data-track-'); // Valid
 * validateSourceTrackingPrefix('');            // Valid (empty)
 * validateSourceTrackingPrefix('123-');        // Throws error
 * validateSourceTrackingPrefix('my@prefix');   // Throws error
 * ```
 */
export function validateSourceTrackingPrefix(prefix: string): void {
  if (prefix === '') {
    return; // Empty string is valid - results in unprefixed attributes
  }
  if (!VALID_PREFIX_REGEX.test(prefix)) {
    throw new Error(
      `Invalid sourceTrackingPrefix "${prefix}". ` +
        `Prefix must be empty or start with a letter/underscore and contain only alphanumeric characters, hyphens, and underscores.`
    );
  }
}

// =============================================================================
// Render Options and Configuration
// =============================================================================

export interface RenderOptions {
  globals?: Record<string, unknown>;
  helpers?: HelperRegistry;
  config?: Partial<RenderConfig>;
  /**
   * Overrides for the render's resource ceilings; unset keys keep
   * {@link DEFAULT_RESOURCE_LIMITS}.
   */
  limits?: Partial<ResourceLimits>;
  /**
   * When the render makes the decisions that depend on data.
   *
   * Defaults to {@link EAGER}: every decision is made once, as the traversal
   * reaches it, which is what a string or a DOM fragment needs. A host that
   * renders into a live tree supplies a reactivity that binds the decisions
   * instead, and gets this traversal's scope rules, loop and slot semantics,
   * escaping choices and resource ceilings unchanged.
   */
  reactivity?: Reactivity;
}

export interface RenderConfig {
  includeComments: boolean;
  includeSourceTracking: boolean;
  preserveWhitespace: boolean;
  /**
   * Escape evaluated values written into character data.
   *
   * Only the HTML-body sink is affected. The `<script>` and `<style>` escapers
   * are not a safety net that a caller may decline - a `"` interpolated into a
   * JavaScript string literal ends it whether or not the caller wants escaping,
   * so turning this off would produce a syntax error rather than raw output.
   */
  htmlEscape: boolean;
  sourceTrackingPrefix: string;
  includeOperationTracking: boolean;
  includeNoteGeneration: boolean;
  /**
   * Report the loop element actually rendered - `positions[7].weight` - rather
   * than the pattern `positions[*].weight`.
   *
   * The pattern identifies the template node; the concrete index identifies the
   * value, which is what a provenance registry needs to join a rendered cell
   * back to the datum behind it. A consumer that wants the pattern can always
   * recover it from the index, never the other way round.
   *
   * Only affects `includeSourceTracking` output.
   */
  resolveLoopIndices: boolean;
  /**
   * Source-op classification for helpers outside the built-in registry.
   * Custom helpers are otherwise classified by expression shape alone.
   */
  helperSourceOps?: SourceOpTable;
  /**
   * Let an expression contribute CSS *structure* to a `style` attribute.
   *
   * Off by default, and then an interpolated value is escaped as a CSS value:
   * `style="width: ${pct}%"` works, and a value carrying `; position: fixed`
   * adds no declaration of its own. That is the position an interpolation
   * almost always occupies, so the safe answer is also the useful one.
   *
   * Turn this on to interpolate a whole declaration - `style="${row % 2 ? 'background: #eee;' : ''}"` -
   * which no escaper can distinguish from an injection. The values become the
   * caller's responsibility; the render still records a warning naming the
   * attribute, so the decision stays visible in the metadata.
   */
  allowStyleInterpolation?: boolean;
}

/**
 * Default render configuration.
 */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  includeComments: false,
  includeSourceTracking: false,
  preserveWhitespace: false,
  htmlEscape: true,
  sourceTrackingPrefix: 'rd-',
  includeOperationTracking: false,
  includeNoteGeneration: false,
  resolveLoopIndices: false,
};

// =============================================================================
// Render Results
// =============================================================================

export interface RenderResult {
  html: string;
  metadata: RuntimeMetadata;
}

export interface DomRenderResult {
  nodes: Node[];
  metadata: RuntimeMetadata;
}

export interface RuntimeMetadata {
  /**
   * Data paths this render actually read, in the notation the expressions were
   * written in - the same notation `compiled.root.metadata.pathsAccessed` uses,
   * so subtracting one from the other answers "which fields went untouched".
   *
   * This is a strict subset of the static set: an untaken `@if` arm, a
   * short-circuited `||` and a loop over an empty array contribute nothing.
   */
  pathsAccessed: Set<string>;
  /** Helpers this render actually called, by the same rule. */
  helpersUsed: Set<string>;
  /**
   * Everything the render coerced, refused or replaced, in emission order.
   *
   * Helpers coerce rather than throw - `toInt("nope")` is `0` - and the
   * renderer substitutes rather than throws too: a blocked `javascript:` URL,
   * a function stringified into a page. The warning is the only record that
   * what reached the page is not what was in the data.
   */
  warnings: readonly RenderWarning[];
  renderTime: number;
  iterationCount: number;
  recursionDepth: number;
  /** Characters of output the render produced. */
  outputSize: number;
}

/**
 * Mutable counters that belong to a render rather than to one context in it.
 *
 * Every loop and component derives a child context, so a number stored on the
 * context stops travelling back up at the first copy: nested iterations would
 * go uncounted and the deepest nesting would be forgotten on the way out.
 * Holding them behind one shared reference is what makes `iterationCount` a
 * total and `recursionDepth` a high-water mark.
 *
 * Structurally an `EvaluationTracking`, so the evaluator writes what an
 * expression read, called and complained about straight into the metadata this
 * render will report.
 */
export interface RenderStats {
  totalIterations: number;
  maxComponentDepthReached: number;
  readonly pathsAccessed: Set<string>;
  readonly helpersUsed: Set<string>;
  readonly warnings: RenderWarning[];
}

/** Fresh counters for one render. */
export function createRenderStats(): RenderStats {
  return {
    totalIterations: 0,
    maxComponentDepthReached: 0,
    pathsAccessed: new Set(),
    helpersUsed: new Set(),
    warnings: [],
  };
}

// =============================================================================
// Render Context
// =============================================================================

/**
 * Content a component call supplied for one slot, together with the context it
 * must be rendered in.
 *
 * The context is the whole point. Slot content is the *caller's* markup, and
 * the specification says so: it sees the caller's scope and not the component's
 * props. Holding bare nodes gave the renderer nowhere to put that binding, so
 * `<Card title="T">$name</Card>` rendered `$name` against `Card`'s props and
 * produced nothing - and source tracking attributed the caller's paths to the
 * callee's prop names.
 *
 * Carrying the caller's context is also what makes a forwarded slot terminate:
 * a `<slot/>` inside a nested component call resolves against the *caller's*
 * slot map, so the chain ends at the outermost fill instead of resolving to
 * itself until the stack runs out.
 */
export interface SlotContent {
  readonly nodes: readonly TemplateNode[];
  readonly ctx: RenderContext;
}

/**
 * State shared by every context in one render.
 *
 * The target, the budget and the reused evaluation context are all per-render
 * singletons; keeping them behind one reference means deriving a child context
 * copies a handful of fields rather than reconstructing the world.
 */
interface RenderRuntime {
  readonly target: RenderTarget<unknown>;
  readonly budget: OutputBudget;
  /** When this render makes the decisions that depend on data. */
  readonly reactivity: Reactivity;
  /**
   * The node being rendered, for the location on an error raised inside the
   * sink, which has no idea what produced the text it was handed.
   */
  readonly position: RenderPosition;
  /**
   * One evaluation context for the whole render, its `scope` reassigned before
   * each use.
   *
   * The evaluator never retains it - it derives its own for a function call -
   * so a single mutable cell replaces one four-field allocation per expression,
   * which at ~5000 expressions per 1000-row render was the dominant source of
   * minor GC in per-request server rendering.
   */
  readonly evalContext: EvaluationContext;
}

/**
 * Internal rendering context that tracks state during template rendering.
 * Extends the evaluation context with renderer-specific tracking.
 */
export interface RenderContext {
  /**
   * Bindings in force here.
   *
   * Read-only, and derived rather than mutated: a construct that binds a name
   * hands its siblings a new context. `@let` used to write through this field,
   * and an eager render survived it only because it started from a fresh
   * context every time - the same mutation in a render that builds once and
   * updates in place leaked a binding out of one `@if` arm and into the next.
   */
  readonly scope: DynScope;

  helpers: HelperRegistry;

  renderConfig: RenderConfig;

  /**
   * Resource ceilings. Also the evaluator's configuration: `ResourceLimits`
   * extends `EvaluatorConfig`, so this object is handed to `evaluate` as it is.
   */
  limits: ResourceLimits;

  // Depth of the path being rendered. Per-context on purpose: each loop,
  // component and slot expansion derives a child context, so these unwind by
  // themselves - and, unlike a counter incremented on the way in and
  // decremented on the way out, they are still right when the child's content
  // is built after the traversal that created it has returned.
  readonly currentLoopNesting: number;
  readonly componentDepth: number;
  /** Open `<slot>` expansions along the current path. */
  readonly slotDepth: number;

  /** Counters for the render as a whole, shared by every context in it. */
  stats: RenderStats;

  /**
   * Components in scope. Shared by reference: it is read-only and identical for
   * every context, so copying it per render bought nothing.
   */
  components: ReadonlyMap<string, ComponentDefinition>;

  /**
   * Names visible in the current scope that stand for caller data paths -
   * component props and loop variables. Used to report provenance in the
   * caller's terms rather than in local names.
   */
  pathAliases?: PathAliases;

  /** Content the caller passed for this component's slots, by slot name. */
  slots: ReadonlyMap<string, SlotContent>;

  /** Per-render singletons; never copied. */
  runtime: RenderRuntime;
}

const NO_SLOTS: ReadonlyMap<string, SlotContent> = new Map();

/**
 * Builds the sink for one render.
 *
 * A factory rather than a target, because the target needs the render's budget
 * and position cell and those belong to the render, not to the caller.
 */
export type TargetFactory<T> = (
  budget: OutputBudget,
  position: RenderPosition
) => RenderTarget<T>;

/**
 * Creates a new render context from options and template.
 *
 * @param template - The compiled template
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @param target - Sink the render writes into
 * @returns A fresh render context
 */
export function createRenderContext(
  template: CompiledTemplate,
  data: unknown,
  options?: RenderOptions,
  createTarget: TargetFactory<unknown> = (budget, position) =>
    new StringTarget(budget, position)
): RenderContext {
  const renderConfig = { ...DEFAULT_RENDER_CONFIG, ...options?.config };

  // Validate source tracking prefix before creating context (fail-fast)
  validateSourceTrackingPrefix(renderConfig.sourceTrackingPrefix);

  const limits: ResourceLimits = {
    ...DEFAULT_RESOURCE_LIMITS,
    ...options?.limits,
  };
  const helpers = options?.helpers ?? {};
  const stats = createRenderStats();
  const reactivity = options?.reactivity ?? EAGER;

  const scope = reactivity.rootScope(data, createBindings(options?.globals));

  const budget = new OutputBudget(
    limits.maxOutputChars,
    limits.maxRenderMillis
  );
  const position: RenderPosition = { location: template.root.location };

  const runtime: RenderRuntime = {
    target: createTarget(budget, position),
    budget,
    position,
    reactivity,
    evalContext: {
      scope: scope.snapshot(),
      helpers,
      config: limits,
      tracking: stats,
    },
  };

  return {
    scope,
    helpers,
    renderConfig,
    limits,
    currentLoopNesting: 0,
    componentDepth: 0,
    slotDepth: 0,
    stats,
    components: template.root.components,
    slots: NO_SLOTS,
    runtime,
  };
}

// =============================================================================
// Evaluation
// =============================================================================

/**
 * Evaluates one expression against a set of concrete bindings.
 *
 * The shared evaluation context is rebound rather than rebuilt; see
 * {@link RenderRuntime.evalContext}. The scope is a parameter rather than a
 * field of `ctx` because a reactive render evaluates the same expression
 * against a different snapshot of the same bindings every time its inputs
 * change.
 */
function evaluateWith(
  ctx: RenderContext,
  scope: Scope,
  expr: ExprAst
): unknown {
  const evalContext = ctx.runtime.evalContext;
  evalContext.scope = scope;
  evalContext.helpers = ctx.helpers;
  return evaluate(expr, evalContext);
}

/**
 * A cell holding what `expr` evaluates to in this context.
 *
 * The one place an expression becomes a value, so the timing of that - now, or
 * whenever its inputs change - is the reactivity's business and nobody else's.
 */
function evaluateIn(ctx: RenderContext, expr: ExprAst): Dyn<unknown> {
  return ctx.runtime.reactivity.derive(
    ctx.scope,
    [expr],
    scope => evaluateWith(ctx, scope, expr),
    NOTHING
  );
}

/** The value a failed derivation stands in for: nothing was produced. */
function NOTHING(): undefined {
  return undefined;
}

/** Records something the render substituted, coerced or refused. */
function warn(
  ctx: RenderContext,
  message: string,
  location: SourceLocation
): void {
  ctx.stats.warnings.push({ message, location });
}

/**
 * Converts a value to a string for output.
 *
 * Null and undefined render as empty string, not "null" or "undefined".
 * Functions and symbols render as empty string too, and say so: `String(fn)` is
 * the function's *source text*, so a `@let` arrow interpolated by mistake used
 * to paste a piece of the template engine into the page.
 */
function valueToString(
  value: unknown,
  ctx: RenderContext,
  location: SourceLocation
): string {
  if (value === null || value === undefined) {
    return '';
  }
  // A `TemplateFunction` is an object, not a JavaScript function, so the
  // `typeof` test alone would let `String()` render it as `[object Object]`.
  if (isTemplateFunction(value)) {
    warn(
      ctx,
      'A template function was interpolated as a value; a function has no text form, so nothing was written. Call it instead.',
      location
    );
    return '';
  }
  const type = typeof value;
  if (type === 'function') {
    warn(
      ctx,
      'A function was interpolated as a value; a function has no text form, so nothing was written.',
      location
    );
    return '';
  }
  if (type === 'symbol') {
    warn(
      ctx,
      'A symbol was interpolated as a value; symbols have no text form, so nothing was written.',
      location
    );
    return '';
  }
  return String(value);
}

// =============================================================================
// Resource accounting
// =============================================================================

/** The passes a loop over nothing makes. */
const NO_PASSES: readonly unknown[] = [];

/**
 * Admits one loop's passes and enforces the iteration budgets.
 *
 * Enforced on the whole list before the first pass rather than pass by pass,
 * because a target that binds a list once and updates it in place never runs a
 * per-pass counter at all: it is handed the items and renders them. Checking
 * the list is the only formulation that bounds both kinds of render, and it
 * reports the same numbers - a loop of 50,000 against a ceiling of 1,000 is
 * still `1001 > 1000`, the count at which it would have stopped.
 *
 * `taken` is the run-wide total as it stood when this loop was reached, and the
 * count is replayed from there rather than added to whatever the counter
 * happens to hold. An eager render reaches each loop once, so this is exactly
 * a running total; an incremental one re-measures a list every time it changes,
 * and without the rewind the hundredth honest update of a ten-row table would
 * be refused as if it were the ten-thousandth row of one.
 *
 * @returns `passes`, so the check sits in the derivation that produces them
 */
function admitIterations(
  ctx: RenderContext,
  taken: number,
  passes: readonly unknown[],
  location: SourceLocation
): readonly unknown[] {
  if (passes.length > ctx.limits.maxIterationsPerLoop) {
    throw new ResourceLimitError(
      'iterations',
      ctx.limits.maxIterationsPerLoop + 1,
      ctx.limits.maxIterationsPerLoop,
      location
    );
  }

  ctx.stats.totalIterations = taken + passes.length;
  if (ctx.stats.totalIterations > ctx.limits.maxTotalIterations) {
    throw new ResourceLimitError(
      'iterations',
      ctx.stats.totalIterations,
      ctx.limits.maxTotalIterations,
      location
    );
  }
  // A loop whose body produces nothing still costs time; the sink's own
  // sampling would never see it. The deadline belongs to the pass that started
  // the clock, so an incremental render - whose updates happen minutes later,
  // on somebody else's stack - is not measured against it.
  if (!ctx.runtime.reactivity.incremental) {
    ctx.runtime.budget.checkDeadline(location);
  }
  return passes;
}

/**
 * The depth of a component body, having enforced the nesting budget.
 *
 * The depth reported to callers is a high-water mark, not the depth at the end:
 * a template that nests ten deep once would otherwise be indistinguishable from
 * a flat one.
 */
function enterComponent(ctx: RenderContext, location: SourceLocation): number {
  const depth = ctx.componentDepth + 1;
  ctx.stats.maxComponentDepthReached = Math.max(
    ctx.stats.maxComponentDepthReached,
    depth
  );
  if (depth > ctx.limits.maxComponentDepth) {
    throw new ResourceLimitError(
      'componentDepth',
      depth,
      ctx.limits.maxComponentDepth,
      location
    );
  }
  return depth;
}

/**
 * Expressions a construct reads, memoised against the node that owns them.
 *
 * A reactive render needs the set to work out what a decision depends on, and
 * it is the same set on every render of the same node; an eager render ignores
 * it entirely, so it must not cost an allocation per pass to assemble.
 */
const nodeReads = new WeakMap<object, readonly ExprAst[]>();

function readsOf(
  node: object,
  collect: () => readonly ExprAst[]
): readonly ExprAst[] {
  const cached = nodeReads.get(node);
  if (cached !== undefined) return cached;
  const reads = collect();
  nodeReads.set(node, reads);
  return reads;
}

// =============================================================================
// Element sites
// =============================================================================

/**
 * Where in the document a run of nodes sits.
 *
 * Both fields are properties of the enclosing element, and both change what the
 * renderer must do with a value: the namespace decides how the sink creates
 * elements, and the text context decides which escaper is correct. Passed down
 * as an argument rather than stored on the context, so descending into an
 * element costs nothing.
 */
interface Site {
  readonly namespace: Namespace;
  /** The sink an interpolated value in this element's content goes into. */
  readonly textContext: EscapeContext;
}

const ROOT_SITE: Site = { namespace: 'html', textContext: 'html-body' };

/** Everything about an element that depends only on the AST node. */
interface ElementPlan {
  readonly spec: Omit<ElementSpec, 'attributes' | 'listeners'>;
  readonly site: Site;
}

/**
 * Per-node element plans, keyed by the namespace they were resolved in.
 *
 * `namespaceForTag` and `isVoidElement` both lower-case the tag, which
 * allocates a string per element per render; a template with 7000 static
 * attributes spent 44% of its render time re-deriving answers that had not
 * changed since it was compiled. Three namespaces, so the inner record is
 * bounded.
 */
const elementPlans = new WeakMap<
  ElementNode,
  Partial<Record<Namespace, ElementPlan>>
>();

function planElement(node: ElementNode, parent: Site): ElementPlan {
  let byNamespace = elementPlans.get(node);
  if (byNamespace === undefined) {
    byNamespace = {};
    elementPlans.set(node, byNamespace);
  }
  const cached = byNamespace[parent.namespace];
  if (cached !== undefined) return cached;

  const namespace = namespaceForTag(node.tag, parent.namespace);
  const plan: ElementPlan = {
    spec: {
      tag: node.tag,
      namespace,
      // Voidness is an HTML concept; a foreign element closes itself only by
      // being written `<tag/>`, which the parser already turned into an
      // element with no children.
      isVoid: namespace === 'html' && isVoidElement(node.tag),
    },
    site: {
      namespace,
      textContext: escapeContextForElementText(node.tag, namespace),
    },
  };
  byNamespace[parent.namespace] = plan;
  return plan;
}

// =============================================================================
// Attributes
// =============================================================================

/**
 * Rendered forms of attributes that never change.
 *
 * A static attribute produces the same {@link RenderedAttribute} on every
 * render, and handing the target the same object each time lets the target
 * cache its own encoding of it too.
 */
const staticAttributes = new WeakMap<AttributeNode, AttributeBinding>();

/**
 * The attribute to emit, or null to drop it from the element entirely.
 *
 * A dropped attribute and an absent one are different answers: an event handler
 * built from an expression is refused for good, so it never reaches a sink,
 * while `disabled=${x}` is present or absent according to the data and has to
 * stay bound so it can change its mind.
 *
 * Three policies live here, and here only, so that every sink applies them:
 * a false or nullish value omits the attribute, a URL-valued attribute with any
 * dynamic part is validated as a URL, and an event-handler attribute with any
 * dynamic part is refused.
 */
function buildAttribute(
  attr: Exclude<AttributeNode, EventAttributeNode>,
  ctx: RenderContext,
  location: SourceLocation
): AttributeBinding | null {
  if (attr.kind === 'static') {
    const cached = staticAttributes.get(attr);
    if (cached !== undefined) return cached;
    const built: AttributeBinding = {
      name: attr.name,
      attribute: constant<RenderedAttribute | null>({
        kind: 'parts',
        name: attr.name,
        parts: [{ kind: 'source', source: attr.value }],
      }),
    };
    staticAttributes.set(attr, built);
    return built;
  }

  if (isEventHandlerAttribute(attr.name)) {
    // There is no encoder for this position: the value would land in
    // JavaScript source that the engine never parses, so "escaped" would be a
    // guess. The compiler refuses this at build time; a template that reached
    // a renderer without passing through it still must not emit the handler.
    warn(
      ctx,
      `Attribute '${attr.name}' was dropped: an event handler cannot be built from an expression, because there is no correct way to escape a value into JavaScript source the engine does not parse.`,
      location
    );
    return null;
  }

  const reads = readsOf(attr, () =>
    attr.kind === 'expr'
      ? [attr.expr]
      : attr.segments.flatMap(segment =>
          segment.kind === 'static' ? [] : [segment.expr]
        )
  );

  return {
    name: attr.name,
    attribute: ctx.runtime.reactivity.derive(
      ctx.scope,
      reads,
      scope => buildAttributeValue(attr, ctx, scope, location),
      () => null
    ),
  };
}

/** What a dynamic attribute is worth right now, or null to omit it. */
function buildAttributeValue(
  attr: ExprAttributeNode | MixedAttributeNode,
  ctx: RenderContext,
  scope: Scope,
  location: SourceLocation
): RenderedAttribute | null {
  let parts: AttributePart[];

  if (attr.kind === 'expr') {
    const value = evaluateWith(ctx, scope, attr.expr);

    // A boolean is presence, not text: true renders the bare name, false omits
    // the attribute.
    if (typeof value === 'boolean') {
      return value ? { kind: 'boolean', name: attr.name } : null;
    }
    if (value === null || value === undefined) {
      return null;
    }
    parts = [{ kind: 'value', value: valueToString(value, ctx, location) }];
  } else {
    parts = [];
    for (const segment of attr.segments) {
      if (segment.kind === 'static') {
        parts.push({ kind: 'source', source: segment.value });
      } else {
        const value = evaluateWith(ctx, scope, segment.expr);
        parts.push({
          kind: 'value',
          value:
            value === null || value === undefined
              ? ''
              : valueToString(value, ctx, location),
        });
      }
    }
  }

  if (isUrlAttribute(attr.name)) {
    parts = applyUrlPolicy(parts, attr.name, ctx, location);
  } else if (attr.name.toLowerCase() === 'style') {
    parts = applyStylePolicy(parts, ctx, location);
  }

  return { kind: 'parts', name: attr.name, parts };
}

/**
 * The listener for one `on:` binding, or null when there is nothing to bind.
 *
 * Three refusals, all of them here so that all three sinks make the same one:
 * a sink that cannot hold a listener, a binding with no event name, and an
 * expression that produced something that is not callable. Each is a warning
 * with a location rather than a silent omission, because a dead button looks
 * exactly like a working one.
 *
 * The handler is wrapped rather than passed through: a `@let` arrow is a
 * {@link TemplateFunction}, not a JavaScript function, and the sink has no
 * business knowing the difference.
 */
function buildListener(
  attr: EventAttributeNode,
  ctx: RenderContext,
  fallback: SourceLocation
): EventBinding | null {
  const location = attr.location ?? fallback;

  if (!ctx.runtime.target.bindsEvents) {
    warn(
      ctx,
      `Binding '${attr.name}' was dropped: this render produces output that cannot hold a listener. Render to the DOM, or to a reactive tree, for '${attr.name}' to do anything.`,
      location
    );
    return null;
  }

  if (attr.event === '') {
    warn(
      ctx,
      `Binding '${attr.name}' was dropped: it names no event.`,
      location
    );
    return null;
  }

  const handler = ctx.runtime.reactivity.derive<TemplateEventHandler | null>(
    ctx.scope,
    readsOf(attr, () => [attr.expr]),
    scope => {
      const value = evaluateWith(ctx, scope, attr.expr);
      if (value === null || value === undefined) return null;
      if (!isCallable(value)) {
        warn(
          ctx,
          `Binding '${attr.name}' was dropped: the expression produced ${typeof value}, which cannot be called.`,
          location
        );
        return null;
      }
      // The scope as it stood when the binding was made, so the handler runs
      // against the row it belongs to rather than against whatever the shared
      // evaluation context was last pointed at.
      const callContext: EvaluationContext = {
        scope,
        helpers: ctx.helpers,
        config: ctx.limits,
        tracking: ctx.stats,
      };
      return (event: unknown) =>
        callValue(value, [event], callContext, location);
    },
    NO_HANDLER
  );

  return { event: attr.event, handler };
}

/** The handler a failed derivation stands in for: nothing to run. */
function NO_HANDLER(): null {
  return null;
}

/**
 * Constrains what an interpolated value may contribute to a `style` attribute.
 *
 * A style value is a CSS declaration list, and HTML escaping does nothing to it
 * - `;` and `{` are not HTML-special. Escaping the value half of a declaration
 * as a CSS value is: `#fff`, `1.5em`, `50%` and `Helvetica, sans-serif` survive
 * unchanged, while `; position: fixed; top: 0` cannot end the declaration it is
 * in. Static segments are the author's own CSS and are left alone.
 */
function applyStylePolicy(
  parts: readonly AttributePart[],
  ctx: RenderContext,
  location: SourceLocation
): AttributePart[] {
  if (ctx.renderConfig.allowStyleInterpolation) {
    for (const part of parts) {
      if (part.kind !== 'value' || part.value === '') continue;
      warn(
        ctx,
        `An expression contributed unescaped CSS to a 'style' attribute; allowStyleInterpolation is on, so the value was not constrained.`,
        location
      );
      break;
    }
    return [...parts];
  }

  return parts.map(part => {
    if (part.kind !== 'value') return part;
    const escaped = escapeCssValue(part.value);
    if (escaped !== part.value) {
      warn(
        ctx,
        `A value interpolated into 'style' was escaped as a CSS value, so it can only be a value and not a declaration. Set allowStyleInterpolation if it was meant to be CSS.`,
        location
      );
    }
    return { kind: 'value', value: escaped };
  });
}

/**
 * Validates the URL an attribute is about to carry.
 *
 * HTML escaping is structurally the wrong defence here - `javascript:alert(1)`
 * contains no HTML-special character, so escaping passes it through untouched -
 * so the scheme is checked instead.
 *
 * The check runs on the *assembled* value rather than segment by segment,
 * because a URL is one thing: `href="javascript:${x}"` puts the scheme in the
 * static half and the payload in the dynamic one, and neither half is
 * suspicious alone. Control characters are stripped from the dynamic parts
 * first, since browsers strip them while parsing and a `javascript:` URL split
 * by a tab still runs.
 */
function applyUrlPolicy(
  parts: readonly AttributePart[],
  name: string,
  ctx: RenderContext,
  location: SourceLocation
): AttributePart[] {
  let dynamic = false;
  const cleaned: AttributePart[] = [];
  let probe = '';
  for (const part of parts) {
    if (part.kind === 'source') {
      probe += part.source;
      cleaned.push(part);
      continue;
    }
    dynamic = true;
    const value = stripUrlControlCharacters(part.value);
    probe += value;
    cleaned.push({ kind: 'value', value });
  }

  // A fully author-written URL is the author's own choice, and validating it
  // would refuse the `javascript:` bookmarklet somebody deliberately wrote.
  if (!dynamic) return cleaned;

  if (sanitizeUrlAttribute(probe).blocked) {
    warn(
      ctx,
      `Attribute '${name}' was blocked: '${probe.slice(0, 64)}' is not an allowed URL scheme.`,
      location
    );
    return [{ kind: 'value', value: BLOCKED_URL }];
  }
  return cleaned;
}

// =============================================================================
// Source Tracking
// =============================================================================

/**
 * Rendered source-tracking attributes, keyed by the tracking object.
 *
 * `buildElementSourceTracking` is identity-stable per node, alias map and
 * config, so a loop that renders one row template a thousand times builds these
 * attribute objects once.
 */
const trackingAttributes = new WeakMap<
  ElementSourceTracking,
  readonly AttributeBinding[]
>();

/**
 * Source tracking attributes for an element, or none when tracking is off or
 * the element has nothing of its own to report.
 */
function sourceTrackingAttributes(
  node: ElementNode,
  ctx: RenderContext
): readonly AttributeBinding[] {
  const config = ctx.renderConfig;
  if (!config.includeSourceTracking) return [];

  const tracking = buildElementSourceTracking(node, {
    prefix: config.sourceTrackingPrefix,
    includeOp: config.includeOperationTracking,
    includeNote: config.includeNoteGeneration,
    aliases: ctx.pathAliases,
    opTable: config.helperSourceOps,
  });
  if (!tracking) return [];

  const cached = trackingAttributes.get(tracking);
  if (cached !== undefined) return cached;

  const prefix = config.sourceTrackingPrefix;
  const attrs: AttributeBinding[] = [
    attributeFromText(sourceAttributeName(prefix, 'source'), tracking.source),
  ];
  if (tracking.op !== null) {
    attrs.push(
      attributeFromText(sourceAttributeName(prefix, 'source-op'), tracking.op)
    );
  }
  if (tracking.note !== null) {
    attrs.push(
      attributeFromText(
        sourceAttributeName(prefix, 'source-note'),
        tracking.note
      )
    );
  }
  trackingAttributes.set(tracking, attrs);
  return attrs;
}

function attributeFromText(name: string, value: string): AttributeBinding {
  return {
    name,
    attribute: constant<RenderedAttribute | null>({
      kind: 'parts',
      name,
      parts: [{ kind: 'value', value }],
    }),
  };
}

/** Aliases in force inside a component body, or undefined when tracking is off. */
function componentPathAliases(
  node: ComponentNode,
  ctx: RenderContext
): PathAliases | undefined {
  if (!ctx.renderConfig.includeSourceTracking) return undefined;
  return componentAliases(node.props, ctx.pathAliases);
}

/**
 * Aliases in force inside a loop body, or the caller's when tracking is off.
 *
 * `index` is the position being rendered, and is reported only when
 * `resolveLoopIndices` is on; otherwise the body is named by the pattern, which
 * is identical for every iteration - and identical means one shared alias map
 * for the whole loop, which is what lets the per-element tracking cache hit on
 * every row. Passing the index unconditionally would silently restore
 * O(iterations) work. Key iteration passes none: the variable there stands for
 * a key, which has no element to point at.
 */
function loopPathAliases(
  node: ForNode,
  ctx: RenderContext,
  index?: number
): PathAliases | undefined {
  const config = ctx.renderConfig;
  if (!config.includeSourceTracking) return ctx.pathAliases;
  return loopAliases(
    node.itemsExpr,
    node.itemVar,
    node.iterationType,
    ctx.pathAliases,
    config.resolveLoopIndices ? index : undefined
  );
}

// =============================================================================
// Node rendering
// =============================================================================

function renderText(node: TextNode, ctx: RenderContext, site: Site): void {
  const target = ctx.runtime.target;
  const escapeBody = ctx.renderConfig.htmlEscape;

  for (const segment of node.segments) {
    if (segment.kind === 'literal') {
      target.literalText(segment.text, site.textContext);
      continue;
    }

    const location = segment.location;
    const expr = segment.expr;
    const text = ctx.runtime.reactivity.derive(
      ctx.scope,
      readsOf(segment, () => [expr]),
      scope => valueToString(evaluateWith(ctx, scope, expr), ctx, location),
      EMPTY_TEXT
    );

    if (segment.unsafe || (site.textContext === 'html-body' && !escapeBody)) {
      target.rawHtml(text);
      continue;
    }

    target.text(text, textContextFor(expr, site));
  }
}

/** The text a failed derivation stands in for. */
function EMPTY_TEXT(): string {
  return '';
}

/**
 * The sink an interpolated value in element content is written into.
 *
 * Inside a `<script>` a value is normally a JavaScript *string*, but JSON is
 * JavaScript source already: run through a string escaper it comes out as a
 * quoted pile of backslashes, which is what pushed every author of
 * `<script>var d = ${toJson(x)}</script>` onto the raw `$!` sink and straight
 * into a `</script>` breakout. Recognising the call keeps the safe form correct.
 */
function textContextFor(expr: ExprAst, site: Site): EscapeContext {
  if (
    site.textContext === 'raw-text-js' &&
    expr.kind === 'call' &&
    producesJsonSource(expr.callee)
  ) {
    return 'script-json';
  }
  return site.textContext;
}

function renderElement(
  node: ElementNode,
  ctx: RenderContext,
  site: Site
): void {
  const plan = planElement(node, site);

  const attributes: AttributeBinding[] = [];
  const listeners: EventBinding[] = [];
  for (const attr of node.attributes) {
    if (attr.kind === 'event') {
      const listener = buildListener(attr, ctx, node.location);
      if (listener !== null) listeners.push(listener);
      continue;
    }
    const rendered = buildAttribute(attr, ctx, node.location);
    if (rendered !== null) attributes.push(rendered);
  }
  attributes.push(...sourceTrackingAttributes(node, ctx));

  ctx.runtime.target.element({ ...plan.spec, attributes, listeners }, () => {
    renderNodes(node.children, ctx, plan.site);
  });
}

function renderIf(node: IfNode, ctx: RenderContext, site: Site): void {
  const branches = node.branches;
  const elseBranch = node.elseBranch;

  // Conditions are evaluated in order and stop at the first that holds, so an
  // untaken arm still contributes nothing to `pathsAccessed`. A reactive render
  // has to *depend* on all of them - which one decides is itself data - and
  // that is a dependency, not an evaluation.
  const choose = ctx.runtime.reactivity.derive(
    ctx.scope,
    readsOf(node, () => branches.map(branch => branch.condition)),
    scope => {
      for (let i = 0; i < branches.length; i++) {
        if (evaluateWith(ctx, scope, branches[i]!.condition)) return i;
      }
      return elseBranch ? branches.length : -1;
    },
    NO_ARM
  );

  ctx.runtime.reactivity.branch(
    choose,
    elseBranch ? branches.length + 1 : branches.length,
    index => {
      const body =
        index < branches.length ? branches[index]!.body : elseBranch!;
      renderNodes(body, ctx, site);
    }
  );
}

/** The arm a failed selection picks: none. */
function NO_ARM(): number {
  return -1;
}

/**
 * What one `@for` iterates over: the array's elements for `of`, its keys for
 * `in`. Anything that is not iterable in the requested sense yields no passes.
 */
function passesOf(node: ForNode, items: unknown): readonly unknown[] {
  if (node.iterationType === 'of') {
    return Array.isArray(items) ? items : NO_PASSES;
  }
  if (items === null || items === undefined) return NO_PASSES;
  return Array.isArray(items)
    ? items.map((_, i) => i)
    : Object.keys(items as object);
}

function renderFor(node: ForNode, ctx: RenderContext, site: Site): void {
  const nesting = ctx.currentLoopNesting + 1;
  if (nesting > ctx.limits.maxLoopNesting) {
    throw new ResourceLimitError(
      'loopNesting',
      nesting,
      ctx.limits.maxLoopNesting,
      node.location
    );
  }

  const reactivity = ctx.runtime.reactivity;
  const byIndex = node.iterationType === 'of';
  const taken = ctx.stats.totalIterations;

  // Keys computed for the list as it last stood. Filled by the same derivation
  // that produces the list, because that is where "the list changed" is known,
  // and read by `keyOf` below - so the key expression is evaluated once per
  // element per change rather than once per element per reconciliation.
  const keys = node.key === undefined ? null : new Map<unknown, unknown>();

  // The budget is enforced on the list, inside the derivation that produces it,
  // which is the only point both kinds of render pass through: an incremental
  // target is handed the whole list and renders it, so a per-pass counter in
  // the body below would be checked after the list had already been built.
  const passes = reactivity.derive(
    ctx.scope,
    readsOf(node, () =>
      node.key ? [node.itemsExpr, node.key] : [node.itemsExpr]
    ),
    scope => {
      const list = admitIterations(
        ctx,
        taken,
        passesOf(node, evaluateWith(ctx, scope, node.itemsExpr)),
        node.location
      );
      if (keys !== null) indexKeys(node, ctx, scope, list, keys);
      return list;
    },
    NO_ITEMS
  );

  const keyOf =
    keys === null
      ? undefined
      : (item: unknown): unknown =>
          keys.has(item) ? keys.get(item) : keyValue(node, ctx, item);

  reactivity.each(
    passes,
    (item, index) => {
      // The loop variable is a local, not an entry smuggled into the data, so
      // an enclosing `@let` of the same name is shadowed by it rather than the
      // other way round - and the caller's data object is never copied per row.
      const bindings: Record<string, Dyn<unknown>> = { [node.itemVar]: item };
      if (byIndex && node.indexVar !== undefined) {
        bindings[node.indexVar] = index;
      }

      renderNodes(
        node.body,
        {
          ...ctx,
          scope: reactivity.extendScope(ctx.scope, bindings),
          currentLoopNesting: nesting,
          pathAliases: loopPathAliases(
            node,
            ctx,
            byIndex ? index.value : undefined
          ),
        },
        site
      );
    },
    keyOf
  );
}

/**
 * What one pass of a keyed loop *is*.
 *
 * The key expression sees the item variable and nothing else the loop
 * introduced. Not the index: an identity that depends on where a row sits is
 * not an identity, and the validator refuses a key that reads the index
 * variable rather than leaving it to fail silently here.
 */
function keyValue(node: ForNode, ctx: RenderContext, item: unknown): unknown {
  const outer = ctx.scope.snapshot();
  return evaluateWith(
    ctx,
    {
      locals: extendBindings(outer.locals, { [node.itemVar]: item }),
      data: outer.data,
      globals: outer.globals,
    },
    node.key!
  );
}

/**
 * Keys every element of the list, and reports a repeat.
 *
 * Duplicate keys are a defect in the template, not in the data: two rows that
 * claim to be the same row give an incremental render no way to tell them
 * apart, and it will move one onto the other. Reported once per pass over the
 * list however many repeats there are, because the interesting fact is that
 * the key is not a key.
 */
function indexKeys(
  node: ForNode,
  ctx: RenderContext,
  scope: Scope,
  list: readonly unknown[],
  keys: Map<unknown, unknown>
): void {
  keys.clear();
  const seen = new Set<unknown>();
  let duplicate = false;

  for (const item of list) {
    const key = evaluateWith(
      ctx,
      {
        locals: extendBindings(scope.locals, { [node.itemVar]: item }),
        data: scope.data,
        globals: scope.globals,
      },
      node.key!
    );
    keys.set(item, key);
    if (seen.has(key)) duplicate = true;
    else seen.add(key);
  }

  if (duplicate) {
    warn(
      ctx,
      `@for over '${node.itemVar}' produced duplicate keys, so its rows cannot be told apart. Key by something unique to each element.`,
      node.location
    );
  }
}

/** The list a failed derivation stands in for: no passes at all. */
function NO_ITEMS(): readonly unknown[] {
  return NO_PASSES;
}

function renderMatch(node: MatchNode, ctx: RenderContext, site: Site): void {
  const reactivity = ctx.runtime.reactivity;
  const cases = node.cases;
  const defaultCase = node.defaultCase;

  // One cell for the subject, shared by the case conditions and by every case
  // body through the binding of `_`. Evaluating the subject once per case would
  // call its helpers once per case; binding `_` to anything but this cell would
  // leave the matched value unreadable in the arm written to render it.
  const subject = evaluateIn(ctx, node.value);
  const caseCtx: RenderContext = {
    ...ctx,
    scope: reactivity.extendScope(ctx.scope, { _: subject }),
  };

  const choose = reactivity.derive(
    caseCtx.scope,
    readsOf(node, () => [
      node.value,
      ...cases.flatMap(matchCase =>
        matchCase.kind === 'literal' ? [] : [matchCase.condition]
      ),
    ]),
    scope => {
      const value = scope.locals['_'];
      for (let i = 0; i < cases.length; i++) {
        const matchCase = cases[i]!;
        if (matchCase.kind === 'literal') {
          if (matchCase.values.includes(value as string | number | boolean)) {
            return i;
          }
          continue;
        }
        if (evaluateWith(ctx, scope, matchCase.condition)) return i;
      }
      return defaultCase ? cases.length : -1;
    },
    NO_ARM
  );

  reactivity.branch(
    choose,
    defaultCase ? cases.length + 1 : cases.length,
    index => {
      if (index === cases.length) {
        renderNodes(defaultCase!, ctx, site);
        return;
      }
      const matchCase = cases[index]!;
      // A literal case names nothing, so it renders in the enclosing scope; an
      // expression case renders in the one where `_` is the subject.
      renderNodes(
        matchCase.body,
        matchCase.kind === 'literal' ? ctx : caseCtx,
        site
      );
    }
  );
}

/**
 * Binds a name for the rest of the enclosing block.
 *
 * The binding is a *cell*, not a value, so a `@let` in an incremental render is
 * re-evaluated when its inputs change instead of freezing whatever the data
 * happened to say when the traversal walked past it. The new context is
 * returned rather than written into the old one: {@link renderNodes} threads it
 * to the later siblings, which is what makes the binding visible to them and to
 * nobody else - including the other arm of an enclosing `@if`, which shares
 * this context and may be built long afterwards.
 */
function bindLet(node: LetNode, ctx: RenderContext): RenderContext {
  const reactivity = ctx.runtime.reactivity;
  const value = reactivity.derive(
    ctx.scope,
    readsOf(node, () => [node.value]),
    scope => {
      const bound = evaluateWith(ctx, scope, node.value);
      // A closure captures the scope as it stood when the arrow was evaluated,
      // which is one binding short of including itself. The binder is the only
      // place that knows the name, so it closes the `letrec` loop here -
      // without it a recursive `@let` function fails with UNKNOWN_HELPER.
      if (isTemplateFunction(bound)) bound.captureSelf(node.name);
      return bound;
    },
    NOTHING
  );

  return {
    ...ctx,
    scope: node.isGlobal
      ? reactivity.extendGlobals(ctx.scope, node.name, value)
      : reactivity.extendScope(ctx.scope, { [node.name]: value }),
  };
}

function renderComponent(
  node: ComponentNode,
  ctx: RenderContext,
  site: Site
): void {
  const depth = enterComponent(ctx, node.location);

  const definition = ctx.components.get(node.name);
  if (!definition) {
    throw new RenderError(
      `Unknown component: ${node.name}`,
      node.location,
      'UNKNOWN_COMPONENT'
    );
  }

  const reactivity = ctx.runtime.reactivity;
  const props = reactivity.derive(
    ctx.scope,
    readsOf(node, () => [
      ...node.props.map(prop => prop.value),
      ...definition.props.flatMap(declaration =>
        declaration.defaultValue === undefined ? [] : [declaration.defaultValue]
      ),
    ]),
    scope => evaluateProps(node, definition, ctx, scope),
    NO_PROPS,
    // A prop set that says the same thing is the same prop set. Without this an
    // incremental render rebuilds the object on every tick of the caller's
    // data, and its fresh identity invalidates every expression in the
    // component body and in everything the body nests.
    sameBindings
  );

  renderNodes(
    definition.body,
    {
      ...ctx,
      scope: reactivity.componentScope(props, ctx.scope),
      slots: partitionSlots(node, ctx),
      pathAliases: componentPathAliases(node, ctx),
      componentDepth: depth,
    },
    site
  );
}

/**
 * The component's props: what the call passed, then the declared defaults for
 * everything it did not.
 *
 * Built on a null-prototype record, so a prop literally named `__proto__`
 * becomes an ordinary binding instead of reassigning the object's prototype.
 */
function evaluateProps(
  node: ComponentNode,
  definition: ComponentDefinition,
  ctx: RenderContext,
  scope: Scope
): Bindings {
  const props = createBindings();
  for (const prop of node.props) {
    props[prop.name] = evaluateWith(ctx, scope, prop.value);
  }
  for (const declaration of definition.props) {
    if (declaration.name in props) continue;
    if (declaration.defaultValue === undefined) continue;
    props[declaration.name] = evaluateWith(
      ctx,
      scope,
      declaration.defaultValue
    );
  }
  return props;
}

/** The props a failed derivation stands in for: none at all. */
function NO_PROPS(): Bindings {
  return createBindings();
}

/** Whether two binding sets hold the same names bound to the same values. */
function sameBindings(a: Bindings, b: Bindings): boolean {
  if (a === b) return true;
  // A cell asks whether its new value equals its old one before it has ever
  // held a value, so the first comparison of a render is against nothing.
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  const names = Object.keys(a);
  if (names.length !== Object.keys(b).length) return false;
  for (const name of names) {
    if (!Object.is(a[name], b[name])) return false;
  }
  return true;
}

/**
 * Splits a component call's children into the named slots they fill and the
 * default slot.
 *
 * Every entry carries the caller's context, because slot content is the
 * caller's markup and is evaluated in the caller's scope.
 */
function partitionSlots(
  node: ComponentNode,
  ctx: RenderContext
): ReadonlyMap<string, SlotContent> {
  const slots = new Map<string, SlotContent>();
  let defaultNodes: TemplateNode[] | undefined;

  for (const child of node.children) {
    if (child.kind === 'slot-fill') {
      const existing = slots.get(child.name);
      slots.set(child.name, {
        nodes: existing
          ? [...existing.nodes, ...child.children]
          : child.children,
        ctx,
      });
      continue;
    }
    (defaultNodes ??= []).push(child);
  }

  if (defaultNodes !== undefined) {
    slots.set('default', { nodes: defaultNodes, ctx });
  }
  return slots;
}

/**
 * Renders the content a caller supplied for this slot, or the slot's own
 * fallback.
 *
 * The two are rendered in different contexts, and that is the point: supplied
 * content belongs to the caller and sees the caller's scope, while the fallback
 * is part of the component and sees the component's props.
 */
function renderSlot(node: SlotNode, ctx: RenderContext, site: Site): void {
  const content = ctx.slots.get(node.name ?? 'default');

  if (content && content.nodes.length > 0) {
    const depth = ctx.slotDepth + 1;
    if (depth > ctx.limits.maxSlotDepth) {
      throw new ResourceLimitError(
        'slotDepth',
        depth,
        ctx.limits.maxSlotDepth,
        node.location
      );
    }
    // The caller's context, at this expansion's depth: the content is the
    // caller's markup and sees the caller's scope, but the chain of expansions
    // that reached it is a property of where it is being rendered.
    renderNodes(content.nodes, { ...content.ctx, slotDepth: depth }, site);
    return;
  }

  if (node.fallback) {
    renderNodes(node.fallback, ctx, site);
  }
}

// =============================================================================
// Dispatch
// =============================================================================

/**
 * Renders one node and returns the context its later siblings see.
 *
 * The single dispatch point for the whole engine. Every sink, every semantic
 * rule and every resource ceiling meets here exactly once. Only `@let` returns
 * anything but the context it was given.
 */
function renderNode(
  node: TemplateNode,
  ctx: RenderContext,
  site: Site
): RenderContext {
  ctx.runtime.position.location = node.location;

  try {
    switch (node.kind) {
      case 'text':
        renderText(node, ctx, site);
        return ctx;
      case 'element':
        renderElement(node, ctx, site);
        return ctx;
      case 'if':
        renderIf(node, ctx, site);
        return ctx;
      case 'for':
        renderFor(node, ctx, site);
        return ctx;
      case 'match':
        renderMatch(node, ctx, site);
        return ctx;
      case 'let':
        return bindLet(node, ctx);
      case 'component':
        renderComponent(node, ctx, site);
        return ctx;
      case 'fragment':
        renderNodes(node.children, ctx, site);
        return ctx;
      case 'slot':
        renderSlot(node, ctx, site);
        return ctx;
      case 'slot-fill':
        // A fill is only meaningful as the direct child of a component call,
        // where `partitionSlots` consumes it before it is ever rendered.
        // Anywhere else it names a slot that does not exist; the compiler says
        // so, and the renderer emits nothing rather than the tag's own text.
        return ctx;
      case 'comment':
        if (ctx.renderConfig.includeComments && node.style === 'html') {
          ctx.runtime.target.comment(node.text);
        }
        return ctx;
      case 'doctype':
        ctx.runtime.target.doctype(node.value);
        return ctx;
      case 'props':
        // A prop declaration is compile-time metadata, not content.
        return ctx;
      default: {
        const _exhaustive: never = node;
        throw new Error(
          `Unknown node kind: ${(_exhaustive as TemplateNode).kind}`
        );
      }
    }
  } catch (error) {
    // Anything raised below this point - an EvaluationError from a mistyped
    // helper, a TypeError out of a host helper - becomes a RenderError naming
    // the node that was being rendered. One typo used to abort a 5,000-line
    // template with a message that named no element, line or column.
    if (error instanceof RenderError) throw error;
    throw new RenderError(
      error instanceof Error ? error.message : String(error),
      node.location,
      'RENDER_FAILED',
      error
    );
  }
}

/**
 * Renders a run of sibling nodes as one block.
 *
 * The scope is *threaded* through the siblings rather than written into a
 * shared context: a `@let` hands the nodes after it a context of their own, and
 * the list ends without anything having been mutated. That is what makes `@let`
 * block-scoped everywhere, once - it used to be scoped by whoever happened to
 * copy the context, so the same declaration leaked out of an `@if`, out of an
 * element, and out of a literal `@match` case but not an expression one - and
 * it is also what stops a binding made in one arm of an `@if` from being
 * visible in the other when the arms are built at different times.
 *
 * A node kind added later cannot forget: every construct's children go through
 * this function.
 */
function renderNodes(
  nodes: readonly TemplateNode[],
  ctx: RenderContext,
  site: Site
): void {
  let current = ctx;
  for (const node of nodes) {
    current = renderNode(node, current, site);
  }
}

// =============================================================================
// Renderer Function Types
// =============================================================================

/**
 * Function that renders a template to an HTML string.
 *
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Rendered HTML string and metadata
 */
export type StringRenderer = (
  data: unknown,
  options?: RenderOptions
) => RenderResult;

/**
 * Function that renders a template to DOM nodes.
 *
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Array of DOM nodes and metadata
 */
export type DomRenderer = (
  data: unknown,
  options?: RenderOptions
) => DomRenderResult;

// =============================================================================
// Driving a render
// =============================================================================

/**
 * Runs one render of `template` into a target of the caller's choosing.
 *
 * The whole engine, exported: a host that wants a third representation - a
 * reactive tree, a stream, a pretty-printer - writes a {@link RenderTarget} and
 * gets the AST walk, the scope rules, the slot semantics, the escaping choices
 * and the resource ceilings for free, instead of a fourth copy of them.
 *
 * @typeParam T - What the target produces
 * @param template - Compiled template to render
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @param createTarget - Builds the sink from the render's budget and position
 * @returns The target's output and the metadata for this render
 *
 * @example
 * ```typescript
 * const { output, metadata } = renderTo(
 *   template,
 *   data,
 *   options,
 *   (budget, position) => new StringTarget(budget, position)
 * );
 * ```
 */
export function renderTo<T>(
  template: CompiledTemplate,
  data: unknown,
  options: RenderOptions | undefined,
  createTarget: TargetFactory<T>
): { output: T; metadata: RuntimeMetadata } {
  const startTime = performance.now();

  let target!: RenderTarget<T>;
  const ctx = createRenderContext(template, data, options, (budget, pos) => {
    target = createTarget(budget, pos);
    return target;
  });

  renderNodes(template.root.children, ctx, ROOT_SITE);

  return {
    output: target.finish(),
    metadata: {
      pathsAccessed: ctx.stats.pathsAccessed,
      helpersUsed: ctx.stats.helpersUsed,
      warnings: ctx.stats.warnings,
      renderTime: performance.now() - startTime,
      iterationCount: ctx.stats.totalIterations,
      recursionDepth: ctx.stats.maxComponentDepthReached,
      outputSize: ctx.runtime.budget.charsWritten,
    },
  };
}

// =============================================================================
// Renderer Factory Functions
// =============================================================================

/**
 * Creates a string rendering function from a compiled template.
 *
 * @param template - Compiled template to create renderer from
 * @returns Function that renders the template to HTML strings
 *
 * @example
 * ```typescript
 * const compiled = compileOrThrow('<div>Hello, ${name}!</div>');
 * const renderToString = createStringRenderer(compiled);
 * renderToString({ name: 'Alice' }).html; // "<div>Hello, Alice!</div>"
 * ```
 */
export function createStringRenderer(
  template: CompiledTemplate
): StringRenderer {
  return (data: unknown, options?: RenderOptions): RenderResult => {
    const { output, metadata } = renderTo(
      template,
      data,
      options,
      (budget, position) => new StringTarget(budget, position)
    );
    return { html: output, metadata };
  };
}

/**
 * Creates a DOM rendering function from a compiled template.
 *
 * @param template - Compiled template to create renderer from
 * @returns Function that renders the template to DOM nodes
 *
 * @example
 * ```typescript
 * const renderToDom = createDomRenderer(compileOrThrow('<div>${name}</div>'));
 * document.body.append(...renderToDom({ name: 'Alice' }).nodes);
 * ```
 */
export function createDomRenderer(template: CompiledTemplate): DomRenderer {
  return (data: unknown, options?: RenderOptions): DomRenderResult => {
    const { output, metadata } = renderTo(
      template,
      data,
      options,
      (budget, position) => new DomTarget(budget, position)
    );
    return { nodes: output, metadata };
  };
}

// =============================================================================
// Convenience API
// =============================================================================

/**
 * Renders a compiled template to an HTML string.
 *
 * For repeated rendering, use {@link createStringRenderer}.
 *
 * @param template - Compiled template to render
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Rendered HTML string and metadata
 */
export function render(
  template: CompiledTemplate,
  data: unknown,
  options?: RenderOptions
): RenderResult {
  return createStringRenderer(template)(data, options);
}

/**
 * Compiles a template source and returns a ready-to-use string renderer.
 *
 * @param source - Template source string
 * @param compileOptions - Optional compilation options
 * @returns A function that renders data to HTML
 * @throws {CompileError} When the source does not compile cleanly
 *
 * @example
 * ```typescript
 * const render = compileToString('<div>Hello, ${name}!</div>');
 * render({ name: 'World' }).html; // "<div>Hello, World!</div>"
 * ```
 */
export function compileToString(
  source: string,
  compileOptions?: CompileOptions
): StringRenderer {
  return createStringRenderer(compileOrThrow(source, compileOptions));
}
