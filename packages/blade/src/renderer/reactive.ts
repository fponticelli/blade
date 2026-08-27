// Reactive rendering
//
// The second half of the seam that `target.ts` opened.
//
// A {@link RenderTarget} answers "how is a finished piece of output
// represented". It cannot answer "when is it produced", and that is the whole
// of the difference between the two eager sinks and a reactive one: the string
// and DOM targets are handed values and write them, while a reactive target is
// handed *cells* and binds them, once, into a graph that updates itself.
//
// Rather than fork the traversal a third time - which is exactly how
// `@bladets/tempo` came to disagree with the engine about `@let`, about loop
// variable precedence, about `@match`'s `_` and about every resource ceiling -
// the traversal is parameterised by a {@link Reactivity}. It still decides
// *what* a name is bound to, *which* arm of an `@if` runs, *how many* passes a
// loop may make and *what* an attribute becomes; the reactivity decides only
// whether that decision is made now, once, or re-made whenever the data behind
// it changes.
//
// {@link EAGER} is the implementation the string and DOM sinks use, and it is
// deliberately trivial: a cell is its value, a branch runs its arm, a loop runs
// its body. Everything an eager render did before this file existed, it still
// does, through the same code the reactive render uses.

import type { ExprAst } from '../ast/types.js';
import type { Bindings, Scope } from '../evaluator/index.js';
import { createBindings, extendBindings } from '../evaluator/index.js';

// =============================================================================
// Cells
// =============================================================================

/**
 * A value that may change over the life of a render.
 *
 * Deliberately the smallest interface that both a plain value and a signal can
 * satisfy: read it now, or derive another cell from it. `Signal` from
 * `@tempots/dom` implements it structurally, so a reactive host needs no
 * adapter.
 *
 * @typeParam T - The value the cell holds
 */
export interface Dyn<T> {
  /** The value as of now. */
  readonly value: T;

  /**
   * A cell holding `fn` applied to this one's value.
   *
   * @param fn - Transform, which must be a pure function of `value`
   * @param equals - Whether two results count as the same value, so that an
   *   unchanged result does not propagate. Ignored by eager implementations,
   *   which never propagate anything.
   */
  map<U>(fn: (value: T) => U, equals?: (a: U, b: U) => boolean): Dyn<U>;
}

/** A cell whose value never changes. */
class Constant<T> implements Dyn<T> {
  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Dyn<U> {
    return new Constant(fn(this.value));
  }
}

/**
 * A cell holding `value` forever.
 *
 * @param value - The value the cell holds
 */
export function constant<T>(value: T): Dyn<T> {
  return new Constant(value);
}

// =============================================================================
// Scopes
// =============================================================================

/**
 * The bindings in force at a point in the template, as cells.
 *
 * Opaque to the traversal on purpose: the traversal says which names are bound
 * to which cells, and a {@link Reactivity} decides how to store them and how to
 * turn them back into the concrete {@link Scope} the evaluator wants. That is
 * what makes a loop variable, a component prop, a `@let` binding and `@match`'s
 * `_` one mechanism rather than four - and it is why binding one of them
 * reactively binds all of them reactively.
 */
export interface DynScope {
  /**
   * The bindings as concrete values, as of now.
   *
   * Called once per expression evaluation. An eager scope hands back the same
   * object every time; a reactive one materialises its cells.
   */
  snapshot(): Scope;
}

/** A {@link DynScope} whose cells are all constants. */
class EagerScope implements DynScope {
  constructor(private readonly scope: Scope) {}

  snapshot(): Scope {
    return this.scope;
  }
}

// =============================================================================
// The reactivity seam
// =============================================================================

/**
 * When a render decides things.
 *
 * One implementation makes every decision immediately and produces output as it
 * goes ({@link EAGER}); another builds a graph of cells that re-make the
 * decisions when their inputs change. Both drive the same traversal, so the
 * semantics they share cannot drift.
 */
export interface Reactivity {
  /**
   * Whether output built by a callback outlives the call.
   *
   * False for an eager render, where the traversal runs once and everything it
   * emits is final. True for a render that binds once and updates in place: an
   * arm of an `@if` may be built long after the traversal that created it
   * returned, and a loop body persists across changes to its item.
   *
   * The traversal reads this in exactly one place: the wall-clock deadline,
   * which belongs to the pass that started the clock. An incremental render's
   * updates happen minutes later and on somebody else's stack, so measuring
   * them against a budget that expired long ago would refuse every one of them.
   * Every other ceiling - the per-loop and run-wide iteration counts, component
   * depth, slot depth, loop nesting - is enforced on every update.
   */
  readonly incremental: boolean;

  /** A cell holding `value` forever. */
  constant<T>(value: T): Dyn<T>;

  /**
   * The scope a render starts in: no locals, the caller's data, the caller's
   * globals.
   *
   * The data arrives as whatever the caller handed the render, and the
   * reactivity decides what that is: an eager render holds it, a reactive one
   * recognises a cell of its own kind and binds to it.
   */
  rootScope(data: unknown, globals: Bindings): DynScope;

  /**
   * `parent` with `entries` bound as locals.
   *
   * This is the one way a name enters scope, so loop variables, `@let`
   * bindings, component props and `@match`'s `_` all get the same treatment:
   * locals resolve before data, the binding is scoped to the block that made
   * it, and a name like `__proto__` becomes an ordinary binding rather than a
   * prototype reassignment.
   */
  extendScope(
    parent: DynScope,
    entries: Readonly<Record<string, Dyn<unknown>>>
  ): DynScope;

  /** `parent` with `name` bound as a global, for `@let $.name`. */
  extendGlobals(parent: DynScope, name: string, value: Dyn<unknown>): DynScope;

  /**
   * An isolated scope for a component body: its props as data, no locals, and
   * the globals in force at the call site.
   */
  componentScope(props: Dyn<Bindings>, caller: DynScope): DynScope;

  /**
   * A cell holding `compute` applied to `scope`.
   *
   * `reads` is the set of expressions `compute` will evaluate. An eager
   * implementation ignores it; a reactive one uses it to work out what the
   * result depends on, so that changing a field nothing reads recomputes
   * nothing.
   *
   * @param scope - Bindings `compute` evaluates against
   * @param reads - Expressions `compute` may evaluate; nothing else may vary
   * @param compute - The decision, as a pure function of the concrete scope
   * @param recover - The value to use when `compute` throws. An eager render
   *   ignores it and lets the error out, because there is a caller waiting for
   *   it; a reactive render has no such caller and reports through its own
   *   failure channel instead.
   * @param equals - Whether two results count as the same value
   */
  derive<T>(
    scope: DynScope,
    reads: readonly ExprAst[],
    compute: (scope: Scope) => T,
    recover: (error: unknown) => T,
    equals?: (a: T, b: T) => boolean
  ): Dyn<T>;

  /**
   * Emits exactly one of `arms` arms - the one `choose` selects - and re-chooses
   * when the selection changes. A selection outside `[0, arms)` emits nothing.
   *
   * The arms are named by index and built on demand rather than passed as an
   * array of thunks, so an eager render allocates nothing for the arms it does
   * not take.
   */
  branch(
    choose: Dyn<number>,
    arms: number,
    renderArm: (index: number) => void
  ): void;

  /**
   * Emits `body` once per element of `items`, and keeps that correspondence as
   * `items` changes.
   *
   * The index is a cell, not a number, because a keyed implementation moves a
   * row rather than rebuilding it: the row that was third is still the same
   * row when it becomes first, and `@for(x, i of xs key x.id)` has to say so.
   * A positional implementation hands back a constant, since position `i`
   * always renders element `i`.
   *
   * @param items - The passes to make
   * @param body - Renders one pass
   * @param keyOf - What each element *is*, from `@for(... key expr)`. Given,
   *   an incremental implementation matches an element to the output it
   *   produced last time by this value rather than by position, so a reordered
   *   list moves rows instead of rewriting them. An implementation that builds
   *   its output once has no earlier output to match against and ignores it.
   */
  each(
    items: Dyn<readonly unknown[]>,
    body: (item: Dyn<unknown>, index: Dyn<number>) => void,
    keyOf?: (item: unknown) => unknown
  ): void;
}

/**
 * The reactivity of a render that produces its output once.
 *
 * Every method is the obvious thing: a cell is its value, a scope is a scope,
 * a branch runs its arm, a loop runs its body. That is the point - the eager
 * sinks satisfy the reactive abstraction for free, so there is one traversal
 * rather than one per timing model.
 */
class EagerReactivity implements Reactivity {
  readonly incremental = false;

  constant<T>(value: T): Dyn<T> {
    return new Constant(value);
  }

  rootScope(data: unknown, globals: Bindings): DynScope {
    return new EagerScope({ locals: createBindings(), data, globals });
  }

  extendScope(
    parent: DynScope,
    entries: Readonly<Record<string, Dyn<unknown>>>
  ): DynScope {
    const scope = parent.snapshot();
    const values: Record<string, unknown> = {};
    for (const name of Object.keys(entries)) {
      values[name] = entries[name]!.value;
    }
    return new EagerScope({
      locals: extendBindings(scope.locals, values),
      data: scope.data,
      globals: scope.globals,
    });
  }

  extendGlobals(parent: DynScope, name: string, value: Dyn<unknown>): DynScope {
    const scope = parent.snapshot();
    return new EagerScope({
      locals: scope.locals,
      data: scope.data,
      globals: extendBindings(scope.globals, { [name]: value.value }),
    });
  }

  componentScope(props: Dyn<Bindings>, caller: DynScope): DynScope {
    return new EagerScope({
      locals: createBindings(),
      data: props.value,
      // Shared by reference: globals are the same object for every component in
      // a render, and the render already normalised them.
      globals: caller.snapshot().globals,
    });
  }

  derive<T>(
    scope: DynScope,
    _reads: readonly ExprAst[],
    compute: (scope: Scope) => T
  ): Dyn<T> {
    return new Constant(compute(scope.snapshot()));
  }

  branch(
    choose: Dyn<number>,
    arms: number,
    renderArm: (index: number) => void
  ): void {
    const index = choose.value;
    if (index < 0 || index >= arms) return;
    renderArm(index);
  }

  each(
    items: Dyn<readonly unknown[]>,
    body: (item: Dyn<unknown>, index: Dyn<number>) => void
  ): void {
    // The key is ignored, and there is nothing to ignore it *for*: an eager
    // render builds every pass from scratch, so there is no earlier row for a
    // key to identify.
    const values = items.value;
    for (let i = 0; i < values.length; i++) {
      body(new Constant(values[i]), new Constant(i));
    }
  }
}

/** The reactivity every eager sink uses. Stateless, so one instance serves all. */
export const EAGER: Reactivity = new EagerReactivity();
