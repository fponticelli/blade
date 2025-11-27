import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { compile } from '../../src/compiler/index.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('Single file compilation with projectRoot', () => {
  describe('component resolution', () => {
    it('resolves project components when projectRoot specified', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const source = '<div><Button label="Click" /></div>';

      const result = await compile(source, { projectRoot });

      // Should compile without errors - Button exists in project
      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors).toHaveLength(0);
    });

    it('reports error for missing component with projectRoot', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const source = '<div><NonExistent /></div>';

      const result = await compile(source, { projectRoot });

      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('NonExistent');
      expect(errors[0]?.message).toContain('not found');
    });

    it('validates required props with projectRoot', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      // Button requires 'label' prop
      const source = '<div><Button /></div>';

      const result = await compile(source, { projectRoot });

      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('Missing required prop');
      expect(errors[0]?.message).toContain('label');
    });

    it('passes when required props provided', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      const source = '<div><Button label="OK" /></div>';

      const result = await compile(source, { projectRoot });

      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('template component shadowing', () => {
    it('template-defined component shadows project component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      // Define Button in template - should shadow project Button
      const source = `<template:Button>
  <span>Custom Button</span>
</template:Button>
<div><Button /></div>`;

      const result = await compile(source, { projectRoot });

      // Should compile without errors - template Button is used
      const errors = result.diagnostics.filter(d => d.level === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('without projectRoot', () => {
    it('does not validate project components without projectRoot', async () => {
      const source = '<div><Button label="Click" /></div>';

      const result = await compile(source);

      // No project validation errors - unknown components are allowed
      const errors = result.diagnostics.filter(
        d => d.level === 'error' && d.message.includes('not found')
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid projectRoot', () => {
    it('gracefully handles non-existent projectRoot', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      const source = '<div><Button /></div>';

      const result = await compile(source, { projectRoot });

      // Should not throw, just skip project validation
      expect(result.root).toBeDefined();
    });

    it('gracefully handles projectRoot without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');
      const source = '<div><Button /></div>';

      const result = await compile(source, { projectRoot });

      // Should not throw, just skip project validation
      expect(result.root).toBeDefined();
    });
  });
});
