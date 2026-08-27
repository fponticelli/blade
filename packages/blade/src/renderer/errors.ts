// Render errors
//
// Split out of the renderer so that the output targets, which raise resource
// errors of their own, do not have to import the traversal that drives them.

import type { SourceLocation } from '../ast/types.js';

/**
 * Why a render stopped.
 *
 * `RENDER_FAILED` is the catch-all: anything thrown below the node level -
 * an {@link ../evaluator/index.js#EvaluationError}, a `TypeError` out of a host
 * helper - is re-thrown as one of these, carrying the location of the node that
 * was being rendered and the original error as `cause`. Before that, a single
 * mistyped helper anywhere in a template aborted the whole render with a
 * message naming no element, line or column.
 */
export type RenderErrorCode =
  | 'LOOP_NESTING_EXCEEDED'
  | 'ITERATION_LIMIT_EXCEEDED'
  | 'COMPONENT_DEPTH_EXCEEDED'
  | 'SLOT_DEPTH_EXCEEDED'
  | 'OUTPUT_SIZE_EXCEEDED'
  | 'RENDER_TIME_EXCEEDED'
  | 'UNKNOWN_COMPONENT'
  | 'RENDER_FAILED';

/**
 * Error thrown during template rendering.
 * Includes source location for debugging and error code for categorization.
 */
export class RenderError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code: RenderErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

/**
 * Resource limit types that can be exceeded.
 */
export type ResourceLimitType =
  | 'loopNesting'
  | 'iterations'
  | 'componentDepth'
  | 'slotDepth'
  | 'outputSize'
  | 'renderTime';

const LIMIT_CODES: Record<ResourceLimitType, RenderErrorCode> = {
  loopNesting: 'LOOP_NESTING_EXCEEDED',
  iterations: 'ITERATION_LIMIT_EXCEEDED',
  componentDepth: 'COMPONENT_DEPTH_EXCEEDED',
  slotDepth: 'SLOT_DEPTH_EXCEEDED',
  outputSize: 'OUTPUT_SIZE_EXCEEDED',
  renderTime: 'RENDER_TIME_EXCEEDED',
};

const LIMIT_MESSAGES: Record<
  ResourceLimitType,
  (current: number, max: number) => string
> = {
  loopNesting: (c, m) => `Loop nesting depth exceeded: ${c} > ${m}`,
  iterations: (c, m) => `Iteration limit exceeded: ${c} > ${m}`,
  componentDepth: (c, m) => `Component nesting depth exceeded: ${c} > ${m}`,
  slotDepth: (c, m) => `Slot expansion depth exceeded: ${c} > ${m}`,
  outputSize: (c, m) => `Output size limit exceeded: ${c} > ${m} characters`,
  renderTime: (c, m) => `Render time limit exceeded: ${c}ms > ${m}ms`,
};

/**
 * Error thrown when a resource limit is exceeded during rendering.
 * Extends RenderError with specific limit information.
 */
export class ResourceLimitError extends RenderError {
  public readonly limitType: ResourceLimitType;
  public readonly current: number;
  public readonly max: number;

  constructor(
    limitType: ResourceLimitType,
    current: number,
    max: number,
    location: SourceLocation
  ) {
    super(
      LIMIT_MESSAGES[limitType](current, max),
      location,
      LIMIT_CODES[limitType]
    );
    this.name = 'ResourceLimitError';
    this.limitType = limitType;
    this.current = current;
    this.max = max;
  }
}
