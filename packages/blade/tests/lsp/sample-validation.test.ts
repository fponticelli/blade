import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  validateSamples,
  getProjectDiagnostics,
  initializeProjectContext,
} from '../../src/lsp/index.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('Sample Validation', () => {
  describe('validateSamples', () => {
    it('returns empty for project without schema', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const results = validateSamples(context!);

      expect(results).toHaveLength(0);
    });

    it('returns empty for project without samples', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const results = validateSamples(context!);

      expect(results).toHaveLength(0);
    });

    it('validates samples against schema', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).not.toBeNull();
      expect(context!.samples).not.toBeNull();

      const results = validateSamples(context!);

      // Should have results for all 3 sample files
      expect(results).toHaveLength(3);
    });

    it('detects type mismatch errors', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      const results = validateSamples(context!);
      const invalidTypeResult = results.find(
        r => r.sampleFile.name === 'invalid-type'
      );

      expect(invalidTypeResult).toBeDefined();
      expect(invalidTypeResult!.errors.length).toBeGreaterThan(0);

      // Check for email type error (number instead of string)
      const emailError = invalidTypeResult!.errors.find(e =>
        e.path.includes('email')
      );
      expect(emailError).toBeDefined();
      expect(emailError!.message).toContain('Type mismatch');
      expect(emailError!.expectedType).toBe('string');
      expect(emailError!.actualType).toBe('number');

      // Check for age type error (string instead of number)
      const ageError = invalidTypeResult!.errors.find(e =>
        e.path.includes('age')
      );
      expect(ageError).toBeDefined();
      expect(ageError!.message).toContain('Type mismatch');
    });

    it('detects enum validation errors', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      const results = validateSamples(context!);
      const invalidEnumResult = results.find(
        r => r.sampleFile.name === 'invalid-enum'
      );

      expect(invalidEnumResult).toBeDefined();
      expect(invalidEnumResult!.errors.length).toBeGreaterThan(0);

      // Check for status enum error
      const statusError = invalidEnumResult!.errors.find(e =>
        e.path.includes('status')
      );
      expect(statusError).toBeDefined();
      expect(statusError!.message).toContain('not one of allowed values');
    });

    it('passes validation for valid samples', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      const results = validateSamples(context!);
      const validResult = results.find(r => r.sampleFile.name === 'valid');

      expect(validResult).toBeDefined();
      expect(validResult!.errors).toHaveLength(0);
    });
  });

  describe('getProjectDiagnostics', () => {
    it('returns diagnostics grouped by file', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      const diagnostics = getProjectDiagnostics(context!);

      // Should have diagnostics for invalid-type.json and invalid-enum.json
      expect(diagnostics.size).toBe(2);

      // Should NOT have diagnostics for valid.json
      const validPath = resolve(projectRoot, 'samples/valid.json');
      expect(diagnostics.has(validPath)).toBe(false);
    });

    it('returns empty map for valid project', async () => {
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const context = await initializeProjectContext(projectRoot);

      // with-samples doesn't have a schema, so no validation happens
      const diagnostics = getProjectDiagnostics(context!);

      expect(diagnostics.size).toBe(0);
    });

    it('includes error details in diagnostic messages', async () => {
      const projectRoot = resolve(fixturesPath, 'with-invalid-samples');
      const context = await initializeProjectContext(projectRoot);

      const diagnostics = getProjectDiagnostics(context!);

      // Get diagnostics for invalid-type.json
      let invalidTypeDiagnostics: { message: string }[] | undefined;
      for (const [path, diags] of diagnostics) {
        if (path.includes('invalid-type')) {
          invalidTypeDiagnostics = diags;
          break;
        }
      }

      expect(invalidTypeDiagnostics).toBeDefined();
      expect(invalidTypeDiagnostics!.length).toBeGreaterThan(0);

      // Messages should include the path
      const hasPathInMessage = invalidTypeDiagnostics!.some(
        d => d.message.includes('user.email') || d.message.includes('user.age')
      );
      expect(hasPathInMessage).toBe(true);
    });
  });
});
