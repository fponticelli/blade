// @bladets/tempo - Type definitions
// The options a host configures a reactive render with.

import type {
  HelperRegistry,
  ResourceLimits,
  SourceLocation,
  SourceOpTable,
} from '@bladets/template/browser';
import type { Renderable, Signal } from '@tempots/dom';

// =============================================================================
// Public Types
// =============================================================================

/**
 * Configuration options for creating a Tempo renderer.
 *
 * A subset of the engine's `RenderOptions`, with the render config flattened
 * and the string-serializer knobs left out. `htmlEscape` in particular is
 * absent by design: escaping is a property of the sink, and this sink writes
 * through DOM APIs that parse nothing, so there is nothing for it to select.
 */
export interface TempoRenderOptions {
  /**
   * Custom helper functions available in template expressions.
   * @example { formatCurrency: (n: number) => `$${n.toFixed(2)}` }
   */
  helpers?: HelperRegistry;

  /**
   * Global variables accessible via $.name syntax in templates.
   * @example { siteName: 'My App', version: '1.0.0' }
   */
  globals?: Record<string, unknown>;

  /**
   * Overrides for the render's resource ceilings; unset keys keep
   * `DEFAULT_RESOURCE_LIMITS`.
   *
   * The ceilings matter more here than on a server, not less: the machine that
   * pays for a fifty-thousand-row `@for` or a component that calls itself is
   * the reader's own browser tab. A breach is reported through {@link
   * TempoRenderOptions.onError} rather than thrown, because an incremental
   * render has no caller to throw at once it is mounted.
   */
  limits?: Partial<ResourceLimits>;

  /**
   * Emit HTML comments from the template into the rendered tree.
   * @default false
   */
  includeComments?: boolean;

  /**
   * Enable source tracking attributes (rd-source, rd-source-op, rd-source-note).
   * Useful for debugging and audit trails.
   * @default false
   */
  includeSourceTracking?: boolean;

  /**
   * Prefix for source tracking attributes.
   * @default 'rd-'
   */
  sourceTrackingPrefix?: string;

  /**
   * Emit `rd-source-op`, classifying what was done to each source.
   * @default false
   */
  includeOperationTracking?: boolean;

  /**
   * Emit `rd-source-note`, a human-readable account of each value.
   * @default false
   */
  includeNoteGeneration?: boolean;

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
   * @default false
   */
  resolveLoopIndices?: boolean;

  /**
   * Source-op classification for helpers outside the built-in registry.
   */
  helperSourceOps?: SourceOpTable;

  /**
   * Let an expression contribute CSS *structure* to a `style` attribute rather
   * than being escaped as a CSS value.
   * @default false
   */
  allowStyleInterpolation?: boolean;

  /**
   * Where every failure is reported: an expression that threw, a resource
   * ceiling that was breached, a component that could not be found, a value the
   * render refused or substituted. By default, logs a warning to the console.
   *
   * This is the reactive renderer's whole failure channel. The render that
   * mounts the tree returns immediately; everything that happens afterwards
   * happens on somebody else's stack.
   *
   * Called once per distinct failure per pass, at the end of the pass - not
   * once per evaluation. One bad expression in a 200-row table is one report
   * saying it happened 200 times, rather than 200 reports; the third argument
   * carries the count and the loop position it was first seen at.
   */
  onError?: ErrorHandler;
}

/**
 * What else is known about a failure, beyond what went wrong and where.
 *
 * Both fields exist because a reactive render repeats itself: the same
 * expression is evaluated once per row and again on every change, so "it
 * failed" is nearly useless without "how often" and "in which row".
 */
export interface FailureDetail {
  /**
   * Whether the render stopped producing something or changed what it
   * produced.
   *
   * `'error'` is an expression that threw or a ceiling that was breached;
   * `'warning'` is a value the render substituted or refused - a blocked
   * `javascript:` URL, a `@for` whose keys are not unique - and went on.
   */
  readonly severity: 'error' | 'warning';
  /** How many times this same failure happened during the pass. */
  readonly occurrences: number;
  /**
   * The loop positions in force where it was first seen, outermost first.
   *
   * `[3, 1]` means the second cell of the fourth row. Empty outside any loop.
   */
  readonly indices: readonly number[];
}

/**
 * A factory function that creates a Tempo Renderable from a data signal.
 *
 * @typeParam T - The type of data the template expects
 * @param data - A Tempo signal containing the template data
 * @returns A Renderable that can be mounted to the DOM
 */
export type TempoRenderer<T = unknown> = (data: Signal<T>) => Renderable;

// =============================================================================
// Internal Types
// =============================================================================

/**
 * The failure channel's signature.
 *
 * A handler that only cares what went wrong can still be written
 * `error => log(error)`: the extra arguments are there for a handler that
 * wants them.
 */
export type ErrorHandler = (
  error: Error,
  location: SourceLocation,
  detail: FailureDetail
) => void;

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
  TemplateNode,
  ResourceLimits,
  Scope,
} from '@bladets/template/browser';
export type { PathAliases, SourceOpTable } from '@bladets/template/browser';
export type { Renderable, Signal, Prop } from '@tempots/dom';
