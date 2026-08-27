// Render resource limits
//
// One declaration of every ceiling a render honours, and one place the defaults
// live. `EvaluatorConfig` is a structural subset of this interface, so the
// renderer hands its limits straight to the evaluator - there is no mapping
// step left to get wrong, and 10/50 are not written down twice.

import { DEFAULT_EVALUATOR_CONFIG } from '../evaluator/index.js';
import type { EvaluatorConfig } from '../evaluator/index.js';

/**
 * The ceilings a render enforces.
 *
 * Extends {@link EvaluatorConfig}, so `evaluate` can be handed the limits
 * object itself. The three expression-level ceilings therefore have exactly one
 * definition, shared by the two layers that enforce them.
 *
 * Expression *size* (`maxExpressionNodes`) and expression *tree depth*
 * (`maxExpressionDepth`) are deliberately absent: both are properties of the
 * template rather than of the data, and both are enforced at compile time. A
 * limit declared here that nothing reads is how `maxExpressionNodes` went
 * unenforced for as long as it did.
 */
export interface ResourceLimits extends EvaluatorConfig {
  /** Deepest nesting of `@for` blocks along one path. */
  maxLoopNesting: number;
  /** Passes one `@for` block may make. */
  maxIterationsPerLoop: number;
  /** Passes all `@for` blocks in the render may make between them. */
  maxTotalIterations: number;
  /** Deepest nesting of component bodies along one path. */
  maxComponentDepth: number;
  /**
   * Deepest chain of `<slot>` expansions along one path.
   *
   * Slot content resolves against the *caller's* slot map, so a forwarded slot
   * terminates at the outermost fill by construction. This bounds any residual
   * cycle, and turns what used to be a `RangeError: Maximum call stack size
   * exceeded` - thrown from no particular place, catchable by nobody usefully -
   * into a located {@link ./errors.js#ResourceLimitError}.
   */
  maxSlotDepth: number;
  /**
   * Total output one render may produce, in UTF-16 code units.
   *
   * Counted at the sink, so it bounds the render as a whole rather than any one
   * construct. Without it a render that stayed inside every other default
   * produced a 90 MB string - a remote memory-exhaustion DoS on any host that
   * renders user-supplied data.
   */
  maxOutputChars: number;
  /**
   * Wall-clock budget for one render, in milliseconds.
   *
   * Checked at the sink alongside the size budget, so a render that allocates
   * slowly rather than largely is bounded too. `Infinity` disables it.
   */
  maxRenderMillis: number;
}

/**
 * The ceilings a render uses when the caller names none.
 *
 * These are the values Section 10.1 of the specification documents.
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  // The expression-level ceilings are spread in rather than repeated: they are
  // enforced one layer down, and a second copy of 10/50 here is a second thing
  // to forget to change.
  ...DEFAULT_EVALUATOR_CONFIG,
  maxLoopNesting: 5,
  maxIterationsPerLoop: 1000,
  maxTotalIterations: 10000,
  maxComponentDepth: 10,
  maxSlotDepth: 16,
  maxOutputChars: 32 * 1024 * 1024,
  maxRenderMillis: 10_000,
};
