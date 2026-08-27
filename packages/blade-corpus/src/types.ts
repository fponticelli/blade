// The shape of one conformance case.
//
// Deliberately structural and dependency-free: this module is imported by two
// packages, one of which renders through the engine directly and one of which
// renders through a reactive sink built on top of it. Importing the engine's
// own types here would make the corpus depend on the thing it is testing, and
// would put a build edge between the table and the suites that read it.
//
// Every field is data. Nothing in this package renders anything, evaluates
// anything, or knows which renderers exist beyond their names - the assertions
// live in the suites, so that adding a case is editing a table and never
// editing a test.

/** The renderers a case is driven through. */
export type RendererId = 'string' | 'dom' | 'tempo';

/** Every renderer, in the order a report should list them. */
export const RENDERER_IDS: readonly RendererId[] = ['string', 'dom', 'tempo'];

/**
 * Resource ceilings a case overrides.
 *
 * Structurally a `Partial<ResourceLimits>` from `@bladets/template`, spelled
 * out rather than imported so this module keeps no dependency on the engine.
 * A key added there and not here simply cannot be set by a case, which is a
 * compile error in the suite rather than a silently ignored option.
 */
export interface CorpusLimits {
  readonly maxLoopNesting?: number;
  readonly maxIterationsPerLoop?: number;
  readonly maxTotalIterations?: number;
  readonly maxComponentDepth?: number;
  readonly maxSlotDepth?: number;
  readonly maxOutputChars?: number;
  readonly maxRenderMillis?: number;
}

/**
 * What a case configures the render with.
 *
 * The three renderers spell their options differently - the reactive one
 * flattens the render config into its own options object - so the corpus names
 * the *decision* and each suite's adapter maps it. A knob that only one sink
 * has (the string serialiser's `htmlEscape`, say) is deliberately absent:
 * a case the sinks cannot all be given is not a case about agreement.
 */
export interface CorpusRenderOptions {
  /** Values reachable as `$.name`. */
  readonly globals?: Readonly<Record<string, unknown>>;
  /**
   * Register `standardLibrary` as the helper registry.
   *
   * A flag rather than the registry itself, because the registry lives in the
   * engine and this module does not import it.
   */
  readonly standardHelpers?: boolean;
  /** Overrides for the render's resource ceilings. */
  readonly limits?: CorpusLimits;
  /** Emit the template's HTML comments. */
  readonly includeComments?: boolean;
  /** Let an expression contribute CSS structure to a `style` attribute. */
  readonly allowStyleInterpolation?: boolean;
}

/** A diagnostic the compile is expected to produce, identified by its code. */
export interface ExpectedDiagnostic {
  readonly level: 'error' | 'warning';
  readonly code: string;
}

/**
 * A resource ceiling the render is expected to hit.
 *
 * Named by the ceiling rather than by the message, because the message carries
 * the counts and the counts are legitimately sink-specific: the string sink
 * measures its output in characters written and the DOM sink in the characters
 * the same markup would have cost, so `maxOutputChars` trips at 103 in one and
 * 107 in the other. *Which* ceiling stopped the render is the semantics, and
 * that is what every sink must agree on.
 */
export interface ExpectedFailure {
  /**
   * The `limitType` field of the engine's `ResourceLimitError`.
   *
   * Structurally the engine's `ResourceLimitType`, spelled out here for the
   * same reason {@link CorpusLimits} is.
   */
  readonly limitType:
    | 'loopNesting'
    | 'iterations'
    | 'componentDepth'
    | 'slotDepth'
    | 'outputSize'
    | 'renderTime';
}

/**
 * One case: a template, the data to render it with, and what every renderer
 * must produce.
 */
export interface CorpusCase {
  /** Unique, and stable: it names the case in every suite's output. */
  readonly name: string;
  /** What the case is about, used only to group the report. */
  readonly group: string;
  /** Template source, compiled by `compile()` - never a hand-built AST. */
  readonly source: string;
  /** Render data. Defaults to `{}`. */
  readonly data?: unknown;
  readonly options?: CorpusRenderOptions;

  /**
   * The string renderer's output, exactly.
   *
   * `''` for a case that is expected not to compile; see
   * {@link CorpusCase.expectedDiagnostics}.
   */
  readonly expectedHtml: string;

  /**
   * The DOM and reactive sinks' output, serialised, when it legitimately
   * differs from what parsing {@link CorpusCase.expectedHtml} yields.
   *
   * Almost never needed. The two node-building sinks are compared against the
   * *parse* of the string sink's output, which is the right equivalence: the
   * reader sees a document, and `<br/>` and `<br>`, `&#39;` and `'`, `&copy;`
   * and `©` are the same document written differently. Anything that survives
   * that comparison is a real disagreement, so setting this field is a claim
   * that the media genuinely differ - and {@link CorpusCase.domDifference} has
   * to say why.
   */
  readonly expectedDomOuterHtml?: string;

  /**
   * Why {@link CorpusCase.expectedDomOuterHtml} is set. Required with it.
   */
  readonly domDifference?: string;

  /**
   * Diagnostics the compile must produce, in order.
   *
   * A case with an `error` here does not render: `expectedHtml` is `''` and no
   * renderer is asked for output. A case *without* this field must compile
   * with no diagnostics at all - not merely no errors - which is what stops a
   * template that half-works from being pinned as if it worked.
   */
  readonly expectedDiagnostics?: readonly ExpectedDiagnostic[];

  /**
   * Substrings of the render warnings, in order, that every renderer must
   * report.
   *
   * Warnings are the record of what the render substituted or refused - a
   * blocked URL, a value constrained as CSS - and they are decided by the
   * shared traversal, so they are part of what the sinks have to agree on. A
   * case without this field must produce no warnings in any sink.
   */
  readonly expectedWarnings?: readonly string[];

  /** The resource ceiling this case is expected to breach. */
  readonly expectedFailure?: ExpectedFailure;

  /**
   * Renderers this case is *not* driven through, and why.
   *
   * An exclusion is a design decision written down, never a bug parked. The
   * list is asserted to be short and every reason is printed by the suite, so
   * an entry added to make a red test green is visible in the output.
   */
  readonly excludedFrom?: Readonly<Partial<Record<RendererId, string>>>;

  /**
   * Anything a reader of this case needs that the assertions do not say -
   * in particular, behaviour pinned as it stands while a question about it is
   * open elsewhere.
   */
  readonly note?: string;
}
