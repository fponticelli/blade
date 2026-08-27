// @bladets/tempo - Parity with the string renderer
//
// The reactive renderer is the third implementation of one set of semantics. It
// used to be a third *traversal* of them, and disagreed with the other two on
// escaping, on `@let`, on loop variable precedence, on `@match`'s `_`, on slot
// inheritance and on every resource ceiling. It is now the same traversal
// behind a different sink, and these tests say so by rendering the same
// template both ways and comparing the documents.
//
// The comparison is on the parsed DOM rather than on the markup, because that
// is the question that matters: `&amp;amp;` and `&amp;` are different markup and
// the reader only ever sees the character.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  compileOrThrow,
  createStringRenderer,
} from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { TempoRenderOptions } from '../src/types.js';

describe('parity with the string renderer', () => {
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

  /** Mounts a template reactively and hands back the data cell to drive it. */
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

  /**
   * The rendered document, without the empty comments Tempo anchors its
   * dynamic regions on. They are the reactive sink's bookkeeping, not content.
   */
  function documentOf(element: HTMLElement): string {
    const copy = element.cloneNode(true) as HTMLElement;
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
    const comments: Comment[] = [];
    while (walker.nextNode()) comments.push(walker.currentNode as Comment);
    for (const comment of comments) comment.remove();
    copy.normalize();
    return copy.innerHTML;
  }

  /** The same template rendered to HTML, then parsed back into a document. */
  function asString(
    source: string,
    data: unknown,
    options: TempoRenderOptions = {}
  ): string {
    const { html } = createStringRenderer(compileOrThrow(source))(data, {
      helpers: options.helpers,
      globals: options.globals,
    });
    const parsed = document.createElement('div');
    parsed.innerHTML = html;
    return documentOf(parsed);
  }

  /** Renders `source` both ways and asserts the documents are the same. */
  function expectParity(
    source: string,
    data: unknown,
    options: TempoRenderOptions = {}
  ): void {
    mount(source, data, options);
    expect(documentOf(container)).toBe(asString(source, data, options));
  }

  // ==========================================================================
  // Finding 1 - escaping is a property of the sink
  // ==========================================================================

  describe('escaping', () => {
    it('writes a value into a text node exactly once', () => {
      mount('<div>${x}</div>', { x: 'a & b <c> "d"' });
      expect(container.querySelector('div')!.textContent).toBe('a & b <c> "d"');
    });

    it('writes a value into an attribute exactly once', () => {
      mount('<div title="${x}"></div>', { x: 'A & B' });
      expect(container.querySelector('div')!.getAttribute('title')).toBe(
        'A & B'
      );
    });

    it('keeps a query string a query string', () => {
      mount('<a href="?a=1&b=2&c=${x}">go</a>', { x: 'd&e' });
      expect(container.querySelector('a')!.getAttribute('href')).toBe(
        '?a=1&b=2&c=d&e'
      );
    });

    it('leaves an interpolated CSS value parseable', () => {
      mount('<div style="color: ${c}"></div>', { c: 'red' });
      const style = container.querySelector('div')!.getAttribute('style');
      expect(style).toBe('color: red');
      expect(container.querySelector('div')!.style.color).toBe('red');
    });

    it('decodes an author-written character reference once', () => {
      mount('<div title="Tom &amp; Jerry">R &amp; D</div>', {});
      const div = container.querySelector('div')!;
      expect(div.getAttribute('title')).toBe('Tom & Jerry');
      expect(div.textContent).toBe('R & D');
    });

    it('still refuses a URL scheme the traversal blocks', () => {
      mount('<a href="${u}">x</a>', { u: 'javascript:alert(1)' });
      expect(container.querySelector('a')!.getAttribute('href')).toBe(
        'about:invalid#blocked'
      );
    });

    it('still escapes into a script, where nothing is decoded', () => {
      mount('<script>var s = "${x}";</script>', { x: '</script><b>' });
      expect(container.querySelector('script')!.textContent).not.toContain(
        '</script>'
      );
    });

    it('agrees with the string renderer on the rendered document', () => {
      expectParity('<div title="${t}">${x}</div>', {
        t: 'A & B',
        x: 'a & b <c> "d"',
      });
    });
  });

  // ==========================================================================
  // Findings 2 and 4 - a loop variable is a local, not an entry in the data
  // ==========================================================================

  describe('loop variables', () => {
    it('shadows an enclosing @let of the same name', () => {
      const source =
        '@@ { let item = "OUTER"; }<ul>@for(item of items) { <li>${item}</li> }</ul>';
      mount(source, { items: ['a', 'b'] });
      expect(
        [...container.querySelectorAll('li')].map(li => li.textContent)
      ).toEqual(['a', 'b']);
      expect(documentOf(container)).toBe(
        asString(source, { items: ['a', 'b'] })
      );
    });

    it('does not leak into the data the body sees', () => {
      // `item` is a name in the scope, not a key of the payload: an expression
      // that reads the payload must not find it there.
      mount('<ul>@for(item of items) { <li>${keys}</li> }</ul>', {
        items: ['a'],
        keys: 'unchanged',
      });
      expect(container.querySelector('li')!.textContent).toBe('unchanged');
    });

    it('keeps the index binding', () => {
      expectParity('<ul>@for(v, i of items) { <li>${i}:${v}</li> }</ul>', {
        items: ['a', 'b', 'c'],
      });
    });
  });

  // ==========================================================================
  // Finding 3 - @let is a binding, not a snapshot
  // ==========================================================================

  describe('@let', () => {
    it('re-evaluates when the data behind it changes', async () => {
      const data = mount('@@ { let total = n * 2; }<div>${total}</div>', {
        n: 1,
      });
      expect(container.textContent).toBe('2');

      data.value = { n: 50 };
      await Promise.resolve();
      expect(container.textContent).toBe('100');
    });

    it('re-evaluates inside a loop whose items were replaced', async () => {
      const data = mount(
        '<ul>@for(x of items) { @@ { let d = x * 2; }<li>${x}:${d}</li> }</ul>',
        { items: [1, 2, 3] }
      );
      expect(
        [...container.querySelectorAll('li')].map(li => li.textContent)
      ).toEqual(['1:2', '2:4', '3:6']);

      data.value = { items: [10, 20, 30] };
      await Promise.resolve();
      expect(
        [...container.querySelectorAll('li')].map(li => li.textContent)
      ).toEqual(['10:20', '20:40', '30:60']);
    });

    it('binds a callable arrow function', () => {
      mount('@@ { let d = (a) => a * 2; }<p>${d(21)}</p>', {});
      expect(container.querySelector('p')!.textContent).toBe('42');
    });

    it('binds a recursive arrow function', () => {
      mount(
        '@@ { let f = (n) => n <= 1 ? 1 : n * f(n - 1); }<p>${f(5)}</p>',
        {}
      );
      expect(container.querySelector('p')!.textContent).toBe('120');
    });

    // ------------------------------------------------------------------
    // Finding 5 - a binding belongs to its block, not to the context object
    // ------------------------------------------------------------------
    it('does not leak out of one @if arm into another', async () => {
      const source = '@if(a) { @@ { let x = "SET"; } }@if(b) { <p>[${x}]</p> }';
      const data = mount(source, { a: true, b: false });

      data.value = { a: false, b: true };
      await Promise.resolve();

      expect(container.querySelector('p')!.textContent).toBe('[]');
      expect(documentOf(container)).toBe(
        asString(source, { a: false, b: true })
      );
    });

    it('does not leak into the else arm of its own @if', async () => {
      const data = mount(
        '@if(a) { @@ { let x = "SET"; } } else { <p>[${x}]</p> }',
        { a: true }
      );

      data.value = { a: false };
      await Promise.resolve();
      expect(container.querySelector('p')!.textContent).toBe('[]');
    });
  });

  // ==========================================================================
  // Finding 6 - @match binds `_` to the value it matched
  // ==========================================================================

  describe('@match', () => {
    it('binds `_` inside an expression case body', () => {
      const source =
        '@match(v) { _ > 5 { <p>big ${_}</p> } * { <p>small</p> } }';
      mount(source, { v: 10 });
      expect(container.querySelector('p')!.textContent).toBe('big 10');
      expect(documentOf(container)).toBe(asString(source, { v: 10 }));
    });

    it('updates the matched value in place', async () => {
      const data = mount(
        '@match(v) { _ > 5 { <p>big ${_}</p> } * { <p>small ${v}</p> } }',
        { v: 10 }
      );
      expect(container.textContent).toBe('big 10');

      data.value = { v: 42 };
      await Promise.resolve();
      expect(container.textContent).toBe('big 42');

      data.value = { v: 1 };
      await Promise.resolve();
      expect(container.textContent).toBe('small 1');
    });

    it('still matches literal cases and falls through to the default', () => {
      const source =
        '@match(s) { when "a" { <p>A</p> } when "b" { <p>B</p> } * { <p>other</p> } }';
      expectParity(source, { s: 'b' });
    });
  });

  // ==========================================================================
  // Finding 11 - a nested component starts with an empty slot map
  // ==========================================================================

  describe('slots', () => {
    it('does not hand the caller’s named slots to a nested component', () => {
      const source =
        '<template:Inner><i><slot name="header">FALLBACK</slot></i></template:Inner>' +
        '<template:Outer><h1><slot name="header"/></h1><Inner/></template:Outer>' +
        '<Outer><slot:header>CALLER</slot:header></Outer>';
      mount(source, {});
      expect(container.querySelector('h1')!.textContent).toBe('CALLER');
      expect(container.querySelector('i')!.textContent).toBe('FALLBACK');
      expect(documentOf(container)).toBe(asString(source, {}));
    });

    it('renders slot content in the caller’s scope', () => {
      const source =
        '<template:Card title!><div>${title}<slot/></div></template:Card>' +
        '<Card title="CALLEE">${title}</Card>';
      mount(source, { title: 'CALLER' });
      expect(container.querySelector('div')!.textContent).toBe('CALLEECALLER');
    });

    it('fills a named slot and keeps the fill out of the default slot', () => {
      const source =
        '<template:Card><b><slot name="header"><em>fb</em></slot></b>' +
        '<s><slot/></s></template:Card>' +
        '<Card><slot:header><h2>H</h2></slot:header>body</Card>';
      expectParity(source, {});
    });
  });

  // ==========================================================================
  // Components
  // ==========================================================================

  describe('components', () => {
    it('sees only its props, never the caller’s data', () => {
      const source =
        '<template:Row label!><li>${label}/${secret}</li></template:Row>' +
        '<ul><Row label=$name/></ul>';
      expectParity(source, { name: 'n', secret: 'hidden' });
    });

    it('applies declared defaults', () => {
      const source =
        '<template:Row label="fallback"><li>${label}</li></template:Row>' +
        '<ul><Row/><Row label="given"/></ul>';
      expectParity(source, {});
    });

    it('updates a prop in place', async () => {
      const data = mount(
        '<template:Row label!><li>${label}</li></template:Row>' +
          '<ul><Row label=$name/></ul>',
        { name: 'Alice' }
      );
      expect(container.querySelector('li')!.textContent).toBe('Alice');

      data.value = { name: 'Bob' };
      await Promise.resolve();
      expect(container.querySelector('li')!.textContent).toBe('Bob');
    });

    it('does not let a prop named __proto__ reassign a prototype', () => {
      const source =
        '<template:C x><p>${x}</p></template:C>' +
        '<C __proto__="polluted" x="ok"/>';
      mount(source, {});
      expect(container.querySelector('p')!.textContent).toBe('ok');
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });
  });

  // ==========================================================================
  // The whole document
  // ==========================================================================

  it('renders a template with every construct the same as the string sink', () => {
    const source =
      '<template:Badge label!><span class="b-${label}">${label}</span></template:Badge>' +
      '@@ { let heading = "Report"; }' +
      '<section><h1>${heading}</h1>' +
      '@if(rows) { <ul>@for(row, i of rows) { ' +
      '<li data-i="${i}" title="${row.name} &amp; co">' +
      '@match(row.kind) { when "a" { <Badge label=$row.name/> } * { ${row.name} } }' +
      '</li> }</ul> } else { <p>none</p> }' +
      '</section>';
    expectParity(source, {
      rows: [
        { name: 'A & B', kind: 'a' },
        { name: '<C>', kind: 'z' },
      ],
    });
  });
});
