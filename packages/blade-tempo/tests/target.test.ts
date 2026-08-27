// @bladets/tempo - What the sink puts in the document
//
// The reactive target's only job is representation: turning a decision the
// shared traversal already made into a Renderable. These tests pin the parts of
// that job which have no counterpart in the eager sinks - a namespaced element,
// a boolean attribute that appears and disappears, markup parsed from `$!` -
// and the parts where "the same as the DOM renderer" is the whole requirement.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { TempoRenderOptions } from '../src/types.js';

describe('the reactive sink', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    container.remove();
  });

  function mount<T>(
    source: string,
    data: T,
    options: TempoRenderOptions = {}
  ): Prop<T> {
    const cell = prop(data);
    cleanup = render(
      createTempoRenderer<T>(compileOrThrow(source), options)(cell),
      container
    );
    return cell;
  }

  it('creates a void element with no children and no end tag', () => {
    mount('<p>a<br/>b</p>', {});
    const br = container.querySelector('br')!;
    expect(br.childNodes).toHaveLength(0);
    expect(container.querySelector('p')!.textContent).toBe('ab');
  });

  it('creates an SVG element in the SVG namespace', () => {
    mount('<svg><circle cx="${x}" r="4"></circle></svg>', { x: 5 });
    const circle = container.querySelector('circle')!;
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(circle.getAttribute('cx')).toBe('5');
  });

  it('restores the case of an SVG tag and attribute', () => {
    // The parser lower-cases; SVG does not. Answering that question a second
    // time in this sink is how `<clipPath>` came to be created as `<clippath>`.
    mount('<svg><clippath><text textlength="${n}"/></clippath></svg>', {
      n: 40,
    });
    expect(container.querySelector('svg')!.firstElementChild!.tagName).toBe(
      'clipPath'
    );
    const text = container.querySelector('text')!;
    expect(text.getAttribute('textLength')).toBe('40');
  });

  it('sets a boolean attribute as an attribute, not a property', () => {
    mount('<input disabled="disabled"/>', {});
    const input = container.querySelector('input')!;
    // Tempo's own `Attr` would treat anything but `true` on a boolean-listed
    // name as a removal; the traversal already decided this attribute is
    // present, and the sink's job is only to say so.
    expect(input.getAttribute('disabled')).toBe('disabled');
  });

  it('adds and removes an attribute as its value comes and goes', async () => {
    const data = mount('<input disabled=$off/>', {
      off: true as boolean | null,
    });
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(
      true
    );
    expect(container.querySelector('input')!.getAttribute('disabled')).toBe('');

    data.value = { off: false };
    await Promise.resolve();
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(
      false
    );

    data.value = { off: true };
    await Promise.resolve();
    expect(container.querySelector('input')!.hasAttribute('disabled')).toBe(
      true
    );
  });

  it('parses raw markup into real nodes, not a wrapper', () => {
    mount('<ul>$!rows</ul>', { rows: '<li>a</li><li>b</li>' });
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]!.parentElement!.tagName).toBe('UL');
  });

  it('replaces raw markup when it changes', async () => {
    const data = mount('<div>$!html</div>', { html: '<b>one</b>' });
    expect(container.querySelector('b')!.textContent).toBe('one');

    data.value = { html: '<i>two</i>' };
    await Promise.resolve();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')!.textContent).toBe('two');
  });

  it('emits a comment when the caller asks for one', () => {
    mount('<div><!-- note --></div>', {}, { includeComments: true });
    const node = container.querySelector('div')!.firstChild!;
    expect(node.nodeType).toBe(Node.COMMENT_NODE);
    expect(node.textContent).toBe(' note ');
  });

  it('leaves comments out by default', () => {
    mount('<div><!-- note --></div>', {});
    expect(container.querySelector('div')!.childNodes).toHaveLength(0);
  });

  it('iterates the keys of an object with @for ... in', () => {
    mount('<ul>@for(k in obj) { <li>${k}</li> }</ul>', {
      obj: { a: 1, b: 2 },
    });
    expect(
      [...container.querySelectorAll('li')].map(li => li.textContent)
    ).toEqual(['a', 'b']);
  });

  it('binds a global with @let $.name', () => {
    mount('@@ { let $.tax = rate * 2; }<p>${$.tax}</p>', { rate: 5 });
    expect(container.querySelector('p')!.textContent).toBe('10');
  });

  it('re-evaluates a global @let when its data changes', async () => {
    const data = mount('@@ { let $.tax = rate * 2; }<p>${$.tax}</p>', {
      rate: 5,
    });
    data.value = { rate: 6 };
    await Promise.resolve();
    expect(container.querySelector('p')!.textContent).toBe('12');
  });

  it('updates through two levels of component nesting in one flush', async () => {
    const data = mount(
      '<template:Inner v!><b>${v}</b></template:Inner>' +
        '<template:Outer w!><i><Inner v=$w/></i></template:Outer>' +
        '<Outer w=$name/>',
      { name: 'first' }
    );
    expect(container.querySelector('b')!.textContent).toBe('first');

    data.value = { name: 'second' };
    await Promise.resolve();
    expect(container.querySelector('b')!.textContent).toBe('second');
  });

  it('renders a DOCTYPE as nothing, having nowhere to put it', () => {
    mount('<!DOCTYPE html><p>x</p>', {});
    expect(container.innerHTML).toContain('<p>x</p>');
    expect(container.innerHTML).not.toContain('DOCTYPE');
  });
});
