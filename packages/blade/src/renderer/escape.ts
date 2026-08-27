// Context-directed escaping
//
// Escaping is a property of the SINK, not of the value. One `escapeHtml` applied
// everywhere is wrong in four different directions at once:
//
//   (a) inside `<script>`/`<style>` browsers never decode character references,
//       so HTML entities corrupt the data outright - `a & b` reaches the
//       JavaScript parser as `a &amp; b` - and pushing users onto a raw sink to
//       avoid that hands them a `</script>` breakout;
//   (b) `href="${url}"` with a `javascript:` URL contains no HTML-special
//       character at all, so escaping cannot touch it - the URL scheme has to be
//       validated instead;
//   (c) author-written static attribute text is already HTML source, so escaping
//       it again turns `title="Tom &amp; Jerry"` into `Tom &amp;amp; Jerry`;
//   (d) `createTextNode` and `setAttribute` do not parse HTML, so anything
//       escaped on the way into them is double-encoded on screen.
//
// Every entry point below names the sink it is for. `escapeForContext` is the
// single dispatch point, and `escapeContextForAttribute` /
// `escapeContextForElementText` decide which sink a given position is.

import {
  isRawTextElement,
  isUrlAttribute,
  type Namespace,
} from '../ast/html.js';

/**
 * The sinks a value can be written into.
 *
 * - `html-body` - character data in an HTML document
 * - `attr-value` - a quoted attribute value produced by evaluating an expression
 * - `url-attr` - an attribute whose value is a URL (`href`, `src`, ...)
 * - `raw-text-js` - a value interpolated into JavaScript source in `<script>`
 * - `script-json` - JSON text interpolated into `<script>`, which is JavaScript
 *   source already and must not be escaped as if it were a string literal
 * - `raw-text-css` - a value interpolated into CSS source in `<style>`
 * - `comment` - the text of an HTML comment
 */
export type EscapeContext =
  | 'html-body'
  | 'attr-value'
  | 'url-attr'
  | 'raw-text-js'
  | 'script-json'
  | 'raw-text-css'
  | 'comment';

// =============================================================================
// HTML body
// =============================================================================

/**
 * HTML entity map for escaping special characters.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Regex for matching HTML special characters.
 */
const HTML_ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escapes character data for an HTML document.
 *
 * This is the classic escaper, and the only one that is correct for text nodes
 * and for EVALUATED attribute values. It is deliberately byte-identical to the
 * `escapeHtml` in renderer/index.ts that it replaces, so migrating a call site
 * to the context-directed API is provably behaviour-preserving for this sink.
 *
 * It is NOT correct for static author-written attribute text (already HTML
 * source), for `<script>`/`<style>` bodies, for URL attributes, or for values
 * handed to DOM APIs.
 *
 * @param value - The string to escape
 * @returns The escaped string, safe for HTML character data
 */
export function escapeHtmlBody(value: string): string {
  return value.replace(HTML_ESCAPE_REGEX, char => HTML_ENTITIES[char]!);
}

// =============================================================================
// JavaScript string literals
// =============================================================================

/**
 * Characters with a shorter, more readable escape than a `\uXXXX` sequence.
 */
const JS_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '`': '\\`',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
  // Not special to JavaScript, but critical: a raw `<` lets a value close the
  // enclosing <script> element, and `&` can be reinterpreted by an HTML parser
  // in a few legacy contexts. Escaping them costs nothing and removes the sink.
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  // Line terminators in JavaScript, but ordinary characters in JSON.
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

// eslint-disable-next-line no-control-regex
const JS_ESCAPE_REGEX = /[\\'"`<>&\u2028\u2029\u0000-\u001f\u007f]/g;

/**
 * Escapes a value being interpolated into a JavaScript string literal inside a
 * `<script>` element.
 *
 * The result is safe inside single quotes, double quotes and template literals,
 * and cannot close the enclosing element: the three characters that could,
 * `<`, `>` and `&`, become unicode escapes. U+2028 and U+2029 - line
 * terminators in JavaScript but ordinary characters in JSON - and every C0
 * control character are escaped too.
 *
 * For structured data prefer {@link serializeJsonForScript}, which keeps the
 * value's shape as well as its safety.
 *
 * @param value - The string to escape
 * @returns The escaped string, safe inside a JavaScript string literal
 */
export function escapeJsString(value: string): string {
  return value.replace(JS_ESCAPE_REGEX, char => {
    const short = JS_ESCAPES[char];
    if (short !== undefined) return short;
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

// =============================================================================
// JSON for a script element
// =============================================================================

/**
 * Characters that are legal raw inside JSON but must not appear raw inside a
 * `<script>` element, or inside JavaScript source at all.
 */
const JSON_SCRIPT_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const JSON_SCRIPT_REGEX = /[<>&\u2028\u2029]/g;

/**
 * Serialises a value as JSON that is safe to embed directly in a `<script>`
 * element.
 *
 * `JSON.stringify` alone is not: it emits `</script>` verbatim inside a string,
 * which closes the element, and it emits U+2028/U+2029 raw, which are line
 * terminators to a JavaScript parser and produce a syntax error. Both are fixed
 * here with unicode escapes, which `JSON.parse` decodes back to the original
 * characters - so the value round-trips exactly.
 *
 * This is what makes `<script>var d = ${json(x)}</script>` both correct and
 * safe, so a template author is never pushed onto the raw `$!` sink to get
 * working data into a page.
 *
 * @param value - Any JSON-serialisable value
 * @returns JSON text with no raw `<`, `>`, `&`, U+2028 or U+2029
 */
export function serializeJsonForScript(value: unknown): string {
  const json = JSON.stringify(value);
  // JSON.stringify returns undefined for undefined, functions and symbols.
  // `null` is the only substitute that keeps the surrounding script parseable.
  if (json === undefined) return 'null';
  return escapeJsonInScript(json);
}

/**
 * Makes existing JSON text safe to embed in a `<script>` element.
 *
 * The escaping half of {@link serializeJsonForScript}, for the case where the
 * JSON has already been produced - by the `toJson` helper, say. Applying a
 * JavaScript *string* escaper to JSON instead would escape its quotes and
 * braces and leave a string literal where an object literal was written.
 *
 * @param json - JSON text
 * @returns The same JSON with no raw `<`, `>`, `&`, U+2028 or U+2029
 */
export function escapeJsonInScript(json: string): string {
  return json.replace(JSON_SCRIPT_REGEX, char => JSON_SCRIPT_ESCAPES[char]!);
}

// =============================================================================
// CSS
// =============================================================================

/**
 * Characters kept verbatim in a CSS value.
 *
 * Everything else is hex-escaped. The kept set is exactly the characters that
 * carry meaning inside a *value* but cannot introduce CSS structure: no quote,
 * bracket, brace, semicolon, colon, slash, star, at-sign or backslash survives,
 * so an interpolated value can never end a declaration, open a comment, call a
 * function or close the `<style>` element. `#`, `%`, `.`, `,`, `+`, `-`, `_` and
 * the space stay, so ordinary values like `#fff`, `1.5em`, `50%` and
 * `Helvetica, sans-serif` keep working.
 */
const CSS_UNSAFE_REGEX = /[^a-zA-Z0-9 ,.#%+_-]/gu;

/**
 * Escapes a value being interpolated into CSS source inside a `<style>` element.
 *
 * Escapes are emitted as a backslash, six hex digits and a terminating space.
 * Six digits mean a following hex digit cannot be swallowed into the escape, and
 * the trailing space is consumed by the CSS tokeniser as part of the escape - so
 * a real space after an escaped character survives.
 *
 * Escapes decode back to the original character in both identifier and string
 * positions, so the value's content is preserved.
 *
 * @param value - The string to escape
 * @returns The escaped string, safe inside a CSS declaration value
 */
export function escapeCssValue(value: string): string {
  return value.replace(CSS_UNSAFE_REGEX, char => {
    const codePoint = char.codePointAt(0) ?? 0;
    return `\\${codePoint.toString(16).padStart(6, '0')} `;
  });
}

// =============================================================================
// HTML comments
// =============================================================================

/**
 * Escapes text for the inside of an HTML comment.
 *
 * Comments do not decode character references, so entity escaping is useless
 * here. What matters is that the text cannot terminate the comment: every run of
 * hyphens is broken up, which neutralises the closing and opening sequences at
 * once, and the text is prevented from starting with `>` or `->` or ending with
 * a hyphen.
 *
 * @param value - The comment text
 * @returns Text that cannot close or malform the enclosing comment
 */
export function escapeCommentText(value: string): string {
  // Break every hyphen pair; applied globally this leaves no two adjacent
  // hyphens anywhere in the text.
  let out = value.replace(/-(?=-)/g, '- ');
  if (out.startsWith('>') || out.startsWith('->')) out = ` ${out}`;
  if (out.endsWith('-')) out = `${out} `;
  return out;
}

// =============================================================================
// URLs
// =============================================================================

/**
 * The value substituted for a URL that failed validation.
 *
 * `about:invalid` is the standard inert URL; the fragment makes the substitution
 * obvious in a rendered page and in a diff.
 */
export const BLOCKED_URL = 'about:invalid#blocked';

/** Result of validating a URL attribute value. */
export interface SanitizedUrl {
  /** The value to emit: the cleaned input, or {@link BLOCKED_URL}. */
  readonly safe: string;
  /** True when the input was rejected and replaced. */
  readonly blocked: boolean;
}

/**
 * ASCII control characters, including NUL, TAB, LF and CR.
 *
 * They must be removed BEFORE the scheme is inspected: browsers strip them while
 * parsing a URL, so a `javascript:` URL split by a NUL or a TAB still executes
 * even though a naive prefix check does not recognise it.
 */
// eslint-disable-next-line no-control-regex
const URL_CONTROL_CHARS_REGEX = /[\u0000-\u001f\u007f]/g;

/** A URL scheme, per RFC 3986: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ). */
const URL_SCHEME_REGEX = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** Schemes that are safe to navigate to or fetch from. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
  'http',
  'https',
  'mailto',
  'tel',
  'ftp',
]);

/**
 * A `data:` URL of an image type, capturing the subtype and any parameters.
 */
const DATA_IMAGE_REGEX = /^data:image\/([a-zA-Z0-9!#$&^_.+-]+)((?:;[^,;]*)*),/;

/**
 * Image subtypes that are inert when loaded.
 *
 * `svg+xml` is deliberately absent: an SVG document can carry script, so a
 * `data:image/svg+xml` URL is a code execution sink, not a picture.
 */
const SAFE_DATA_IMAGE_SUBTYPES: ReadonlySet<string> = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'tiff',
  'vnd.microsoft.icon',
  'webp',
  'x-icon',
]);

/**
 * Validates the value of a URL-valued attribute against a scheme allowlist.
 *
 * Escaping cannot defend these attributes - a `javascript:` URL contains no
 * HTML-special character - so the scheme is checked instead. Allowed: `http`,
 * `https`, `mailto`, `tel`, `ftp`, protocol-relative (`//host/path`),
 * root-relative (`/path`), relative (`path`, `./path`), query-only (`?q=1`),
 * fragment-only (`#id`), empty, and `data:` restricted to raster image types.
 * Everything else is replaced with {@link BLOCKED_URL}.
 *
 * The returned `safe` value is the cleaned input - control characters removed,
 * surrounding whitespace trimmed - so what is emitted is exactly what was
 * validated, and no smuggled character can be reinterpreted afterwards.
 *
 * @param value - The raw attribute value
 * @returns The value to emit and whether it was rejected
 */
export function sanitizeUrlAttribute(value: string): SanitizedUrl {
  const cleaned = value.replace(URL_CONTROL_CHARS_REGEX, '').trim();

  const scheme = URL_SCHEME_REGEX.exec(cleaned);
  // No scheme: relative, root-relative, protocol-relative, query, fragment or
  // empty. None of these can select a protocol handler.
  if (scheme === null) return { safe: cleaned, blocked: false };

  const name = scheme[1]!.toLowerCase();
  if (SAFE_URL_SCHEMES.has(name)) return { safe: cleaned, blocked: false };

  if (name === 'data') {
    const image = DATA_IMAGE_REGEX.exec(cleaned.toLowerCase());
    if (image !== null && SAFE_DATA_IMAGE_SUBTYPES.has(image[1]!)) {
      return { safe: cleaned, blocked: false };
    }
  }

  return { safe: BLOCKED_URL, blocked: true };
}

// =============================================================================
// Dispatch
// =============================================================================

/**
 * Escapes a value for the sink it is being written into.
 *
 * The single dispatch point: callers name the context and never choose an
 * escaper by habit.
 *
 * @param value - The value to escape
 * @param context - The sink the value is written into
 * @returns The escaped value
 */
export function escapeForContext(
  value: string,
  context: EscapeContext
): string {
  switch (context) {
    case 'html-body':
    case 'attr-value':
      return escapeHtmlBody(value);
    case 'url-attr':
      // Validate the scheme first, then escape the survivor for the attribute
      // it is going into - a legal URL can still contain `&` and `"`.
      return escapeHtmlBody(sanitizeUrlAttribute(value).safe);
    case 'raw-text-js':
      return escapeJsString(value);
    case 'script-json':
      return escapeJsonInScript(value);
    case 'raw-text-css':
      return escapeCssValue(value);
    case 'comment':
      return escapeCommentText(value);
    default: {
      // Exhaustiveness guard: a new EscapeContext fails to compile here.
      const _never: never = context;
      return _never;
    }
  }
}

/**
 * The sink an attribute value is written into.
 *
 * @param name - Attribute name as written in the template
 * @returns `'url-attr'` for URL-valued attributes, `'attr-value'` otherwise
 */
export function escapeContextForAttribute(name: string): EscapeContext {
  return isUrlAttribute(name) ? 'url-attr' : 'attr-value';
}

// =============================================================================
// Author-written HTML source
// =============================================================================

/**
 * Escapes text that is *already* HTML source for the inside of a quoted
 * attribute value.
 *
 * Literal text a template author wrote is HTML source: `&amp;` in it means one
 * ampersand, and re-escaping it to `&amp;amp;` shows the reader the entity
 * instead of the character. The single thing that must still be neutralised is
 * the quote that delimits the value, because the parser removed the author's
 * choice of delimiter and the renderer always emits double quotes.
 *
 * This is the "escape exactly once, by origin" rule for the static half of a
 * mixed attribute: static segments go through here, evaluated segments through
 * {@link escapeHtmlBody}, and the concatenation is never escaped as a whole.
 *
 * @param source - Author-written attribute text, as HTML source
 * @returns The same source with `"` replaced by `&quot;`
 */
export function escapeAttributeDelimiter(source: string): string {
  return source.includes('"') ? source.replace(/"/g, '&quot;') : source;
}

/**
 * Removes the characters a URL parser strips before it looks at the scheme.
 *
 * Browsers discard ASCII control characters while parsing a URL, so
 * `java\0script:` reaches a protocol handler as `javascript:` even though no
 * prefix check recognises it. Interpolated segments of a URL attribute are run
 * through this before the assembled value is validated, so what is checked is
 * what the browser will act on.
 *
 * @param value - One interpolated segment of a URL attribute
 * @returns The segment with ASCII control characters removed
 */
export function stripUrlControlCharacters(value: string): string {
  return value.replace(URL_CONTROL_CHARS_REGEX, '');
}

/**
 * The sink an element's text content is written into.
 *
 * `<script>` and `<style>` are raw text - entities are never decoded there, so
 * HTML escaping corrupts the value. Every other element, including the escapable
 * raw text elements `<textarea>` and `<title>`, takes ordinary body escaping.
 *
 * @param tag - Tag name of the containing element
 * @param namespace - Namespace of the containing element, if known; raw text
 *   applies only to the HTML `script` and `style` elements
 * @returns The context for text inside that element
 */
export function escapeContextForElementText(
  tag: string,
  namespace: Namespace = 'html'
): EscapeContext {
  if (namespace !== 'html') return 'html-body';
  if (!isRawTextElement(tag)) return 'html-body';
  return tag.toLowerCase() === 'script' ? 'raw-text-js' : 'raw-text-css';
}
