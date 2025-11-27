import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import type { ComponentDefinition } from '../../src/ast/types.js';
import {
  resolveComponent,
  createProjectContext,
} from '../../src/project/resolver.js';
import { discoverComponents } from '../../src/project/discovery.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('resolveComponent', () => {
  describe('project component resolution', () => {
    it('resolves component from discovered components', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext(projectRoot, components);

      const result = resolveComponent('Button', context);

      expect(result).toBeDefined();
      expect(result!.tagName).toBe('Button');
      expect(result!.filePath).toContain('button.blade');
    });

    it('returns undefined for unknown component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext(projectRoot, components);

      const result = resolveComponent('Unknown', context);

      expect(result).toBeUndefined();
    });
  });

  describe('template component shadowing', () => {
    it('template-passed component shadows project component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);

      // Create a template component that shadows the project Button
      const templateComponents = new Map<string, ComponentDefinition>();
      templateComponents.set('Button', {
        type: 'ComponentDefinition',
        name: 'Button',
        props: [],
        template: {
          type: 'Root',
          children: [],
          location: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
        },
        location: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      });

      const context = createProjectContext(
        projectRoot,
        components,
        templateComponents
      );

      const result = resolveComponent('Button', context);

      // Should return undefined since template components are handled separately
      // The resolver only handles project components, template components are
      // resolved by the existing template component mechanism
      expect(result).toBeUndefined();
    });
  });

  describe('dot-notation resolution', () => {
    it('resolves nested component with dot-notation', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext(projectRoot, components);

      const result = resolveComponent('Components.Form.Input', context);

      expect(result).toBeDefined();
      expect(result!.tagName).toBe('Components.Form.Input');
      expect(result!.namespace).toEqual(['Components', 'Form']);
    });
  });
});

describe('createProjectContext', () => {
  it('creates context with discovered components', async () => {
    const projectRoot = resolve(fixturesPath, 'simple');
    const components = await discoverComponents(projectRoot);
    const context = createProjectContext(projectRoot, components);

    expect(context.config.rootPath).toBe(projectRoot);
    expect(context.config.entry).toBe('index.blade');
    expect(context.components.size).toBe(1);
    expect(context.warnings).toHaveLength(0);
    expect(context.errors).toHaveLength(0);
  });

  it('creates context with template components', async () => {
    const projectRoot = resolve(fixturesPath, 'simple');
    const components = await discoverComponents(projectRoot);
    const templateComponents = new Map<string, ComponentDefinition>();

    const context = createProjectContext(
      projectRoot,
      components,
      templateComponents
    );

    expect(context.templateComponents).toBe(templateComponents);
  });
});
