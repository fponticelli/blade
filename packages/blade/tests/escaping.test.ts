/**
 * Escape sequences, and the diagnostics that go with them.
 *
 * Two things were wrong with this file.
 *
 * The first: it asserted that `@if(true)Hello\@world@endif` CONTAINED
 * `Hello@world`, and it did - because Blade's directives are brace-delimited,
 * `@endif` is not a directive at all, and the whole construct failed to parse
 * and degraded to literal text. Three error diagnostics, and an assertion that
 * passed. A test that cannot tell a working directive from a broken one is not
 * evidence of anything, and the broken form is now a NEGATIVE test that pins
 * the diagnostics by name.
 *
 * The second, which is what let the first survive: not one of the twenty-two
 * tests here looked at `result.diagnostics`. Every positive-path assertion now
 * goes through {@link ./support/render-ok.js#renderOk}, which fails the test
 * unless the compile was completely clean before it renders - so "it produced
 * the right characters" can no longer stand in for "it compiled".
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler/index.js';
import { compileOk, diagnosticCodes, htmlOk } from './support/render-ok.js';

describe('escape sequences', () => {
  describe('in text', () => {
    it('renders \\@ as a literal @', () => {
      expect(htmlOk('Email: user\\@example.com')).toBe(
        'Email: user@example.com'
      );
    });

    it('renders \\$ as a literal $', () => {
      expect(htmlOk('Price: \\$100')).toBe('Price: $100');
    });

    it('renders \\\\ as a literal backslash', () => {
      expect(htmlOk('Path: C:\\\\Users')).toBe('Path: C:\\Users');
    });

    it('handles several escapes in one template', () => {
      expect(htmlOk('\\@user paid \\$50')).toBe('@user paid $50');
    });

    it('keeps a trailing backslash', () => {
      expect(htmlOk('trailing\\')).toBe('trailing\\');
    });

    it('keeps a backslash before an ordinary character', () => {
      expect(htmlOk('test\\n value')).toBe('test\\n value');
    });
  });

  describe('an @ that is not a directive', () => {
    it('renders @mentions as text', () => {
      expect(htmlOk('<p>Tweet @mentions</p>')).toBe('<p>Tweet @mentions</p>');
    });

    it('renders @support as text', () => {
      expect(htmlOk('Contact: @support')).toBe('Contact: @support');
    });
  });

  describe('a $ that is not an interpolation', () => {
    it('renders $100 as text', () => {
      expect(htmlOk('Price: $100')).toBe('Price: $100');
    });

    it('renders a bare $! as text', () => {
      expect(htmlOk('Cost: $!')).toBe('Cost: $!');
    });

    it('renders $ followed by a space as text', () => {
      expect(htmlOk('Amount: $ 50')).toBe('Amount: $ 50');
    });
  });

  describe('in attribute values', () => {
    it('processes an escape', () => {
      expect(htmlOk('<a href="mailto:user\\@example.com">Email</a>')).toBe(
        '<a href="mailto:user@example.com">Email</a>'
      );
    });

    it('processes an escaped dollar', () => {
      expect(htmlOk('<span data-price="\\$99">Price</span>')).toBe(
        '<span data-price="$99">Price</span>'
      );
    });
  });

  describe('raw interpolation', () => {
    it('renders $!variable without escaping', () => {
      expect(htmlOk('Content: $!content', { content: '<b>bold</b>' })).toBe(
        'Content: <b>bold</b>'
      );
    });

    it('renders $!{expression} without escaping', () => {
      expect(
        htmlOk('Content: $!{content}', { content: '<em>italic</em>' })
      ).toBe('Content: <em>italic</em>');
    });

    it('renders a dotted path without escaping', () => {
      expect(htmlOk('Bio: $!data.bio', { data: { bio: '<p>Hello</p>' } })).toBe(
        'Bio: <p>Hello</p>'
      );
    });

    it('still escapes the ordinary interpolations beside it', () => {
      expect(
        htmlOk('Safe: $safe, Raw: $!raw', {
          safe: '<script>bad</script>',
          raw: '<b>good</b>',
        })
      ).toBe('Safe: &lt;script&gt;bad&lt;/script&gt;, Raw: <b>good</b>');
    });

    it('reads ${!expr} as a logical NOT, not as a raw interpolation', () => {
      expect(htmlOk('${!isHidden}', { isHidden: false })).toBe('true');
    });
  });

  describe('mixed with real syntax', () => {
    it('escapes an @ inside a directive body', () => {
      // The brace-delimited form, which is the one Blade actually has. The
      // trailing space is the whitespace before the closing brace: a block
      // body keeps it, and this test says so rather than reaching for
      // `toContain` to avoid the question.
      expect(htmlOk('@if(true) { Hello\\@world }')).toBe('Hello@world ');
    });

    it('mixes an escaped dollar with a real interpolation', () => {
      expect(htmlOk('Cost: \\$50 for {$item}', { item: 'widget' })).toBe(
        'Cost: $50 for {widget}'
      );
    });
  });
});

// =============================================================================
// The negative path
//
// Every test above asserts a clean compile. These assert the opposite, by name:
// a construct that does not exist has to be REPORTED, and the fact that it
// degrades to readable text is not a substitute for reporting it.
// =============================================================================

describe('diagnostics', () => {
  it('reports @endif, which is not a directive in this language', () => {
    // The exact template the old "mixes escaped and real directives" test used.
    // It renders text that contains `Hello@world`, which is why a `toContain`
    // assertion passed - and it does not compile.
    const source = '@if(true)Hello\\@world@endif';

    expect(diagnosticCodes(source)).toEqual([
      'error:PARSE_ERROR',
      'error:PARSE_ERROR',
    ]);

    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.diagnostics[0].message).toContain("Expected '{'");
    // A renderer factory structurally cannot be handed this, which is the
    // other half of why the old assertion was misleading: the thing it
    // measured was never a render of a working template.
    expect('template' in result).toBe(false);
  });

  it('reports an @if whose block is never closed', () => {
    expect(diagnosticCodes('@if(x) {')).toEqual(['error:PARSE_ERROR']);

    const result = compile('@if(x) {');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.diagnostics[0].message).toContain("Expected '}'");
    expect(result.diagnostics[0].location.start.line).toBe(1);
  });

  it('reports an @for whose header is never closed', () => {
    expect(diagnosticCodes('@for(x of xs { <i>${x}</i> }')).toContain(
      'error:PARSE_ERROR'
    );
  });

  it('accepts the same @if once its block is closed', () => {
    // The control for the two above: the diagnostics are about the mistake,
    // not about the shape of the construct.
    expect(compileOk('@if(x) { <i>y</i> }')).toBeDefined();
  });
});
