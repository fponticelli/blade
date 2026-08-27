import { describe, it, expect } from 'vitest';
import {
  BLOCKED_URL,
  escapeHtmlBody,
  escapeJsString,
  escapeCssValue,
  escapeCommentText,
  serializeJsonForScript,
  sanitizeUrlAttribute,
  escapeForContext,
  escapeContextForAttribute,
  escapeContextForElementText,
} from '../../src/renderer/escape.js';

// -----------------------------------------------------------------------------
// escapeHtmlBody
// -----------------------------------------------------------------------------

describe('escapeHtmlBody', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtmlBody('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtmlBody('Tom and Jerry')).toBe('Tom and Jerry');
    expect(escapeHtmlBody('')).toBe('');
  });

  it('escapes an ampersand exactly once', () => {
    expect(escapeHtmlBody('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('neutralises a tag injection', () => {
    expect(escapeHtmlBody('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
  });

  // The migration guarantee, now that the one-size-fits-all `escapeHtml` this
  // replaced is gone: the classic escaper's exact output, for the one sink it
  // was ever correct for.
  it('produces the classic escaping it replaced', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['plain', 'plain'],
      ['&<>"\'', '&amp;&lt;&gt;&quot;&#39;'],
      ['Tom & Jerry', 'Tom &amp; Jerry'],
      [
        '<script>alert("x & y")</script>',
        '&lt;script&gt;alert(&quot;x &amp; y&quot;)&lt;/script&gt;',
      ],
      ['&amp;', '&amp;amp;'],
      ['\u2028\u2029\u0000', '\u2028\u2029\u0000'],
      ['ünïcödé ✓', 'ünïcödé ✓'],
    ];
    for (const [input, expected] of cases) {
      expect(escapeHtmlBody(input)).toBe(expected);
    }
  });
});

// -----------------------------------------------------------------------------
// escapeJsString
// -----------------------------------------------------------------------------

describe('escapeJsString', () => {
  it('escapes backslashes before anything else', () => {
    expect(escapeJsString('a\\b')).toBe('a\\\\b');
    expect(escapeJsString('\\n')).toBe('\\\\n');
  });

  it('escapes both quote styles and the backtick', () => {
    expect(escapeJsString(`'"\``)).toBe(`\\'\\"\\\``);
  });

  it('escapes newline and carriage return', () => {
    expect(escapeJsString('a\nb\r\nc')).toBe('a\\nb\\r\\nc');
  });

  // The critical part: no interpolated value may close the <script> element.
  it('escapes angle brackets and ampersand as unicode escapes', () => {
    expect(escapeJsString('</script>')).toBe('\\u003c/script\\u003e');
    expect(escapeJsString('a & b < c')).toBe('a \\u0026 b \\u003c c');
  });

  it('escapes the JS line terminators U+2028 and U+2029', () => {
    expect(escapeJsString('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
  });

  it('escapes NUL and other control characters', () => {
    expect(escapeJsString('a\u0000b')).toBe('a\\u0000b');
    expect(escapeJsString('\u0001\u001f\u007f')).toBe('\\u0001\\u001f\\u007f');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeJsString('hello world 123')).toBe('hello world 123');
    expect(escapeJsString('')).toBe('');
  });

  it('produces a value that survives a round trip through JSON.parse', () => {
    // JSON is a subset of the JavaScript string grammar, so parsing the escaped
    // value as JSON proves it decodes back to exactly the input. (Single quotes
    // are excluded only because `\'` is legal JavaScript but not legal JSON.)
    const raw = 'a & b < c </script> \u2028\u2029 "q" \\ back\n\t';
    const source = `"${escapeJsString(raw)}"`;
    expect(JSON.parse(source)).toBe(raw);
  });
});

// -----------------------------------------------------------------------------
// escapeCssValue
// -----------------------------------------------------------------------------

describe('escapeCssValue', () => {
  it('leaves value-only characters untouched', () => {
    expect(escapeCssValue('red')).toBe('red');
    expect(escapeCssValue('12px')).toBe('12px');
    expect(escapeCssValue('1.5em')).toBe('1.5em');
    expect(escapeCssValue('#fff')).toBe('#fff');
    expect(escapeCssValue('50%')).toBe('50%');
    expect(escapeCssValue('bold italic')).toBe('bold italic');
    expect(escapeCssValue('a, b, c')).toBe('a, b, c');
    expect(escapeCssValue('')).toBe('');
  });

  it('escapes the characters that would close a style element', () => {
    // `/` is escaped too: it is half of a CSS comment opener.
    expect(escapeCssValue('</style>')).toBe('\\00003c \\00002f style\\00003e ');
  });

  it('escapes declaration and rule structure', () => {
    expect(escapeCssValue('red; background: url(x)')).toBe(
      'red\\00003b  background\\00003a  url\\000028 x\\000029 '
    );
    expect(escapeCssValue('}')).toBe('\\00007d ');
    expect(escapeCssValue('{')).toBe('\\00007b ');
    expect(escapeCssValue('@import "x"')).toBe(
      '\\000040 import \\000022 x\\000022 '
    );
  });

  it('escapes quotes, comments and backslashes', () => {
    expect(escapeCssValue('"')).toBe('\\000022 ');
    expect(escapeCssValue("'")).toBe('\\000027 ');
    expect(escapeCssValue('/*')).toBe('\\00002f \\00002a ');
    expect(escapeCssValue('\\')).toBe('\\00005c ');
  });

  it('escapes newlines and control characters', () => {
    expect(escapeCssValue('a\nb')).toBe('a\\00000a b');
    expect(escapeCssValue('a\u0000b')).toBe('a\\000000 b');
  });

  it('escapes non-ASCII losslessly', () => {
    expect(escapeCssValue('é')).toBe('\\0000e9 ');
    // Astral characters are escaped as a single code point, not two units.
    expect(escapeCssValue('\u{1F600}')).toBe('\\01f600 ');
  });

  it('always terminates a hex escape so the next character survives', () => {
    // Six hex digits plus the terminating space: CSS consumes the space as part
    // of the escape, so `< b` keeps its space rather than losing it.
    expect(escapeCssValue('< b')).toBe('\\00003c  b');
  });
});

// -----------------------------------------------------------------------------
// escapeCommentText
// -----------------------------------------------------------------------------

describe('escapeCommentText', () => {
  it('leaves ordinary comment text untouched', () => {
    expect(escapeCommentText('a normal comment')).toBe('a normal comment');
    expect(escapeCommentText('')).toBe('');
  });

  it('breaks up double hyphens so a comment cannot be closed early', () => {
    expect(escapeCommentText('a --> b')).toBe('a - -> b');
    // The trailing space is the "must not end in a hyphen" rule, applied after.
    expect(escapeCommentText('<!--')).toBe('<!- - ');
    expect(escapeCommentText('---')).toBe('- - - ');
    expect(escapeCommentText('a--!>b')).toBe('a- -!>b');
  });

  it('never leaves the text ending in a hyphen', () => {
    expect(escapeCommentText('trailing-')).toBe('trailing- ');
    expect(escapeCommentText('<!-')).toBe('<!- ');
  });

  it('never lets the text start with > or ->', () => {
    expect(escapeCommentText('>oops')).toBe(' >oops');
    expect(escapeCommentText('->oops')).toBe(' ->oops');
  });

  it('produces text containing no comment-terminating sequence', () => {
    const hostile = '--> <!-- --!> ---';
    const escaped = escapeCommentText(hostile);
    expect(escaped).not.toContain('--');
  });
});

// -----------------------------------------------------------------------------
// serializeJsonForScript
// -----------------------------------------------------------------------------

describe('serializeJsonForScript', () => {
  it('serialises ordinary values as JSON', () => {
    expect(serializeJsonForScript({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    expect(serializeJsonForScript([1, 2, 3])).toBe('[1,2,3]');
    expect(serializeJsonForScript('hi')).toBe('"hi"');
    expect(serializeJsonForScript(null)).toBe('null');
    expect(serializeJsonForScript(true)).toBe('true');
  });

  // The headline case: a `</script>` in the data must not close the element.
  it('escapes a </script> breakout inside a string', () => {
    expect(serializeJsonForScript({ a: '</script>' })).toBe(
      '{"a":"\\u003c/script\\u003e"}'
    );
  });

  it('escapes angle brackets and ampersands anywhere in the payload', () => {
    expect(serializeJsonForScript('a & b < c > d')).toBe(
      '"a \\u0026 b \\u003c c \\u003e d"'
    );
  });

  it('escapes U+2028 and U+2029 which are literal in JSON but not in JS', () => {
    expect(serializeJsonForScript('a\u2028b\u2029c')).toBe(
      '"a\\u2028b\\u2029c"'
    );
  });

  it('escapes keys as well as values', () => {
    expect(serializeJsonForScript({ '</script>': 1 })).toBe(
      '{"\\u003c/script\\u003e":1}'
    );
  });

  it('round-trips through JSON.parse unchanged', () => {
    const data = {
      html: '</script><img src=x onerror=alert(1)>',
      sep: 'a\u2028b',
      amp: 'a & b',
    };
    expect(JSON.parse(serializeJsonForScript(data))).toEqual(data);
  });

  it('produces a string containing no raw < > or &', () => {
    const out = serializeJsonForScript({ x: '<&>' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
  });

  it('emits null for values JSON cannot represent', () => {
    expect(serializeJsonForScript(undefined)).toBe('null');
    expect(serializeJsonForScript(() => 1)).toBe('null');
  });
});

// -----------------------------------------------------------------------------
// sanitizeUrlAttribute
// -----------------------------------------------------------------------------

describe('sanitizeUrlAttribute', () => {
  const allows = (url: string, expected = url) => {
    expect(sanitizeUrlAttribute(url)).toEqual({
      safe: expected,
      blocked: false,
    });
  };
  const blocks = (url: string) => {
    expect(sanitizeUrlAttribute(url)).toEqual({
      safe: BLOCKED_URL,
      blocked: true,
    });
  };

  it('allows the http family', () => {
    allows('http://example.com/a?b=1#c');
    allows('https://example.com');
    allows('HTTPS://EXAMPLE.COM');
    allows('ftp://files.example.com/x');
  });

  it('allows mailto and tel', () => {
    allows('mailto:someone@example.com');
    allows('tel:+15551234567');
  });

  it('allows protocol-relative, root-relative, relative and fragment URLs', () => {
    allows('//cdn.example.com/a.js');
    allows('/assets/logo.png');
    allows('assets/logo.png');
    allows('./a/b');
    allows('../a/b');
    allows('#section');
    allows('?q=1');
    allows('');
  });

  // (b) in the audit: escaping is structurally the wrong defence here, because
  // the payload contains no HTML-special character at all.
  it('blocks javascript: URLs', () => {
    blocks('javascript:alert(1)');
    blocks('JavaScript:alert(1)');
    blocks('  javascript:alert(1)  ');
  });

  it('blocks the NUL evasion java\\x00script:', () => {
    blocks('java\u0000script:alert(1)');
  });

  it('blocks the tab evasion jav\\tascript:', () => {
    blocks('jav\tascript:alert(1)');
  });

  it('blocks newline and carriage-return evasions', () => {
    blocks('jav\nascript:alert(1)');
    blocks('jav\rascript:alert(1)');
    blocks('java\u000bscript:alert(1)');
  });

  it('blocks other executable or unexpected schemes', () => {
    blocks('vbscript:msgbox(1)');
    blocks('file:///etc/passwd');
    blocks('blob:https://example.com/uuid');
    blocks('about:blank');
    blocks('chrome://settings');
    blocks('custom-scheme:whatever');
  });

  it('allows data: URLs for raster image types only', () => {
    allows('data:image/png;base64,iVBORw0KGgo=');
    allows('data:image/gif;base64,R0lGOD');
    allows('data:image/jpeg;base64,/9j/4AA');
    allows('data:image/webp;base64,UklGR');
    allows('data:image/avif;base64,AAAA');
    allows('DATA:IMAGE/PNG;base64,iVBORw0KGgo=');
  });

  it('blocks data:text/html', () => {
    blocks('data:text/html,<script>alert(1)</script>');
    blocks('data:text/html;base64,PHNjcmlwdD4=');
  });

  // SVG in a data: URL is a script execution sink, not an inert image.
  it('blocks data:image/svg+xml', () => {
    blocks('data:image/svg+xml,<svg onload=alert(1)>');
    blocks('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('blocks a malformed data: URL with no comma', () => {
    blocks('data:image/png;base64');
  });

  it('blocks a data: URL whose type is smuggled past control characters', () => {
    blocks('data:\u0000text/html,<script>alert(1)</script>');
    blocks('da\tta:text/html,x');
  });

  it('returns the stripped value, so what is emitted is what was validated', () => {
    expect(sanitizeUrlAttribute('  https://example.com/a\u0000b  ')).toEqual({
      safe: 'https://example.com/ab',
      blocked: false,
    });
  });

  it('blocks a relative-looking path whose first segment parses as a scheme', () => {
    // `foo:bar` is a valid absolute URL with scheme `foo`, not a relative path.
    blocks('foo:bar');
  });

  it('does not mistake a colon later in a relative path for a scheme', () => {
    allows('a/b:c');
    allows('./a:b');
  });
});

// -----------------------------------------------------------------------------
// escapeForContext
// -----------------------------------------------------------------------------

describe('escapeForContext', () => {
  it('routes html-body to escapeHtmlBody', () => {
    expect(escapeForContext('a & b', 'html-body')).toBe(
      escapeHtmlBody('a & b')
    );
  });

  it('routes attr-value to escapeHtmlBody', () => {
    expect(escapeForContext('a " b', 'attr-value')).toBe(
      escapeHtmlBody('a " b')
    );
  });

  it('routes raw-text-js to escapeJsString', () => {
    expect(escapeForContext('a & b', 'raw-text-js')).toBe(
      escapeJsString('a & b')
    );
    expect(escapeForContext('a & b', 'raw-text-js')).toBe('a \\u0026 b');
  });

  it('routes raw-text-css to escapeCssValue', () => {
    expect(escapeForContext('a; b', 'raw-text-css')).toBe(
      escapeCssValue('a; b')
    );
  });

  it('routes comment to escapeCommentText', () => {
    expect(escapeForContext('a --> b', 'comment')).toBe('a - -> b');
  });

  it('sanitises then HTML-escapes a url-attr value', () => {
    expect(escapeForContext('https://example.com/?a=1&b=2', 'url-attr')).toBe(
      'https://example.com/?a=1&amp;b=2'
    );
    expect(escapeForContext('javascript:alert(1)', 'url-attr')).toBe(
      BLOCKED_URL
    );
  });

  it('never HTML-escapes a raw text sink', () => {
    // (a) in the audit: entity escaping inside <script>/<style> corrupts data
    // because browsers do not decode entities there.
    expect(escapeForContext('a & b < c', 'raw-text-js')).not.toContain('&amp;');
    expect(escapeForContext('a & b < c', 'raw-text-css')).not.toContain(
      '&amp;'
    );
  });
});

// -----------------------------------------------------------------------------
// Context selection
// -----------------------------------------------------------------------------

describe('escapeContextForAttribute', () => {
  it('selects url-attr for URL-valued attributes', () => {
    expect(escapeContextForAttribute('href')).toBe('url-attr');
    expect(escapeContextForAttribute('SRC')).toBe('url-attr');
    expect(escapeContextForAttribute('xlink:href')).toBe('url-attr');
    expect(escapeContextForAttribute('formaction')).toBe('url-attr');
  });

  it('selects attr-value for everything else', () => {
    expect(escapeContextForAttribute('class')).toBe('attr-value');
    expect(escapeContextForAttribute('title')).toBe('attr-value');
  });
});

describe('escapeContextForElementText', () => {
  it('selects the JS sink inside script', () => {
    expect(escapeContextForElementText('script')).toBe('raw-text-js');
    expect(escapeContextForElementText('SCRIPT')).toBe('raw-text-js');
  });

  it('selects the CSS sink inside style', () => {
    expect(escapeContextForElementText('style')).toBe('raw-text-css');
    expect(escapeContextForElementText('Style')).toBe('raw-text-css');
  });

  it('selects html-body inside escapable raw text elements', () => {
    // Entities ARE decoded inside <textarea>/<title>, so ordinary body
    // escaping is exactly right there and anything else would be wrong.
    expect(escapeContextForElementText('textarea')).toBe('html-body');
    expect(escapeContextForElementText('title')).toBe('html-body');
  });

  it('selects html-body for ordinary elements', () => {
    expect(escapeContextForElementText('div')).toBe('html-body');
    expect(escapeContextForElementText('p')).toBe('html-body');
  });
});
