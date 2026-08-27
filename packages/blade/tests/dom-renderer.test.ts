/**
 * @vitest-environment jsdom
 *
 * The DOM renderer, driven from real templates.
 *
 * Like `renderer.test.ts`, this file used to build its input by hand - 64 uses
 * of a `createMockTemplate()` helper, zero calls to `compile()` - and the mocks
 * always reported `diagnostics: []`, so no test here could see a diagnostic.
 * That is how a renderer suite can be entirely green while the renderer
 * disagrees with the parser about what a template means.
 *
 * Everything below compiles the template it is about, through
 * {@link ./support/render-ok.js#renderDomOk}, which asserts the compile was
 * clean before it renders.
 *
 * What is asserted here is what only the DOM has: node types, real elements,
 * attribute presence, listeners. That the DOCUMENT matches the string sink's is
 * the conformance corpus's job (`tests/corpus-eager-sinks.test.ts`), and is not
 * repeated case by case here.
 */

import { describe, it, expect } from 'vitest';
import { createDomRenderer } from '../src/renderer/index.js';
import type {
  CompiledTemplate,
  ComponentDefinition,
  RootNode,
  SourceLocation,
  TemplateNode,
} from '../src/ast/types.js';
import { domHtmlOk, renderDomOk } from './support/render-ok.js';

// =============================================================================
// Synthetic trees
//
// The one path no source text can reach: a call to a component the compiler
// would have refused. Everything else in this file is compiled.
// =============================================================================

const syntheticLocation: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

/** A compiled template made of nodes no parser would emit. */
function syntheticTemplate(
  children: TemplateNode[],
  components: Map<string, ComponentDefinition> = new Map()
): CompiledTemplate {
  const root: RootNode = {
    kind: 'root',
    children,
    components,
    props: [],
    metadata: {
      globalsUsed: new Set(),
      pathsAccessed: new Set(),
      helpersUsed: new Set(),
      componentsUsed: new Set(),
    },
    location: syntheticLocation,
  };
  return { kind: 'valid', root, diagnostics: [] };
}

// =============================================================================
// Text
// =============================================================================

describe('text nodes', () => {
  it('renders literal text as a text node', () => {
    const { nodes } = renderDomOk('Hello, World!');

    expect(nodes).toHaveLength(1);
    expect(nodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(nodes[0].textContent).toBe('Hello, World!');
  });

  it('coalesces the runs around an interpolation into one node', () => {
    // A text node's boundaries are not observable in a document, and one node
    // per segment would make `Hello, ${name}!` three nodes where the string
    // sink produces one string.
    const { nodes } = renderDomOk('Hello, ${name}!', { name: 'Alice' });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toBe('Hello, Alice!');
  });

  it('writes a value into the text node exactly once', () => {
    // `createTextNode` parses nothing, so escaping on the way in would show
    // the reader `&lt;script&gt;` where the string sink shows `<script>`.
    const { nodes } = renderDomOk('${content}', {
      content: '<script>alert("xss")</script>',
    });

    expect(nodes[0].textContent).toBe('<script>alert("xss")</script>');
  });

  it('decodes an author-written character reference', () => {
    // Author text is HTML source; a text node shows `&amp;` as five
    // characters unless it is decoded on the way in.
    const { nodes } = renderDomOk('R &amp; D &copy; 2024');

    expect(nodes[0].textContent).toBe('R & D © 2024');
  });

  it('parses a $! interpolation into real nodes', () => {
    // The divergence the `rawHtml` target operation exists for: this sink
    // used to escape `$!` away, because "a text node is inherently safe" is
    // true of `$` and false of `$!`.
    const { nodes } = renderDomOk('$!{markup}', { markup: '<b>bold</b>' });

    expect(nodes).toHaveLength(1);
    expect((nodes[0] as Element).tagName.toLowerCase()).toBe('b');
    expect(nodes[0].textContent).toBe('bold');
  });
});

// =============================================================================
// Elements
// =============================================================================

describe('elements', () => {
  it('creates the element and sets its static attributes', () => {
    const { nodes } = renderDomOk('<div class="container"></div>');

    const element = nodes[0] as Element;
    expect(element.tagName.toLowerCase()).toBe('div');
    expect(element.getAttribute('class')).toBe('container');
  });

  it('sets an evaluated attribute', () => {
    const { nodes } = renderDomOk('<input value=$v/>', { v: 'test-value' });

    expect((nodes[0] as Element).getAttribute('value')).toBe('test-value');
  });

  it('writes an attribute value exactly once', () => {
    const { nodes } = renderDomOk('<div title=$t></div>', { t: 'A & B <c>' });

    expect((nodes[0] as Element).getAttribute('title')).toBe('A & B <c>');
  });

  it('decodes an author-written attribute reference', () => {
    const { nodes } = renderDomOk('<div title="Tom &amp; Jerry"></div>');

    expect((nodes[0] as Element).getAttribute('title')).toBe('Tom & Jerry');
  });

  it('sets a true boolean attribute and omits a false one', () => {
    const { nodes } = renderDomOk('<input disabled=$a readonly=$b/>', {
      a: true,
      b: false,
    });

    const element = nodes[0] as Element;
    expect(element.hasAttribute('disabled')).toBe(true);
    expect(element.getAttribute('disabled')).toBe('');
    expect(element.hasAttribute('readonly')).toBe(false);
  });

  it('gives a void element no children', () => {
    const { nodes } = renderDomOk('<br/>');

    expect((nodes[0] as Element).childNodes).toHaveLength(0);
  });

  it('nests elements', () => {
    const { nodes } = renderDomOk('<div><span>nested</span></div>');

    const div = nodes[0] as Element;
    expect(div.children).toHaveLength(1);
    expect(div.children[0].tagName.toLowerCase()).toBe('span');
    expect(div.children[0].textContent).toBe('nested');
  });

  it('creates a foreign element in its own namespace, spelled canonically', () => {
    const { nodes } = renderDomOk(
      '<svg viewbox="0 0 1 1"><lineargradient id="g"/></svg>'
    );

    const svg = nodes[0] as Element;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    // Written lower-case by the author; SVG names are case-significant, and
    // both sinks restore the canonical spelling.
    expect(svg.getAttribute('viewBox')).toBe('0 0 1 1');
    expect(svg.firstElementChild!.tagName).toBe('linearGradient');
    expect(svg.firstElementChild!.namespaceURI).toBe(
      'http://www.w3.org/2000/svg'
    );
  });

  it('escapes into a script element, where nothing is decoded', () => {
    const { nodes } = renderDomOk('<script>var s = "${v}";</script>', {
      v: '</script><b>',
    });

    expect(nodes[0].textContent).toBe(
      'var s = "\\u003c/script\\u003e\\u003cb\\u003e";'
    );
  });
});

// =============================================================================
// Event listeners
// =============================================================================

describe('event listeners', () => {
  it('attaches a handler that a click actually runs', () => {
    // The reason this sink answers `bindsEvents: true`: a real element can
    // hold a real listener, and the string sink refuses the same binding.
    let clicks = 0;
    const { nodes } = renderDomOk('<button on:click=$handler>go</button>', {
      handler: () => {
        clicks += 1;
      },
    });

    (nodes[0] as HTMLElement).click();
    expect(clicks).toBe(1);
    // The binding is not an attribute.
    expect((nodes[0] as Element).hasAttribute('on:click')).toBe(false);
  });

  it('reads the handler when the event fires, not when it is bound', () => {
    let seen = 'none';
    const { nodes } = renderDomOk('<button on:click=$h>go</button>', {
      h: () => {
        seen = 'first';
      },
    });

    (nodes[0] as HTMLElement).click();
    expect(seen).toBe('first');
  });
});

// =============================================================================
// Directives
// =============================================================================

describe('directives', () => {
  it('renders only the arm that was taken', () => {
    const source = '@if(show) { <i>visible</i> }';

    expect(renderDomOk(source, { show: true }).nodes).toHaveLength(1);
    expect(renderDomOk(source, { show: false }).nodes).toHaveLength(0);
  });

  it('renders the else arm', () => {
    const { nodes } = renderDomOk('@if(show) { <i>a</i> } else { <b>b</b> }', {
      show: false,
    });

    expect(nodes).toHaveLength(1);
    expect((nodes[0] as Element).tagName.toLowerCase()).toBe('b');
  });

  it('produces one node list per loop pass, in order', () => {
    const { nodes } = renderDomOk('@for(x of xs) { <li>${x}</li> }', {
      xs: ['A', 'B', 'C'],
    });

    expect(nodes.map(node => node.textContent)).toEqual(['A', 'B', 'C']);
  });

  it('expands a component into its own nodes', () => {
    const { nodes } = renderDomOk(
      '<template:Greeting name!><span>Hi, ${name}</span></template:Greeting>' +
        '<Greeting name="World"/>'
    );

    expect(nodes).toHaveLength(1);
    expect((nodes[0] as Element).tagName.toLowerCase()).toBe('span');
    expect(nodes[0].textContent).toBe('Hi, World');
  });
});

// =============================================================================
// Comments
// =============================================================================

describe('comments', () => {
  it('emits no comment node by default', () => {
    expect(renderDomOk('<!-- A comment -->').nodes).toHaveLength(0);
  });

  it('emits a comment node when includeComments is on', () => {
    const { nodes } = renderDomOk(
      '<!-- A comment -->',
      {},
      { config: { includeComments: true } }
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].nodeType).toBe(Node.COMMENT_NODE);
    expect(nodes[0].textContent).toBe(' A comment ');
  });

  it('emits nothing for a DOCTYPE, which a node list cannot hold', () => {
    expect(domHtmlOk('<!DOCTYPE html><p>a</p>')).toBe('<p>a</p>');
  });
});

// =============================================================================
// Metadata
// =============================================================================

describe('metadata', () => {
  it('reports the same shape the string renderer does', () => {
    const { metadata } = renderDomOk('@for(x of xs) { <i>${x}</i> }', {
      xs: [1, 2],
    });

    expect(metadata.renderTime).toBeGreaterThanOrEqual(0);
    expect(metadata.iterationCount).toBe(2);
    expect(metadata.pathsAccessed).toBeInstanceOf(Set);
    expect(metadata.helpersUsed).toBeInstanceOf(Set);
    expect(metadata.outputSize).toBeGreaterThan(0);
  });
});

// =============================================================================
// Paths only a hand-built tree can reach
// =============================================================================

describe('synthetic trees', () => {
  it('refuses a component the compiler would never have admitted', () => {
    // SYNTHETIC: `compile('<Missing/>')` reports UNKNOWN_COMPONENT and hands
    // back a partial template, which `createDomRenderer` structurally will not
    // take - so this guard is unreachable from source text, and is here for a
    // host that assembles a tree itself through `renderTo`.
    const template = syntheticTemplate([
      {
        kind: 'component',
        name: 'Missing',
        props: [],
        children: [],
        location: syntheticLocation,
      },
    ]);

    expect(() => createDomRenderer(template)({})).toThrowError(
      /Unknown component/
    );
  });
});
