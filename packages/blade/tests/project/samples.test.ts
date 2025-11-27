import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  loadProjectSamples,
  extractSampleValues,
  getSampleValues,
  formatSampleHint,
} from '../../src/project/samples.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('Sample Loading', () => {
  describe('loadProjectSamples', () => {
    it('loads samples from project with samples/ directory', async () => {
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).not.toBeNull();
      expect(samples!.samples.length).toBe(2);
      expect(samples!.samples.map(s => s.name).sort()).toEqual([
        'admin',
        'default',
      ]);
    });

    it('returns null for project without samples/ directory', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).toBeNull();
    });

    it('returns null for non-existent project', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).toBeNull();
    });

    it('skips non-JSON files in samples directory', async () => {
      // The with-samples fixture only has .json files
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).not.toBeNull();
      expect(samples!.samples.every(s => s.filePath.endsWith('.json'))).toBe(
        true
      );
    });
  });

  describe('extractSampleValues', () => {
    it('extracts top-level values', () => {
      const samples = [
        {
          name: 'test',
          filePath: '/test.json',
          data: { name: 'John', age: 30 },
        },
      ];

      const values = extractSampleValues(samples);

      expect(values.get('name')).toHaveLength(1);
      expect(values.get('name')![0]!.value).toBe('John');
      expect(values.get('age')).toHaveLength(1);
      expect(values.get('age')![0]!.value).toBe(30);
    });

    it('extracts nested values', () => {
      const samples = [
        {
          name: 'test',
          filePath: '/test.json',
          data: { user: { name: 'John', address: { city: 'NYC' } } },
        },
      ];

      const values = extractSampleValues(samples);

      expect(values.get('user.name')).toHaveLength(1);
      expect(values.get('user.name')![0]!.value).toBe('John');
      expect(values.get('user.address.city')).toHaveLength(1);
      expect(values.get('user.address.city')![0]!.value).toBe('NYC');
    });

    it('extracts array values', () => {
      const samples = [
        {
          name: 'test',
          filePath: '/test.json',
          data: { items: [{ id: 1 }, { id: 2 }] },
        },
      ];

      const values = extractSampleValues(samples);

      expect(values.get('items')).toHaveLength(1);
      expect(values.get('items')![0]!.displayValue).toBe('Array(2)');
      // Only the first item is processed to avoid duplicate type info
      expect(values.get('items[].id')).toHaveLength(1);
      expect(values.get('items[].id')![0]!.value).toBe(1);
    });

    it('merges values from multiple samples', () => {
      const samples = [
        {
          name: 'default',
          filePath: '/default.json',
          data: { user: { name: 'John' } },
        },
        {
          name: 'admin',
          filePath: '/admin.json',
          data: { user: { name: 'Admin' } },
        },
      ];

      const values = extractSampleValues(samples);

      expect(values.get('user.name')).toHaveLength(2);
      expect(values.get('user.name')!.map(v => v.value)).toContain('John');
      expect(values.get('user.name')!.map(v => v.value)).toContain('Admin');
    });
  });

  describe('getSampleValues', () => {
    it('returns values for valid path', async () => {
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).not.toBeNull();

      const values = getSampleValues(samples!, 'user.name');

      expect(values.length).toBe(2);
      expect(values.map(v => v.value)).toContain('John Doe');
      expect(values.map(v => v.value)).toContain('Admin User');
    });

    it('strips $ prefix from path', async () => {
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).not.toBeNull();

      const values = getSampleValues(samples!, '$user.name');

      expect(values.length).toBe(2);
    });

    it('returns empty array for non-existent path', async () => {
      const projectRoot = resolve(fixturesPath, 'with-samples');
      const samples = await loadProjectSamples(projectRoot);

      expect(samples).not.toBeNull();

      const values = getSampleValues(samples!, 'nonexistent.path');

      expect(values).toHaveLength(0);
    });
  });

  describe('formatSampleHint', () => {
    it('formats single value', () => {
      const values = [
        { sampleName: 'default', value: 'John', displayValue: '"John"' },
      ];

      const hint = formatSampleHint(values);

      expect(hint).toBe('Example: "John"');
    });

    it('formats multiple values', () => {
      const values = [
        { sampleName: 'default', value: 'John', displayValue: '"John"' },
        { sampleName: 'admin', value: 'Admin', displayValue: '"Admin"' },
      ];

      const hint = formatSampleHint(values);

      expect(hint).toContain('Examples:');
      expect(hint).toContain('default: "John"');
      expect(hint).toContain('admin: "Admin"');
    });

    it('returns empty string for no values', () => {
      const hint = formatSampleHint([]);

      expect(hint).toBe('');
    });
  });
});

describe('Sample Integration', () => {
  it('loads and queries with-samples fixture', async () => {
    const projectRoot = resolve(fixturesPath, 'with-samples');
    const samples = await loadProjectSamples(projectRoot);

    expect(samples).not.toBeNull();

    // Check user.email values from both samples
    const emailValues = getSampleValues(samples!, 'user.email');
    expect(emailValues.map(v => v.value)).toContain('john@example.com');
    expect(emailValues.map(v => v.value)).toContain('admin@example.com');

    // Check array values
    const itemsValues = getSampleValues(samples!, 'items');
    expect(itemsValues.length).toBe(2); // One from each sample

    // Format hint for display
    const hint = formatSampleHint(getSampleValues(samples!, 'user.name'));
    expect(hint).toContain('Examples:');
  });
});
