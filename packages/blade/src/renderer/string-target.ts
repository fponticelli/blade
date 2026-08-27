// HTML string output target
//
// A sink, not a renderer: it holds no scope, evaluates nothing and makes no
// decision about what to emit. Everything it does is turn one call from the
// shared traversal into characters, escaped for the position it is going into.

import {
  canonicalAttributeName,
  canonicalTagName,
  type Namespace,
} from '../ast/html.js';
import type {
  ElementSpec,
  RenderedAttribute,
  RenderPosition,
  RenderTarget,
} from './target.js';
import type { Dyn } from './reactive.js';
import { OutputBudget } from './target.js';
import type { EscapeContext } from './escape.js';
import {
  escapeAttributeDelimiter,
  escapeCommentText,
  escapeForContext,
  escapeHtmlBody,
} from './escape.js';

/**
 * Rendered fragments for attributes that never change.
 *
 * An attribute built entirely from author-written source is the same
 * ` name="value"` on every render, and the traversal hands the same
 * {@link RenderedAttribute} object back each time for exactly this reason.
 * Re-escaping and re-formatting them was 44% of the total time of a
 * static-attribute-heavy template.
 */
const staticFragments = new WeakMap<RenderedAttribute, string>();

/**
 * A destination for finished HTML, called with each chunk in document order.
 *
 * Supplying one makes the render streaming: the chunk is handed on and not
 * retained, so peak memory is a chunk rather than the document.
 */
export type ChunkSink = (chunk: string) => void;

/**
 * Collects rendered HTML.
 *
 * Output is appended to a chunk list and joined once, so nothing is copied
 * quadratically and no intermediate `string[]` per loop, per element and per
 * children array survives to be joined again one level up. The peak memory of
 * a large render used to be twice its output for exactly that reason - a
 * `@for` accumulated `string[]`, joined it, and handed the result to a parent
 * that was accumulating a `string[]` of its own.
 *
 * Pass a {@link ChunkSink} to stream instead of accumulating at all.
 */
export class StringTarget implements RenderTarget<string> {
  /**
   * Characters cannot carry a closure. The traversal refuses every `on:`
   * binding on this sink's behalf, with a warning naming the binding, rather
   * than this class quietly writing nothing.
   */
  readonly bindsEvents = false;

  private readonly chunks: string[] = [];

  /**
   * @param budget - Output-size and wall-clock accounting, shared with the
   *   traversal so that time spent outside the sink is bounded too
   * @param position - The node currently being rendered, for error locations
   * @param sink - Optional destination for each chunk. When given, nothing is
   *   retained and `finish()` returns the empty string.
   */
  constructor(
    private readonly budget: OutputBudget,
    private readonly position: RenderPosition,
    private readonly sink?: ChunkSink
  ) {}

  /** The single point every character of output passes through. */
  private write(text: string): void {
    if (text === '') return;
    this.budget.account(text.length, this.position.location);
    if (this.sink) this.sink(text);
    else this.chunks.push(text);
  }

  element(spec: ElementSpec, children: () => void): void {
    // The same spelling `DomTarget` creates the element with. A foreign name is
    // case-significant - `<lineargradient>` is not `<linearGradient>` - and
    // writing back whatever the author typed made this sink disagree with the
    // other two on every SVG element whose canonical name carries an internal
    // capital. Only an HTML parser reading the result would have papered over
    // it; served as XHTML, or compared against the DOM, the difference is real.
    const tag = canonicalTagName(spec.tag, spec.namespace);

    let open = `<${tag}`;
    for (const binding of spec.attributes) {
      const attribute = binding.attribute.value;
      if (attribute !== null) {
        open += this.attributeFragment(attribute, spec.namespace);
      }
    }
    // Void elements are written self-closing, which is valid HTML and is also
    // valid XHTML/XML - the same string can be served as either.
    this.write(spec.isVoid ? `${open}/>` : `${open}>`);
    if (spec.isVoid) return;
    children();
    this.write(`</${tag}>`);
  }

  /** ` name="value"`, or ` name` for a valueless attribute. */
  private attributeFragment(
    attribute: RenderedAttribute,
    namespace: Namespace
  ): string {
    // Canonicalised for the same reason the tag is: `viewbox` is not `viewBox`
    // to an SVG element, and `DomTarget` has always restored the spelling.
    const name = canonicalAttributeName(attribute.name, namespace);
    if (attribute.kind === 'boolean') return ` ${name}`;

    const cached = staticFragments.get(attribute);
    if (cached !== undefined) return cached;

    let value = '';
    let isStatic = true;
    for (const part of attribute.parts) {
      if (part.kind === 'source') {
        value += escapeAttributeDelimiter(part.source);
      } else {
        value += escapeHtmlBody(part.value);
        isStatic = false;
      }
    }

    const fragment = ` ${name}="${value}"`;
    if (isStatic) staticFragments.set(attribute, fragment);
    return fragment;
  }

  literalText(source: string, _context: EscapeContext): void {
    // Author-written text is already HTML source in every context: escaped once
    // by the author in an HTML body, and raw JavaScript or CSS inside a
    // `<script>` or `<style>`, where character references are never decoded.
    this.write(source);
  }

  text(value: Dyn<string>, context: EscapeContext): void {
    this.write(escapeForContext(value.value, context));
  }

  rawHtml(html: Dyn<string>): void {
    this.write(html.value);
  }

  comment(text: string): void {
    this.write(`<!--${escapeCommentText(text)}-->`);
  }

  doctype(value: string): void {
    this.write(`<!DOCTYPE ${value}>`);
  }

  finish(): string {
    return this.chunks.join('');
  }
}
