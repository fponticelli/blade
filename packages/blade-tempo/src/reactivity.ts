// @bladets/tempo - Reactive decisions
//
// The `Reactivity` half of the engine's render seam, implemented with Tempo
// signals. Everything here answers *when*: when a name is read, when an arm of
// an `@if` is chosen, when a loop's list is measured. Nothing here answers
// *what* - that is the traversal's job, in @bladets/template, and it is the
// same traversal the string and DOM renderers run.
//
// The one thing this file adds that an eager render has no use for is
// dependency narrowing. An eager render evaluates each expression exactly once,
// so it does not matter what the expression reads; a reactive one has to know,
// or it re-walks every expression in the template whenever any field of the
// data changes. A 200-row table whose title changed used to perform 800
// expression evaluations to produce no DOM mutation at all.

import type {
  Bindings,
  Dyn,
  DynScope,
  ExprAst,
  PathNode,
  Reactivity,
  Scope,
  SourceLocation,
} from '@bladets/template/browser';
import {
  constant,
  createBindings,
  extendBindings,
  hasBinding,
  RenderError,
  ResourceLimitError,
} from '@bladets/template/browser';
import type { RenderWarning } from '@bladets/template/browser';
import {
  computedOf,
  Empty,
  ForEach,
  Fragment,
  KeyedForEach,
  MapSignal,
  Signal,
} from '@tempots/dom';
import type { Renderable } from '@tempots/dom';
import { Emitter } from './emitter.js';
import { FailureLog, NO_INDICES } from './failures.js';
import type { ErrorHandler } from './types.js';

// =============================================================================
// Cells
// =============================================================================

/** The cell as a signal, or null when it can never change. */
function asSignal<T>(cell: Dyn<T>): Signal<T> | null {
  return cell instanceof Signal ? (cell as Signal<T>) : null;
}

/**
 * Computes a cell now, while nothing depends on it yet, and hands it back.
 *
 * A Tempo `Computed` is lazy and starts dirty, so the first read of a chain
 * computes the parent *inside* the child's own computation - and the parent,
 * finding its value changed from `undefined`, marks the child dirty again. The
 * child then computes a second time. Settling each cell as it is built, before
 * anything derives from it, makes every expression in a mounted template cost
 * exactly one evaluation instead of two.
 */
function settle<T>(cell: Dyn<T>): Dyn<T> {
  void cell.value;
  return cell;
}

/** A caller's data as a cell: their signal, or a constant if they passed one. */
function cellOf(data: unknown): Dyn<unknown> {
  return data instanceof Signal ? (data as Signal<unknown>) : constant(data);
}

/**
 * The data of one scope, with a cell per root name it has been read through.
 *
 * Memoising the roots is half of what makes narrowing work: every expression
 * that reads `rows` shares one `data -> data.rows` cell, so an update that
 * replaced an unrelated field leaves that cell holding the same array. The
 * other half is in {@link SignalReactivity.derive}, because a Tempo cell is
 * marked stale when its source changes and stays stale whether or not its own
 * value moved - so being told to recompute is not the same as having anything
 * to recompute.
 *
 * Shared by every scope derived from this data: a loop body binds its item as a
 * local and leaves the data alone, so all thousand rows read the same root
 * cells and no row copies the payload.
 */
class DataCell {
  private readonly roots = new Map<string, Dyn<unknown>>();

  constructor(readonly cell: Dyn<unknown>) {}

  /** A cell holding `data[name]`, the same one every time. */
  root(name: string): Dyn<unknown> {
    const cached = this.roots.get(name);
    if (cached !== undefined) return cached;
    const derived = settle(this.cell.map(data => ownProperty(data, name)));
    this.roots.set(name, derived);
    return derived;
  }
}

/**
 * `data[name]`, own properties only.
 *
 * Own-only for the same reason the evaluator resolves names that way: an
 * inherited `toString` is not a datum, and a cell that tracked one would react
 * to nothing a template can read.
 */
function ownProperty(data: unknown, name: string): unknown {
  if (data === null || typeof data !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(data, name)
    ? (data as Record<string, unknown>)[name]
    : undefined;
}

// =============================================================================
// Scopes
// =============================================================================

/** Bindings with nothing in them, shared by every scope that has no locals. */
const NO_BINDINGS: Bindings = createBindings();

/**
 * A scope whose bindings are cells.
 *
 * `locals` holds cells rather than values, which is the whole of findings 2
 * through 6 and 8: a loop variable, a component prop, a `@let` and `@match`'s
 * `_` are all just names bound to cells, so all four update, all four shadow
 * the data rather than being smuggled into it, and none of them requires
 * copying the caller's data object per row.
 */
class ReactiveScope implements DynScope {
  constructor(
    /** Cells by name, prototype-chained onto the enclosing scope's. */
    readonly locals: Bindings,
    /** False when nothing is bound, so the common case allocates nothing. */
    readonly bound: boolean,
    readonly data: DataCell,
    /** The render's globals, which are values and do not change. */
    readonly globals: Bindings,
    /** Cells bound by `@let $.name`, or null when there are none. */
    readonly globalCells: Bindings | null
  ) {}

  snapshot(): Scope {
    return {
      locals: this.bound ? materialise(this.locals) : NO_BINDINGS,
      data: this.data.cell.value,
      globals:
        this.globalCells === null
          ? this.globals
          : extendBindings(this.globals, materialise(this.globalCells)),
    };
  }
}

/**
 * The cells of a binding set, read.
 *
 * `for...in` walks the prototype chain, which is how the set was built, and
 * every chain bottoms out at a null-prototype object - so an inherited name is
 * an enclosing binding and never `Object.prototype.toString`.
 */
function materialise(cells: Bindings): Bindings {
  const values = createBindings();
  for (const name in cells) {
    values[name] = (cells[name] as Dyn<unknown>).value;
  }
  return values;
}

/** Whether two argument lists hold the same values in the same places. */
function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function reactiveScope(scope: DynScope): ReactiveScope {
  if (scope instanceof ReactiveScope) return scope;
  throw new Error(
    'A reactive render was handed a scope it did not create; the render options and the reactivity must come from the same renderer.'
  );
}

// =============================================================================
// What an expression reads
// =============================================================================

/**
 * The outside world an expression touches.
 *
 * Names are resolved against the scope at the point of use, not here: the same
 * `item` is a loop variable inside the loop and a data field outside it, and
 * only the scope knows which.
 */
interface Reads {
  /** Root names looked up in the locals, then in the data. */
  readonly names: readonly string[];
  /** Root names looked up in the globals - `$.name`. */
  readonly globals: readonly string[];
  /**
   * Whether the expression reads through the data in a way this analysis
   * cannot name - a computed member, a path that starts with an index. The
   * dependency is then the whole data, which is always correct and never
   * narrow.
   */
  readonly wide: boolean;
}

const readCache = new WeakMap<ExprAst, Reads>();

/**
 * The names `expr` may read, memoised against the node.
 *
 * A conservative over-approximation on purpose: a name that turns out not to
 * matter costs one redundant recompute, while a name that was missed costs a
 * value on screen that never updates. Both arms of a ternary are included, and
 * so is the body of a `@let` arrow, for that reason.
 *
 * The callee of a call is included as a name because it may be a `@let`
 * function; a callee that is a helper resolves to a data root nothing ever sets
 * and therefore never fires. Helpers are otherwise treated as functions of
 * their arguments and of the render's globals, which is what the helper
 * signature promises.
 */
function readsOf(expr: ExprAst): Reads {
  const cached = readCache.get(expr);
  if (cached !== undefined) return cached;

  const names: string[] = [];
  const globals: string[] = [];
  let wide = false;

  const root = (path: PathNode): void => {
    const first = path.segments[0];
    if (first === undefined || first.kind !== 'key') {
      wide = true;
      return;
    }
    (path.isGlobal ? globals : names).push(first.key);
  };

  const visit = (node: ExprAst | undefined): void => {
    if (node === undefined) return;
    switch (node.kind) {
      case 'literal':
        return;
      case 'path':
        root(node);
        return;
      case 'wildcard':
        root(node.path);
        return;
      case 'call':
        names.push(node.callee);
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
        visit(node.object);
        return;
      case 'function':
        visit(node.body);
        return;
    }
  };

  visit(expr);
  const reads: Reads = { names, globals, wide };
  readCache.set(expr, reads);
  return reads;
}

// =============================================================================
// The reactivity
// =============================================================================

/**
 * Decisions made once and re-made when their inputs change.
 *
 * Paired with `TempoTarget`: this decides *when* the traversal's callbacks run,
 * the target decides what their output looks like, and both write into the same
 * {@link Emitter}, because both of them nest.
 */
export class SignalReactivity implements Reactivity {
  readonly incremental = true;

  /**
   * @param emitter - Where branch arms and loop bodies put their Renderables
   * @param onError - The reactive renderer's failure channel. A render that
   *   updates in place has no caller to throw at: by the time a limit is
   *   breached or a helper throws, the render that started it returned long ago.
   * @param location - The location reported when a failure carries none
   */
  private readonly failures: FailureLog;

  /**
   * The loop positions in force where output is currently being built,
   * outermost first.
   *
   * Captured by every cell as it is made, because that is the only moment at
   * which the position is known: a row's body is built inside Tempo's own
   * render callback, long after the `each` that arranged for it returned, and
   * a failure inside that row is reported later still.
   */
  private trail: readonly number[] = NO_INDICES;

  /** Engine warnings already reported. The list only ever grows. */
  private warnings: readonly RenderWarning[] | null = null;
  private reported = 0;

  constructor(
    private readonly emitter: Emitter,
    onError: ErrorHandler,
    private readonly location: SourceLocation
  ) {
    this.failures = new FailureLog(onError);
  }

  /**
   * Starts reporting what the render substituted or refused.
   *
   * The engine's warnings are a list the render appends to - a blocked URL, a
   * `style` value it constrained, a `@for` whose keys are not unique. An eager
   * render hands that list back to its caller when it finishes; an incremental
   * one has no such moment, so the list is watched instead and anything new in
   * it goes out through the same channel as everything else.
   *
   * @param warnings - The live list from the render's metadata
   */
  watchWarnings(warnings: readonly RenderWarning[]): void {
    this.warnings = warnings;
    this.drainWarnings();
  }

  /**
   * Reports a failure with no expression behind it - a build that died whole.
   *
   * @param error - What went wrong
   */
  fail(error: unknown): void {
    this.report(error, []);
  }

  constant<T>(value: T): Dyn<T> {
    return constant(value);
  }

  rootScope(data: unknown, globals: Bindings): DynScope {
    return new ReactiveScope(
      NO_BINDINGS,
      false,
      new DataCell(cellOf(data)),
      globals,
      null
    );
  }

  extendScope(
    parent: DynScope,
    entries: Readonly<Record<string, Dyn<unknown>>>
  ): DynScope {
    const scope = reactiveScope(parent);
    return new ReactiveScope(
      extendBindings(scope.locals, entries),
      true,
      scope.data,
      scope.globals,
      scope.globalCells
    );
  }

  extendGlobals(parent: DynScope, name: string, value: Dyn<unknown>): DynScope {
    const scope = reactiveScope(parent);
    return new ReactiveScope(
      scope.locals,
      scope.bound,
      scope.data,
      scope.globals,
      extendBindings(scope.globalCells ?? NO_BINDINGS, { [name]: value })
    );
  }

  componentScope(props: Dyn<Bindings>, caller: DynScope): DynScope {
    const scope = reactiveScope(caller);
    return new ReactiveScope(
      NO_BINDINGS,
      false,
      new DataCell(props),
      scope.globals,
      scope.globalCells
    );
  }

  derive<T>(
    scope: DynScope,
    reads: readonly ExprAst[],
    compute: (scope: Scope) => T,
    recover: (error: unknown) => T,
    equals?: (a: T, b: T) => boolean
  ): Dyn<T> {
    const bindings = reactiveScope(scope);
    // Where this cell was made. Every later recompute is attributed to that
    // position, because a Computed re-runs on a stack that knows nothing about
    // the row whose value it holds.
    const trail = this.trail;
    const run = (): T =>
      this.at(trail, () => {
        try {
          return compute(bindings.snapshot());
        } catch (error) {
          this.report(error, reads);
          return recover(error);
        } finally {
          // Inside the trail: a value the engine substituted while computing
          // this belongs to this row, not to whatever was being built when the
          // recompute happened to be triggered.
          this.drainWarnings();
        }
      });

    const sources = this.dependencies(bindings, reads);
    // Nothing it reads can change, so neither can it. A `${1 + 1}` becomes a
    // static text node rather than a signal nobody will ever notify.
    if (sources.length === 0) return constant(run());

    // Being asked to recompute is not a reason to. Staleness propagates through
    // a Tempo graph whether or not a value moved, so a table of 600 cells is
    // asked to recompute when an unrelated title changes; comparing the inputs
    // first turns 600 AST walks into 600 identity checks and no DOM mutation.
    let taken: unknown[] | null = null;
    let last!: T;
    const recall = (...values: unknown[]): T => {
      if (taken !== null && same(taken, values)) return last;
      taken = values;
      last = run();
      return last;
    };

    // Sources first: a cell built on a stale parent computes twice.
    for (const source of sources) settle(source);
    if (sources.length === 1) return settle(sources[0]!.map(recall, equals));
    return settle(computedOf(...sources)(recall, equals));
  }

  branch(
    choose: Dyn<number>,
    arms: number,
    renderArm: (index: number) => void
  ): void {
    const selection = asSignal(choose);
    if (selection === null) {
      const index = choose.value;
      if (index < 0 || index >= arms) return;
      this.guard(() => renderArm(index));
      return;
    }

    // Where this arm sits, remembered: the callback below runs when Tempo
    // mounts the arm and again whenever the selection changes, by which time
    // the traversal that chose it is long finished.
    const trail = this.trail;
    const emitter = this.emitter;
    this.emitter.emit(
      MapSignal(selection, index => {
        if (index < 0 || index >= arms) return Empty;
        return Fragment(
          ...emitter.collect(() =>
            this.at(trail, () => this.guard(() => renderArm(index)))
          )
        );
      })
    );
  }

  each(
    items: Dyn<readonly unknown[]>,
    body: (item: Dyn<unknown>, index: Dyn<number>) => void,
    keyOf?: (item: unknown) => unknown
  ): void {
    const outer = this.trail;
    const list = asSignal(items);
    if (list === null) {
      const values = items.value;
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        this.at([...outer, i], () =>
          this.guard(() => body(constant(value), constant(i)))
        );
      }
      return;
    }

    const emitter = this.emitter;
    const row = (item: Dyn<unknown>, index: Dyn<number>): Renderable =>
      Fragment(
        ...emitter.collect(() =>
          this.at([...outer, index.value], () =>
            this.guard(() => body(item, index))
          )
        )
      );

    this.emitter.emit(
      // `ForEach` and `KeyedForEach` want a mutable array type; the traversal
      // produces a list it promises not to modify, which is the stronger
      // guarantee of the two.
      keyOf === undefined
        ? // Slots keyed by position: element `i` renders into slot `i`, so its
          // index never changes and a constant is the honest cell for it.
          ForEach(list as unknown as Signal<unknown[]>, (item, position) =>
            row(item, constant(position.index))
          )
        : // Slots keyed by what the template says a row *is*. A row that moves
          // takes its DOM with it, so its index is a signal - and the engine
          // binds `@for(x, i of xs key ...)`'s `i` to exactly that.
          KeyedForEach(
            list as unknown as Signal<unknown[]>,
            keyOf,
            (item, position) => row(item, position.index)
          )
    );
  }

  /** Runs `build` as though it were building output at `trail`. */
  private at<T>(trail: readonly number[], build: () => T): T {
    const outer = this.trail;
    this.trail = trail;
    try {
      return build();
    } finally {
      this.trail = outer;
    }
  }

  /** Sends anything the engine has newly complained about to the same channel. */
  private drainWarnings(): void {
    const warnings = this.warnings;
    if (warnings === null || warnings.length === this.reported) return;
    for (let i = this.reported; i < warnings.length; i++) {
      const warning = warnings[i]!;
      this.failures.record(
        `warning:${warning.location.start.offset}:${warning.message}`,
        {
          error: new Error(warning.message),
          location: warning.location,
          indices: this.trail,
          severity: 'warning',
        }
      );
    }
    this.reported = warnings.length;
  }

  /**
   * The signals a derivation must depend on.
   *
   * A name bound in the locals contributes that binding's cell; anything else
   * contributes the data cell for its root. Globals contribute nothing unless
   * a `@let $.name` made one of them a cell, because a render's globals are
   * fixed for its lifetime.
   */
  private dependencies(
    scope: ReactiveScope,
    reads: readonly ExprAst[]
  ): Signal<unknown>[] {
    const sources = new Set<Signal<unknown>>();

    const add = (cell: Dyn<unknown> | undefined): void => {
      if (cell === undefined) return;
      const signal = asSignal(cell);
      if (signal !== null) sources.add(signal);
    };

    for (const expr of reads) {
      const uses = readsOf(expr);
      if (uses.wide) add(scope.data.cell);
      for (const name of uses.names) {
        if (scope.bound && hasBinding(scope.locals, name)) {
          add(scope.locals[name] as Dyn<unknown>);
        } else {
          add(scope.data.root(name));
        }
      }
      for (const name of uses.globals) {
        if (scope.globalCells !== null && hasBinding(scope.globalCells, name)) {
          add(scope.globalCells[name] as Dyn<unknown>);
        }
      }
    }

    return [...sources];
  }

  /** Builds output, reporting anything that goes wrong instead of throwing. */
  private guard(build: () => void): void {
    try {
      build();
    } catch (error) {
      this.report(error, []);
    } finally {
      this.drainWarnings();
    }
  }

  /**
   * Records one failure against the expression that produced it.
   *
   * Keyed by the AST node rather than by the evaluation, which is the whole
   * difference between one report and two hundred: the same `${boom(r)}` fails
   * once per row, and it is still one defect in one place.
   */
  private report(error: unknown, reads: readonly ExprAst[]): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    const located =
      error instanceof RenderError
        ? error.location
        : (reads[0]?.location ?? this.location);
    this.failures.record(reads[0] ?? this.keyFor(failure, located), {
      error: failure,
      location: located,
      indices: this.trail,
      severity: 'error',
    });
  }

  /**
   * What makes two failures with no expression behind them the same failure.
   *
   * The message would be the obvious key and is the wrong one for a breached
   * ceiling: `maxOutputChars` reports how much has been written, which is a
   * different number every time it is checked. A `@for` whose rows exhaust the
   * budget would key each row's refusal separately and report a nine-hundred
   * row table nine hundred times - reintroducing, for exactly the failure most
   * likely to happen in bulk, the noise `FailureLog` exists to prevent.
   *
   * A ceiling is one fact about the render, so it keys on which ceiling it was.
   *
   * @param failure - The error being recorded
   * @param located - Where it is attributed
   */
  private keyFor(failure: Error, located: SourceLocation): string {
    return failure instanceof ResourceLimitError
      ? `limit:${failure.limitType}`
      : `error:${located.start.offset}:${failure.message}`;
  }
}
