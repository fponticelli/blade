/**
 * Escape Sequence Tests
 *
 * Tests for escape sequences in Blade templates.
 */

import { describe, it, expect } from 'vitest';
import { compile, render } from '../src/index.js';

describe('Escape Sequences', () => {
  describe('Tokenizer escape handling', () => {
    it('renders \\@ as literal @', async () => {
      const ast = compile('Email: user\\@example.com');
      const result = render(ast, {});
      expect(result.html).toContain('user@example.com');
    });

    it('renders \\$ as literal $', async () => {
      const ast = compile('Price: \\$100');
      const result = render(ast, {});
      expect(result.html).toContain('$100');
    });

    it('renders \\\\ as literal \\', async () => {
      const ast = compile('Path: C:\\\\Users');
      const result = render(ast, {});
      expect(result.html).toContain('C:\\Users');
    });

    it('handles multiple escape sequences', async () => {
      const ast = compile('\\@user paid \\$50');
      const result = render(ast, {});
      expect(result.html).toContain('@user paid $50');
    });

    it('handles backslash at end of template', async () => {
      const ast = compile('trailing\\');
      const result = render(ast, {});
      expect(result.html).toContain('trailing\\');
    });

    it('handles backslash followed by non-special char', async () => {
      const ast = compile('test\\n value');
      const result = render(ast, {});
      expect(result.html).toContain('test\\n value');
    });
  });

  describe('Invalid directive handling', () => {
    it('renders @example as literal text (invalid directive)', async () => {
      const ast = compile('<p>Tweet @mentions</p>');
      const result = render(ast, {});
      expect(result.html).toContain('@mentions');
    });

    it('renders @anything as literal text', async () => {
      const ast = compile('Contact: @support');
      const result = render(ast, {});
      expect(result.html).toContain('@support');
    });
  });

  describe('Invalid variable handling', () => {
    it('renders $123 as literal text ($ not followed by letter)', async () => {
      const ast = compile('Price: $100');
      const result = render(ast, {});
      expect(result.html).toContain('$100');
    });

    it('renders $! as literal text', async () => {
      const ast = compile('Cost: $!');
      const result = render(ast, {});
      expect(result.html).toContain('$!');
    });

    it('renders $ followed by space as literal', async () => {
      const ast = compile('Amount: $ 50');
      const result = render(ast, {});
      expect(result.html).toContain('$ 50');
    });
  });

  describe('Escapes in attribute values', () => {
    it('processes escapes in attribute values', async () => {
      const ast = compile('<a href="mailto:user\\@example.com">Email</a>');
      const result = render(ast, {});
      expect(result.html).toContain('user@example.com');
    });

    it('handles $ in attribute values', async () => {
      const ast = compile('<span data-price="\\$99">Price</span>');
      const result = render(ast, {});
      expect(result.html).toContain('$99');
    });
  });

  describe('Unsafe/raw HTML interpolation', () => {
    it('renders $!variable without HTML escaping', async () => {
      const ast = compile('Content: $!content');
      const result = render(ast, { content: '<b>bold</b>' });
      expect(result.html).toBe('Content: <b>bold</b>');
    });

    it('renders $!{expression} without HTML escaping', async () => {
      const ast = compile('Content: $!{content}');
      const result = render(ast, { content: '<em>italic</em>' });
      expect(result.html).toBe('Content: <em>italic</em>');
    });

    it('renders dotted path $!data.bio without escaping', async () => {
      const ast = compile('Bio: $!data.bio');
      const result = render(ast, { data: { bio: '<p>Hello</p>' } });
      expect(result.html).toBe('Bio: <p>Hello</p>');
    });

    it('still escapes regular expressions alongside unsafe ones', async () => {
      const ast = compile('Safe: $safe, Raw: $!raw');
      const result = render(ast, {
        safe: '<script>bad</script>',
        raw: '<b>good</b>',
      });
      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).toContain('<b>good</b>');
    });

    it('does not treat $! without identifier as unsafe', async () => {
      const ast = compile('Cost: $!');
      const result = render(ast, {});
      expect(result.html).toContain('$!');
    });

    it('preserves ${!expr} as logical NOT (not unsafe)', async () => {
      const ast = compile('${!isHidden}');
      const result = render(ast, { isHidden: false });
      expect(result.html).toBe('true');
    });

    it('handles $!{expression} with helper calls', async () => {
      const ast = compile('$!{content}');
      const result = render(ast, { content: '<div>block</div>' });
      expect(result.html).toBe('<div>block</div>');
    });
  });

  describe('Combined with valid syntax', () => {
    it('mixes escaped and real directives', async () => {
      const ast = compile('@if(true)Hello\\@world@endif');
      const result = render(ast, {});
      expect(result.html).toContain('Hello@world');
    });

    it('mixes escaped and real variables', async () => {
      const ast = compile('Cost: \\$50 for {$item}', {
        projectRoot: undefined,
      });
      const result = render(ast, { item: 'widget' });
      expect(result.html).toContain('$50');
      expect(result.html).toContain('widget');
    });
  });
});
