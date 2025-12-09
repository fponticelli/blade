import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { discoverComponents } from '../../src/project/discovery.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('discoverComponents', () => {
  describe('flat project structure', () => {
    it('discovers components in simple project', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = discoverComponents(projectRoot);

      expect(components.size).toBe(1);
      expect(components.has('Button')).toBe(true);

      const button = components.get('Button')!;
      expect(button.tagName).toBe('Button');
      expect(button.filePath).toContain('button.blade');
      expect(button.namespace).toEqual([]);
      expect(button.props).toBeUndefined(); // Not parsed yet (lazy)
    });

    it('excludes index.blade from discovered components', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = discoverComponents(projectRoot);

      // index.blade should NOT be a component
      expect(components.has('Index')).toBe(false);
    });
  });

  describe('nested folder structure', () => {
    it('discovers components with dot-notation namespacing', () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = discoverComponents(projectRoot);

      // Should have Button at root and Components.Form.Input in nested folder
      expect(components.has('Button')).toBe(true);
      expect(components.has('Components.Form.Input')).toBe(true);
    });

    it('sets correct namespace for nested components', () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = discoverComponents(projectRoot);

      const input = components.get('Components.Form.Input')!;
      expect(input.namespace).toEqual(['Components', 'Form']);
      expect(input.tagName).toBe('Components.Form.Input');
    });
  });

  describe('error handling', () => {
    it('throws error for folder without index.blade', () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');

      expect(() => discoverComponents(projectRoot)).toThrow(/index\.blade/);
    });

    it('throws error for non-existent folder', () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');

      expect(() => discoverComponents(projectRoot)).toThrow();
    });
  });

  describe('hidden files', () => {
    it('skips hidden files and folders', () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = discoverComponents(projectRoot);

      // No components should start with a dot
      for (const [name] of components) {
        expect(name.startsWith('.')).toBe(false);
      }
    });
  });

  describe('naming conventions', () => {
    it('converts kebab-case filenames to PascalCase', () => {
      // This will be tested once we have a fixture with kebab-case names
      // For now, just verify the basic conversion works
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = discoverComponents(projectRoot);

      // button.blade -> Button
      expect(components.has('Button')).toBe(true);
    });
  });
});
