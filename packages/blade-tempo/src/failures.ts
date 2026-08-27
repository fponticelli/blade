// @bladets/tempo - The failure channel
//
// A reactive render has nobody to throw at. The call that mounted the tree
// returned long ago, and everything that goes wrong afterwards goes wrong on
// somebody else's stack - inside a signal recompute, during a list
// reconciliation, in a branch that was rebuilt because a flag flipped.
//
// What that made of the old renderer's `console.warn` per evaluation was not a
// log but a flood: one bad expression in a 200-row table produced 200 warnings
// at mount and 200 more on every change, each one retained by DevTools with all
// its arguments. The defect, though, was singular - one expression, in one
// place. So a failure is recorded against the expression that produced it, and
// reported once for the pass it happened in, carrying the number of times it
// happened and the loop position it was first seen at.
//
// "Once per pass" is why reporting is deferred to a microtask: the count only
// exists once the pass is over, and a pass ends when the synchronous
// propagation that started it runs out.

import type { SourceLocation } from '@bladets/template/browser';
import type { ErrorHandler } from './types.js';

/** Shared by every failure that happened outside a loop. */
export const NO_INDICES: readonly number[] = [];

/** One failure, as it is recorded. */
export interface Failure {
  readonly error: Error;
  readonly location: SourceLocation;
  /** Loop positions in force where it happened, outermost first. */
  readonly indices: readonly number[];
  readonly severity: 'error' | 'warning';
}

/** A failure and how many times it has happened in the pass so far. */
interface Counted extends Failure {
  occurrences: number;
}

/**
 * Distinct failures of one pass, reported when the pass ends.
 *
 * The key is whatever identifies the *defect* - an AST node for an expression
 * that threw, a location and message for a value the render refused. Two
 * hundred rows failing on one expression share one key and produce one report;
 * two expressions failing once each produce two.
 */
export class FailureLog {
  private readonly pending = new Map<unknown, Counted>();
  private scheduled = false;

  /**
   * @param report - The host's handler, called once per distinct failure
   */
  constructor(private readonly report: ErrorHandler) {}

  /**
   * Records one occurrence.
   *
   * @param key - What identifies the defect; equal keys are the same failure
   * @param failure - What to report if this is the first occurrence
   */
  record(key: unknown, failure: Failure): void {
    const existing = this.pending.get(key);
    if (existing !== undefined) {
      existing.occurrences += 1;
      return;
    }
    this.pending.set(key, { ...failure, occurrences: 1 });
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  /**
   * Reports everything recorded since the last flush, and forgets it.
   *
   * Cleared before the handler runs, so a handler that renders - and fails
   * again - starts a pass of its own rather than mutating the one being
   * delivered.
   */
  private flush(): void {
    this.scheduled = false;
    const failures = [...this.pending.values()];
    this.pending.clear();

    for (const failure of failures) {
      this.report(failure.error, failure.location, {
        severity: failure.severity,
        occurrences: failure.occurrences,
        indices: failure.indices,
      });
    }
  }
}
