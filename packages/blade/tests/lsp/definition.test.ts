import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  getComponentDefinition,
  initializeProjectContext,
} from '../../src/lsp/index.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('Definition Provider', () => {
  describe('getComponentDefinition', () => {
    it('returns definition for existing component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const definition = getComponentDefinition('Button', context!);

      expect(definition).not.toBeNull();
      expect(definition!.uri).toContain('button.blade');
      expect(definition!.range.start.line).toBe(0);
    });

    it('returns null for non-existent component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const definition = getComponentDefinition('NonExistent', context!);

      expect(definition).toBeNull();
    });

    it('returns definition for nested component', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      // The nested fixture has components/form/input.blade -> Components.Form.Input
      const definition = getComponentDefinition(
        'Components.Form.Input',
        context!
      );

      expect(definition).not.toBeNull();
      expect(definition!.uri).toContain('form');
      expect(definition!.uri).toContain('input.blade');
    });

    it('handles dot-notation component names', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      // Check that the component map has the dot-notation name
      const componentNames = Array.from(context!.components.keys());
      expect(componentNames.some(name => name.includes('.'))).toBe(true);
    });
  });

  describe('Project context integration', () => {
    it('initializes context with schema', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).not.toBeNull();
      expect(context!.schema!.properties.length).toBeGreaterThan(0);
    });

    it('initializes context without schema', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).toBeNull();
    });

    it('returns null for invalid project root', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      const context = await initializeProjectContext(projectRoot);

      expect(context).toBeNull();
    });

    it('returns null for directory without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');
      const context = await initializeProjectContext(projectRoot);

      expect(context).toBeNull();
    });
  });
});
