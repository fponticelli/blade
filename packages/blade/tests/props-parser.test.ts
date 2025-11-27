import { describe, it, expect } from 'vitest';
import { parseProps } from '../src/parser/props-parser.js';

describe('PropsParser', () => {
  describe('basic parsing', () => {
    it('returns undefined directive when no @props present', () => {
      const result = parseProps('<div>Hello</div>');
      expect(result.directive).toBeUndefined();
      expect(result.remainingSource).toBe('<div>Hello</div>');
      expect(result.remainingOffset).toBe(0);
    });

    it('parses empty @props()', () => {
      const result = parseProps('@props()\n<div>Hello</div>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(0);
      expect(result.remainingSource).toBe('<div>Hello</div>');
    });

    it('parses single required prop', () => {
      const result = parseProps('@props(label)\n<button>{$label}</button>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(1);
      expect(result.directive!.props[0]).toMatchObject({
        name: 'label',
        required: true,
        defaultValue: undefined,
      });
    });

    it('parses multiple required props', () => {
      const result = parseProps(
        '@props(label, href, target)\n<a href={$href}>{$label}</a>'
      );
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(3);
      expect(result.directive!.props[0]!.name).toBe('label');
      expect(result.directive!.props[1]!.name).toBe('href');
      expect(result.directive!.props[2]!.name).toBe('target');
      expect(result.directive!.props.every(p => p.required)).toBe(true);
    });
  });

  describe('optional props with ? suffix', () => {
    it('parses optional prop with ? suffix', () => {
      const result = parseProps('@props(title?)\n<h1>{$title}</h1>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]).toMatchObject({
        name: 'title',
        required: false,
        defaultValue: undefined,
      });
    });

    it('parses mixed required and optional props', () => {
      const result = parseProps('@props(title, subtitle?, items)\n<div></div>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(3);
      expect(result.directive!.props[0]!.required).toBe(true);
      expect(result.directive!.props[1]!.required).toBe(false);
      expect(result.directive!.props[2]!.required).toBe(true);
    });
  });

  describe('default values', () => {
    it('parses prop with boolean default', () => {
      const result = parseProps('@props(disabled = false)\n<button></button>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]).toMatchObject({
        name: 'disabled',
        required: false,
      });
      expect(result.directive!.props[0]!.defaultValue).toBeDefined();
    });

    it('parses prop with string default', () => {
      const result = parseProps('@props(size = "medium")\n<button></button>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]).toMatchObject({
        name: 'size',
        required: false,
      });
      expect(result.directive!.props[0]!.defaultValue).toBeDefined();
    });

    it('parses prop with number default', () => {
      const result = parseProps('@props(count = 0)\n<span>{$count}</span>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]).toMatchObject({
        name: 'count',
        required: false,
      });
    });

    it('parses prop with null default', () => {
      const result = parseProps('@props(items = null)\n<ul></ul>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]).toMatchObject({
        name: 'items',
        required: false,
      });
    });

    it('parses mixed required, optional, and default props', () => {
      const result = parseProps(
        '@props(label, disabled?, size = "medium")\n<button></button>'
      );
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(3);
      expect(result.directive!.props[0]!.required).toBe(true);
      expect(result.directive!.props[1]!.required).toBe(false);
      expect(result.directive!.props[2]!.required).toBe(false);
      expect(result.directive!.props[2]!.defaultValue).toBeDefined();
    });
  });

  describe('whitespace handling', () => {
    it('handles whitespace before @props', () => {
      const result = parseProps('  \n  @props(label)\n<div></div>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]!.name).toBe('label');
    });

    it('handles whitespace around props', () => {
      const result = parseProps('@props(  label  ,  href  )\n<a></a>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(2);
    });

    it('handles whitespace around equals sign', () => {
      const result = parseProps(
        '@props(disabled  =  false)\n<button></button>'
      );
      expect(result.directive).toBeDefined();
      expect(result.directive!.props[0]!.required).toBe(false);
    });

    it('handles trailing comma', () => {
      const result = parseProps('@props(label, href,)\n<a></a>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.props).toHaveLength(2);
    });
  });

  describe('remaining source', () => {
    it('returns correct remaining source', () => {
      const result = parseProps('@props(label)\n\n<div>{$label}</div>');
      expect(result.remainingSource).toBe('<div>{$label}</div>');
    });

    it('handles props on same line as content', () => {
      const result = parseProps('@props(x) <div></div>');
      expect(result.remainingSource).toBe('<div></div>');
    });
  });

  describe('error handling', () => {
    it('returns warning for missing opening paren', () => {
      const result = parseProps('@props label)\n<div></div>');
      expect(result.directive).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.remainingSource).toBe('@props label)\n<div></div>');
    });

    it('returns warning for missing closing paren', () => {
      const result = parseProps('@props(label\n<div></div>');
      expect(result.directive).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('returns warning for invalid characters in prop name', () => {
      const result = parseProps('@props(123invalid)\n<div></div>');
      expect(result.directive).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('location tracking', () => {
    it('tracks prop locations correctly', () => {
      const result = parseProps('@props(label)\n<div></div>');
      expect(result.directive).toBeDefined();
      const prop = result.directive!.props[0]!;
      expect(prop.location.start.line).toBe(1);
      expect(prop.location.start.column).toBeGreaterThan(0);
    });

    it('tracks directive location correctly', () => {
      const result = parseProps('@props(label)\n<div></div>');
      expect(result.directive).toBeDefined();
      expect(result.directive!.location.start.line).toBe(1);
      expect(result.directive!.location.start.column).toBe(1);
    });
  });
});
