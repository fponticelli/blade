// The corpus.
//
// One table. Every renderer is driven through all of it, and the assertion is
// that they agree - so a case added here is a case three implementations have
// to satisfy, and a divergence has nowhere left to hide.
//
// Expectations are written out in full rather than derived. A derived
// expectation restates the implementation and passes whatever the code does;
// the point of this table is that somebody looked at each string and decided it
// was right.

import type { CorpusCase } from './types.js';

/** Ten thousand and one of anything: past the default per-loop ceiling. */
const OVER_DEFAULT_ITERATIONS = Array.from(
  { length: 1001 },
  (_unused, index) => index
);

/** A component that calls itself `n` more times. */
const RECURSIVE_COMPONENT =
  '<template:R n><i>@if(n > 0) { <R n=${n - 1}/> }</i></template:R>';

export const CORPUS: readonly CorpusCase[] = [
  // ===========================================================================
  // Text escaping
  //
  // The string sink escapes on the way out; the node-building sinks write the
  // character itself, because `createTextNode` parses nothing. Both are right,
  // and comparing the *documents* is what says so.
  // ===========================================================================
  {
    name: 'text/every-html-special',
    group: 'escaping',
    source: '<p>${v}</p>',
    data: { v: `a & b < c > d " e ' f` },
    expectedHtml: '<p>a &amp; b &lt; c &gt; d &quot; e &#39; f</p>',
  },
  {
    name: 'text/unicode-and-surrogate-pairs',
    group: 'escaping',
    source: '<p>${v}</p>',
    // A composed accent, an emoji (U+1F600) and a musical symbol (U+1D11E):
    // two astral characters, four UTF-16 code units, nothing an escaper may
    // split. A `\uXXXX` escaper applied per code unit corrupts both.
    data: { v: 'café \u{1F600} \u{1D11E}' },
    expectedHtml: '<p>café \u{1F600} \u{1D11E}</p>',
  },
  {
    name: 'text/lone-surrogate-passes-through',
    group: 'escaping',
    source: '<p>${v}</p>',
    // Not a character at all: half of a pair, which JavaScript strings admit
    // and no escaper may either drop or complete.
    data: { v: 'a\uD83Db' },
    expectedHtml: '<p>a\uD83Db</p>',
  },
  {
    name: 'text/author-written-entities-are-source',
    group: 'escaping',
    source: '<p>&amp; &lt; &copy; &#65;</p>',
    // The author already escaped once, when they wrote it. The string sink
    // repeats the source; the DOM sinks decode it, because a text node shows
    // `&amp;` as five characters. Same document either way.
    expectedHtml: '<p>&amp; &lt; &copy; &#65;</p>',
  },
  {
    name: 'text/missing-value-is-empty',
    group: 'escaping',
    source: '<p>[${v}]</p>',
    data: {},
    expectedHtml: '<p>[]</p>',
  },

  // ===========================================================================
  // Attribute escaping
  // ===========================================================================
  {
    name: 'attributes/evaluated-value-is-escaped-once',
    group: 'escaping',
    source: '<p title="${v}">x</p>',
    data: { v: `a & b < c > d " e ' f` },
    expectedHtml: '<p title="a &amp; b &lt; c &gt; d &quot; e &#39; f">x</p>',
  },
  {
    name: 'attributes/static-entities-are-not-re-escaped',
    group: 'escaping',
    source: '<p title="Tom &amp; Jerry">R &amp; D</p>',
    // The defect this pins: escaping the author's `&amp;` again put
    // `Tom &amp;amp; Jerry` on the page, where the reader saw the entity
    // rather than the ampersand.
    expectedHtml: '<p title="Tom &amp; Jerry">R &amp; D</p>',
  },
  {
    name: 'attributes/mixed-static-and-evaluated-parts',
    group: 'escaping',
    source: '<p class="s-${v} t">x</p>',
    data: { v: 'a&b' },
    expectedHtml: '<p class="s-a&amp;b t">x</p>',
  },
  {
    name: 'attributes/astral-characters-survive',
    group: 'escaping',
    source: '<p title="${v}">x</p>',
    data: { v: 'a\u{1F600}b & c' },
    expectedHtml: '<p title="a\u{1F600}b &amp; c">x</p>',
  },
  {
    name: 'attributes/boolean-present-and-absent',
    group: 'attributes',
    source: '<input disabled=$a readonly=$b/>',
    data: { a: true, b: false },
    expectedHtml: '<input disabled/>',
  },
  {
    name: 'attributes/null-value-omits-the-attribute',
    group: 'attributes',
    source: '<input value=$a title=$b/>',
    data: { a: null },
    expectedHtml: '<input/>',
  },

  // ===========================================================================
  // $ versus $!
  //
  // The one place the two differ is the whole reason `rawHtml` exists as a
  // target operation: the DOM sink used to escape `$!` away, because "a text
  // node is inherently safe" is true of `$` and false of `$!`.
  // ===========================================================================
  {
    name: 'raw/escaped-beside-raw',
    group: 'raw-interpolation',
    source: '<p>${v}|$!{v}</p>',
    data: { v: '<b>hi</b>' },
    expectedHtml: '<p>&lt;b&gt;hi&lt;/b&gt;|<b>hi</b></p>',
  },
  {
    name: 'raw/dotted-path-shorthand',
    group: 'raw-interpolation',
    source: 'Bio: $!data.bio',
    data: { data: { bio: '<p>H</p>' } },
    expectedHtml: 'Bio: <p>H</p>',
  },
  {
    name: 'raw/empty-value-emits-nothing',
    group: 'raw-interpolation',
    source: '<p>[$!{v}]</p>',
    data: { v: '' },
    expectedHtml: '<p>[]</p>',
  },
  {
    name: 'raw/missing-value-emits-nothing',
    group: 'raw-interpolation',
    source: '<p>[$!{v}]</p>',
    data: {},
    expectedHtml: '<p>[]</p>',
  },

  // ===========================================================================
  // URL attributes
  //
  // Escaping cannot defend these: a `javascript:` URL holds no HTML-special
  // character. The scheme is validated instead, in the traversal, so all three
  // sinks refuse the same URLs and record the same warning.
  // ===========================================================================
  {
    name: 'urls/javascript-scheme-is-blocked',
    group: 'urls',
    source: '<a href="${u}">go</a>',
    data: { u: 'javascript:alert(1)' },
    expectedHtml: '<a href="about:invalid#blocked">go</a>',
    expectedWarnings: ["Attribute 'href' was blocked"],
  },
  {
    name: 'urls/data-text-html-is-blocked',
    group: 'urls',
    source: '<img src="${u}"/>',
    data: { u: 'data:text/html,<script>' },
    expectedHtml: '<img src="about:invalid#blocked"/>',
    expectedWarnings: ["Attribute 'src' was blocked"],
  },
  {
    name: 'urls/data-raster-image-is-allowed',
    group: 'urls',
    source: '<img src="${u}"/>',
    data: { u: 'data:image/png;base64,iVBOR' },
    expectedHtml: '<img src="data:image/png;base64,iVBOR"/>',
  },
  {
    name: 'urls/https-keeps-its-query-string',
    group: 'urls',
    source: '<a href="${u}">go</a>',
    data: { u: 'https://e.com/?a=1&b=2' },
    expectedHtml: '<a href="https://e.com/?a=1&amp;b=2">go</a>',
  },
  {
    name: 'urls/author-written-query-string',
    group: 'urls',
    source: '<a href="?a=1&amp;b=2">go</a>',
    expectedHtml: '<a href="?a=1&amp;b=2">go</a>',
  },

  // ===========================================================================
  // Raw text elements
  //
  // Character references are never decoded inside `<script>` and `<style>`, so
  // HTML escaping corrupts the program outright. Every sink escapes for the
  // language instead - the DOM sink included, because a `"` ends a JavaScript
  // string literal whether the script was assembled as text or as a node.
  // ===========================================================================
  {
    name: 'script/value-cannot-close-the-element',
    group: 'raw-text',
    source: '<script>var s = "${v}";</script>',
    data: { v: '</script><b>&' },
    expectedHtml:
      '<script>var s = "\\u003c/script\\u003e\\u003cb\\u003e\\u0026";</script>',
  },
  {
    name: 'script/json-stays-javascript-source',
    group: 'raw-text',
    source: '<script>var d = ${toJson(v)};</script>',
    data: { v: { a: '<x>&' } },
    options: { standardHelpers: true },
    // Not run through a *string* escaper: JSON is JavaScript source already,
    // and quoting it would leave a string literal where an object was written.
    expectedHtml: '<script>var d = {"a":"\\u003cx\\u003e\\u0026"};</script>',
  },
  {
    name: 'style/value-is-escaped-as-css',
    group: 'raw-text',
    source: '<style>.a { color: ${c}; }</style>',
    data: { c: 'red' },
    expectedHtml: '<style>.a { color: red; }</style>',
  },
  {
    name: 'textarea/is-escapable-raw-text',
    group: 'raw-text',
    // `<textarea>` and `<title>` DO decode references, unlike `<script>` and
    // `<style>`, so they take ordinary body escaping.
    source: '<textarea>${v}</textarea>',
    data: { v: 'a & <b>' },
    expectedHtml: '<textarea>a &amp; &lt;b&gt;</textarea>',
  },
  {
    name: 'style-attribute/value-cannot-add-a-declaration',
    group: 'raw-text',
    source: '<div style="width: ${v}"></div>',
    data: { v: '1px; position: fixed' },
    expectedHtml:
      '<div style="width: 1px\\00003b  position\\00003a  fixed"></div>',
    expectedWarnings: ["A value interpolated into 'style' was escaped"],
  },
  {
    name: 'style-attribute/interpolation-allowed-on-request',
    group: 'raw-text',
    source: '<div style="${v}"></div>',
    data: { v: 'color: red;' },
    options: { allowStyleInterpolation: true },
    expectedHtml: '<div style="color: red;"></div>',
    expectedWarnings: ['An expression contributed unescaped CSS'],
  },

  // ===========================================================================
  // Void elements
  // ===========================================================================
  {
    name: 'void/self-closing-and-no-end-tag',
    group: 'elements',
    source: '<p>a<br/>b</p><img src="/a.png" alt="A &amp; B"/>',
    // The string sink writes `<br/>`, which is valid HTML and valid XML; the
    // DOM sinks build a node that serialises as `<br>`. One document.
    expectedHtml: '<p>a<br/>b</p><img src="/a.png" alt="A &amp; B"/>',
  },

  // ===========================================================================
  // Namespaces
  // ===========================================================================
  {
    name: 'svg/canonical-spelling-is-preserved',
    group: 'elements',
    source: '<svg viewBox="0 0 1 1"><clipPath id="c"><rect/></clipPath></svg>',
    expectedHtml:
      '<svg viewBox="0 0 1 1"><clipPath id="c"><rect></rect></clipPath></svg>',
  },
  {
    name: 'svg/lowercase-source-is-canonicalised',
    group: 'elements',
    // The divergence this case was written to catch: the string sink wrote
    // back whatever the author typed - `<lineargradient viewbox=...>` - while
    // the DOM sinks created the canonical `linearGradient`/`viewBox`. Only an
    // HTML parser reading the result would have hidden it.
    source: '<svg viewbox="0 0 1 1"><lineargradient id="g"/></svg>',
    expectedHtml:
      '<svg viewBox="0 0 1 1"><linearGradient id="g"></linearGradient></svg>',
  },

  // ===========================================================================
  // @if / @else
  // ===========================================================================
  {
    name: 'if/else-if-chain-takes-the-first-true-arm',
    group: 'conditionals',
    source: '@if(a) { <p>A</p> } else if(b) { <p>B</p> } else { <p>C</p> }',
    data: { a: false, b: true },
    expectedHtml: '<p>B</p>',
  },
  {
    name: 'if/else-arm',
    group: 'conditionals',
    source: '@if(a) { <p>A</p> } else { <p>C</p> }',
    data: { a: false },
    expectedHtml: '<p>C</p>',
  },
  {
    name: 'if/false-with-no-else-emits-nothing',
    group: 'conditionals',
    source: '<i>@if(a) { <p>A</p> }</i>',
    data: { a: false },
    expectedHtml: '<i></i>',
  },

  // ===========================================================================
  // @for
  // ===========================================================================
  {
    name: 'for/array',
    group: 'loops',
    source: '<ul>@for(x of xs) { <li>${x}</li> }</ul>',
    data: { xs: ['a', 'b'] },
    expectedHtml: '<ul><li>a</li><li>b</li></ul>',
  },
  {
    name: 'for/array-with-index',
    group: 'loops',
    source: '<ul>@for(x, i of xs) { <li>${i}:${x}</li> }</ul>',
    data: { xs: ['a', 'b'] },
    expectedHtml: '<ul><li>0:a</li><li>1:b</li></ul>',
  },
  {
    name: 'for/array-empty',
    group: 'loops',
    source: '<ul>@for(x of xs) { <li>${x}</li> }</ul>',
    data: { xs: [] },
    expectedHtml: '<ul></ul>',
  },
  {
    name: 'for/object-keys',
    group: 'loops',
    source: '<ul>@for(k in o) { <li>${k}</li> }</ul>',
    data: { o: { a: 1, b: 2 } },
    expectedHtml: '<ul><li>a</li><li>b</li></ul>',
  },
  {
    name: 'for/object-keys-with-index',
    group: 'loops',
    source: '<ul>@for(k, i in o) { <li>[${i}]${k}</li> }</ul>',
    data: { o: { a: 1, b: 2 } },
    expectedHtml: '<ul><li>[]a</li><li>[]b</li></ul>',
    note:
      'Pinned as it stands, not endorsed. A second variable on an `in` loop ' +
      'parses, and the LSP scope analyzer binds it, but the traversal binds an ' +
      'index only for `of` - so `${i}` is empty. The three renderers agree ' +
      'because they are one traversal; the renderer and the language server do ' +
      'not. Handed off rather than changed here: the specification defines the ' +
      'second variable for `of` only, so what it should mean for `in` is a ' +
      'language decision, not a renderer bug.',
  },
  {
    name: 'for/object-empty',
    group: 'loops',
    source: '<ul>@for(k in o) { <li>${k}</li> }</ul>',
    data: { o: {} },
    expectedHtml: '<ul></ul>',
  },
  {
    name: 'for/array-indices-with-in',
    group: 'loops',
    source: '<ul>@for(i in xs) { <li>${i}</li> }</ul>',
    data: { xs: ['a', 'b'] },
    expectedHtml: '<ul><li>0</li><li>1</li></ul>',
  },
  {
    name: 'for/nested',
    group: 'loops',
    source:
      '<table><tbody>@for(r of rs) { <tr>@for(c of r) { <td>${c}</td> }</tr> }</tbody></table>',
    data: { rs: [[1, 2], [3]] },
    expectedHtml:
      '<table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></tbody></table>',
  },
  {
    name: 'for/keyed',
    group: 'loops',
    // A key changes what an incremental render *moves*, never what any render
    // produces - so the three outputs are identical and that is the assertion.
    source: '<ul>@for(r of rs key r.id) { <li>${r.id}</li> }</ul>',
    data: { rs: [{ id: 1 }, { id: 2 }] },
    expectedHtml: '<ul><li>1</li><li>2</li></ul>',
  },
  {
    name: 'for/loop-variable-shadows-an-enclosing-let',
    group: 'loops',
    source:
      '@@ { let item = "OUTER"; }<ul>@for(item of xs) { <li>${item}</li> }</ul><p>${item}</p>',
    data: { xs: ['a'] },
    expectedHtml: '<ul><li>a</li></ul><p>OUTER</p>',
  },

  // ===========================================================================
  // @match
  // ===========================================================================
  {
    name: 'match/literal-case-with-several-values',
    group: 'match',
    source:
      '@match(s) { when "a" { <p>A</p> } when "b", "c" { <p>BC</p> } * { <p>D</p> } }',
    data: { s: 'c' },
    expectedHtml: '<p>BC</p>',
  },
  {
    name: 'match/default-case',
    group: 'match',
    source: '@match(s) { when "a" { <p>A</p> } * { <p>D</p> } }',
    data: { s: 'z' },
    expectedHtml: '<p>D</p>',
  },
  {
    name: 'match/expression-case-binds-underscore',
    group: 'match',
    // `_` was bound in two renderers and null in the third. It is now bound by
    // the traversal, so there is one answer.
    source: '@match(v) { _ > 5 { <p>big ${_}</p> } * { <p>small ${_}</p> } }',
    data: { v: 10 },
    expectedHtml: '<p>big 10</p>',
  },
  {
    name: 'match/default-case-falls-through-to-the-data',
    group: 'match',
    source: '@match(v) { _ > 5 { <p>big ${_}</p> } * { <p>small ${v}</p> } }',
    data: { v: 1 },
    expectedHtml: '<p>small 1</p>',
  },
  {
    name: 'match/default-case-does-not-bind-underscore',
    group: 'match',
    source: '@match(v) { _ > 5 { <p>big ${_}</p> } * { <p>small[${_}]</p> } }',
    data: { v: 1 },
    expectedHtml: '<p>small[]</p>',
    note:
      '`*` is the default clause, not an expression clause, so `_` is no more ' +
      'bound there than in a `when`. Pinned because this is precisely the ' +
      'question the three renderers used to answer three ways.',
  },
  {
    name: 'match/literal-case-does-not-bind-underscore',
    group: 'match',
    source: '@match(v) { when 1 { <p>one[${_}]</p> } * { <p>other</p> } }',
    data: { v: 1 },
    expectedHtml: '<p>one[]</p>',
    note:
      'Per the specification: "Expression clauses use `_` as the matched ' +
      'value". A `when` clause names its values, so there is nothing for `_` ' +
      'to add. Pinned so the three sinks cannot drift apart on it again.',
  },
  {
    name: 'match/no-arm-matches-and-there-is-no-default',
    group: 'match',
    source: '<i>@match(s) { when "a" { <p>A</p> } }</i>',
    data: { s: 'z' },
    expectedHtml: '<i></i>',
  },

  // ===========================================================================
  // @let
  // ===========================================================================
  {
    name: 'let/binds-an-expression',
    group: 'let',
    source: '@@ { let t = n * 2; }<p>${t}</p>',
    data: { n: 21 },
    expectedHtml: '<p>42</p>',
  },
  {
    name: 'let/binds-a-callable-arrow-function',
    group: 'let',
    // The dead `@let`-function path: a bound arrow was stored but never
    // callable, so `${d(21)}` produced nothing.
    source: '@@ { let d = (a) => a * 2; }<p>${d(21)}</p>',
    expectedHtml: '<p>42</p>',
  },
  {
    name: 'let/binds-a-recursive-arrow-function',
    group: 'let',
    source: '@@ { let f = (n) => n <= 1 ? 1 : n * f(n - 1); }<p>${f(5)}</p>',
    expectedHtml: '<p>120</p>',
  },
  {
    name: 'let/does-not-leak-out-of-its-block',
    group: 'let',
    source: '@if(a) { @@ { let x = "SET"; } }<p>[${x}]</p>',
    data: { a: true },
    expectedHtml: '<p>[]</p>',
  },
  {
    name: 'let/inside-a-loop-body-sees-the-pass',
    group: 'let',
    source:
      '<ul>@for(x of xs) { @@ { let d = x * 2; }<li>${x}:${d}</li> }</ul>',
    data: { xs: [1, 2, 3] },
    expectedHtml: '<ul><li>1:2</li><li>2:4</li><li>3:6</li></ul>',
  },

  // ===========================================================================
  // Components
  // ===========================================================================
  {
    name: 'components/required-prop',
    group: 'components',
    source:
      '<template:Row label!><li>${label}</li></template:Row><ul><Row label="X"/></ul>',
    expectedHtml: '<ul><li>X</li></ul>',
  },
  {
    name: 'components/declared-default-is-used',
    group: 'components',
    source:
      '<template:Row label="fb"><li>${label}</li></template:Row><ul><Row/><Row label="g"/></ul>',
    expectedHtml: '<ul><li>fb</li><li>g</li></ul>',
  },
  {
    name: 'components/see-only-their-props',
    group: 'components',
    source:
      '<template:Row label!><li>${label}/[${secret}]</li></template:Row><ul><Row label="L"/></ul>',
    data: { secret: 'S' },
    expectedHtml: '<ul><li>L/[]</li></ul>',
  },
  {
    name: 'components/nested',
    group: 'components',
    source:
      '<template:In><i><slot/></i></template:In>' +
      '<template:Out><b><In><slot/></In></b></template:Out>' +
      '<Out>X</Out>',
    expectedHtml: '<b><i>X</i></b>',
  },
  {
    name: 'components/a-prop-named-__proto__-is-inert',
    group: 'components',
    source:
      '<template:C x><p>${x}</p></template:C><C __proto__="polluted" x="ok"/>',
    expectedHtml: '<p>ok</p>',
  },
  {
    name: 'components/missing-required-prop-does-not-compile',
    group: 'components',
    source:
      '<template:Row label!><li>[${label}]</li></template:Row><ul><Row/></ul>',
    expectedHtml: '',
    expectedDiagnostics: [{ level: 'error', code: 'MISSING_REQUIRED_PROP' }],
  },
  {
    name: 'components/unknown-component-does-not-compile',
    group: 'components',
    source: '<Nope/>',
    expectedHtml: '',
    expectedDiagnostics: [{ level: 'error', code: 'UNKNOWN_COMPONENT' }],
  },

  // ===========================================================================
  // Slots
  // ===========================================================================
  {
    name: 'slots/default',
    group: 'slots',
    source: '<template:C><b><slot/></b></template:C><C>body</C>',
    expectedHtml: '<b>body</b>',
  },
  {
    name: 'slots/fallback-when-nothing-is-supplied',
    group: 'slots',
    source: '<template:C><b><slot>FB</slot></b></template:C><C/>',
    expectedHtml: '<b>FB</b>',
  },
  {
    name: 'slots/named-beside-default',
    group: 'slots',
    source:
      '<template:C><h1><slot name="h"/></h1><s><slot/></s></template:C>' +
      '<C><slot:h>H</slot:h>B</C>',
    expectedHtml: '<h1>H</h1><s>B</s>',
  },
  {
    name: 'slots/a-nested-component-does-not-inherit-the-fill',
    group: 'slots',
    source:
      '<template:I><i><slot name="h">FB</slot></i></template:I>' +
      '<template:O><h1><slot name="h"/></h1><I/></template:O>' +
      '<O><slot:h>CALLER</slot:h></O>',
    expectedHtml: '<h1>CALLER</h1><i>FB</i>',
  },
  {
    name: 'slots/content-is-rendered-in-the-callers-scope',
    group: 'slots',
    source:
      '<template:C t!><div>${t}<slot/></div></template:C><C t="CALLEE">${t}</C>',
    data: { t: 'CALLER' },
    expectedHtml: '<div>CALLEECALLER</div>',
  },

  // ===========================================================================
  // Fragments
  // ===========================================================================
  {
    name: 'fragments/top-level',
    group: 'fragments',
    source: '<><p>a</p><p>b</p></>',
    expectedHtml: '<p>a</p><p>b</p>',
  },
  {
    name: 'fragments/preserve-their-whitespace',
    group: 'fragments',
    source: '<div>a<>  b  </>c</div>',
    expectedHtml: '<div>ab  c</div>',
  },

  // ===========================================================================
  // Comments and DOCTYPE
  // ===========================================================================
  {
    name: 'comments/dropped-by-default',
    group: 'comments',
    source: '<p>a</p><!-- note --><p>b</p>',
    expectedHtml: '<p>a</p><p>b</p>',
  },
  {
    name: 'comments/emitted-when-asked-for',
    group: 'comments',
    // `includeComments` was honoured by one sink and silently inert in
    // another. One traversal decides it now.
    source: '<p>a</p><!-- note --><p>b</p>',
    options: { includeComments: true },
    expectedHtml: '<p>a</p><!-- note --><p>b</p>',
  },
  {
    name: 'comments/cannot-terminate-early',
    group: 'comments',
    source: '<!--> bad -- comment---><p>c</p>',
    options: { includeComments: true },
    expectedHtml: '<!-- > bad - - comment- --><p>c</p>',
  },
  {
    name: 'doctype/declared-once-at-the-top',
    group: 'comments',
    source: '<!DOCTYPE html><p>a</p>',
    expectedHtml: '<!DOCTYPE html><p>a</p>',
    expectedDomOuterHtml: '<p>a</p>',
    domDifference:
      'A DOCTYPE is a property of a document, not a node. The DOM and reactive ' +
      'sinks produce a node list, which cannot hold one, so both emit nothing ' +
      'and say so in `doctype()`. Serialising is the only medium that has ' +
      'somewhere to put it.',
  },

  // ===========================================================================
  // Globals and helpers
  // ===========================================================================
  {
    name: 'globals/read-with-dollar-dot',
    group: 'evaluation',
    source: '<p>${$.site}</p>',
    options: { globals: { site: 'S & T' } },
    expectedHtml: '<p>S &amp; T</p>',
  },
  {
    name: 'helpers/standard-library-call',
    group: 'evaluation',
    source: '<p>${upper(v)} ${join(xs, ", ")}</p>',
    data: { v: 'a&b', xs: ['a', 'b'] },
    options: { standardHelpers: true },
    expectedHtml: '<p>A&amp;B a, b</p>',
  },

  // ===========================================================================
  // Events
  // ===========================================================================
  {
    name: 'events/handler-is-bound-and-the-markup-is-unchanged',
    group: 'events',
    source: '<button on:click=$h class="c">go</button>',
    data: { h: () => undefined },
    expectedHtml: '<button class="c">go</button>',
    excludedFrom: {
      string:
        'A string carries characters, and no sequence of characters is a ' +
        'function. The traversal asks the sink (`RenderTarget.bindsEvents`) ' +
        'and refuses the binding on its behalf, recording a warning the other ' +
        'two sinks correctly do not - so this case has a different *warning* ' +
        'expectation there, not a different document. Compiling with ' +
        "`target: 'string'` turns the same refusal into a compile error; " +
        'packages/blade/tests/events.test.ts pins both.',
    },
  },

  // ===========================================================================
  // Resource limits
  //
  // Every ceiling below is enforced in the traversal, so all three sinks stop
  // at the same pass, the same depth and the same expansion. The two that are
  // counted at the sink - output size and wall clock - are only compared on
  // *which* ceiling was hit, because the sinks legitimately measure different
  // things.
  // ===========================================================================
  {
    name: 'limits/default-iterations-per-loop-takes-effect',
    group: 'limits',
    // No `limits` option: this asserts that the documented default of 1000 is
    // the number a caller who names nothing actually gets. Restating
    // `DEFAULT_RESOURCE_LIMITS.maxIterationsPerLoop === 1000` in a test would
    // have passed with the limit unenforced.
    source: '<p>@for(x of xs) { a }</p>',
    data: { xs: OVER_DEFAULT_ITERATIONS },
    expectedHtml: '',
    expectedFailure: { limitType: 'iterations' },
  },
  {
    name: 'limits/default-component-depth-takes-effect',
    group: 'limits',
    source: `${RECURSIVE_COMPONENT}<R n=\${11}/>`,
    expectedHtml: '',
    expectedFailure: { limitType: 'componentDepth' },
  },
  {
    name: 'limits/component-depth-inside-the-default',
    group: 'limits',
    source: `${RECURSIVE_COMPONENT}<R n=\${3}/>`,
    expectedHtml: '<i><i><i><i></i></i></i></i>',
  },
  {
    name: 'limits/iterations-per-loop-override',
    group: 'limits',
    source: '<p>@for(x of xs) { a }</p>',
    data: { xs: [1, 2, 3] },
    options: { limits: { maxIterationsPerLoop: 2 } },
    expectedHtml: '',
    expectedFailure: { limitType: 'iterations' },
  },
  {
    name: 'limits/total-iterations-override',
    group: 'limits',
    source: '<p>@for(a of x) { @for(b of x) { z } }</p>',
    data: { x: [1, 2, 3] },
    options: { limits: { maxTotalIterations: 4 } },
    expectedHtml: '',
    expectedFailure: { limitType: 'iterations' },
  },
  {
    name: 'limits/loop-nesting-override',
    group: 'limits',
    source: '<p>@for(a of x) { @for(b of x) { @for(c of x) { z } } }</p>',
    data: { x: [1] },
    options: { limits: { maxLoopNesting: 2 } },
    expectedHtml: '',
    expectedFailure: { limitType: 'loopNesting' },
  },
  {
    name: 'limits/slot-depth-override',
    group: 'limits',
    source: '<template:A><a><slot/></a></template:A><A><A><A>x</A></A></A>',
    options: { limits: { maxSlotDepth: 1 } },
    expectedHtml: '',
    expectedFailure: { limitType: 'slotDepth' },
  },
  {
    name: 'limits/output-size-override',
    group: 'limits',
    source: '<p>${v}</p>',
    data: { v: 'x'.repeat(100) },
    options: { limits: { maxOutputChars: 20 } },
    expectedHtml: '',
    expectedFailure: { limitType: 'outputSize' },
    note:
      'All three sinks now count what they write. `TempoTarget` charges the ' +
      'BUILD pass only - what the traversal produces on its way through - ' +
      'which is the part a ceiling can honestly bound: everything after it ' +
      "happens inside a signal's callback, and charging those against the " +
      'same budget would fail a mounted page ten seconds later when the ' +
      'wall-clock deadline set at mount expired. Bounding an incremental ' +
      'update needs a limit of its own.',
  },
];
