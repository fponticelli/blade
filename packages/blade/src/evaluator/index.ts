// Evaluator module
// Expression evaluation for Blade templates
//
// Template data is untrusted input, and in CMS and multi-tenant deployments the
// template itself is untrusted too. Two rules follow, and every function below
// is written to keep them:
//
//   1. An expression reads *own* properties of the values it was given, and
//      nothing else. The prototype chain is not a place data lives, so it is not
//      a place expressions may look.
//   2. The only things an expression can call are the helpers the host
//      registered and the functions the template itself defined with `@let`.
//      Data never supplies a callable.

import type {
  ExprAst,
  LiteralNode,
  PathNode,
  UnaryNode,
  BinaryNode,
  TernaryNode,
  CallNode,
  ArrayWildcardNode,
  ArrayNode,
  MemberAccessNode,
  FunctionExpr,
  SourceLocation,
} from '../ast/types.js';
import { serializePath } from '../source-tracking/index.js';

// =============================================================================
// Path Serialization Cache
// =============================================================================

/**
 * Serialized form of each path node, computed once.
 *
 * A node's segments never change, so its string never does either - but the
 * node is re-evaluated on every pass of every loop, and rebuilding the string
 * there would make metadata collection cost proportional to iterations rather
 * than to template size. Keyed weakly, so the cache dies with the template.
 */
const serializedPaths = new WeakMap<PathNode | ArrayWildcardNode, string>();

function pathKey(node: PathNode | ArrayWildcardNode): string {
  const cached = serializedPaths.get(node);
  if (cached !== undefined) return cached;
  const path = node.kind === 'path' ? node : node.path;
  const serialized = serializePath(path.segments, path.isGlobal);
  serializedPaths.set(node, serialized);
  return serialized;
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Why an evaluation stopped.
 *
 * - `UNKNOWN_HELPER` - the callee is not a registered helper and not a function
 *   bound in scope.
 * - `NOT_CALLABLE` - the callee resolved to a value that is not callable.
 * - `RESOURCE_LIMIT` - a configured ceiling in {@link EvaluatorConfig} was
 *   reached.
 */
export type EvaluationErrorCode =
  | 'UNKNOWN_HELPER'
  | 'NOT_CALLABLE'
  | 'RESOURCE_LIMIT'
  | 'HELPER_FAILED';

/**
 * Error thrown during expression evaluation.
 * Includes source location for debugging and optional error code.
 */
export class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code?: EvaluationErrorCode | string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EvaluationError';
  }
}

/**
 * A helper could not complete.
 *
 * Helpers have no source location - they are called from expressions, and it
 * is the CALL that has a position - so this carries no location of its own.
 * {@link evaluateCall} attaches one, which is the point: the standard library
 * can raise a precise message about the argument it was given without every
 * helper having to be handed a location it cannot otherwise use, and no bare
 * platform error escapes to a caller that has no idea what produced it.
 *
 * The original failure is always kept as `cause`.
 */
export class HelperError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'HelperError';
  }
}

// =============================================================================
// Property Access
// =============================================================================

/**
 * Property names an expression may never resolve, in data or in scope.
 *
 * `hasOwnProperty` already keeps the prototype chain out of reach - none of
 * these three is an own property of a plain object or an array - so this set is
 * the second lock rather than the first: it holds even for data that carries
 * one of the names as a real own property, which is the only way a host could
 * hand a template a live constructor by accident.
 */
const RESERVED_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Whether `name` is one of the property names templates may never resolve.
 *
 * Exported so that every layer that builds a lookup out of untrusted names -
 * component props, loop variables, host helper registries - applies the same
 * rule as expression evaluation, rather than growing its own copy.
 */
export function isReservedPropertyName(name: string): boolean {
  return RESERVED_PROPERTY_NAMES.has(name);
}

const objectHasOwnProperty = Object.prototype.hasOwnProperty;

/** `Object.hasOwn`, spelled so it also works on null-prototype objects. */
function hasOwn(target: object, key: string | number): boolean {
  return objectHasOwnProperty.call(target, key);
}

/**
 * Read one property of a value, with implicit optional chaining.
 *
 * Only own properties are readable, and only of objects, arrays and strings.
 * Functions are opaque: template data is never a function, so a function
 * reached through data is a host object that leaked in, and the way to stop
 * `${x.constructor.constructor}` from being `Function` is to make the second
 * hop impossible rather than to blocklist the first.
 *
 * Anything unreadable is `undefined`, which is what the engine already renders
 * as empty - a missing path and a forbidden path are indistinguishable to the
 * template, on purpose.
 */
function accessProperty(obj: unknown, key: string | number): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (typeof key === 'string' && isReservedPropertyName(key)) {
    return undefined;
  }

  // Strings expose exactly one intrinsic: their length.
  if (typeof obj === 'string') {
    return key === 'length' ? obj.length : undefined;
  }

  // Numbers, booleans, bigints, symbols and functions expose nothing.
  if (typeof obj !== 'object') {
    return undefined;
  }

  if (Array.isArray(obj)) {
    // Indices and `length` are own properties of an array; naming them here
    // skips the hasOwnProperty call on the hot path of every loop body.
    if (typeof key === 'number') {
      return obj[key];
    }
    if (key === 'length') {
      return obj.length;
    }
  }

  return hasOwn(obj, key)
    ? (obj as Record<string | number, unknown>)[key]
    : undefined;
}

// =============================================================================
// Scope
// =============================================================================

/**
 * A set of named values - locals or globals.
 *
 * Always null-prototype: built with {@link createBindings} or
 * {@link extendBindings} and never with an object literal. A `{}` literal
 * carries every `Object.prototype` name, so `${toString}` would resolve to a
 * native function and a datum genuinely named `toString` would be unreachable
 * behind it.
 */
export type Bindings = Record<string, unknown>;

/**
 * A fresh null-prototype binding set, optionally seeded from a plain object.
 *
 * Only own enumerable entries are copied, and the target has no prototype, so a
 * `__proto__` key in the source becomes an ordinary binding instead of
 * reassigning the prototype of the result.
 */
export function createBindings(
  source?: Readonly<Record<string, unknown>>
): Bindings {
  const bindings = Object.create(null) as Bindings;
  if (source) {
    for (const key of Object.keys(source)) {
      bindings[key] = source[key];
    }
  }
  return bindings;
}

/**
 * `base` extended with `entries`, without copying `base`.
 *
 * The child is `Object.create(base)`, so the base is left untouched - scopes
 * are values, and a loop body or a function call can extend one without the
 * extension escaping upward - but a loop that runs a thousand times no longer
 * copies its enclosing locals a thousand times. That was the dominant
 * allocation in a per-request render.
 *
 * Prototype chaining is only safe because every chain bottoms out at
 * `Object.create(null)`: no link reaches `Object.prototype`, so a lookup that
 * walks the chain can never find `toString`, `constructor` or any other
 * inherited member. {@link hasBinding} is the lookup that goes with it.
 */
export function extendBindings(
  base: Readonly<Bindings>,
  entries: Readonly<Record<string, unknown>>
): Bindings {
  const bindings = Object.create(base) as Bindings;
  for (const key of Object.keys(entries)) {
    bindings[key] = entries[key];
  }
  return bindings;
}

/**
 * Whether `name` is bound in a binding set or in one it extends.
 *
 * `in` rather than `hasOwnProperty`, because {@link extendBindings} chains
 * rather than copies. It is exactly as tight: the chain is rooted at a
 * null-prototype object, so there is nothing above the outermost scope to find.
 */
export function hasBinding(
  bindings: Readonly<Bindings>,
  name: string
): boolean {
  // Fast negative: one engine-level lookup rules out the whole chain.
  if (!(name in bindings)) return false;
  // A positive answer is confirmed link by link, stopping at
  // `Object.prototype`. Bindings built here never reach it - the chain is
  // rooted at `Object.create(null)` - but a host may hand `Scope` a plain
  // object literal, and `${toString}` must not resolve to a native function
  // there either.
  let target: object | null = bindings;
  while (target !== null && target !== Object.prototype) {
    if (objectHasOwnProperty.call(target, name)) return true;
    target = Object.getPrototypeOf(target) as object | null;
  }
  return false;
}

export interface Scope {
  locals: Bindings;
  data: unknown;
  globals: Bindings;
}

/**
 * Resolve the first segment of a path through the scope hierarchy.
 * For regular paths: locals → data
 * For global paths ($.prefix): globals only
 */
function resolveFirstSegment(
  name: string,
  isGlobal: boolean,
  scope: Scope
): unknown {
  if (isReservedPropertyName(name)) {
    return undefined;
  }
  if (isGlobal) {
    return hasBinding(scope.globals, name) ? scope.globals[name] : undefined;
  }
  if (hasBinding(scope.locals, name)) {
    return scope.locals[name];
  }
  return accessProperty(scope.data, name);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * The helpers a host makes callable from templates.
 *
 * Supplied as a plain record for convenience; it is normalized into an
 * allowlist before a single lookup happens - see {@link resolveHelperRegistry}.
 * The default registry is empty, so an evaluation with no registry can call
 * nothing at all.
 *
 * The allowlist is captured the first time a registry object is used and is
 * keyed by that object's identity, so mutating a registry afterwards does not
 * change what is callable. Assemble the registry first - {@link
 * createHelperRegistry} makes that explicit - rather than growing it under a
 * running render.
 */
export interface HelperRegistry {
  [name: string]: HelperFunction;
}

/**
 * The budgets a helper must respect.
 *
 * Passed in rather than read from a module constant, so a host that lowers
 * {@link EvaluatorConfig.maxHelperStringLength} lowers it for the helpers too:
 * `repeat("x", 5e7)` is one call and 50 MB, and a ceiling that only the helper
 * module knows about is a ceiling the caller cannot set.
 */
export interface HelperLimits {
  /** Upper bound, in UTF-16 code units, on the string one call may produce. */
  readonly maxStringLength: number;
}

/**
 * A helper: curried once per call with the scope, a warning sink and the
 * budgets in force, then applied to the call's arguments.
 *
 * The third parameter is optional so that a helper which needs none of it can
 * be written with two - every existing helper still typechecks - while the
 * evaluator always supplies it.
 */
export type HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void,
  limits?: HelperLimits
) => (...args: unknown[]) => unknown;

/**
 * Normalized registries, keyed by the object the host handed in.
 *
 * The normalization is the security boundary - own enumerable function-valued
 * entries and nothing else - so it must happen exactly once per registry rather
 * than being re-derived per call. A registry is a long-lived object owned by the
 * host, so identity is a sound key and a weak one keeps nothing alive.
 */
const normalizedRegistries = new WeakMap<
  object,
  ReadonlyMap<string, HelperFunction>
>();

function normalizeHelpers(
  registry: HelperRegistry
): ReadonlyMap<string, HelperFunction> {
  const normalized = new Map<string, HelperFunction>();
  for (const name of Object.keys(registry)) {
    if (isReservedPropertyName(name)) continue;
    const helper = registry[name];
    if (typeof helper !== 'function') continue;
    normalized.set(name, helper);
  }
  return normalized;
}

/**
 * The allowlist behind a registry: own enumerable function-valued entries only.
 *
 * Inherited members are not in it, so indexing a registry supplied as a class
 * instance - or as any object with a polluted prototype - can no longer smuggle
 * a callable in, and `${constructor(1)}` is an `UNKNOWN_HELPER` error rather
 * than a raw `TypeError`.
 */
function resolveHelperRegistry(
  registry: HelperRegistry
): ReadonlyMap<string, HelperFunction> {
  const cached = normalizedRegistries.get(registry);
  if (cached !== undefined) return cached;
  const normalized = normalizeHelpers(registry);
  normalizedRegistries.set(registry, normalized);
  return normalized;
}

/**
 * A frozen, null-prototype registry containing exactly the callable helpers of
 * `source`.
 *
 * Hosts that assemble a registry from several sources should end with this: it
 * validates once, up front, instead of leaving the check to the first template
 * that happens to call the entry.
 */
export function createHelperRegistry(
  source: Readonly<Record<string, unknown>>
): Readonly<HelperRegistry> {
  const registry = Object.create(null) as HelperRegistry;
  for (const name of Object.keys(source)) {
    if (isReservedPropertyName(name)) continue;
    const helper = source[name];
    if (typeof helper !== 'function') continue;
    registry[name] = helper as HelperFunction;
  }
  const frozen = Object.freeze(registry);
  normalizedRegistries.set(frozen, normalizeHelpers(frozen));
  return frozen;
}

/**
 * Whether `name` resolves to a callable helper in `registry`.
 *
 * The same allowlist the evaluator calls through, so a validator that asks this
 * question statically gets the same answer the render will - and does not need
 * `name in registry`, which reports every inherited member as a helper.
 */
export function hasHelper(registry: HelperRegistry, name: string): boolean {
  return (
    !isReservedPropertyName(name) && resolveHelperRegistry(registry).has(name)
  );
}

// =============================================================================
// Configuration
// =============================================================================

export interface EvaluatorConfig {
  /**
   * Maximum depth of nested *helper* calls along one evaluation path, so
   * `outer(inner(x))` is depth two. Helpers cannot call back into evaluation,
   * so this bounds how deeply an expression may nest them.
   */
  maxFunctionDepth: number;
  /**
   * Maximum depth of nested *user-defined function* calls, which is what
   * recursion is made of: a `@let` function that calls itself adds one frame
   * per call.
   */
  maxRecursionDepth: number;
  /**
   * Upper bound, in UTF-16 code units, on the string a single helper call may
   * produce. Reaches the helpers as {@link HelperLimits.maxStringLength}.
   */
  maxHelperStringLength: number;
}

/**
 * The ceilings an evaluation uses when its context does not name its own.
 *
 * These are the values Section 10.1 of the specification documents. They live
 * here, next to the code that enforces them, so a host and the engine cannot
 * disagree about what the default is. `ResourceLimits` in the renderer is a
 * superset of this interface and is passed straight through, so the renderer
 * and the evaluator cannot drift either.
 */
export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  maxFunctionDepth: 10,
  maxRecursionDepth: 50,
  maxHelperStringLength: 1_000_000,
};

// =============================================================================
// Tracking
// =============================================================================

/**
 * A warning a helper raised while producing a value.
 *
 * Helpers coerce rather than throw - `toInt("nope")` is `0` - and the warning is
 * the only record that the value on the page is not the value in the data.
 * Carrying the helper name and the call's location makes it addressable: a
 * consumer can point at the expression that produced it.
 */
export interface RenderWarning {
  /** What went wrong, in the helper's own words. */
  readonly message: string;
  /**
   * Name of the helper that raised it, when a helper did.
   *
   * Absent for warnings the renderer raises on its own account - a blocked
   * `javascript:` URL, a function interpolated where text was expected - which
   * belong in the same channel because they answer the same question: what
   * reached the page that was not in the data?
   */
  readonly helper?: string;
  /** Location of the expression or node that raised it. */
  readonly location: SourceLocation;
}

/**
 * Sinks for what an evaluation actually read, called and complained about.
 *
 * Collection happens here rather than over the AST because only the evaluator
 * knows which branches ran: a short-circuited `||`, an untaken `@if` arm and a
 * loop over an empty array all read nothing, and a static walk cannot tell.
 * Paths are recorded in the notation the expression was written in - the same
 * notation the compiler records statically - so the two sets are comparable and
 * "declared but never read this render" is a set difference.
 */
export interface EvaluationTracking {
  readonly pathsAccessed: Set<string>;
  /** Callees this evaluation invoked: registered helpers and `@let` functions. */
  readonly helpersUsed: Set<string>;
  /** Warnings raised by helpers, in the order they were raised. */
  readonly warnings: RenderWarning[];
}

export interface EvaluationContext {
  scope: Scope;
  helpers: HelperRegistry;
  /** Optional; {@link DEFAULT_EVALUATOR_CONFIG} applies when absent. */
  config?: EvaluatorConfig;
  /** Optional; evaluation behaves identically without it. */
  tracking?: EvaluationTracking;
}

// =============================================================================
// Callables
// =============================================================================

/**
 * A function defined by a template with `@let name = (a, b) => ...`.
 *
 * A distinct type rather than a plain JavaScript closure, for three reasons:
 * only values of this type are callable from a template, so a host function
 * that leaks into scope cannot be invoked; the body is evaluated by the same
 * `evaluate` that runs every other expression, so the depth limits apply to
 * recursion; and the renderer can recognise one and refuse to stringify it into
 * the page.
 */
export class TemplateFunction {
  private capturedScope: Scope;

  constructor(
    public readonly params: readonly string[],
    public readonly body: ExprAst,
    capturedScope: Scope,
    public readonly location: SourceLocation
  ) {
    this.capturedScope = capturedScope;
  }

  /** The scope the function closed over. */
  get scope(): Scope {
    return this.capturedScope;
  }

  /**
   * Bind the function into its own captured scope under `name`, so that its
   * body can call it.
   *
   * A closure captures the scope as it stood when the arrow was evaluated,
   * which is one binding short of including itself - `letrec`, not `let`. The
   * binder that names the function is the only place that knows the name, so it
   * closes the loop by calling this once, immediately after evaluation.
   */
  captureSelf(name: string): void {
    if (isReservedPropertyName(name)) return;
    this.capturedScope = {
      locals: extendBindings(this.capturedScope.locals, { [name]: this }),
      data: this.capturedScope.data,
      globals: this.capturedScope.globals,
    };
  }
}

/** Whether `value` is a template-defined function. */
export function isTemplateFunction(value: unknown): value is TemplateFunction {
  return value instanceof TemplateFunction;
}

// =============================================================================
// Call Depth
// =============================================================================

/**
 * How many call frames of each kind are open along the current evaluation path.
 *
 * Two counters, because the two limits bound different things and neither
 * should be able to mask the other: helper nesting is a property of the
 * expression as written, while user-function depth is a property of what the
 * data made it do.
 *
 * Immutable and threaded downward, so unwinding is automatic and an exception
 * cannot leave a counter stranded. Only a call allocates one.
 */
interface CallDepth {
  readonly helpers: number;
  readonly functions: number;
}

const ROOT_DEPTH: CallDepth = { helpers: 0, functions: 0 };

// =============================================================================
// Node Evaluators
// =============================================================================

/**
 * Evaluate a literal node - returns the value directly.
 */
function evaluateLiteral(node: LiteralNode): unknown {
  return node.value;
}

/**
 * Evaluate a path node - traverse through scope and properties.
 */
function evaluatePath(node: PathNode, context: EvaluationContext): unknown {
  const { segments, isGlobal } = node;
  if (segments.length === 0) {
    return undefined;
  }

  context.tracking?.pathsAccessed.add(pathKey(node));

  // First segment must be a key
  const firstSegment = segments[0]!;
  if (firstSegment.kind !== 'key') {
    return undefined;
  }

  let current = resolveFirstSegment(firstSegment.key, isGlobal, context.scope);

  // Traverse remaining segments
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.kind === 'key') {
      current = accessProperty(current, segment.key);
    } else if (segment.kind === 'index') {
      current = accessProperty(current, segment.index);
    } else if (segment.kind === 'star') {
      // Star segments are handled by evaluateWildcard
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a unary node - apply ! or - operator.
 */
function evaluateUnary(
  node: UnaryNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  const operand = evaluateNode(node.operand, context, depth);
  switch (node.operator) {
    case '!':
      return !operand;
    case '-':
      return -(operand as number);
  }
}

/**
 * Evaluate a binary node - apply operator with type coercion.
 */
function evaluateBinary(
  node: BinaryNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  const { operator, left, right } = node;

  // Short-circuit evaluation for logical operators
  if (operator === '&&') {
    const leftVal = evaluateNode(left, context, depth);
    if (!leftVal) return leftVal;
    return evaluateNode(right, context, depth);
  }
  if (operator === '||') {
    const leftVal = evaluateNode(left, context, depth);
    if (leftVal) return leftVal;
    return evaluateNode(right, context, depth);
  }
  if (operator === '??') {
    const leftVal = evaluateNode(left, context, depth);
    if (leftVal !== null && leftVal !== undefined) return leftVal;
    return evaluateNode(right, context, depth);
  }

  // Evaluate both operands for non-short-circuit operators
  const leftVal = evaluateNode(left, context, depth);
  const rightVal = evaluateNode(right, context, depth);

  switch (operator) {
    // Arithmetic
    case '+':
      // String concatenation if either operand is string
      if (typeof leftVal === 'string' || typeof rightVal === 'string') {
        return String(leftVal) + String(rightVal);
      }
      return (leftVal as number) + (rightVal as number);
    case '-':
      return (leftVal as number) - (rightVal as number);
    case '*':
      return (leftVal as number) * (rightVal as number);
    case '/':
      return (leftVal as number) / (rightVal as number);
    case '%':
      return (leftVal as number) % (rightVal as number);

    // Comparison
    case '==':
      return leftVal == rightVal;
    case '!=':
      return leftVal != rightVal;
    case '<':
      return (leftVal as number) < (rightVal as number);
    case '>':
      return (leftVal as number) > (rightVal as number);
    case '<=':
      return (leftVal as number) <= (rightVal as number);
    case '>=':
      return (leftVal as number) >= (rightVal as number);

    default:
      return undefined;
  }
}

/**
 * Evaluate a ternary node - evaluate condition and return appropriate branch.
 */
function evaluateTernary(
  node: TernaryNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  const condition = evaluateNode(node.condition, context, depth);
  if (condition) {
    return evaluateNode(node.truthy, context, depth);
  } else {
    return evaluateNode(node.falsy, context, depth);
  }
}

/**
 * What a callee name resolved to.
 *
 * Locals and globals are searched before helpers, so a template's own functions
 * and the standard library share one namespace with the template's names
 * winning - the reading the specification implies when it says a user-defined
 * function may call other user-defined functions and registered helpers.
 * Data is not searched: it is untrusted, and untrusted input must not decide
 * what code runs.
 *
 * Globals are the one exception, and only for values that are not functions.
 * `$` is not just another scope: it is where the host puts CONFIGURATION, and
 * several standard helpers read their own configuration out of it under their
 * own name - `now()` returns `$.now` when one is set, exactly as `formatDate`
 * reads `$.locale` and `$.timezone`. Treating `$.now` as a shadowing binding
 * made that documented seam unreachable: setting a fixed clock, the one thing
 * it exists for, turned every `now()` in the template into
 * "Cannot call now: it is bound to a object, not a function". A non-function
 * global therefore falls through to a helper of the same name when one exists,
 * and only when one exists - with no helper to fall through to, the call is
 * still the NOT_CALLABLE mistake it always was.
 */
type ResolvedCallee =
  | { readonly kind: 'helper'; readonly helper: HelperFunction }
  | { readonly kind: 'function'; readonly fn: TemplateFunction };

function resolveCallee(
  node: CallNode,
  context: EvaluationContext
): ResolvedCallee {
  const name = node.callee;
  const { scope } = context;

  if (!isReservedPropertyName(name)) {
    let bound: unknown;
    let isBound = false;
    /** True when the binding came from `$` rather than from the template. */
    let isGlobal = false;
    if (hasBinding(scope.locals, name)) {
      bound = scope.locals[name];
      isBound = true;
    } else if (hasBinding(scope.globals, name)) {
      bound = scope.globals[name];
      isBound = true;
      isGlobal = true;
    }

    if (isBound) {
      if (isTemplateFunction(bound)) {
        return { kind: 'function', fn: bound };
      }
      // Host configuration under a helper's name is configuration FOR that
      // helper, not a shadowing binding. A callable global is still refused:
      // a host function is not callable from a template wherever it is bound,
      // and silently ignoring one would hide the host's intent.
      const configured =
        isGlobal && typeof bound !== 'function'
          ? resolveHelperRegistry(context.helpers).get(name)
          : undefined;
      if (configured !== undefined) {
        return { kind: 'helper', helper: configured };
      }
      // A name bound in scope shadows a helper of the same name. Falling
      // through to the helper here would make the shadowing silent and the
      // template's meaning depend on the registry.
      throw new EvaluationError(
        typeof bound === 'function'
          ? `Cannot call ${name}: it is bound to a host function, and only helpers and template functions are callable`
          : `Cannot call ${name}: it is bound to a ${describeType(bound)}, not a function`,
        node.location,
        'NOT_CALLABLE'
      );
    }

    const helper = resolveHelperRegistry(context.helpers).get(name);
    if (helper !== undefined) {
      return { kind: 'helper', helper };
    }
  }

  throw new EvaluationError(
    `Unknown helper function: ${name}`,
    node.location,
    'UNKNOWN_HELPER'
  );
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function limitExceeded(
  limit: keyof EvaluatorConfig,
  max: number,
  location: SourceLocation
): EvaluationError {
  return new EvaluationError(
    `Resource limit exceeded: ${limit} (${max})`,
    location,
    'RESOURCE_LIMIT'
  );
}

/**
 * Evaluate a call node - resolve the callee, then invoke it.
 */
function evaluateCall(
  node: CallNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  const callee = resolveCallee(node, context);
  const config = context.config ?? DEFAULT_EVALUATOR_CONFIG;

  context.tracking?.helpersUsed.add(node.callee);

  if (callee.kind === 'function') {
    const functions = depth.functions + 1;
    if (functions > config.maxRecursionDepth) {
      throw limitExceeded(
        'maxRecursionDepth',
        config.maxRecursionDepth,
        node.location
      );
    }
    const nested: CallDepth = { helpers: depth.helpers, functions };
    const args = node.args.map(arg => evaluateNode(arg, context, nested));
    return invokeTemplateFunction(callee.fn, args, context, nested);
  }

  const helpers = depth.helpers + 1;
  if (helpers > config.maxFunctionDepth) {
    throw limitExceeded(
      'maxFunctionDepth',
      config.maxFunctionDepth,
      node.location
    );
  }
  const nested: CallDepth = { helpers, functions: depth.functions };

  // Curry the helper with scope, routing its warnings to the tracking sink.
  const curriedFn = inHelper(node, () =>
    callee.helper(
      context.scope,
      message => {
        context.tracking?.warnings.push({
          message,
          helper: node.callee,
          location: node.location,
        });
      },
      { maxStringLength: config.maxHelperStringLength }
    )
  );

  if (typeof curriedFn !== 'function') {
    throw new EvaluationError(
      `Helper ${node.callee} did not return a callable`,
      node.location,
      'NOT_CALLABLE'
    );
  }

  const args = node.args.map(arg => evaluateNode(arg, context, nested));
  return inHelper(node, () => curriedFn(...args));
}

/**
 * Runs one step of a helper invocation, giving anything it throws a location.
 *
 * A helper is host code: it can raise a `TypeError` on an argument shape it did
 * not expect, or a `RangeError` out of a platform API. Those used to travel
 * unchanged - the renderer eventually attached the enclosing NODE's location,
 * which is the right element but the wrong expression, and a helper called
 * outside a render got no location at all. The call expression is what has the
 * position, and this is the one place that knows it.
 *
 * An {@link EvaluationError} raised further down already carries a more precise
 * location and passes through untouched.
 */
function inHelper<T>(node: CallNode, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    throw new EvaluationError(
      `Helper ${node.callee} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      node.location,
      'HELPER_FAILED',
      error
    );
  }
}

/**
 * Invoke a template-defined function: bind the arguments over the scope the
 * function closed on, and evaluate its body there.
 */
function invokeTemplateFunction(
  fn: TemplateFunction,
  args: readonly unknown[],
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  const captured = fn.scope;
  const locals = extendBindings(captured.locals, {});
  for (let i = 0; i < fn.params.length; i++) {
    locals[fn.params[i]!] = args[i];
  }
  const callContext: EvaluationContext = {
    ...context,
    scope: { locals, data: captured.data, globals: captured.globals },
  };
  return evaluateNode(fn.body, callContext, depth);
}

/**
 * Evaluate a wildcard node - expand path across array elements and flatten.
 */
function evaluateWildcard(
  node: ArrayWildcardNode,
  context: EvaluationContext
): unknown[] {
  const { path } = node;
  const { segments, isGlobal } = path;

  if (segments.length === 0) {
    return [];
  }

  context.tracking?.pathsAccessed.add(pathKey(node));

  // First segment must be a key
  const firstSegment = segments[0]!;
  if (firstSegment.kind !== 'key') {
    return [];
  }

  // Start with the first resolved value wrapped in array
  let current: unknown[] = [
    resolveFirstSegment(firstSegment.key, isGlobal, context.scope),
  ];

  // Process remaining segments
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;

    if (segment.kind === 'star') {
      // Flatten and expand: each array element becomes multiple results
      current = current.flatMap(item => (Array.isArray(item) ? item : []));
    } else if (segment.kind === 'key') {
      // Map property access across all current values
      current = current.map(item => accessProperty(item, segment.key));
    } else if (segment.kind === 'index') {
      // Map index access across all current values
      current = current.map(item => accessProperty(item, segment.index));
    }
  }

  return current;
}

/**
 * Evaluate an array literal node - evaluate each element and return as array.
 */
function evaluateArray(
  node: ArrayNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown[] {
  return node.elements.map(element => evaluateNode(element, context, depth));
}

/**
 * Evaluate a member access node - evaluate the object, then access members.
 * Handles cases like foo()[0], foo()[*].bar, (a || b).length
 */
function evaluateMemberAccess(
  node: MemberAccessNode,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  // First, evaluate the object expression
  let current: unknown = evaluateNode(node.object, context, depth);

  // If it has a wildcard, we need to handle it specially
  if (node.hasWildcard) {
    // Process segments, expanding at wildcard points
    let results: unknown[] = [current];

    for (const segment of node.path) {
      if (segment.kind === 'star') {
        // Flatten and expand: each array element becomes multiple results
        results = results.flatMap(item => (Array.isArray(item) ? item : []));
      } else if (segment.kind === 'key') {
        // Map property access across all current values
        results = results.map(item => accessProperty(item, segment.key));
      } else if (segment.kind === 'index') {
        // Map index access across all current values
        results = results.map(item => accessProperty(item, segment.index));
      }
    }

    return results;
  }

  // No wildcard - simple sequential property access
  for (const segment of node.path) {
    if (segment.kind === 'key') {
      current = accessProperty(current, segment.key);
    } else if (segment.kind === 'index') {
      current = accessProperty(current, segment.index);
    }
    // Note: 'star' without hasWildcard shouldn't happen, but handle gracefully
  }

  return current;
}

/**
 * Evaluate a function expression - close over the current scope.
 */
function evaluateFunction(
  node: FunctionExpr,
  context: EvaluationContext
): TemplateFunction {
  return new TemplateFunction(
    node.params,
    node.body,
    context.scope,
    node.location
  );
}

// =============================================================================
// Main Evaluate Function
// =============================================================================

function evaluateNode(
  expr: ExprAst,
  context: EvaluationContext,
  depth: CallDepth
): unknown {
  switch (expr.kind) {
    case 'literal':
      return evaluateLiteral(expr);
    case 'path':
      return evaluatePath(expr, context);
    case 'unary':
      return evaluateUnary(expr, context, depth);
    case 'binary':
      return evaluateBinary(expr, context, depth);
    case 'ternary':
      return evaluateTernary(expr, context, depth);
    case 'call':
      return evaluateCall(expr, context, depth);
    case 'wildcard':
      return evaluateWildcard(expr, context);
    case 'array':
      return evaluateArray(expr, context, depth);
    case 'member':
      return evaluateMemberAccess(expr, context, depth);
    case 'function':
      return evaluateFunction(expr, context);
    default: {
      // Exhaustive check
      const _exhaustive: never = expr;
      throw new Error(
        `Unknown expression kind: ${(_exhaustive as ExprAst).kind}`
      );
    }
  }
}

/**
 * Evaluate an expression AST node and return the result.
 *
 * The depth of the expression tree itself is bounded at parse time
 * (`maxExpressionDepth`); what is bounded here is what the data made the
 * template do - how deeply helpers nest and how far a user-defined function
 * recurses.
 *
 * @param expr - The expression AST node to evaluate
 * @param context - The evaluation context (scope, helpers, config, tracking)
 * @returns The evaluated result
 * @throws EvaluationError if evaluation fails
 */
export function evaluate(expr: ExprAst, context: EvaluationContext): unknown {
  return evaluateNode(expr, context, ROOT_DEPTH);
}

/**
 * Whether a value the template produced can be called.
 *
 * Two things are: a host function reached through the data or the globals, and
 * a {@link TemplateFunction} declared with `@let f = (x) => ...`. They look
 * nothing alike - one is a JavaScript function, the other an AST and the scope
 * it closed over - which is precisely why deciding "is this callable" belongs
 * here and not at every call site that wants to know.
 *
 * @param value - Anything an expression evaluated to
 */
export function isCallable(value: unknown): boolean {
  return typeof value === 'function' || isTemplateFunction(value);
}

/**
 * Calls a value the template produced, whichever kind of callable it is.
 *
 * The one entry point for calling something that was not written as a call:
 * an `on:` handler, and anything else a host later wants to invoke. A
 * `TemplateFunction` is evaluated in the scope it closed over with the
 * arguments bound over it - the same path a `f(x)` in an expression takes -
 * so a handler declared in the template behaves like a handler passed in.
 *
 * @param value - The callable, from {@link isCallable}
 * @param args - Arguments to pass
 * @param context - Evaluation context, for helpers and limits
 * @param location - Where the call was written, for the error if it is not one
 * @returns Whatever it returned
 * @throws {EvaluationError} When `value` is not callable
 */
export function callValue(
  value: unknown,
  args: readonly unknown[],
  context: EvaluationContext,
  location: SourceLocation
): unknown {
  if (isTemplateFunction(value)) {
    return invokeTemplateFunction(value, args, context, ROOT_DEPTH);
  }
  if (typeof value === 'function') {
    return (value as (...rest: unknown[]) => unknown)(...args);
  }
  throw new EvaluationError(
    `Value is not callable: ${typeof value}`,
    location,
    'NOT_CALLABLE'
  );
}
