import { describe, it, expect } from 'vitest';
import { compile } from '../../src/compiler/index.js';

/**
 * Tests for single-file compilation without project context.
 *
 * Note: Project-based validation (component resolution, prop validation)
 * is only available through compileProject() from the project module.
 * The compile() function is browser-safe and doesn't do filesystem operations.
 */
describe('Single file compilation', () => {
  describe('without project context', () => {
    it('compiles template with unknown components', () => {
      const source = '<div><Button label="Click" /></div>';

      const result = compile(source);

      // No project validation errors - unknown components are allowed
      const errors = result.diagnostics.filter(
        d => d.level === 'error' && d.message.includes('not found')
      );
      expect(errors).toHaveLength(0);
    });

    it('validates template-defined components', () => {
      const source = `<template:Button label!>
  <button>$label</button>
</template:Button>
<div><Button /></div>`;

      const result = compile(source, { validate: true });

      // Should report missing required prop for template-defined component
      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('Missing required prop');
    });

    it('passes when template component props provided', () => {
      const source = `<template:Button label!>
  <button>$label</button>
</template:Button>
<div><Button label="OK" /></div>`;

      const result = compile(source, { validate: true });

      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors).toHaveLength(0);
    });
  });
});
