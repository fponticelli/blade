// @bladets/tempo - Renderable collection
//
// The traversal in @bladets/template emits into a sink by calling it; Tempo
// wants a tree of `Renderable`s handed to it. This is the adapter between the
// two: a stack of collection frames, one per nesting level the traversal opens.
//
// Both the target and the reactivity write through it, because both nest: an
// element collects its children, and so does an `@if` arm or a loop body - the
// difference being only *when* the collection happens.

import type { Renderable } from '@tempots/dom';

/**
 * A stack of Renderable lists, innermost last.
 *
 * Re-entrant on purpose. A branch arm or a loop body is built long after the
 * traversal that created it returned, and building it runs the traversal again;
 * {@link Emitter.collect} pushes a frame of its own and pops it whatever
 * happens, so an inner build cannot leave output in an outer frame.
 */
export class Emitter {
  private readonly stack: Renderable[][] = [[]];

  /** Adds one Renderable at the current nesting level. */
  emit(renderable: Renderable): void {
    this.stack[this.stack.length - 1]!.push(renderable);
  }

  /**
   * Everything `build` emits, collected into a list of its own.
   *
   * @param build - Emits into a fresh frame
   * @returns What it emitted, in order
   */
  collect(build: () => void): Renderable[] {
    const frame: Renderable[] = [];
    this.stack.push(frame);
    try {
      build();
    } finally {
      this.stack.pop();
    }
    return frame;
  }

  /** The top-level Renderables, once the traversal has finished. */
  roots(): readonly Renderable[] {
    return this.stack[0]!;
  }
}
