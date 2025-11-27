import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { compileProject } from '../../src/project/compile.js';
import { discoverComponents } from '../../src/project/discovery.js';
import { parseComponentProps } from '../../src/project/props.js';
import { readFile } from 'fs/promises';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('@props directive', () => {
  describe('parseComponentProps', () => {
    it('parses @props from component source', () => {
      const source = `@props(label, disabled = false)

<button disabled={$disabled}>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.props).toHaveLength(2);
      expect(result.props![0]).toMatchObject({
        name: 'label',
        required: true,
      });
      expect(result.props![1]).toMatchObject({
        name: 'disabled',
        required: false,
      });
      expect(result.inferred).toBe(false);
    });

    it('infers props when no @props directive', () => {
      const source = `<button disabled={$disabled}>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.props).toHaveLength(2);
      expect(result.inferred).toBe(true);
      // Inferred props are all required
      expect(result.props!.every(p => p.required)).toBe(true);
    });

    it('returns warning for malformed @props', () => {
      // Invalid prop name starting with number
      const source = `@props(123invalid)

<button>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.message).toContain('Expected');
      // Falls back to inference
      expect(result.inferred).toBe(true);
    });
  });

  describe('component discovery with props', () => {
    it('parses props during discovery', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      const components = await discoverComponents(projectRoot);

      // Parse props for Button component
      const button = components.get('Button')!;
      const buttonSource = await readFile(button.filePath, 'utf-8');
      const propsResult = parseComponentProps(buttonSource);

      expect(propsResult.props).toHaveLength(2);
      expect(propsResult.props![0]!.name).toBe('label');
      expect(propsResult.props![0]!.required).toBe(true);
      expect(propsResult.props![1]!.name).toBe('disabled');
      expect(propsResult.props![1]!.required).toBe(false);
    });
  });

  describe('prop validation during compilation', () => {
    it('compiles successfully when all required props provided', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports error for missing required prop', async () => {
      const projectRoot = resolve(fixturesPath, 'missing-required-prop');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const error = result.errors.find(e =>
        e.message.includes('Missing required prop')
      );
      expect(error).toBeDefined();
      expect(error?.message).toContain('label');
      expect(error?.message).toContain('Button');
    });
  });
});
