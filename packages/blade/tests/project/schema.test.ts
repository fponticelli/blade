import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  loadProjectSchema,
  extractSchemaProperties,
  getSchemaCompletions,
  getSchemaPropertyInfo,
} from '../../src/project/schema.js';

const fixturesPath = resolve(__dirname, '../fixtures/project');

describe('Schema Loading', () => {
  describe('loadProjectSchema', () => {
    it('loads schema.json from project root', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const schema = await loadProjectSchema(projectRoot);

      expect(schema).not.toBeNull();
      expect(schema!.schema).toBeDefined();
      expect(schema!.properties).toBeDefined();
      expect(schema!.properties.length).toBeGreaterThan(0);
    });

    it('returns null for project without schema.json', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const schema = await loadProjectSchema(projectRoot);

      expect(schema).toBeNull();
    });

    it('returns null for non-existent project', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      const schema = await loadProjectSchema(projectRoot);

      expect(schema).toBeNull();
    });
  });

  describe('extractSchemaProperties', () => {
    it('extracts top-level properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(props).toHaveLength(2);
      expect(props.find(p => p.path === 'name')).toEqual({
        path: 'name',
        type: 'string',
        description: undefined,
        hasChildren: false,
        childNames: [],
      });
      expect(props.find(p => p.path === 'age')).toEqual({
        path: 'age',
        type: 'number',
        description: undefined,
        hasChildren: false,
        childNames: [],
      });
    });

    it('extracts nested object properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(props).toHaveLength(3);
      expect(props.find(p => p.path === 'user')).toMatchObject({
        path: 'user',
        type: 'object',
        hasChildren: true,
        childNames: ['name', 'email'],
      });
      expect(props.find(p => p.path === 'user.name')).toMatchObject({
        path: 'user.name',
        type: 'string',
      });
      expect(props.find(p => p.path === 'user.email')).toMatchObject({
        path: 'user.email',
        type: 'string',
      });
    });

    it('extracts array item properties', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(props).toHaveLength(3);
      expect(props.find(p => p.path === 'items')).toMatchObject({
        path: 'items',
        type: 'array',
        hasChildren: true,
      });
      expect(props.find(p => p.path === 'items[].id')).toMatchObject({
        path: 'items[].id',
        type: 'number',
      });
      expect(props.find(p => p.path === 'items[].name')).toMatchObject({
        path: 'items[].name',
        type: 'string',
      });
    });

    it('includes descriptions when present', () => {
      const schema = {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Page title',
          },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(props[0]).toMatchObject({
        path: 'title',
        description: 'Page title',
      });
    });

    it('handles union types', () => {
      const schema = {
        type: 'object',
        properties: {
          value: { type: ['string', 'number'] },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(props[0]).toMatchObject({
        path: 'value',
        type: 'string | number',
      });
    });

    it('handles deeply nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const props = extractSchemaProperties(schema);

      expect(
        props.find(p => p.path === 'level1.level2.level3.value')
      ).toBeDefined();
    });
  });

  describe('getSchemaCompletions', () => {
    const schema = {
      schema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          items: { type: 'array' },
        },
      },
      properties: [
        {
          path: 'user',
          type: 'object',
          hasChildren: true,
          childNames: ['name', 'email'],
        },
        {
          path: 'user.name',
          type: 'string',
          hasChildren: false,
          childNames: [],
        },
        {
          path: 'user.email',
          type: 'string',
          hasChildren: false,
          childNames: [],
        },
        { path: 'items', type: 'array', hasChildren: false, childNames: [] },
      ],
    };

    it('returns top-level properties for empty path', () => {
      const completions = getSchemaCompletions(schema, '');

      expect(completions).toHaveLength(2);
      expect(completions.map(c => c.path)).toContain('user');
      expect(completions.map(c => c.path)).toContain('items');
    });

    it('returns top-level properties for $ path', () => {
      const completions = getSchemaCompletions(schema, '$');

      expect(completions).toHaveLength(2);
    });

    it('returns child properties for nested path', () => {
      const completions = getSchemaCompletions(schema, 'user');

      expect(completions).toHaveLength(2);
      expect(completions.map(c => c.path)).toContain('user.name');
      expect(completions.map(c => c.path)).toContain('user.email');
    });

    it('returns child properties for path with $ prefix', () => {
      const completions = getSchemaCompletions(schema, '$user');

      expect(completions).toHaveLength(2);
    });

    it('returns empty for leaf node', () => {
      const completions = getSchemaCompletions(schema, 'user.name');

      expect(completions).toHaveLength(0);
    });

    it('returns empty for non-existent path', () => {
      const completions = getSchemaCompletions(schema, 'nonexistent');

      expect(completions).toHaveLength(0);
    });
  });

  describe('getSchemaPropertyInfo', () => {
    const schema = {
      schema: { type: 'object', properties: {} },
      properties: [
        {
          path: 'user',
          type: 'object',
          hasChildren: true,
          childNames: ['name'],
          description: 'User object',
        },
        {
          path: 'user.name',
          type: 'string',
          hasChildren: false,
          childNames: [],
          description: 'User name',
        },
      ],
    };

    it('returns property info for valid path', () => {
      const info = getSchemaPropertyInfo(schema, 'user');

      expect(info).toMatchObject({
        path: 'user',
        type: 'object',
        description: 'User object',
      });
    });

    it('returns property info for nested path', () => {
      const info = getSchemaPropertyInfo(schema, 'user.name');

      expect(info).toMatchObject({
        path: 'user.name',
        type: 'string',
      });
    });

    it('strips $ prefix from path', () => {
      const info = getSchemaPropertyInfo(schema, '$user.name');

      expect(info).toMatchObject({
        path: 'user.name',
      });
    });

    it('returns null for non-existent path', () => {
      const info = getSchemaPropertyInfo(schema, 'nonexistent');

      expect(info).toBeNull();
    });
  });
});

describe('Schema Integration', () => {
  it('loads and queries with-schema fixture', async () => {
    const projectRoot = resolve(fixturesPath, 'with-schema');
    const schema = await loadProjectSchema(projectRoot);

    expect(schema).not.toBeNull();

    // Check user properties
    const userCompletions = getSchemaCompletions(schema!, 'user');
    expect(userCompletions.map(c => c.path)).toContain('user.name');
    expect(userCompletions.map(c => c.path)).toContain('user.email');
    expect(userCompletions.map(c => c.path)).toContain('user.age');
    expect(userCompletions.map(c => c.path)).toContain('user.address');

    // Check nested address properties
    const addressCompletions = getSchemaCompletions(schema!, 'user.address');
    expect(addressCompletions.map(c => c.path)).toContain('user.address.city');
    expect(addressCompletions.map(c => c.path)).toContain(
      'user.address.street'
    );

    // Check items array
    const itemsInfo = getSchemaPropertyInfo(schema!, 'items');
    expect(itemsInfo).toMatchObject({
      type: 'array',
      hasChildren: true,
    });
  });
});
