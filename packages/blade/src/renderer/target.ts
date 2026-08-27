// Render targets
//
// The seam that ended thirty implementations of eleven node kinds.
//
// The AST walk, the scope rules, the loop/component/slot semantics, the
// escaping decisions and the resource accounting are written once, in
// `renderer/index.ts`, against this interface. A target is a sink: it decides
// how a finished piece of output is *represented*, and has no control flow of
// its own. `StringTarget` produces HTML text, `DomTarget` produces DOM nodes,
// and a reactive target in `@bladets/tempo` produces `Renderable`s - all from
// the same traversal, so a fix in the traversal is a fix everywhere.
//
// The one thing a target owns that looks like a decision is *encoding*, and it
// owns it because the correct encoding depends on the sink: `createTextNode`
// parses nothing, so escaping on the way into it double-encodes the page, while
// writing the same value into an HTML string requires it. The traversal
// therefore never escapes. It says what a value IS - author-written HTML source
// (`literalText`), an evaluated value (`text`), evaluated markup (`rawHtml`) -
// and which sink it is going into (an {@link EscapeContext}), and the target
// applies the escaper that is right for the pair.

import type { Namespace } from '../ast/html.js';
import type { SourceLocation } from '../ast/types.js';
import { ResourceLimitError } from './errors.js';
import type { EscapeContext } from './escape.js';
import type { Dyn } from './reactive.js';

// =============================================================================
// Attributes
// =============================================================================

/**
 * One piece of an attribute value, tagged with where it came from.
 *
 * The origin is the whole point. Author-written text is already HTML source -
 * `title="Tom &amp; Jerry"` means one ampersand - while an evaluated value is
 * plain text and has to be escaped to mean itself. Escaping the *concatenation*
 * gets one of the two wrong whichever escaper is chosen, which is how
 * `Tom &amp; Jerry` came to render as `Tom &amp;amp; Jerry`.
 */
export type AttributePart =
  /** Author-written text, in the sink's own representation. */
  | { readonly kind: 'source'; readonly source: string }
  /** An evaluated value, as plain text. */
  | { readonly kind: 'value'; readonly value: string };

/**
 * An attribute the traversal decided to emit.
 *
 * A `boolean` attribute is present with no value (`disabled`); a `parts`
 * attribute has a value assembled from the pieces, escaped by origin.
 */
export type RenderedAttribute =
  | { readonly kind: 'boolean'; readonly name: string }
  | {
      readonly kind: 'parts';
      readonly name: string;
      readonly parts: readonly AttributePart[];
    };

/**
 * One attribute of an element, as the traversal decided it.
 *
 * The name is fixed and the value is a cell, because that is the shape of the
 * decision: an attribute's name comes from the template and never varies, while
 * whether it is present at all - `disabled=${x}` with a falsy `x` - and what it
 * says are both properties of the data. An eager sink reads the cell once; a
 * reactive one binds it.
 */
export interface AttributeBinding {
  /** The attribute's name, exactly as the template wrote it. */
  readonly name: string;
  /** What to set it to, or null to omit the attribute entirely. */
  readonly attribute: Dyn<RenderedAttribute | null>;
}

// =============================================================================
// Event bindings
// =============================================================================

/**
 * What an `on:` binding's expression must evaluate to.
 *
 * Deliberately not `EventListener`: the traversal never touches the event, and
 * a sink that is not the DOM may have something else to hand a handler. The
 * sink narrows it at the point where it knows what it is attaching to.
 */
export type TemplateEventHandler = (event: unknown) => unknown;

/**
 * One `on:` binding the traversal decided, as `on:click=${handler}`.
 *
 * The handler is a cell for the same reason an attribute's value is: which
 * function should run can be a property of the data. A sink binds the cell once
 * and reads it when the event fires, so a handler that changes is simply a
 * different value in the same cell rather than a listener torn down and
 * replaced.
 *
 * A null handler means the expression did not produce something callable. The
 * traversal has already reported that; the sink attaches nothing.
 */
export interface EventBinding {
  /** The event to listen for, e.g. `click`. */
  readonly event: string;
  /** What to run, or null when there is nothing to run. */
  readonly handler: Dyn<TemplateEventHandler | null>;
}

/** Everything a target needs to open, fill and close one element. */
export interface ElementSpec {
  /** Tag name exactly as the template wrote it. */
  readonly tag: string;
  /** Namespace the element belongs to, resolved from its ancestry. */
  readonly namespace: Namespace;
  /** True for void elements, which have no children and no end tag. */
  readonly isVoid: boolean;
  readonly attributes: readonly AttributeBinding[];
  /**
   * Event listeners to bind to the element.
   *
   * Always empty for a sink whose {@link RenderTarget.bindsEvents} is false;
   * the traversal reports the refusal once per binding rather than leaving each
   * sink to decide what to do with something it cannot represent.
   */
  readonly listeners: readonly EventBinding[];
}

// =============================================================================
// The target interface
// =============================================================================

/**
 * A sink the shared traversal writes rendered output into.
 *
 * Calls arrive in document order. `element` is the only nesting operation: the
 * target opens the element, invokes `children`, and closes it - so a target
 * cannot forget to close, and the traversal cannot leave a target's stack
 * unbalanced when a node throws.
 *
 * @typeParam T - What {@link RenderTarget.finish} produces.
 */
export interface RenderTarget<T> {
  /**
   * Whether this sink can hold a listener.
   *
   * A capability, not a policy: what to *do* about a template that binds an
   * event a sink cannot hold is a semantic decision, and semantic decisions
   * belong to the traversal. A string sink produces characters, and characters
   * cannot carry a closure, so it answers false and the traversal refuses the
   * binding - once, with a location - instead of every sink inventing its own
   * silence.
   */
  readonly bindsEvents: boolean;

  /**
   * Emits one element and, unless it is void, everything inside it.
   *
   * @param spec - Tag, namespace, voidness and the attributes to set
   * @param children - Renders the element's content into this same target
   */
  element(spec: ElementSpec, children: () => void): void;

  /**
   * Emits author-written text, which is already in this sink's representation.
   *
   * For an HTML string that means verbatim - the author escaped it once, when
   * they wrote it. For the DOM it means decoded, because `createTextNode` shows
   * `&amp;` as four characters.
   *
   * @param source - The text as the template wrote it
   * @param context - The sink it is being written into
   */
  literalText(source: string, context: EscapeContext): void;

  /**
   * Emits an evaluated value, as plain text.
   *
   * @param value - The value, already stringified, unescaped
   * @param context - The sink it is being written into
   */
  text(value: Dyn<string>, context: EscapeContext): void;

  /**
   * Emits an evaluated value as markup - the `$!` raw interpolation.
   *
   * @param html - HTML source produced by the template's data
   */
  rawHtml(html: Dyn<string>): void;

  /**
   * Emits an HTML comment.
   *
   * @param text - Comment text, which the target neutralises so it cannot
   *   close the comment early
   */
  comment(text: string): void;

  /**
   * Emits a DOCTYPE declaration.
   *
   * @param value - The declaration's value, e.g. `html`
   */
  doctype(value: string): void;

  /** The finished output. Called once, after the traversal completes. */
  finish(): T;
}

// =============================================================================
// Resource accounting
// =============================================================================

/**
 * The output-size and wall-clock budget for one render.
 *
 * Both ceilings are enforced here, at the single point every byte of output
 * passes through, rather than construct by construct: iterations were counted
 * for years while the size of what each iteration produced was not, so a render
 * that stayed inside every documented limit could still allocate 90 MB.
 *
 * The deadline is sampled rather than read on every write - `performance.now()`
 * costs more than the append it would guard - which is why the effective
 * granularity is a few thousand writes.
 */
export class OutputBudget {
  private used = 0;
  private sinceDeadlineCheck = 0;
  private readonly deadline: number;

  /** How often, in writes, the wall clock is consulted. */
  private static readonly DEADLINE_INTERVAL = 512;

  constructor(
    private readonly maxChars: number,
    private readonly maxMillis: number,
    private readonly startedAt: number = performance.now()
  ) {
    this.deadline = startedAt + maxMillis;
  }

  /** Characters written so far. */
  get charsWritten(): number {
    return this.used;
  }

  /**
   * Records `chars` characters of output and enforces both budgets.
   *
   * @param chars - Length of the text about to be emitted
   * @param location - Node being rendered, for the error's location
   * @throws {ResourceLimitError} When either budget is exhausted
   */
  account(chars: number, location: SourceLocation): void {
    this.used += chars;
    if (this.used > this.maxChars) {
      throw new ResourceLimitError(
        'outputSize',
        this.used,
        this.maxChars,
        location
      );
    }
    if (++this.sinceDeadlineCheck >= OutputBudget.DEADLINE_INTERVAL) {
      this.sinceDeadlineCheck = 0;
      this.checkDeadline(location);
    }
  }

  /**
   * Enforces the wall-clock budget now, whatever the sampling interval says.
   *
   * The traversal calls this per loop iteration, so a render that spends its
   * time in helpers rather than in output still stops.
   *
   * @param location - Node being rendered, for the error's location
   * @throws {ResourceLimitError} When the deadline has passed
   */
  checkDeadline(location: SourceLocation): void {
    if (this.maxMillis === Infinity) return;
    const now = performance.now();
    if (now > this.deadline) {
      throw new ResourceLimitError(
        'renderTime',
        Math.round(now - this.startedAt),
        this.maxMillis,
        location
      );
    }
  }
}

/**
 * The node a target attributes a budget overflow to.
 *
 * A target writes text without knowing which node produced it, so the traversal
 * keeps the current node's location here and the target reads it when it has to
 * raise an error. One mutable cell rather than a location threaded through
 * every sink call.
 */
export interface RenderPosition {
  location: SourceLocation;
}
