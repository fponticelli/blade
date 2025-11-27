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
      const ast = await compile('Email: user\\@example.com');
      const result = render(ast, {});
      expect(result.html).toContain('user@example.com');
    });

    it('renders \\$ as literal $', async () => {
      const ast = await compile('Price: \\$100');
      const result = render(ast, {});
      expect(result.html).toContain('$100');
    });

    it('renders \\\\ as literal \\', async () => {
      const ast = await compile('Path: C:\\\\Users');
      const result = render(ast, {});
      expect(result.html).toContain('C:\\Users');
    });

    it('handles multiple escape sequences', async () => {
      const ast = await compile('\\@user paid \\$50');
      const result = render(ast, {});
      expect(result.html).toContain('@user paid $50');
    });

    it('handles backslash at end of template', async () => {
      const ast = await compile('trailing\\');
      const result = render(ast, {});
      expect(result.html).toContain('trailing\\');
    });

    it('handles backslash followed by non-special char', async () => {
      const ast = await compile('test\\n value');
      const result = render(ast, {});
      expect(result.html).toContain('test\\n value');
    });
  });

  describe('Invalid directive handling', () => {
    it('renders @example as literal text (invalid directive)', async () => {
      const ast = await compile('<p>Tweet @mentions</p>');
      const result = render(ast, {});
      expect(result.html).toContain('@mentions');
    });

    it('renders @anything as literal text', async () => {
      const ast = await compile('Contact: @support');
      const result = render(ast, {});
      expect(result.html).toContain('@support');
    });
  });

  describe('Invalid variable handling', () => {
    it('renders $123 as literal text ($ not followed by letter)', async () => {
      const ast = await compile('Price: $100');
      const result = render(ast, {});
      expect(result.html).toContain('$100');
    });

    it('renders $! as literal text', async () => {
      const ast = await compile('Cost: $!');
      const result = render(ast, {});
      expect(result.html).toContain('$!');
    });

    it('renders $ followed by space as literal', async () => {
      const ast = await compile('Amount: $ 50');
      const result = render(ast, {});
      expect(result.html).toContain('$ 50');
    });
  });

  describe('Escapes in attribute values', () => {
    it('processes escapes in attribute values', async () => {
      const ast = await compile(
        '<a href="mailto:user\\@example.com">Email</a>'
      );
      const result = render(ast, {});
      expect(result.html).toContain('user@example.com');
    });

    it('handles $ in attribute values', async () => {
      const ast = await compile('<span data-price="\\$99">Price</span>');
      const result = render(ast, {});
      expect(result.html).toContain('$99');
    });
  });

  describe('Combined with valid syntax', () => {
    it('mixes escaped and real directives', async () => {
      const ast = await compile('@if(true)Hello\\@world@endif');
      const result = render(ast, {});
      expect(result.html).toContain('Hello@world');
    });

    it('mixes escaped and real variables', async () => {
      const ast = await compile('Cost: \\$50 for {$item}', {
        projectRoot: undefined,
      });
      const result = render(ast, { item: 'widget' });
      expect(result.html).toContain('$50');
      expect(result.html).toContain('widget');
    });
  });
});
