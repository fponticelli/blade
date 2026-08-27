// DOM output target
//
// The other implementation of `RenderTarget`, and the reason the interface
// exists: the string sink and the DOM sink need *different* encoding for the
// same value, and every attempt to share a renderer without naming that fact
// ended with one of them silently wrong. `$!` raw interpolation was escaped
// away here for as long as the DOM renderer existed, because "DOM text nodes
// are inherently safe" is true of `$` and false of `$!`.

import { canonicalAttributeName, canonicalTagName } from '../ast/html.js';
import type { Namespace } from '../ast/html.js';
import type {
  ElementSpec,
  RenderPosition,
  RenderTarget,
  RenderedAttribute,
} from './target.js';
import { OutputBudget } from './target.js';
import type { EscapeContext } from './escape.js';
import { escapeCommentText, escapeForContext } from './escape.js';
import { decodeHtmlText } from './decode.js';
import type { Dyn } from './reactive.js';

/** XML namespace URIs, by the namespace names `ast/html.ts` resolves. */
const NAMESPACE_URIS: Record<Namespace, string | null> = {
  html: null,
  svg: 'http://www.w3.org/2000/svg',
  mathml: 'http://www.w3.org/1998/Math/MathML',
};

/**
 * Builds DOM nodes.
 *
 * Nodes are appended straight into their parent as the traversal produces them,
 * so no intermediate `Node[]` is built, spread into `push` or re-spread one
 * level up. Those spreads turned a list of more than ~65k nodes into a
 * `RangeError` thrown from inside `Function.prototype.apply`.
 */
export class DomTarget implements RenderTarget<Node[]> {
  /** A real element can hold a real listener. */
  readonly bindsEvents = true;

  private readonly roots: Node[] = [];
  /** Open elements, innermost last; empty means the fragment's top level. */
  private readonly stack: Element[] = [];

  /**
   * @param budget - Output-size and wall-clock accounting
   * @param position - The node currently being rendered, for error locations
   */
  constructor(
    private readonly budget: OutputBudget,
    private readonly position: RenderPosition
  ) {}

  /** The single point every produced node passes through. */
  private append(node: Node, cost: number): void {
    this.budget.account(cost, this.position.location);
    const parent = this.stack[this.stack.length - 1];
    if (parent) parent.appendChild(node);
    else this.roots.push(node);
  }

  element(spec: ElementSpec, children: () => void): void {
    const uri = NAMESPACE_URIS[spec.namespace];
    const tag = canonicalTagName(spec.tag, spec.namespace);
    const el =
      uri === null
        ? document.createElement(tag)
        : document.createElementNS(uri, tag);

    for (const binding of spec.attributes) {
      const attribute = binding.attribute.value;
      if (attribute !== null) this.setAttribute(el, attribute, spec.namespace);
    }

    for (const binding of spec.listeners) {
      this.budget.account(binding.event.length, this.position.location);
      // The handler is read when the event fires rather than captured now:
      // the cell is what may change, and one listener that consults it costs
      // less than tearing a listener down and installing another. A null
      // handler is one the traversal already refused and reported.
      el.addEventListener(binding.event, event => {
        binding.handler.value?.(event);
      });
    }

    // `<tag ...>` and `</tag>` are what this element would cost as text; the
    // two sinks are then bounded by comparable numbers.
    this.append(el, tag.length * 2 + 5);
    if (spec.isVoid) return;

    this.stack.push(el);
    try {
      children();
    } finally {
      this.stack.pop();
    }
  }

  private setAttribute(
    el: Element,
    attribute: RenderedAttribute,
    namespace: Namespace
  ): void {
    const name = canonicalAttributeName(attribute.name, namespace);
    if (attribute.kind === 'boolean') {
      this.budget.account(name.length, this.position.location);
      el.setAttribute(name, '');
      return;
    }

    let value = '';
    for (const part of attribute.parts) {
      // Author source is decoded; an evaluated value is already plain text and
      // `setAttribute` does no parsing, so escaping either would show the
      // reader the escape rather than the character.
      value +=
        part.kind === 'source' ? decodeHtmlText(part.source) : part.value;
    }
    this.budget.account(name.length + value.length, this.position.location);
    el.setAttribute(name, value);
  }

  literalText(source: string, context: EscapeContext): void {
    // Inside `<script>`/`<style>` the author's text is program source and is
    // used verbatim; anywhere else it is HTML source and has to be decoded,
    // because a text node shows `&amp;` as four characters.
    const text = context === 'html-body' ? decodeHtmlText(source) : source;
    this.appendText(text);
  }

  text(dyn: Dyn<string>, context: EscapeContext): void {
    const value = dyn.value;
    // `html-body` needs no escaping into a text node. The raw-text contexts
    // still do: a `"` in a value interpolated into a `<script>` ends the
    // JavaScript string literal it sits in whether the script was assembled as
    // text or as a DOM node.
    this.appendText(
      context === 'html-body' ? value : escapeForContext(value, context)
    );
  }

  private appendText(text: string): void {
    if (text === '') return;
    // Adjacent runs coalesce into one text node: a text node's boundaries are
    // not observable in a rendered document, and one node per interpolation
    // would make `Hello, ${name}!` three where the string sink produces one
    // string.
    const previous = this.lastNode();
    if (previous !== null && previous.nodeType === 3 /* TEXT_NODE */) {
      this.budget.account(text.length, this.position.location);
      (previous as Text).appendData(text);
      return;
    }
    this.append(document.createTextNode(text), text.length);
  }

  /** The node most recently emitted at the current level, if any. */
  private lastNode(): Node | null {
    const parent = this.stack[this.stack.length - 1];
    if (parent) return parent.lastChild;
    return this.roots.length > 0 ? this.roots[this.roots.length - 1]! : null;
  }

  rawHtml(source: Dyn<string>): void {
    const html = source.value;
    if (html === '') return;
    this.budget.account(html.length, this.position.location);
    // `<template>` parses its content without running it and without the
    // fostering rules that a `<div>` would apply, so `<tr>` survives the trip.
    const template = document.createElement('template');
    template.innerHTML = html;
    const parent = this.stack[this.stack.length - 1];
    if (parent) {
      parent.appendChild(template.content);
      return;
    }
    // `childNodes` is live over a fragment being drained, so it is snapshotted.
    for (const node of Array.from(template.content.childNodes)) {
      this.roots.push(node);
    }
  }

  comment(text: string): void {
    const safe = escapeCommentText(text);
    this.append(document.createComment(safe), safe.length + 7);
  }

  doctype(value: string): void {
    // A DOCTYPE is a property of a document, not a node that can live in a
    // fragment. Emitting nothing is the only honest answer, and it keeps the
    // node lists of the two sinks structurally comparable.
    void value;
  }

  finish(): Node[] {
    return this.roots;
  }
}
