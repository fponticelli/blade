// @bladets/tempo - Reactive output target
//
// The third implementation of `RenderTarget`, alongside `StringTarget` and
// `DomTarget` in @bladets/template. It represents finished output as Tempo
// `Renderable`s and makes no decision of its own beyond encoding - which is the
// one thing a target owns, and the reason this package's escaping was wrong for
// two releases.
//
// Nothing here escapes for HTML. `createTextNode` and `setAttribute` parse
// nothing, so a value written through them means itself; running it through an
// HTML escaper first put `a &amp;amp; b` on the page where the string renderer
// put `a & b`, turned `?a=1&b=2` into a different URL, and made
// `style="color: ${c}"` unparseable often enough that the browser dropped the
// declaration. The safety that *is* real - refusing an `on*` handler built from
// an expression, validating the scheme of a URL attribute, constraining a value
// interpolated into `style`, and escaping into `<script>` and `<style>`, where
// character references are never decoded - lives in the shared traversal and
// applies here exactly as it does to the other two sinks.

import type {
  AttributeBinding,
  Dyn,
  ElementSpec,
  EscapeContext,
  EventBinding,
  Namespace,
  OutputBudget,
  RenderPosition,
  RenderTarget,
  RenderedAttribute,
} from '@bladets/template/browser';
import {
  canonicalAttributeName,
  canonicalTagName,
  decodeHtmlText,
  escapeCommentText,
  escapeForContext,
} from '@bladets/template/browser';
import type { Renderable, TNode } from '@tempots/dom';
import {
  DOMNode,
  El,
  ElNS,
  Empty,
  Fragment,
  MapSignal,
  OnDispose,
  Signal,
  TextNode,
  WithElement,
} from '@tempots/dom';
import { Emitter } from './emitter.js';

/** XML namespace URIs, by the namespace names the traversal resolves. */
const NAMESPACE_URIS: Record<Namespace, string | null> = {
  html: null,
  svg: 'http://www.w3.org/2000/svg',
  mathml: 'http://www.w3.org/1998/Math/MathML',
};

/** The cell as a signal, or null when it can never change. */
function asSignal<T>(cell: Dyn<T>): Signal<T> | null {
  return cell instanceof Signal ? (cell as Signal<T>) : null;
}

/**
 * Builds a live DOM tree.
 *
 * Every operation that can take a changing value takes a cell, and binds it
 * once: a text node whose content is a signal is one text node for the life of
 * the render, not a node rebuilt per update.
 */
export class TempoTarget implements RenderTarget<Renderable> {
  /** A live element can hold a live listener; that is the point of this sink. */
  readonly bindsEvents = true;

  /**
   * @param emitter - Collects the Renderables this sink produces
   * @param budget - Output-size and wall-clock accounting for the build pass
   * @param position - The node currently being rendered, for error locations
   */
  constructor(
    private readonly emitter: Emitter,
    private readonly budget: OutputBudget,
    private readonly position: RenderPosition
  ) {}

  /**
   * Charges the render's budget for output this sink is about to produce.
   *
   * Only the *build* pass is accounted, which is what this sink can honestly
   * bound. A ceiling is a promise about one render, and the traversal runs once
   * here: everything after it happens inside a signal's callback, on a stack
   * whose beginning was minutes ago. Charging those against the same budget
   * would make a page that mounted successfully fail ten seconds later, when
   * the wall-clock deadline set at mount expired - a mounted page is not a
   * render in progress. What a ceiling should mean for an incremental update is
   * a separate question and needs a separate limit.
   *
   * A breach throws {@link ResourceLimitError} out of the traversal, where
   * `createTempoRenderer` catches it and reports it through the failure
   * channel, exactly as it reports an iteration ceiling.
   *
   * @param chars - Length of the output about to be emitted
   */
  private account(chars: number): void {
    this.budget.account(chars, this.position.location);
  }

  element(spec: ElementSpec, children: () => void): void {
    const parts: TNode[] = spec.attributes.map(binding => {
      // The attribute's opening value, charged now for the same reason
      // `DomTarget` charges it: it is output the build pass produces. Later
      // values arrive through the cell and are not charged.
      const attribute = binding.attribute.value;
      if (attribute !== null) {
        const name = canonicalAttributeName(binding.name, spec.namespace);
        this.account(name.length + (attributeText(attribute) ?? '').length);
      }
      return bindAttribute(binding, spec.namespace);
    });
    for (const listener of spec.listeners) {
      this.account(listener.event.length);
      parts.push(bindListener(listener));
    }
    const tag = canonicalTagName(spec.tag, spec.namespace);
    // `<tag ...>` and `</tag>` are what this element would cost as text, the
    // same figure `DomTarget` charges, so the three sinks are bounded by
    // comparable numbers rather than by whatever each one's medium happens to
    // allocate. Charged before descending, so a breach is attributed to the
    // element that caused it rather than to its last child.
    this.account(tag.length * 2 + 5);

    // Void elements have no children and the traversal does not offer any; the
    // callback is simply not invoked, exactly as the two eager sinks do.
    if (!spec.isVoid) parts.push(...this.emitter.collect(children));

    const uri = NAMESPACE_URIS[spec.namespace];
    this.emitter.emit(
      uri === null ? El(tag, ...parts) : ElNS(tag, uri, ...parts)
    );
  }

  literalText(source: string, context: EscapeContext): void {
    // Inside `<script>`/`<style>` the author's text is program source and is
    // used verbatim; anywhere else it is HTML source and has to be decoded,
    // because a text node shows `&amp;` as five characters.
    const text = context === 'html-body' ? decodeHtmlText(source) : source;
    this.account(text.length);
    this.emitter.emit(TextNode(text));
  }

  text(value: Dyn<string>, context: EscapeContext): void {
    // `html-body` needs no escaping into a text node. The raw-text contexts
    // still do: a `"` in a value interpolated into a `<script>` ends the
    // JavaScript string literal it sits in whether the script was assembled as
    // text or as a DOM node.
    const encoded =
      context === 'html-body'
        ? value
        : value.map(text => escapeForContext(text, context));

    // What this text node says at mount. A later value replaces it rather than
    // adding to the page, so charging only the opening one is what bounds the
    // build without making an update look like fresh allocation.
    this.account(encoded.value.length);

    const signal = asSignal(encoded);
    this.emitter.emit(TextNode(signal ?? encoded.value));
  }

  rawHtml(html: Dyn<string>): void {
    this.account(html.value.length);

    const signal = asSignal(html);
    this.emitter.emit(
      signal === null
        ? parseHtml(html.value)
        : MapSignal(signal, source => parseHtml(source))
    );
  }

  comment(text: string): void {
    const safe = escapeCommentText(text);
    this.account(safe.length + 7);
    this.emitter.emit(adopt(document.createComment(safe)));
  }

  doctype(value: string): void {
    // A DOCTYPE is a property of a document, not a node that can live in a
    // rendered tree. Emitting nothing is the only honest answer, and it keeps
    // this sink structurally comparable with `DomTarget`.
    void value;
  }

  finish(): Renderable {
    return Fragment(...this.emitter.roots());
  }
}

/**
 * Parses evaluated markup - the `$!` interpolation - into nodes.
 *
 * A `<template>` parses its content without running it and without the
 * fostering rules a `<div>` would apply, so a `<tr>` survives the trip. The
 * nodes are adopted individually rather than as a fragment, because a fragment
 * empties itself when it is inserted and Tempo would have nothing left to
 * remove.
 */
function parseHtml(source: string): Renderable {
  if (source === '') return Empty;
  const template = document.createElement('template');
  template.innerHTML = source;
  return Fragment(...Array.from(template.content.childNodes).map(adopt));
}

/** An existing DOM node, as a Renderable. */
function adopt(node: Node): Renderable {
  return DOMNode(node) as Renderable;
}

/**
 * Binds one attribute onto the element being built.
 *
 * `setAttribute` directly rather than through Tempo's `Attr`, which routes
 * some names to element *properties* and treats anything but `true` on a
 * boolean-listed name as a removal - so `<input disabled="disabled">` would
 * have lost its attribute. The traversal has already decided what this
 * attribute is worth, including whether it is present at all; the sink's job is
 * only to say it.
 */
function bindAttribute(
  binding: AttributeBinding,
  namespace: Namespace
): Renderable {
  const name = canonicalAttributeName(binding.name, namespace);
  const value = binding.attribute.map(attributeText);
  const signal = asSignal(value);

  return WithElement(element => {
    if (signal === null) {
      applyAttribute(element, name, value.value);
      return;
    }
    // Called with the current value immediately, and unsubscribed with the
    // element's own disposal scope.
    signal.on(text => applyAttribute(element, name, text));
  });
}

/**
 * Attaches one `on:` binding to the element being built.
 *
 * The handler is read from its cell when the event fires rather than captured
 * now. That is what lets a handler depend on the data without the element being
 * rebuilt to change what it does - and it is why the listener is installed once
 * and never replaced.
 *
 * Removed when the scope that owns the element is disposed. The element is
 * usually dropped at the same moment, which would make the listener garbage
 * anyway - but "usually" is not "always": a caller who kept a reference to a
 * node would otherwise still be able to fire a handler that reads cells the
 * render has finished with.
 */
function bindListener(binding: EventBinding): Renderable {
  return WithElement(element => {
    const listener = (event: Event): void => {
      binding.handler.value?.(event);
    };
    element.addEventListener(binding.event, listener);
    return OnDispose(() =>
      element.removeEventListener(binding.event, listener)
    );
  });
}

function applyAttribute(
  element: Element,
  name: string,
  value: string | null
): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/** What an attribute says, or null when it is not present at all. */
function attributeText(attribute: RenderedAttribute | null): string | null {
  if (attribute === null) return null;
  if (attribute.kind === 'boolean') return '';

  let value = '';
  for (const part of attribute.parts) {
    // Author source is decoded; an evaluated value is already plain text and
    // `setAttribute` does no parsing, so escaping either would show the reader
    // the escape rather than the character.
    value += part.kind === 'source' ? decodeHtmlText(part.source) : part.value;
  }
  return value;
}
