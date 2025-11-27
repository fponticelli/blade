import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { compileProject } from '../../src/project/compile.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('compileProject', () => {
  describe('simple project', () => {
    it('compiles project with index.blade entry', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('discovers components in project', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = await compileProject(projectRoot);

      expect(result.context.components.has('Button')).toBe(true);
    });
  });

  describe('nested project', () => {
    it('compiles project and discovers nested components', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.context.components.has('Button')).toBe(true);
      // Nested components are discovered even if not used yet
      // (dot-notation in template will be added in US2)
      expect(result.context.components.has('Components.Form.Input')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('reports error for missing component', async () => {
      const projectRoot = resolve(fixturesPath, 'missing-component');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const error = result.errors[0];
      expect(error?.message).toContain('Card');
      expect(error?.message).toContain('not found');
    });

    it('reports error for project without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');

      await expect(compileProject(projectRoot)).rejects.toThrow(/index\.blade/);
    });
  });

  describe('project options', () => {
    it('accepts custom entry point', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = await compileProject(projectRoot, {
        entry: 'index.blade',
      });

      expect(result.success).toBe(true);
    });
  });
});
