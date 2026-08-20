import { describe, it, expect } from 'vitest';
import { validateTemplate } from '../src/validation/index.js';
import type { ComponentRegistry } from '../src/validation/index.js';
import type { HelperRegistry } from '../src/evaluator/index.js';

describe('validateTemplate', () => {
  describe('parse error detection', () => {
    it('should return valid for a simple valid template', () => {
      const result = validateTemplate('<div>Hello</div>');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for template with expressions', () => {
      const result = validateTemplate('<div>$name</div>');
      expect(result.valid).toBe(true);
    });

    it('should detect parse errors in malformed templates', () => {
      // Unclosed expression
      const result = validateTemplate('<div>${</div>');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.code).toBe('PARSE_ERROR');
    });
  });

  describe('component validation', () => {
    it('should report unknown components when registry is provided', () => {
      const source =
        '<template:Known prop!><div>$prop</div></template:Known><Unknown />';
      const components: ComponentRegistry = {};
      const result = validateTemplate(source, { components });
      expect(result.valid).toBe(false);
      const unknownErr = result.errors.find(
        e => e.code === 'UNKNOWN_COMPONENT'
      );
      expect(unknownErr).toBeDefined();
      expect(unknownErr!.message).toContain('Unknown');
    });

    it('should not report inline template components as unknown', () => {
      const source =
        '<template:Card title!><div>$title</div></template:Card><Card title="Hello" />';
      const result = validateTemplate(source);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required props for inline components', () => {
      const source =
        '<template:Card title!><div>$title</div></template:Card><Card />';
      const result = validateTemplate(source);
      expect(result.valid).toBe(false);
      const missingProp = result.errors.find(
        e => e.code === 'MISSING_REQUIRED_PROP'
      );
      expect(missingProp).toBeDefined();
      expect(missingProp!.message).toContain('title');
    });

    it('should report missing required props for external components', () => {
      const components: ComponentRegistry = {
        Alert: {
          props: [
            { name: 'message', required: true },
            { name: 'type', required: false },
          ],
        },
      };
      const source = '<Alert type="info" />';
      const result = validateTemplate(source, { components });
      expect(result.valid).toBe(false);
      const missingProp = result.errors.find(
        e => e.code === 'MISSING_REQUIRED_PROP'
      );
      expect(missingProp).toBeDefined();
      expect(missingProp!.message).toContain('message');
    });

    it('should pass when all required props are provided', () => {
      const components: ComponentRegistry = {
        Alert: {
          props: [
            { name: 'message', required: true },
            { name: 'type', required: false },
          ],
        },
      };
      const source = '<Alert message="Hello" />';
      const result = validateTemplate(source, { components });
      expect(result.valid).toBe(true);
    });
  });

  describe('helper validation', () => {
    it('should warn about unknown helpers when registry is provided', () => {
      const helpers: HelperRegistry = {
        formatDate: () => () => 'formatted',
      };
      const source = '<div>${unknownHelper($value)}</div>';
      const result = validateTemplate(source, { helpers });
      expect(result.valid).toBe(true); // warnings don't make it invalid
      const helperWarning = result.warnings.find(
        w => w.code === 'UNKNOWN_HELPER'
      );
      expect(helperWarning).toBeDefined();
      expect(helperWarning!.message).toContain('unknownHelper');
    });

    it('should error on unknown helpers in strict mode', () => {
      const helpers: HelperRegistry = {
        formatDate: () => () => 'formatted',
      };
      const source = '<div>${unknownHelper($value)}</div>';
      const result = validateTemplate(source, { helpers, strict: true });
      expect(result.valid).toBe(false);
      const helperError = result.errors.find(e => e.code === 'UNKNOWN_HELPER');
      expect(helperError).toBeDefined();
    });

    it('should not warn about known helpers', () => {
      const helpers: HelperRegistry = {
        formatDate: () => () => 'formatted',
      };
      const source = '<div>${formatDate($value)}</div>';
      const result = validateTemplate(source, { helpers });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('schema validation', () => {
    it('should warn about unknown top-level properties in strict mode', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const source = '<div>$unknown</div>';
      const result = validateTemplate(source, { schema, strict: true });
      const propWarning = result.warnings.find(
        w => w.code === 'UNKNOWN_PROPERTY'
      );
      expect(propWarning).toBeDefined();
      expect(propWarning!.message).toContain('unknown');
    });

    it('should not warn about known schema properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const source = '<div>$name</div>';
      const result = validateTemplate(source, { schema, strict: true });
      expect(result.warnings).toHaveLength(0);
    });

    it('should not validate schema paths when not in strict mode', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const source = '<div>$unknown</div>';
      const result = validateTemplate(source, { schema, strict: false });
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('complex template validation', () => {
    it('should validate expressions in if conditions', () => {
      const helpers: HelperRegistry = {};
      const source = '@if(badHelper($x)) { <div>yes</div> }';
      const result = validateTemplate(source, { helpers, strict: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNKNOWN_HELPER')).toBe(true);
    });

    it('should validate expressions in for loops', () => {
      const source = '@for(item of $items) { <div>$item</div> }';
      const result = validateTemplate(source);
      expect(result.valid).toBe(true);
    });

    it('should validate expressions in attributes', () => {
      const helpers: HelperRegistry = {};
      const source = '<div class=${badHelper($x)}>content</div>';
      const result = validateTemplate(source, { helpers, strict: true });
      expect(result.valid).toBe(false);
    });

    it('should return valid true with no errors for an empty template', () => {
      const result = validateTemplate('');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
