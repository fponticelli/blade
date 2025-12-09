import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { compileProject } from '../../src/project/compile.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('compileProject', () => {
  describe('simple project', () => {
    it('compiles project with index.blade entry', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('discovers components in project', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = compileProject(projectRoot);

      expect(result.context.components.has('Button')).toBe(true);
    });
  });

  describe('nested project', () => {
    it('compiles project and discovers nested components', () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const result = compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.context.components.has('Button')).toBe(true);
      // Nested components are discovered even if not used yet
      // (dot-notation in template will be added in US2)
      expect(result.context.components.has('Components.Form.Input')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('reports error for missing component', () => {
      const projectRoot = resolve(fixturesPath, 'missing-component');
      const result = compileProject(projectRoot);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const error = result.errors[0];
      expect(error?.message).toContain('Card');
      expect(error?.message).toContain('not found');
    });

    it('reports error for project without index.blade', () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');

      expect(() => compileProject(projectRoot)).toThrow(/index\.blade/);
    });
  });

  describe('project options', () => {
    it('accepts custom entry point', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = compileProject(projectRoot, {
        entry: 'index.blade',
      });

      expect(result.success).toBe(true);
    });
  });
});
