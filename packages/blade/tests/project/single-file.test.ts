import { describe, it, expect } from 'vitest';
import { compile } from '../../src/compiler/index.js';
import type { CompileResult, Diagnostic } from '../../src/ast/types.js';

/** Every diagnostic a compile produced, whichever way it went. */
function diagnosticsOf(result: CompileResult): readonly Diagnostic[] {
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

/**
 * Tests for single-file compilation without project context.
 *
 * Component resolution against the filesystem is only available through
 * compileProject(); `compile()` is browser-safe and knows only the components
 * the template defines inline and the ones the caller declares.
 */
describe('Single file compilation', () => {
  describe('without project context', () => {
    it('compiles template with unknown components', () => {
      const source = '<div><Button label="Click" /></div>';

      const result = compile(source);

      // A component the compiler has never heard of cannot render, so it is an
      // error - but one about the component, not about the filesystem.
      expect(result.ok).toBe(false);
      expect(diagnosticsOf(result).map(d => d.code)).toContain(
        'UNKNOWN_COMPONENT'
      );
    });

    it('validates template-defined components', () => {
      const source = `<template:Button label!>
  <button>$label</button>
</template:Button>
<div><Button /></div>`;

      const result = compile(source);

      // Should report missing required prop for template-defined component
      const errors = diagnosticsOf(result).filter(d => d.level === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('Missing required prop');
    });

    it('passes when template component props provided', () => {
      const source = `<template:Button label!>
  <button>$label</button>
</template:Button>
<div><Button label="OK" /></div>`;

      const result = compile(source);

      const errors = diagnosticsOf(result).filter(d => d.level === 'error');
      expect(errors).toHaveLength(0);
    });
  });
});
