/**
 * Tests for @props validation against schema
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  validatePropsAgainstSchema,
  generatePropsValidationDiagnostics,
  initializeProjectContext,
  createDocument,
} from '../../src/lsp/index.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('@props Schema Validation', () => {
  describe('validatePropsAgainstSchema', () => {
    it('returns empty for props matching schema', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).not.toBeNull();

      // Props that exist in schema.json (user, items, settings)
      const content = '@props(user, items)\n<div>${user.name}</div>';
      const errors = validatePropsAgainstSchema(content, context!);

      expect(errors).toHaveLength(0);
    });

    it('returns error for prop not in schema', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      // Prop 'unknown' doesn't exist in schema
      const content = '@props(user, unknown)\n<div>${user.name}</div>';
      const errors = validatePropsAgainstSchema(content, context!);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.propName).toBe('unknown');
      expect(errors[0]!.message).toContain('not defined in schema.json');
    });

    it('returns multiple errors for multiple unknown props', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      const content = '@props(foo, bar, user)\n<div></div>';
      const errors = validatePropsAgainstSchema(content, context!);

      // 'foo' and 'bar' don't exist, 'user' does
      expect(errors).toHaveLength(2);
      expect(errors.map(e => e.propName)).toContain('foo');
      expect(errors.map(e => e.propName)).toContain('bar');
    });

    it('returns empty when no @props directive', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      const content = '<div>No props here</div>';
      const errors = validatePropsAgainstSchema(content, context!);

      expect(errors).toHaveLength(0);
    });

    it('returns empty when no schema', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).toBeNull();

      const content = '@props(whatever)\n<div></div>';
      const errors = validatePropsAgainstSchema(content, context!);

      expect(errors).toHaveLength(0);
    });

    it('includes location information', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      const content = '@props(unknown)\n<div></div>';
      const errors = validatePropsAgainstSchema(content, context!);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(1);
      expect(errors[0]!.column).toBeGreaterThan(0);
    });
  });

  describe('generatePropsValidationDiagnostics', () => {
    it('generates LSP diagnostics for invalid props', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      const content = '@props(invalid)\n<div></div>';
      const doc = createDocument('test://test.blade', content);
      const diagnostics = generatePropsValidationDiagnostics(doc, context!);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.severity).toBe(2); // Warning
      expect(diagnostics[0]!.source).toBe('blade');
      expect(diagnostics[0]!.code).toBe('UNKNOWN_PROP');
      expect(diagnostics[0]!.message).toContain('invalid');
    });

    it('returns empty without project context', () => {
      const content = '@props(anything)\n<div></div>';
      const doc = createDocument('test://test.blade', content);
      const diagnostics = generatePropsValidationDiagnostics(doc, undefined);

      expect(diagnostics).toHaveLength(0);
    });

    it('includes correct range for diagnostic', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      const content = '@props(badprop)\n<div></div>';
      const doc = createDocument('test://test.blade', content);
      const diagnostics = generatePropsValidationDiagnostics(doc, context!);

      expect(diagnostics).toHaveLength(1);
      // LSP uses 0-indexed positions
      expect(diagnostics[0]!.range.start.line).toBe(0);
      expect(diagnostics[0]!.range.start.character).toBeGreaterThanOrEqual(0);
    });
  });
});
