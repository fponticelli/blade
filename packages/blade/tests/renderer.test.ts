/**
 * The string renderer, driven from real templates.
 *
 * This file used to build its input by hand: 140 uses of a
 * `createMockTemplate()` helper and not one call to `compile()`. Every mock set
 * `diagnostics: []` and an empty metadata block unconditionally, so no test
 * here ever saw a diagnostic, and the parser-to-renderer seam was insulated
 * from the entire suite. Two defects lived in exactly that gap - static
 * attribute text escaped twice, and a `@let`-bound arrow function that was
 * stored and never callable - and neither could be caught by a test whose AST
 * came from the test.
 *
 * Everything below now compiles the template it is about, through
 * {@link ./support/render-ok.js#renderOk}, which asserts the compile was clean
 * before it renders. The handful of cases the parser genuinely CANNOT produce -
 * a call to a component the compiler would have refused, a comment style no
 * syntax creates - are built by hand under a section that says so.
 *
 * Node semantics shared by every sink are not re-asserted here: they belong to
 * the conformance corpus (`tests/corpus-eager-sinks.test.ts`) and to
 * `tests/renderer/traversal.test.ts`. What this file is about is the string
 * renderer's own surface - its factories, its options, its context, its
 * metadata and its errors.
 */

import { describe, it, expect } from 'vitest';
import {
  RenderError,
  ResourceLimitError,
  createRenderContext,
  createStringRenderer,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_RENDER_CONFIG,
  EAGER,
  constant,
  validateSourceTrackingPrefix,
} from '../src/renderer/index.js';
import { sourceAttributeName } from '../src/source-tracking/index.js';
import type {
  CompiledTemplate,
  ComponentDefinition,
  RootNode,
  SourceLocation,
  TemplateNode,
} from '../src/ast/types.js';
import type { Bindings } from '../src/evaluator/index.js';
import { compileOk, htmlOk, renderOk } from './support/render-ok.js';

// =============================================================================
// Synthetic trees
//
// Everything in this section is a tree the parser CANNOT produce, built by hand
// because the code path under test is only reachable that way: the compiler
// refuses an unknown component before a renderer ever sees one, and no syntax
// produces a `line` or `block` comment node. Anything that a template can
// express is compiled from a template instead - that is the point of the
// rewrite, and this section is deliberately as small as it can be.
// =============================================================================

const syntheticLocation: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

/** A compiled template made of nodes no parser would emit. */
function syntheticTemplate(
  children: TemplateNode[] = [],
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
// Errors
// =============================================================================

describe('render errors', () => {
  describe('RenderError', () => {
    it('carries its message, location and code', () => {
      const error = new RenderError(
        'Something went wrong',
        syntheticLocation,
        'RENDER_FAILED'
      );

      expect(error.message).toBe('Something went wrong');
      expect(error.location).toEqual(syntheticLocation);
      expect(error.code).toBe('RENDER_FAILED');
      expect(error.name).toBe('RenderError');
    });

    it('carries the error it wraps', () => {
      const cause = new Error('original');
      const error = new RenderError(
        'Wrapped',
        syntheticLocation,
        'RENDER_FAILED',
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it('accepts every code it declares', () => {
      const codes = [
        'LOOP_NESTING_EXCEEDED',
        'ITERATION_LIMIT_EXCEEDED',
        'COMPONENT_DEPTH_EXCEEDED',
        'SLOT_DEPTH_EXCEEDED',
        'OUTPUT_SIZE_EXCEEDED',
        'RENDER_TIME_EXCEEDED',
        'UNKNOWN_COMPONENT',
        'RENDER_FAILED',
      ] as const;

      for (const code of codes) {
        expect(new RenderError('Test', syntheticLocation, code).code).toBe(
          code
        );
      }
    });
  });

  describe('ResourceLimitError', () => {
    it('names the ceiling, the count and the maximum', () => {
      const error = new ResourceLimitError(
        'loopNesting',
        6,
        5,
        syntheticLocation
      );

      expect(error.limitType).toBe('loopNesting');
      expect(error.current).toBe(6);
      expect(error.max).toBe(5);
      expect(error.code).toBe('LOOP_NESTING_EXCEEDED');
      expect(error.message).toContain('6 > 5');
    });

    it('maps every ceiling to its own code', () => {
      const codes = {
        loopNesting: 'LOOP_NESTING_EXCEEDED',
        iterations: 'ITERATION_LIMIT_EXCEEDED',
        componentDepth: 'COMPONENT_DEPTH_EXCEEDED',
        slotDepth: 'SLOT_DEPTH_EXCEEDED',
        outputSize: 'OUTPUT_SIZE_EXCEEDED',
        renderTime: 'RENDER_TIME_EXCEEDED',
      } as const;

      for (const [limit, code] of Object.entries(codes)) {
        expect(
          new ResourceLimitError(
            limit as keyof typeof codes,
            2,
            1,
            syntheticLocation
          ).code
        ).toBe(code);
      }
    });
  });
});

// =============================================================================
// Defaults
//
// Asserted by what they DO, not by what they say. A test that read
// `DEFAULT_RESOURCE_LIMITS.maxIterationsPerLoop` back and compared it to 1000
// passed for years while `maxExpressionNodes` sat beside it enforced by
// nothing: restating a constant proves the constant exists, and nothing else.
// =============================================================================

describe('defaults', () => {
  it('bounds a loop at a thousand passes when the caller names no limit', () => {
    const rows = Array.from({ length: 1001 }, (_unused, index) => index);

    expect(() =>
      htmlOk('@for(x of xs) { <i></i> }', { xs: rows })
    ).toThrowError(ResourceLimitError);
    expect(
      htmlOk('@for(x of xs) { <i></i> }', { xs: rows.slice(0, 1000) })
    ).toBe('<i></i>'.repeat(1000));
    // And the constant says the same thing the behaviour does.
    expect(DEFAULT_RESOURCE_LIMITS.maxIterationsPerLoop).toBe(1000);
  });

  it('bounds loop nesting at five when the caller names no limit', () => {
    const nest = (depth: number): string =>
      depth === 0 ? '<i></i>' : `@for(a${depth} of xs) { ${nest(depth - 1)} }`;

    expect(htmlOk(nest(5), { xs: [1] })).toBe('<i></i>');
    expect(() => htmlOk(nest(6), { xs: [1] })).toThrowError(ResourceLimitError);
    expect(DEFAULT_RESOURCE_LIMITS.maxLoopNesting).toBe(5);
  });

  it('drops comments unless the caller asks for them', () => {
    expect(htmlOk('a<!-- note -->b')).toBe('ab');
    expect(
      htmlOk('a<!-- note -->b', {}, { config: { includeComments: true } })
    ).toBe('a<!-- note -->b');
    expect(DEFAULT_RENDER_CONFIG.includeComments).toBe(false);
  });

  it('escapes evaluated text unless the caller turns it off', () => {
    expect(htmlOk('${v}', { v: '<b>' })).toBe('&lt;b&gt;');
    expect(
      htmlOk('${v}', { v: '<b>' }, { config: { htmlEscape: false } })
    ).toBe('<b>');
    expect(DEFAULT_RENDER_CONFIG.htmlEscape).toBe(true);
  });

  it('emits no source-tracking attributes unless the caller asks', () => {
    expect(htmlOk('<p>${v}</p>', { v: 'x' })).toBe('<p>x</p>');
    expect(
      htmlOk(
        '<p>${v}</p>',
        { v: 'x' },
        { config: { includeSourceTracking: true } }
      )
    ).toContain('rd-source');
    expect(DEFAULT_RENDER_CONFIG.includeSourceTracking).toBe(false);
    expect(DEFAULT_RENDER_CONFIG.sourceTrackingPrefix).toBe('rd-');
  });
});

// =============================================================================
// Render context
// =============================================================================

describe('createRenderContext', () => {
  const empty = () => compileOk('');

  it("starts with the caller's data and nothing else", () => {
    const data = { name: 'Alice' };
    const context = createRenderContext(empty(), data);

    expect(context.scope.snapshot().data).toEqual(data);
    expect(context.scope.snapshot().locals).toEqual({});
    expect(context.scope.snapshot().globals).toEqual({});
    expect(context.currentLoopNesting).toBe(0);
    expect(context.componentDepth).toBe(0);
    expect(context.stats.totalIterations).toBe(0);
    expect(context.stats.maxComponentDepthReached).toBe(0);
    expect(context.stats.pathsAccessed).toBeInstanceOf(Set);
    expect(context.stats.helpersUsed).toBeInstanceOf(Set);
  });

  it("takes the caller's globals", () => {
    const context = createRenderContext(
      empty(),
      {},
      { globals: { currency: 'EUR' } }
    );
    expect(context.scope.snapshot().globals).toEqual({ currency: 'EUR' });
  });

  it("takes the caller's helpers", () => {
    const myHelper = () => () => 'result';
    const context = createRenderContext(empty(), {}, { helpers: { myHelper } });
    expect(context.helpers.myHelper).toBe(myHelper);
  });

  it('merges the render config over the defaults', () => {
    const context = createRenderContext(
      empty(),
      {},
      { config: { includeComments: true } }
    );

    expect(context.renderConfig.includeComments).toBe(true);
    expect(context.renderConfig.htmlEscape).toBe(true);
  });

  it('merges the limits over the defaults', () => {
    const context = createRenderContext(
      empty(),
      {},
      { limits: { maxLoopNesting: 10 } }
    );

    expect(context.limits.maxLoopNesting).toBe(10);
    expect(context.limits.maxTotalIterations).toBe(10000);
  });
});

// The scope rules themselves. `EAGER` is the reactivity the string and DOM
// sinks render with; a reactive host supplies its own, and the traversal binds
// names through this same interface either way, so the two cannot disagree
// about what a loop variable or a component prop is.
describe('EAGER scopes', () => {
  const root = () =>
    EAGER.rootScope({ items: [1, 2, 3] }, { global: 'var' } as Bindings);

  it('binds a loop variable as a local, over the data', () => {
    const parent = EAGER.extendScope(root(), { existing: constant('value') });
    const child = EAGER.extendScope(parent, { item: constant(42) });

    expect(child.snapshot().locals.item).toBe(42);
    expect(child.snapshot().locals.existing).toBe('value');
    expect(child.snapshot().data).toEqual({ items: [1, 2, 3] });
    expect(child.snapshot().globals).toEqual({ global: 'var' });
  });

  it('binds several names at once', () => {
    const child = EAGER.extendScope(root(), {
      item: constant('value'),
      index: constant(5),
    });

    expect(child.snapshot().locals.item).toBe('value');
    expect(child.snapshot().locals.index).toBe(5);
  });

  it('leaves the parent scope alone', () => {
    const parent = EAGER.extendScope(root(), { a: constant(1) });
    EAGER.extendScope(parent, { b: constant(2) });

    expect(parent.snapshot().locals.b).toBeUndefined();
    expect(parent.snapshot().locals.a).toBe(1);
  });

  it('gives a component its props as data and nothing else', () => {
    const props = { title: 'Hello', count: 42 } as Bindings;
    const caller = EAGER.extendScope(root(), { hidden: constant('x') });

    const scope = EAGER.componentScope(constant(props), caller).snapshot();

    expect(scope.data).toBe(props);
    expect(scope.globals).toEqual({ global: 'var' });
    expect(scope.locals).toEqual({});
    expect(scope.locals.hidden).toBeUndefined();
  });

  it('binds a global without touching the locals', () => {
    const scope = EAGER.extendGlobals(root(), 'y', constant(2)).snapshot();

    expect(scope.globals.global).toBe('var');
    expect(scope.globals.y).toBe(2);
    expect(scope.locals).toEqual({});
  });

  it('chains binding sets rather than copying them', () => {
    // The addition is the new set's only own property, and both names still
    // resolve, so a loop that runs a thousand times does not copy its
    // enclosing locals a thousand times.
    const parent = EAGER.extendScope(root(), { a: constant(1) });
    const child = EAGER.extendScope(parent, { b: constant(2) });

    expect(Object.keys(child.snapshot().locals)).toEqual(['b']);
    expect(child.snapshot().locals.a).toBe(1);
  });
});

// =============================================================================
// Rendering
//
// Compiled, every one. What each of these asserts about the DOCUMENT is also
// asserted of the DOM and reactive sinks by the conformance corpus; what they
// add here is the string renderer's own spelling of it.
// =============================================================================

describe('text', () => {
  it('renders literal text', () => {
    expect(htmlOk('Hello, World!')).toBe('Hello, World!');
  });

  it('interpolates a value', () => {
    expect(htmlOk('Hello, ${name}!', { name: 'Alice' })).toBe('Hello, Alice!');
  });

  it('follows a path', () => {
    expect(htmlOk('${user.name}', { user: { name: 'Bob' } })).toBe('Bob');
  });

  it('evaluates arithmetic', () => {
    expect(htmlOk('${a + b}', { a: 2, b: 3 })).toBe('5');
  });

  it('escapes an evaluated value', () => {
    expect(htmlOk('${v}', { v: '<script>alert("x")</script>' })).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('renders a missing value as nothing', () => {
    expect(htmlOk('[${missing}]')).toBe('[]');
  });

  it('renders null as nothing', () => {
    expect(htmlOk('[${v}]', { v: null })).toBe('[]');
  });

  it('does not escape a $! segment, and still escapes its neighbours', () => {
    expect(htmlOk('${safe}$!{raw}', { safe: '<i>', raw: '<em>ok</em>' })).toBe(
      '&lt;i&gt;<em>ok</em>'
    );
  });
});

describe('elements', () => {
  it('renders an element with no attributes', () => {
    expect(htmlOk('<div></div>')).toBe('<div></div>');
  });

  it('renders a static attribute', () => {
    expect(htmlOk('<div class="container"></div>')).toBe(
      '<div class="container"></div>'
    );
  });

  it('renders an evaluated attribute', () => {
    expect(htmlOk('<div id=$id></div>', { id: 'main' })).toBe(
      '<div id="main"></div>'
    );
  });

  it('renders a mixed attribute', () => {
    expect(
      htmlOk('<div class="status-${status}"></div>', { status: 'ok' })
    ).toBe('<div class="status-ok"></div>');
  });

  it('writes a true boolean attribute with no value', () => {
    expect(htmlOk('<input disabled=$on/>', { on: true })).toBe(
      '<input disabled/>'
    );
  });

  it('omits a false boolean attribute', () => {
    expect(htmlOk('<input disabled=$on/>', { on: false })).toBe('<input/>');
  });

  it('omits an attribute whose value is null', () => {
    expect(htmlOk('<div title=$t></div>', { t: null })).toBe('<div></div>');
  });

  it('writes a void element self-closing', () => {
    expect(htmlOk('<br/>')).toBe('<br/>');
    expect(htmlOk('<img src="/a.png" alt="A"/>')).toBe(
      '<img src="/a.png" alt="A"/>'
    );
  });

  it('escapes an evaluated attribute value', () => {
    expect(htmlOk('<div title=$t></div>', { t: '"quoted" & <tagged>' })).toBe(
      '<div title="&quot;quoted&quot; &amp; &lt;tagged&gt;"></div>'
    );
  });

  it('does not re-escape author-written attribute source', () => {
    // The seam the hand-built ASTs hid: a static attribute value is HTML
    // source already, and escaping it again put `&amp;amp;` on the page.
    expect(htmlOk('<div title="Tom &amp; Jerry"></div>')).toBe(
      '<div title="Tom &amp; Jerry"></div>'
    );
  });

  it('nests elements', () => {
    expect(htmlOk('<div><span>Hello</span></div>')).toBe(
      '<div><span>Hello</span></div>'
    );
  });
});

describe('directives', () => {
  // Directive bodies are written with an element around the content, because
  // `{ A }` renders as `A ` - a block body keeps the whitespace before its
  // closing brace - and a test about `@if` should not also be a test about
  // that.
  it('takes a true @if arm', () => {
    expect(htmlOk('@if(show) { <i>yes</i> }', { show: true })).toBe(
      '<i>yes</i>'
    );
  });

  it('renders nothing for a false @if with no @else', () => {
    expect(htmlOk('[@if(show) { <i>yes</i> }]', { show: false })).toBe('[]');
  });

  it('takes the @else arm', () => {
    expect(
      htmlOk('@if(show) { <i>yes</i> } else { <b>no</b> }', { show: false })
    ).toBe('<b>no</b>');
  });

  it('takes the first true arm of an @else if chain', () => {
    const source =
      '@if(a) { <i>A</i> } else if(b) { <i>B</i> } else { <i>C</i> }';
    expect(htmlOk(source, { a: true, b: true })).toBe('<i>A</i>');
    expect(htmlOk(source, { a: false, b: true })).toBe('<i>B</i>');
    expect(htmlOk(source, { a: false, b: false })).toBe('<i>C</i>');
  });

  it('loops over an array', () => {
    expect(htmlOk('@for(x of xs) { <i>${x}</i> }', { xs: ['a', 'b'] })).toBe(
      '<i>a</i><i>b</i>'
    );
  });

  it('binds the index of an `of` loop', () => {
    expect(
      htmlOk('@for(x, i of xs) { <i>${i}:${x}</i> }', { xs: ['a', 'b'] })
    ).toBe('<i>0:a</i><i>1:b</i>');
  });

  it("loops over an object's keys", () => {
    expect(htmlOk('@for(k in o) { <i>${k}</i> }', { o: { a: 1, b: 2 } })).toBe(
      '<i>a</i><i>b</i>'
    );
  });

  it('renders nothing for an empty list', () => {
    expect(htmlOk('[@for(x of xs) { <i>${x}</i> }]', { xs: [] })).toBe('[]');
  });

  it('matches a literal case, and several values in one', () => {
    const source =
      '@match(s) { when "a" { <i>A</i> } when "b", "c" { <i>BC</i> } * { <i>D</i> } }';
    expect(htmlOk(source, { s: 'a' })).toBe('<i>A</i>');
    expect(htmlOk(source, { s: 'c' })).toBe('<i>BC</i>');
    expect(htmlOk(source, { s: 'z' })).toBe('<i>D</i>');
  });

  it('binds `_` in an expression case', () => {
    expect(
      htmlOk('@match(v) { _ > 5 { <i>big ${_}</i> } * { <i>small</i> } }', {
        v: 10,
      })
    ).toBe('<i>big 10</i>');
  });

  it('renders nothing when no case matches and there is no default', () => {
    expect(htmlOk('[@match(s) { when "a" { <i>A</i> } }]', { s: 'z' })).toBe(
      '[]'
    );
  });

  it('binds a @let and uses it', () => {
    expect(htmlOk('@@ { let greeting = "Hello"; }${greeting}')).toBe('Hello');
  });

  it('binds a global with @let $.name', () => {
    expect(htmlOk('@@ { let $.currency = "EUR"; }${$.currency}')).toBe('EUR');
  });

  it('renders a fragment without a wrapper', () => {
    expect(htmlOk('<><span>A</span><span>B</span></>')).toBe(
      '<span>A</span><span>B</span>'
    );
  });
});

describe('components', () => {
  const CARD =
    '<template:Card title!><div class="card"><h1>${title}</h1><slot/></div></template:Card>';

  it('renders a component with its props', () => {
    expect(htmlOk(`${CARD}<Card title=$heading/>`, { heading: 'Hello' })).toBe(
      '<div class="card"><h1>Hello</h1></div>'
    );
  });

  it("fills the default slot with the caller's content", () => {
    expect(htmlOk(`${CARD}<Card title="T">body</Card>`)).toBe(
      '<div class="card"><h1>T</h1>body</div>'
    );
  });

  it("falls back to the slot's own content", () => {
    expect(
      htmlOk('<template:C><b><slot>fallback</slot></b></template:C><C/>')
    ).toBe('<b>fallback</b>');
  });

  it("does not let a component see the caller's data", () => {
    expect(
      htmlOk('<template:C><i>[${secret}]</i></template:C><C/>', {
        secret: 'hidden',
      })
    ).toBe('<i>[]</i>');
  });
});

describe('configuration', () => {
  it('emits an HTML comment when includeComments is on', () => {
    expect(
      htmlOk('<!-- A comment -->', {}, { config: { includeComments: true } })
    ).toBe('<!-- A comment -->');
  });

  it('drops an HTML comment by default', () => {
    expect(htmlOk('<!-- A comment -->')).toBe('');
  });

  it('turns off body escaping when asked, and only for evaluated text', () => {
    expect(
      htmlOk('${v}', { v: '<b>bold</b>' }, { config: { htmlEscape: false } })
    ).toBe('<b>bold</b>');
  });
});

describe('metadata', () => {
  it('reports the paths and helpers a render actually used', () => {
    const { metadata } = renderOk(
      '${upper(user.name)}@if(never) { ${unused} }',
      { user: { name: 'a' }, never: false, unused: 'x' },
      { helpers: { upper: () => (v: unknown) => String(v).toUpperCase() } }
    );

    expect([...metadata.pathsAccessed]).toContain('user.name');
    // An untaken arm contributes nothing: this is a record of what the render
    // DID, which is what makes subtracting it from the static set meaningful.
    expect([...metadata.pathsAccessed]).not.toContain('unused');
    expect([...metadata.helpersUsed]).toEqual(['upper']);
  });

  it('counts iterations and measures the output', () => {
    const { metadata, html } = renderOk('@for(x of xs) { ${x} }', {
      xs: [1, 2, 3],
    });

    expect(metadata.iterationCount).toBe(3);
    expect(metadata.outputSize).toBe(html.length);
    expect(metadata.renderTime).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Paths only a hand-built tree can reach
// =============================================================================

describe('synthetic trees', () => {
  it('refuses a component the compiler would never have admitted', () => {
    // SYNTHETIC: `compile('<Missing/>')` reports UNKNOWN_COMPONENT and returns
    // a partial template, which `createStringRenderer` structurally will not
    // take - so this render-time guard is unreachable from any source text.
    // It is still the last line of defence for a host that assembles a tree
    // itself, which is what `renderTo` invites.
    expect(compileOk('<div/>')).toBeDefined();

    const template = syntheticTemplate([
      {
        kind: 'component',
        name: 'Missing',
        props: [],
        children: [],
        location: syntheticLocation,
      },
    ]);

    expect(() => createStringRenderer(template)({})).toThrowError(
      /Unknown component/
    );
  });

  it('emits only HTML comments, whatever style the node claims', () => {
    // SYNTHETIC: the parser produces `style: 'html'` and nothing else; `line`
    // and `block` exist in the AST for tooling that models `//` and `/* */`,
    // and neither belongs in rendered output.
    const template = syntheticTemplate([
      {
        kind: 'comment',
        style: 'line',
        text: 'not html',
        location: syntheticLocation,
      },
      {
        kind: 'comment',
        style: 'html',
        text: 'html',
        location: syntheticLocation,
      },
    ]);

    expect(
      createStringRenderer(template)({}, { config: { includeComments: true } })
        .html
    ).toBe('<!--html-->');
  });
});

// =============================================================================
// Source tracking prefix
// =============================================================================

describe('source tracking prefix', () => {
  describe('validateSourceTrackingPrefix', () => {
    it.each(['rd-', '', 'data-track-', 'my_prefix_', '_prefix', 'audit123'])(
      'accepts %o',
      prefix => {
        expect(() => validateSourceTrackingPrefix(prefix)).not.toThrow();
      }
    );

    it.each(['123-', 'my@prefix', 'has space', '-invalid'])(
      'rejects %o',
      prefix => {
        expect(() => validateSourceTrackingPrefix(prefix)).toThrow(
          /Invalid sourceTrackingPrefix/
        );
      }
    );

    it('says what a prefix has to look like', () => {
      expect(() => validateSourceTrackingPrefix('123bad')).toThrow(
        /Prefix must be empty or start with a letter\/underscore/
      );
    });
  });

  describe('sourceAttributeName', () => {
    it('prefixes each attribute name', () => {
      expect(sourceAttributeName('rd-', 'source')).toBe('rd-source');
      expect(sourceAttributeName('rd-', 'source-op')).toBe('rd-source-op');
      expect(sourceAttributeName('rd-', 'source-note')).toBe('rd-source-note');
      expect(sourceAttributeName('data-track-', 'source')).toBe(
        'data-track-source'
      );
      expect(sourceAttributeName('audit_', 'source')).toBe('audit_source');
    });

    it('takes an empty prefix', () => {
      expect(sourceAttributeName('', 'source')).toBe('source');
      expect(sourceAttributeName('', 'source-op')).toBe('source-op');
      expect(sourceAttributeName('', 'source-note')).toBe('source-note');
    });
  });

  describe('through a render', () => {
    it('uses the configured prefix on the attributes it emits', () => {
      const html = htmlOk(
        '<p>${v}</p>',
        { v: 'x' },
        {
          config: {
            includeSourceTracking: true,
            sourceTrackingPrefix: 'audit-',
          },
        }
      );

      expect(html).toContain('audit-source=');
      expect(html).not.toContain('rd-source=');
    });

    it('refuses a prefix that would not be a legal attribute name', () => {
      expect(() =>
        htmlOk('<p>x</p>', {}, { config: { sourceTrackingPrefix: '@invalid' } })
      ).toThrow(/Invalid sourceTrackingPrefix/);
      expect(() =>
        createRenderContext(
          compileOk(''),
          {},
          { config: { sourceTrackingPrefix: '123-invalid' } }
        )
      ).toThrow(/Invalid sourceTrackingPrefix/);
    });

    it('keeps the prefix across repeated renders', () => {
      const render = createStringRenderer(compileOk('<p>${v}</p>'));
      const options = {
        config: {
          includeSourceTracking: true,
          sourceTrackingPrefix: 'custom-',
        },
      };

      expect(render({ v: 'a' }, options).html).toContain('custom-source=');
      expect(render({ v: 'b' }, options).html).toContain('custom-source=');
    });
  });
});
