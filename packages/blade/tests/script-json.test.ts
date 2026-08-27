/**
 * @vitest-environment jsdom
 *
 * Embedding data in a `<script>` must be correct through the SAFE form.
 *
 * The defect this pins down: `toJson` returns JSON text, the renderer escaped
 * every interpolated value as HTML, and HTML entities are never decoded inside
 * a `<script>` - so `<script>var d = ${toJson(v)}</script>` emitted
 * `var d = {&quot;a&quot;:1}`, which is not parseable JavaScript. The only form
 * that produced working output was `$!{toJson(v)}`, which writes the raw
 * string, `</script>` and all, and closes the element. The engine's own
 * standard library had no correct way to do the single most common
 * data-embedding task, and the workaround was the XSS sink.
 *
 * Both halves are asserted here: the same expression must be JSON in a script
 * and HTML-escaped text in the body, with one payload carrying every character
 * that can break either.
 */

import { describe, it, expect } from 'vitest';
import { compileOrThrow } from '../src/compiler/index.js';
import { createDomRenderer, render } from '../src/renderer/index.js';
import { standardLibrary } from '../src/helpers/index.js';

/** Every character that can end a script, start a comment, or break a parse. */
const HOSTILE = {
  close: '</script>',
  closeSpaced: '</SCRIPT >',
  open: '<script>',
  commentOpen: '<!--',
  commentClose: '-->',
  entity: 'a & b',
  quote: '"\'`',
  lineSeparator: '\u2028',
  paragraphSeparator: '\u2029',
  backslash: '\\',
  nested: { '</script>': ['<!--', '\u2028'] },
};

function html(src: string, data: unknown): string {
  return render(compileOrThrow(src), data, { helpers: standardLibrary }).html;
}

/** The text content of the single `<script>` a DOM render produced. */
function scriptText(src: string, data: unknown): string {
  const result = createDomRenderer(compileOrThrow(src))(data, {
    helpers: standardLibrary,
  });
  const host = document.createElement('div');
  for (const node of result.nodes) host.appendChild(node);
  return host.querySelector('script')!.textContent ?? '';
}

/** The JavaScript source between the script tags of a string render. */
function scriptBody(out: string): string {
  const match = /<script>([\s\S]*)<\/script>/.exec(out);
  expect(match, `no single <script> element in: ${out}`).not.toBeNull();
  return match![1]!;
}

// -----------------------------------------------------------------------------
// The safe form is correct
// -----------------------------------------------------------------------------

describe('${toJson(x)} inside a <script>', () => {
  const template = '<script>var d = ${toJson(payload)};</script>';

  it('round-trips the value exactly through JSON.parse', () => {
    const out = html(template, { payload: HOSTILE });
    const body = scriptBody(out);
    const json = body.replace(/^var d = /, '').replace(/;$/, '');
    expect(JSON.parse(json)).toEqual(HOSTILE);
  });

  it('emits JSON, not a quoted JavaScript string', () => {
    const out = html('<script>var d = ${toJson(x)};</script>', {
      x: { a: 1, b: [2, 3] },
    });
    expect(out).toBe('<script>var d = {"a":1,"b":[2,3]};</script>');
  });

  it('cannot close the enclosing element', () => {
    const out = html(template, { payload: HOSTILE });
    // Exactly one closing tag: the author's own.
    expect(out.match(/<\/script>/gi)).toHaveLength(1);
    expect(out).not.toContain('</script>{');
    expect(scriptBody(out)).not.toContain('</script>');
    expect(scriptBody(out)).not.toContain('</SCRIPT');
  });

  it('escapes < > & so no HTML parser state can be entered', () => {
    const body = scriptBody(html(template, { payload: HOSTILE }));
    expect(body).not.toMatch(/[<>&]/);
    expect(body).toContain('\\u003c/script\\u003e');
    expect(body).toContain('\\u003c!--');
  });

  it('escapes U+2028 and U+2029, which are JavaScript line terminators', () => {
    const body = scriptBody(html(template, { payload: { s: '\u2028\u2029' } }));
    expect(body).not.toMatch(/[\u2028\u2029]/);
    expect(body).toContain('\\u2028');
    expect(body).toContain('\\u2029');
  });

  it('leaves the JSON parseable as JavaScript source', () => {
    const body = scriptBody(html(template, { payload: HOSTILE }));
    // If the escaping were wrong in either direction - HTML entities, or a
    // string escaper applied to an object literal - this would be a SyntaxError.
    const evaluated = new Function(`${body} return d;`)() as unknown;
    expect(evaluated).toEqual(HOSTILE);
  });

  it('applies the same rule in the DOM sink', () => {
    const text = scriptText(template, { payload: HOSTILE });
    const json = text.replace(/^var d = /, '').replace(/;$/, '');
    expect(JSON.parse(json)).toEqual(HOSTILE);
    expect(text).not.toContain('&quot;');
  });

  it('serialises an array, a string and a null at the top level', () => {
    expect(html('<script>var d = ${toJson(x)}</script>', { x: [1, 2] })).toBe(
      '<script>var d = [1,2]</script>'
    );
    expect(
      html('<script>var d = ${toJson(x)}</script>', { x: '</script>' })
    ).toBe('<script>var d = "\\u003c/script\\u003e"</script>');
    expect(html('<script>var d = ${toJson(x)}</script>', { x: null })).toBe(
      '<script>var d = null</script>'
    );
  });
});

// -----------------------------------------------------------------------------
// The same expression in the body is still HTML-escaped
// -----------------------------------------------------------------------------

describe('${toJson(x)} in HTML body context', () => {
  it('is HTML-escaped, so the JSON is shown rather than parsed as markup', () => {
    const out = html('<p>${toJson(x)}</p>', { x: { a: '</script>' } });
    expect(out).toBe('<p>{&quot;a&quot;:&quot;&lt;/script&gt;&quot;}</p>');
    expect(out).not.toContain('</script>');
  });

  it('escapes a payload that would otherwise inject an element', () => {
    const out = html('<p>${toJson(x)}</p>', {
      x: { a: '<img src=x onerror=alert(1)>' },
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('is escaped in an attribute value too', () => {
    const out = html('<div data-x="${toJson(x)}"></div>', { x: { a: '"' } });
    expect(out).toBe(
      '<div data-x="{&quot;a&quot;:&quot;\\&quot;&quot;}"></div>'
    );
  });

  it('escapes it in the DOM sink as text, not as markup', () => {
    const result = createDomRenderer(compileOrThrow('<p>${toJson(x)}</p>'))(
      { x: { a: '<b>' } },
      { helpers: standardLibrary }
    );
    const host = document.createElement('div');
    for (const node of result.nodes) host.appendChild(node);
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('p')!.textContent).toBe('{"a":"<b>"}');
  });
});

// -----------------------------------------------------------------------------
// A non-JSON value in a script is still escaped as a JavaScript string
// -----------------------------------------------------------------------------

describe('the JSON rule is scoped to JSON-producing calls', () => {
  it('escapes a plain interpolation as a JavaScript string literal', () => {
    const out = html('<script>var s = "$msg";</script>', {
      msg: '</script>"\u2028',
    });
    expect(scriptBody(out)).toBe('var s = "\\u003c/script\\u003e\\"\\u2028";');
  });

  it('escapes a non-JSON helper call as a JavaScript string literal', () => {
    const out = html('<script>var s = "${upper(msg)}";</script>', {
      msg: '</script>',
    });
    expect(scriptBody(out)).toBe('var s = "\\u003c/SCRIPT\\u003e";');
  });

  it('keeps <style> on the CSS escaper', () => {
    const out = html('<style>a { content: "${toJson(x)}"; }</style>', {
      x: { a: 1 },
    });
    expect(out).not.toContain('</style>{');
    expect(out.match(/<\/style>/g)).toHaveLength(1);
  });
});
