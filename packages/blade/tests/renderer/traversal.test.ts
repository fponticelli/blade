/**
 * @vitest-environment jsdom
 *
 * The one traversal, seen through both sinks.
 *
 * Every case here failed before the string renderer, the DOM renderer and their
 * three copies of the node semantics were collapsed into a single walk over a
 * `RenderTarget`. They are grouped by the defect they pin down, and the ones
 * that concern both sinks assert both - which is the point: a semantic fixed in
 * the traversal is fixed everywhere, and a test that only looked at the string
 * output is how five divergences shipped.
 */

import { describe, it, expect } from 'vitest';
import { compile, compileOrThrow } from '../../src/compiler/index.js';
import {
  createDomRenderer,
  createStringRenderer,
  EAGER,
  render,
  renderTo,
  RenderError,
  ResourceLimitError,
  StringTarget,
  BLOCKED_URL,
  type Dyn,
  type ElementSpec,
  type Reactivity,
  type EscapeContext,
  type RenderOptions,
  type RenderTarget,
  type RuntimeMetadata,
} from '../../src/renderer/index.js';
import { standardLibrary } from '../../src/helpers/index.js';
import type { Diagnostic } from '../../src/ast/types.js';
import type { Bindings } from '../../src/evaluator/index.js';

// -----------------------------------------------------------------------------
// Harness
// -----------------------------------------------------------------------------

function html(
  src: string,
  data: unknown = {},
  options?: RenderOptions
): string {
  return render(compileOrThrow(src), data, options).html;
}

function meta(
  src: string,
  data: unknown = {},
  options?: RenderOptions
): RuntimeMetadata {
  return render(compileOrThrow(src), data, options).metadata;
}

/** The rendered DOM of a template, as serialised markup. */
function dom(src: string, data: unknown = {}, options?: RenderOptions): string {
  const result = createDomRenderer(compileOrThrow(src))(data, options);
  const host = document.createElement('div');
  for (const node of result.nodes) host.appendChild(node);
  return host.innerHTML;
}

function diagnostics(src: string): readonly Diagnostic[] {
  const result = compile(src);
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

function codes(src: string): string[] {
  return diagnostics(src)
    .filter(d => d.level === 'error')
    .map(d => d.code ?? '');
}

// =============================================================================
// A - URL attributes are validated, not escaped
// =============================================================================

describe('URL attributes', () => {
  it('blocks a javascript: URL that no escaper could touch', () => {
    expect(html('<a href="${u}">go</a>', { u: 'javascript:alert(1)' })).toBe(
      `<a href="${BLOCKED_URL}">go</a>`
    );
  });

  it('blocks data:text/html but allows a raster data: image', () => {
    expect(html('<img src="${u}"/>', { u: 'data:text/html,<script>' })).toBe(
      `<img src="${BLOCKED_URL}"/>`
    );
    expect(html('<img src="${u}"/>', { u: 'data:image/png;base64,AAA' })).toBe(
      '<img src="data:image/png;base64,AAA"/>'
    );
  });

  it('sees through control characters the browser would strip', () => {
    expect(
      html('<a href="${u}">x</a>', { u: 'java\u0000script:alert(1)' })
    ).toBe(`<a href="${BLOCKED_URL}">x</a>`);
  });

  it('validates the assembled URL, not each segment', () => {
    // The scheme is in the static half and the payload in the dynamic one:
    // neither is suspicious alone.
    expect(html('<a href="javascript:${p}">x</a>', { p: 'alert(1)' })).toBe(
      `<a href="${BLOCKED_URL}">x</a>`
    );
  });

  it('leaves an ordinary URL alone, ampersand and all', () => {
    expect(html('<a href="${u}">x</a>', { u: 'https://h/p?a=1&b=2' })).toBe(
      '<a href="https://h/p?a=1&amp;b=2">x</a>'
    );
  });

  it('records the substitution as a warning', () => {
    const warnings = meta('<a href="${u}">x</a>', {
      u: 'javascript:1',
    }).warnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('href');
  });

  it('applies the same policy to the DOM sink', () => {
    expect(dom('<a href="${u}">go</a>', { u: 'javascript:alert(1)' })).toBe(
      `<a href="${BLOCKED_URL}">go</a>`
    );
  });

  it('refuses interpolation into an event handler at compile time', () => {
    expect(codes('<div onclick="${x}"></div>')).toContain(
      'UNENCODABLE_ATTRIBUTE'
    );
    expect(codes('<div onclick="alert(1)"></div>')).toEqual([]);
    // `on-` is not a handler prefix.
    expect(codes('<div on-thing="${x}"></div>')).toEqual([]);
  });

  it('drops an event handler that reaches the renderer anyway', () => {
    const result = compile('<div onclick="${x}">y</div>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const rendered = render(
      { kind: 'valid', root: result.partial.root, diagnostics: [] },
      { x: 'alert(1)' }
    );
    expect(rendered.html).toBe('<div>y</div>');
    expect(rendered.metadata.warnings[0]!.message).toContain('onclick');
  });
});

// =============================================================================
// B - script and style bodies are not HTML
// =============================================================================

describe('raw text elements', () => {
  it('escapes a script body for JavaScript, not for HTML', () => {
    expect(html('<script>var s = "$msg";</script>', { msg: 'a & b < c' })).toBe(
      '<script>var s = "a \\u0026 b \\u003c c";</script>'
    );
  });

  it('makes a </script> in the data unable to close the element', () => {
    const out = html('<script>var s = "$msg";</script>', {
      msg: '</script><img src=x onerror=alert(1)>',
    });
    expect(out).not.toContain('</script><img');
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });

  it('emits toJson output as JSON, not as a JavaScript string literal', () => {
    expect(
      html(
        '<script>var d = ${toJson(x)}</script>',
        { x: { a: '</script>', b: 1 } },
        { helpers: standardLibrary }
      )
    ).toBe('<script>var d = {"a":"\\u003c/script\\u003e","b":1}</script>');
  });

  it('escapes a style body for CSS so a value cannot add a declaration', () => {
    const out = html('<style>a { color: $c; }</style>', {
      c: 'red; } body { display: none',
    });
    // The author's own braces survive; the value's do not. Only one `{` and
    // one `}` are left, and they are the ones the template wrote.
    expect(out.match(/[{}]/g)).toEqual(['{', '}']);
    expect(out.startsWith('<style>a { color: red\\')).toBe(true);
    expect(out.endsWith('; }</style>')).toBe(true);
  });

  it('leaves the author\u2019s own script text verbatim', () => {
    expect(html('<script>if (a < b && c) x();</script>')).toBe(
      '<script>if (a < b && c) x();</script>'
    );
  });

  it('applies the same escaper in the DOM sink', () => {
    const host = document.createElement('div');
    const result = createDomRenderer(
      compileOrThrow('<script>var s = "$msg";</script>')
    )({ msg: 'a " b' });
    for (const node of result.nodes) host.appendChild(node);
    expect(host.querySelector('script')!.textContent).toBe(
      'var s = "a \\" b";'
    );
  });
});

// =============================================================================
// C - author-written text is escaped exactly once
// =============================================================================

describe('static attribute values', () => {
  it('does not escape an author-written entity a second time', () => {
    expect(html('<a title="Tom &amp; Jerry">x</a>')).toBe(
      '<a title="Tom &amp; Jerry">x</a>'
    );
  });

  it('keeps a query string in a static href intact', () => {
    expect(html('<a href="/s?a=1&amp;b=2">x</a>')).toBe(
      '<a href="/s?a=1&amp;b=2">x</a>'
    );
  });

  it('escapes each segment of a mixed attribute by origin', () => {
    // The static half means one ampersand; the dynamic half means two
    // characters. Escaping the concatenation gets one of them wrong.
    expect(html('<a title="a-${v}-b &amp; c">x</a>', { v: 'x&y' })).toBe(
      '<a title="a-x&amp;y-b &amp; c">x</a>'
    );
  });

  it('neutralises only the delimiter in author text', () => {
    expect(html('<a title=\'say "hi"\'>x</a>')).toBe(
      '<a title="say &quot;hi&quot;">x</a>'
    );
  });

  it('decodes author text for the DOM, which parses nothing', () => {
    const host = document.createElement('div');
    const result = createDomRenderer(
      compileOrThrow('<a title="Tom &amp; Jerry">x &amp; y</a>')
    )({});
    for (const node of result.nodes) host.appendChild(node);
    const anchor = host.querySelector('a')!;
    expect(anchor.getAttribute('title')).toBe('Tom & Jerry');
    expect(anchor.textContent).toBe('x & y');
  });
});

// =============================================================================
// D - raw interpolation reaches both sinks
// =============================================================================

describe('$! raw interpolation', () => {
  it('writes markup in the string sink', () => {
    expect(html('<div>$!{h}</div>', { h: '<b>hi</b>' })).toBe(
      '<div><b>hi</b></div>'
    );
  });

  it('writes markup in the DOM sink too', () => {
    expect(dom('<div>$!{h}</div>', { h: '<b>hi</b>' })).toBe(
      '<div><b>hi</b></div>'
    );
  });

  it('still escapes the safe form beside it', () => {
    expect(dom('<div>$safe$!{h}</div>', { safe: '<i>', h: '<b>x</b>' })).toBe(
      '<div>&lt;i&gt;<b>x</b></div>'
    );
  });
});

// =============================================================================
// E, F, G - slots
// =============================================================================

describe('slots', () => {
  const CARD =
    '<template:Card title!><div><slot/></div></template:Card>' +
    '<Card title="T">$name</Card>';

  it('renders slot content in the caller\u2019s scope', () => {
    expect(html(CARD, { name: 'CALLER' })).toBe('<div>CALLER</div>');
  });

  it('renders the slot\u2019s fallback in the component\u2019s own scope', () => {
    expect(
      html(
        '<template:Card title!><div><slot>$title</slot></div></template:Card>' +
          '<Card title="T"/>'
      )
    ).toBe('<div>T</div>');
  });

  it('does not let slot content see the component\u2019s props', () => {
    expect(
      html(
        '<template:Card title!><div><slot/></div></template:Card>' +
          '<Card title="CALLEE">$title</Card>',
        { title: 'CALLER' }
      )
    ).toBe('<div>CALLER</div>');
  });

  it('attributes slot content to the caller\u2019s paths in source tracking', () => {
    const out = html(
      '<template:Card title!><div><slot/></div></template:Card>' +
        '<Card title="T"><p>$name</p></Card>',
      { name: 'n' },
      { config: { includeSourceTracking: true } }
    );
    expect(out).toContain('rd-source="name"');
  });

  it('terminates a slot forwarded through a nested component', () => {
    expect(
      html(
        '<template:Wrap><b><slot/></b></template:Wrap>' +
          '<template:Outer><Wrap><slot/></Wrap></template:Outer>' +
          '<Outer>x</Outer>'
      )
    ).toBe('<b>x</b>');
  });

  it('bounds any residual slot cycle with a located error', () => {
    expect(() =>
      html(
        '<template:Wrap><b><slot/></b></template:Wrap>' +
          '<template:Outer><Wrap><slot/></Wrap></template:Outer>' +
          '<Outer>x</Outer>',
        {},
        { limits: { maxSlotDepth: 1 } }
      )
    ).toThrow(ResourceLimitError);
  });

  it('fills a named slot and keeps the fill out of the body', () => {
    expect(
      html(
        '<template:Card><div class="h"><slot name="header"><em>fb</em></slot></div>' +
          '<div class="b"><slot/></div></template:Card>' +
          '<Card><slot:header><h2>H</h2></slot:header>body</Card>'
      )
    ).toBe('<div class="h"><h2>H</h2></div><div class="b">body</div>');
  });

  it('falls back when a named slot is not filled', () => {
    expect(
      html(
        '<template:Card><slot name="header"><em>fb</em></slot></template:Card>' +
          '<Card/>'
      )
    ).toBe('<em>fb</em>');
  });

  it('reports a fill naming a slot the component does not declare', () => {
    const errors = diagnostics(
      '<template:Card><slot name="header"/></template:Card>' +
        '<Card><slot:headr>x</slot:headr></Card>'
    ).filter(d => d.level === 'error');
    expect(errors.map(d => d.code)).toContain('UNKNOWN_SLOT');
    expect(errors[0]!.message).toContain("'header'");
  });

  it('reports a fill that is not the direct child of a component call', () => {
    expect(codes('<div><slot:header>x</slot:header></div>')).toContain(
      'MISPLACED_SLOT_FILL'
    );
  });

  it('resolves slots identically in the DOM sink', () => {
    expect(dom(CARD, { name: 'CALLER' })).toBe('<div>CALLER</div>');
  });
});

// =============================================================================
// H - @let is block-scoped, in every block
// =============================================================================

describe('@let scoping', () => {
  const cases: [string, string, string, unknown][] = [
    [
      'an @if branch',
      '@if(f) {@@ { let y = 1; }<b>$y</b>}<i>$y</i>',
      '<b>1</b><i></i>',
      { f: true },
    ],
    [
      'an @else branch',
      '@if(f) {x} else {@@ { let y = 1; }<b>$y</b>}<i>$y</i>',
      '<b>1</b><i></i>',
      { f: false },
    ],
    [
      'element children',
      '<div>@@ { let z = 5; }</div><i>$z</i>',
      '<div></div><i></i>',
      {},
    ],
    [
      'a literal @match case',
      '@match(v) { when 1 {@@ { let a = 1; }<b>$a</b>} }<i>$a</i>',
      '<b>1</b><i></i>',
      { v: 1 },
    ],
    [
      'an expression @match case',
      '@match(v) { _ > 0 {@@ { let a = 1; }<b>$a</b>} }<i>$a</i>',
      '<b>1</b><i></i>',
      { v: 1 },
    ],
    [
      'a @match default',
      '@match(v) { when 9 {x} _ {@@ { let a = 1; }<b>$a</b>} }<i>$a</i>',
      '<b>1</b><i></i>',
      { v: 1 },
    ],
    [
      'a @for body',
      '@for(i of xs) {@@ { let a = 1; }<b>$a</b>}<i>$a</i>',
      '<b>1</b><i></i>',
      { xs: [0] },
    ],
    [
      'a fragment',
      '<>@@ { let a = 1; }<b>$a</b></><i>$a</i>',
      '<b>1</b><i></i>',
      {},
    ],
  ];

  for (const [name, source, expected, data] of cases) {
    it(`does not leak out of ${name}`, () => {
      expect(html(source, data)).toBe(expected);
    });
  }

  it('is visible to later siblings inside its own block', () => {
    expect(html('<div>@@ { let a = 1; }<b>$a</b><i>$a</i></div>')).toBe(
      '<div><b>1</b><i>1</i></div>'
    );
  });

  it('scopes identically in the DOM sink', () => {
    expect(dom('<div>@@ { let z = 5; }</div><i>$z</i>')).toBe(
      '<div></div><i></i>'
    );
  });
});

// =============================================================================
// @let functions
// =============================================================================

describe('@let functions', () => {
  it('calls a template function defined in the template', () => {
    expect(
      html('@@ { let d = (a, p) => a * (1 - p / 100); }<b>${d(200, 10)}</b>')
    ).toBe('<b>180</b>');
  });

  it('lets a template function call itself', () => {
    expect(
      html('@@ { let f = (n) => n <= 1 ? 1 : n * f(n - 1); }<b>${f(5)}</b>')
    ).toBe('<b>120</b>');
  });

  it('bounds recursion with a located error', () => {
    expect(() =>
      html(
        '@@ { let f = (n) => n <= 0 ? 0 : f(n - 1); }<b>${f(100)}</b>',
        {},
        { limits: { maxRecursionDepth: 5 } }
      )
    ).toThrow(RenderError);
  });

  it('writes nothing, and warns, when one is interpolated as a value', () => {
    const result = render(
      compileOrThrow('@@ { let f = (a) => a; }<p>$f</p>'),
      {}
    );
    expect(result.html).toBe('<p></p>');
    expect(result.metadata.warnings[0]!.message).toContain('template function');
  });
});

// =============================================================================
// I - output and time budgets
// =============================================================================

describe('resource budgets', () => {
  it('stops a render that exceeds the output budget', () => {
    let error: unknown;
    try {
      html(
        '<ul>@for(i of items) { <li>$pad</li> }</ul>',
        { items: Array(500).fill(0), pad: 'x'.repeat(10_000) },
        { limits: { maxOutputChars: 100_000 } }
      );
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect((error as ResourceLimitError).limitType).toBe('outputSize');
    expect((error as ResourceLimitError).location).toBeDefined();
  });

  it('stops a render that exceeds the wall-clock budget', () => {
    expect(() =>
      html(
        '<ul>@for(i of items) { <li>$i</li> }</ul>',
        { items: Array(1000).fill(0) },
        { limits: { maxRenderMillis: 0 } }
      )
    ).toThrow(/Render time limit exceeded/);
  });

  it('bounds the DOM sink by the same budget', () => {
    expect(() =>
      createDomRenderer(
        compileOrThrow('<ul>@for(i of items) { <li>$pad</li> }</ul>')
      )(
        { items: Array(500).fill(0), pad: 'x'.repeat(10_000) },
        { limits: { maxOutputChars: 100_000 } }
      )
    ).toThrow(ResourceLimitError);
  });

  it('reports the output size it produced', () => {
    const result = meta('<p>hello</p>');
    expect(result.outputSize).toBe('<p>hello</p>'.length);
  });

  it('bounds a helper by the render\u2019s own budget', () => {
    const result = render(
      compileOrThrow('<p>${repeat("x", 100000)}</p>'),
      {},
      {
        helpers: standardLibrary,
        limits: { maxHelperStringLength: 10 },
      }
    );
    expect(result.html).toBe(`<p>${'x'.repeat(10)}</p>`);
    expect(result.metadata.warnings[0]!.message).toContain('10-character');
  });
});

// =============================================================================
// J - errors name the node that failed
// =============================================================================

describe('render errors', () => {
  it('wraps an evaluator error as a located RENDER_FAILED', () => {
    let error: unknown;
    try {
      html('<p>ok</p>\n<div><span>${nosuch(1)}</span></div>');
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RenderError);
    const rendered = error as RenderError;
    expect(rendered.code).toBe('RENDER_FAILED');
    expect(rendered.location.start.line).toBe(2);
    expect(rendered.cause).toBeInstanceOf(Error);
  });

  it('leaves a resource limit error as itself', () => {
    let error: unknown;
    try {
      html(
        '@for(i of xs) {x}',
        { xs: Array(5).fill(0) },
        {
          limits: { maxIterationsPerLoop: 2 },
        }
      );
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect((error as ResourceLimitError).code).toBe('ITERATION_LIMIT_EXCEEDED');
  });

  it('reports an unknown component with its own code', () => {
    const template = compile('<Nope/>');
    expect(template.ok).toBe(false);
  });
});

// =============================================================================
// K, L, M - scopes, plans and the warning channel
// =============================================================================

describe('scopes and metadata', () => {
  it('does not let a prop named __proto__ reassign a prototype', () => {
    const out = html(
      '<template:C x><p>$x</p></template:C><C __proto__="polluted" x="ok"/>'
    );
    expect(out).toBe('<p>ok</p>');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('shares the components map rather than copying it', () => {
    const template = compileOrThrow('<template:C><p>c</p></template:C><C/>');
    // Two renders of the same template read the same map; nothing copies it.
    expect(render(template, {}).html).toBe('<p>c</p>');
    expect(render(template, {}).html).toBe('<p>c</p>');
  });

  it('renders a void element self-closed and gives it no children', () => {
    expect(html('<div><br/><img src="/a"/></div>')).toBe(
      '<div><br/><img src="/a"/></div>'
    );
  });

  it('resolves a foreign namespace for the DOM sink', () => {
    const result = createDomRenderer(
      compileOrThrow('<svg viewBox="0 0 1 1"><circle r="1"/></svg>')
    )({});
    const svg = result.nodes[0] as Element;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1 1');
  });

  it('writes nothing, and warns, for a symbol', () => {
    const result = render(compileOrThrow('<p>$s</p>'), {
      s: Symbol('x'),
    });
    expect(result.html).toBe('<p></p>');
    expect(result.metadata.warnings[0]!.message).toContain('symbol');
  });

  it('carries a helper\u2019s warning through to the metadata', () => {
    const result = render(
      compileOrThrow('<p>${toInt(v)}</p>'),
      { v: 'nope' },
      {
        helpers: standardLibrary,
      }
    );
    expect(result.metadata.warnings[0]!.helper).toBe('toInt');
    expect(result.metadata.warnings[0]!.location).toBeDefined();
  });

  it('escapes an interpolated style value as CSS by default', () => {
    const result = render(compileOrThrow('<div style="width: ${w}"></div>'), {
      w: '1px; position: fixed',
    });
    expect(result.html).not.toContain('position: fixed');
    expect(result.metadata.warnings[0]!.message).toContain('style');
  });

  it('leaves style alone when the caller opts in', () => {
    expect(
      html(
        '<div style="${d}"></div>',
        { d: 'background: #eee;' },
        { config: { allowStyleInterpolation: true } }
      )
    ).toBe('<div style="background: #eee;"></div>');
  });
});

// =============================================================================
// N - big lists
// =============================================================================

describe('large output', () => {
  it('builds a list far past the argument-count limit of spread', () => {
    const items = Array.from({ length: 70_000 }, (_, i) => i);
    const result = createDomRenderer(
      compileOrThrow('<ul>@for(i of items) { <li></li> }</ul>')
    )(
      { items },
      {
        limits: {
          maxIterationsPerLoop: 100_000,
          maxTotalIterations: 100_000,
          maxOutputChars: 100_000_000,
        },
      }
    );
    expect((result.nodes[0] as Element).childElementCount).toBe(70_000);
  });
});

// =============================================================================
// The target seam itself
// =============================================================================

describe('RenderTarget', () => {
  it('drives the whole engine from a third implementation', () => {
    // A sink that records the calls it receives. It has no control flow: the
    // traversal decides everything, which is the property this seam exists for.
    const calls: string[] = [];
    class RecordingTarget implements RenderTarget<string[]> {
      readonly bindsEvents = true;
      element(spec: ElementSpec, children: () => void): void {
        calls.push(`open ${spec.tag}${spec.isVoid ? ' (void)' : ''}`);
        for (const attribute of spec.attributes) {
          calls.push(`attr ${attribute.name}`);
        }
        for (const listener of spec.listeners) {
          calls.push(`on ${listener.event}`);
        }
        children();
        if (!spec.isVoid) calls.push(`close ${spec.tag}`);
      }
      literalText(source: string, context: EscapeContext): void {
        calls.push(`literal ${context} ${source}`);
      }
      text(value: Dyn<string>, context: EscapeContext): void {
        calls.push(`text ${context} ${value.value}`);
      }
      rawHtml(value: Dyn<string>): void {
        calls.push(`raw ${value.value}`);
      }
      comment(text: string): void {
        calls.push(`comment ${text}`);
      }
      doctype(value: string): void {
        calls.push(`doctype ${value}`);
      }
      finish(): string[] {
        return calls;
      }
    }

    const { output, metadata } = renderTo(
      compileOrThrow('<!DOCTYPE html><p class="a">hi $name<br/></p>'),
      { name: 'Ada' },
      undefined,
      () => new RecordingTarget()
    );

    expect(output).toEqual([
      'doctype html',
      'open p',
      'attr class',
      'literal html-body hi ',
      'text html-body Ada',
      'open br (void)',
      'close p',
    ]);
    expect(metadata.pathsAccessed).toEqual(new Set(['name']));
  });

  it('offers a listener to a sink that can hold one', () => {
    const calls: string[] = [];
    class ListeningTarget implements RenderTarget<string[]> {
      readonly bindsEvents = true;
      element(spec: ElementSpec, children: () => void): void {
        for (const listener of spec.listeners) {
          calls.push(`on ${listener.event}`);
          listener.handler.value?.('EVENT');
        }
        children();
      }
      literalText(): void {}
      text(): void {}
      rawHtml(): void {}
      comment(): void {}
      doctype(): void {}
      finish(): string[] {
        return calls;
      }
    }

    const fired: unknown[] = [];
    renderTo(
      compileOrThrow('<button on:click=${go}>x</button>'),
      { go: (event: unknown) => fired.push(event) },
      undefined,
      () => new ListeningTarget()
    );

    expect(calls).toEqual(['on click']);
    expect(fired).toEqual(['EVENT']);
  });

  it('produces the same document through both built-in sinks', () => {
    const source =
      '<template:Row label!><li class="r-${label}">$label</li></template:Row>' +
      '<ul>@for(item of items) { <Row label=$item/> }</ul>';
    const data = { items: ['a', 'b'] };
    expect(html(source, data)).toBe(dom(source, data));
  });

  it('streams to a chunk sink instead of accumulating the document', () => {
    const chunks: string[] = [];
    const { output } = renderTo(
      compileOrThrow('<ul>@for(i of xs) { <li>$i</li> }</ul>'),
      { xs: [1, 2, 3] },
      undefined,
      (budget, position) =>
        new StringTarget(budget, position, chunk => chunks.push(chunk))
    );

    // Nothing was retained; the document only exists in the caller's hands.
    expect(output).toBe('');
    expect(chunks.join('')).toBe('<ul><li>1</li><li>2</li><li>3</li></ul>');
    expect(chunks.length).toBeGreaterThan(3);
  });

  it('reuses one string renderer across renders', () => {
    const renderer = createStringRenderer(compileOrThrow('<p>$n</p>'));
    expect(renderer({ n: 1 }).html).toBe('<p>1</p>');
    expect(renderer({ n: 2 }).html).toBe('<p>2</p>');
  });
});

// =============================================================================
// The other half of the seam: when the render decides
// =============================================================================

describe('Reactivity', () => {
  /**
   * `EAGER`, watched. Every data-dependent decision the traversal makes has to
   * go through this interface - that is what lets a reactive host re-make them
   * later instead of writing a traversal of its own - so a construct that
   * evaluated an expression directly would be invisible here.
   */
  function watched(): { reactivity: Reactivity; log: string[] } {
    const log: string[] = [];
    const reactivity: Reactivity = {
      incremental: false,
      constant: value => EAGER.constant(value),
      rootScope: (data, globals) => EAGER.rootScope(data, globals),
      extendScope: (parent, entries) => {
        log.push(`bind ${Object.keys(entries).join(',')}`);
        return EAGER.extendScope(parent, entries);
      },
      extendGlobals: (parent, name, value) => {
        log.push(`bind global ${name}`);
        return EAGER.extendGlobals(parent, name, value);
      },
      componentScope: (props, caller) => {
        log.push('component scope');
        return EAGER.componentScope(props, caller);
      },
      derive: (scope, reads, compute, recover, equals) => {
        log.push('derive');
        return EAGER.derive(scope, reads, compute, recover, equals);
      },
      branch: (choose, arms, renderArm) => {
        log.push(`branch ${choose.value}/${arms}`);
        return EAGER.branch(choose, arms, renderArm);
      },
      each: (items, body, keyOf) => {
        log.push(`each ${items.value.length}`);
        if (keyOf) {
          log.push(`keys ${items.value.map(keyOf).join(',')}`);
        }
        return EAGER.each(items, body, keyOf);
      },
    };
    return { reactivity, log };
  }

  it('routes every data-dependent decision through the seam', () => {
    const { reactivity, log } = watched();
    const { output } = renderTo(
      compileOrThrow(
        '<template:Row label!><li>$label</li></template:Row>' +
          '@@ { let n = 2; }<ul>@for(item of items) { ' +
          '@if(item) { <Row label=$item/> } else { <i>-</i> } }</ul>$n'
      ),
      { items: ['a', ''] },
      { reactivity },
      (budget, position) => new StringTarget(budget, position)
    );

    expect(output).toBe('<ul><li>a</li><i>-</i></ul>2');
    expect(log).toContain('derive');
    expect(log).toContain('bind n');
    expect(log).toContain('each 2');
    expect(log).toContain('bind item');
    expect(log).toContain('branch 0/2');
    expect(log).toContain('branch 1/2');
    expect(log).toContain('component scope');
  });

  it('hands the reactivity what each pass is, when the loop says', () => {
    const { reactivity, log } = watched();
    renderTo(
      compileOrThrow('@for(r of rows key r.id) { <li>$r.id</li> }'),
      { rows: [{ id: 'a' }, { id: 'b' }] },
      { reactivity },
      (budget, position) => new StringTarget(budget, position)
    );
    expect(log).toContain('keys a,b');
  });

  it('hands it nothing when the loop has no key', () => {
    const { reactivity, log } = watched();
    renderTo(
      compileOrThrow('@for(r of rows) { <li>$r.id</li> }'),
      { rows: [{ id: 'a' }] },
      { reactivity },
      (budget, position) => new StringTarget(budget, position)
    );
    expect(log.some(entry => entry.startsWith('keys'))).toBe(false);
  });

  it('defaults to the eager reactivity', () => {
    const { output } = renderTo(
      compileOrThrow('<p>$n</p>'),
      { n: 1 },
      undefined,
      (budget, position) => new StringTarget(budget, position)
    );
    expect(output).toBe('<p>1</p>');
  });

  it('binds a name over the data rather than into it', () => {
    // The rule every construct that binds a name shares, in one place: locals
    // resolve first, so a loop variable shadows a field of the same name.
    const scope = EAGER.extendScope(
      EAGER.rootScope({ x: 'DATA' }, {} as Bindings),
      { x: EAGER.constant('BOUND') }
    );
    expect(scope.snapshot().locals.x).toBe('BOUND');
    expect(scope.snapshot().data).toEqual({ x: 'DATA' });
  });
});
