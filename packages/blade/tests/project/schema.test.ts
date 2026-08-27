import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  extractSchemaProperties,
  getSchemaCompletions,
  getSchemaPropertyInfo,
  loadProjectSchema,
  loadProjectSchemaResult,
} from '../../src/project/schema.js';
import type { ProjectSchema } from '../../src/project/schema.js';
import type { JsonSchema } from '../../src/ast/types.js';
import { createMemoryFileSystem } from '../../src/project/fs.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

/** A schema project held in memory: the document, and nothing else. */
async function schemaOf(document: unknown): Promise<ProjectSchema> {
  const io = createMemoryFileSystem(
    {
      'index.blade': '',
      'schema.json': JSON.stringify(document),
    },
    '/schema-project'
  );
  const schema = await loadProjectSchema('/schema-project', io);
  expect(schema).not.toBeNull();
  return schema!;
}

function paths(schema: ProjectSchema): string[] {
  return schema.properties.map(p => p.path);
}

describe('Schema Loading', () => {
  describe('loadProjectSchema', () => {
    it('loads schema.json from project root', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const schema = await loadProjectSchema(projectRoot);

      expect(schema).not.toBeNull();
      expect(schema!.schema).toBeDefined();
      expect(schema!.properties.length).toBeGreaterThan(0);
    });

    it('returns null for project without schema.json', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      expect(await loadProjectSchema(projectRoot)).toBeNull();
    });

    it('returns null for non-existent project', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      expect(await loadProjectSchema(projectRoot)).toBeNull();
    });

    it('says nothing about a project that simply has no schema', async () => {
      const io = createMemoryFileSystem({ 'index.blade': '' }, '/p');
      const result = await loadProjectSchemaResult('/p', io);

      expect(result.schema).toBeNull();
      expect(result.diagnostics).toEqual([]);
    });

    it('reports malformed JSON instead of swallowing it', async () => {
      // A bare `catch { return null }` made a trailing comma indistinguishable
      // from having no schema at all: completions just stopped working.
      const io = createMemoryFileSystem(
        { 'index.blade': '', 'schema.json': '{ "type": "object", }' },
        '/p'
      );
      const result = await loadProjectSchemaResult('/p', io);

      expect(result.schema).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.code).toBe('INVALID_SCHEMA');
      expect(result.diagnostics[0]!.message).toContain('not valid JSON');
    });

    it('reports a document that is not a schema', async () => {
      const io = createMemoryFileSystem(
        { 'index.blade': '', 'schema.json': '[1, 2, 3]' },
        '/p'
      );
      const result = await loadProjectSchemaResult('/p', io);

      expect(result.schema).toBeNull();
      expect(result.diagnostics[0]!.message).toContain('an array');
    });

    it('reports a schema that is not valid JSON Schema', async () => {
      const io = createMemoryFileSystem(
        { 'index.blade': '', 'schema.json': '{ "type": "nonsense" }' },
        '/p'
      );
      const result = await loadProjectSchemaResult('/p', io);

      expect(result.schema).toBeNull();
      expect(result.diagnostics[0]!.message).toContain(
        'not a valid JSON Schema'
      );
    });
  });

  describe('extractSchemaProperties', () => {
    it('extracts top-level properties', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      });

      expect(props.map(p => p.path)).toEqual(['name', 'age']);
      expect(props.find(p => p.path === 'name')).toEqual({
        path: 'name',
        type: 'string',
        description: undefined,
        required: false,
        hasChildren: false,
        childNames: [],
      });
    });

    it('marks a property the schema requires', () => {
      const props = extractSchemaProperties({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, nickname: { type: 'string' } },
      });

      expect(props.find(p => p.path === 'name')?.required).toBe(true);
      expect(props.find(p => p.path === 'nickname')?.required).toBe(false);
    });

    it('recurses into nested objects', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      });

      expect(props.map(p => p.path)).toEqual(['user', 'user.name']);
      expect(props[0]!.hasChildren).toBe(true);
      expect(props[0]!.childNames).toEqual(['name']);
    });

    it('recurses into array item properties with [] notation', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'number' } } },
          },
        },
      });

      expect(props.map(p => p.path)).toEqual(['items', 'items[].id']);
    });

    it('joins a union type', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: { value: { type: ['string', 'number'] } },
      });

      expect(props[0]!.type).toBe('string | number');
    });

    it('follows a $ref into $defs', () => {
      // Modelled by nothing before: a $ref produced a property with no type
      // and no children, so the whole subtree vanished from completions.
      const props = extractSchemaProperties({
        type: 'object',
        properties: { user: { $ref: '#/$defs/User' } },
        $defs: {
          User: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Display name' },
            },
          },
        },
      });

      expect(props.map(p => p.path)).toEqual(['user', 'user.name']);
      expect(props[0]!.type).toBe('object');
      expect(props[1]!.description).toBe('Display name');
    });

    it('follows a $ref into definitions, the draft-07 spelling', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: { user: { $ref: '#/definitions/User' } },
        definitions: {
          User: { type: 'object', properties: { id: { type: 'integer' } } },
        },
      });

      expect(props.map(p => p.path)).toEqual(['user', 'user.id']);
      expect(props[1]!.type).toBe('integer');
    });

    it('flattens a document whose root is a $ref', () => {
      // This produced `properties: []` on a NON-null schema, so every
      // downstream guard passed and completions were silently empty.
      const props = extractSchemaProperties({
        $ref: '#/$defs/Root',
        $defs: {
          Root: { type: 'object', properties: { title: { type: 'string' } } },
        },
      });

      expect(props.map(p => p.path)).toEqual(['title']);
    });

    it('merges allOf branches', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: {
          user: {
            allOf: [
              {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string' } },
              },
              { type: 'object', properties: { name: { type: 'string' } } },
            ],
          },
        },
      });

      expect(props.map(p => p.path)).toEqual(['user', 'user.id', 'user.name']);
      expect(props.find(p => p.path === 'user.id')?.required).toBe(true);
    });

    it('offers the union of oneOf branches without imposing their required', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: {
          payment: {
            oneOf: [
              {
                type: 'object',
                required: ['card'],
                properties: { card: { type: 'string' } },
              },
              {
                type: 'object',
                required: ['iban'],
                properties: { iban: { type: 'string' } },
              },
            ],
          },
        },
      });

      expect(props.map(p => p.path)).toEqual([
        'payment',
        'payment.card',
        'payment.iban',
      ]);
      // Neither branch is known to apply, so neither field is required here.
      expect(props.filter(p => p.required)).toEqual([]);
    });

    it('terminates on a recursive $ref', () => {
      const props = extractSchemaProperties({
        type: 'object',
        properties: { root: { $ref: '#/$defs/Node' } },
        $defs: {
          Node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/$defs/Node' } },
            },
          },
        },
      });

      expect(props.map(p => p.path)).toContain('root.children[].name');
    });
  });

  describe('validation', () => {
    const document: JsonSchema = {
      type: 'object',
      required: ['id', 'user'],
      additionalProperties: false,
      properties: {
        id: { type: 'integer' },
        user: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    };

    it('accepts data the schema describes', async () => {
      const schema = await schemaOf(document);

      expect(
        schema.validate({
          id: 1,
          user: { name: 'A', tags: ['x'] },
          status: 'active',
        })
      ).toEqual([]);
    });

    it('reports a missing required property', async () => {
      // The hand-rolled validator skipped absent properties outright, so a
      // sample missing a required field was reported clean.
      const schema = await schemaOf(document);

      const errors = schema.validate({ id: 1 });
      expect(errors).toContainEqual({
        path: 'user',
        message: "Missing required property 'user'",
      });
    });

    it('reports a missing required property of a nested object', async () => {
      const schema = await schemaOf(document);

      expect(schema.validate({ id: 1, user: {} })).toContainEqual({
        path: 'user.name',
        message: "Missing required property 'name'",
      });
    });

    it('accepts an integer for an integer field', async () => {
      // `getValueType` returned `typeof`, so a JSON 42 was 'number' and never
      // matched "integer": every integer field produced a false type mismatch.
      const schema = await schemaOf(document);

      expect(schema.validate({ id: 42, user: { name: 'A' } })).toEqual([]);
    });

    it('rejects a fractional number for an integer field', async () => {
      const schema = await schemaOf(document);

      const errors = schema.validate({ id: 1.5, user: { name: 'A' } });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.path).toBe('id');
      expect(errors[0]!.message).toContain('integer');
    });

    it('honours additionalProperties: false', async () => {
      const schema = await schemaOf(document);

      const errors = schema.validate({
        id: 1,
        user: { name: 'A' },
        extra: true,
      });
      expect(errors.map(e => e.message)).toContain(
        'must NOT have additional properties'
      );
    });

    it('reports an array element by index', async () => {
      const schema = await schemaOf(document);

      const errors = schema.validate({
        id: 1,
        user: { name: 'A', tags: ['x', 2] },
      });
      expect(errors[0]!.path).toBe('user.tags[1]');
    });

    it('reports a value outside an enum', async () => {
      const schema = await schemaOf(document);

      const errors = schema.validate({
        id: 1,
        user: { name: 'A' },
        status: 'nope',
      });
      expect(errors[0]!.path).toBe('status');
    });

    it('validates against a 2020-12 schema', async () => {
      const schema = await schemaOf({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      });

      expect(schema.validate({ name: 'A' })).toEqual([]);
      expect(schema.validate({})).toHaveLength(1);
    });

    it('validates a declared format, against a draft-07 schema', async () => {
      const schema = await schemaOf({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { when: { type: 'string', format: 'date-time' } },
      });

      expect(schema.validate({ when: '2026-08-27T10:00:00Z' })).toEqual([]);
      expect(schema.validate({ when: 'whenever' })[0]?.path).toBe('when');
    });

    it('ignores a format nobody implements, in silence', async () => {
      const schema = await schemaOf({
        type: 'object',
        properties: { code: { type: 'string', format: 'internal-sku' } },
      });

      expect(schema.validate({ code: 'anything' })).toEqual([]);
    });
  });

  describe('getSchemaCompletions', () => {
    const document: JsonSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        },
        items: { type: 'array' },
      },
    };

    it('returns top-level properties for empty path', async () => {
      const schema = await schemaOf(document);
      expect(getSchemaCompletions(schema, '').map(p => p.path)).toEqual([
        'user',
        'items',
      ]);
    });

    it('strips a leading $', async () => {
      const schema = await schemaOf(document);
      expect(getSchemaCompletions(schema, '$user').map(p => p.path)).toEqual([
        'user.name',
        'user.address',
      ]);
    });

    it('returns only direct children', async () => {
      const schema = await schemaOf(document);
      expect(
        getSchemaCompletions(schema, 'user.address').map(p => p.path)
      ).toEqual(['user.address.city']);
    });

    it('returns nothing for an unknown path', async () => {
      const schema = await schemaOf(document);
      expect(getSchemaCompletions(schema, 'nonexistent')).toEqual([]);
    });
  });

  describe('getSchemaPropertyInfo', () => {
    it('finds a property by path, with or without the $', async () => {
      const schema = await schemaOf({
        type: 'object',
        properties: {
          user: { type: 'object', properties: { name: { type: 'string' } } },
        },
      });

      expect(getSchemaPropertyInfo(schema, 'user')?.type).toBe('object');
      expect(getSchemaPropertyInfo(schema, '$user.name')?.type).toBe('string');
      expect(getSchemaPropertyInfo(schema, 'nonexistent')).toBeNull();
    });
  });

  describe('integration with the fixture project', () => {
    it('flattens the fixture schema and answers completions from it', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const schema = await loadProjectSchema(projectRoot);

      expect(paths(schema!)).toContain('user.address.city');
      expect(getSchemaCompletions(schema!, 'user').map(p => p.path)).toEqual([
        'user.name',
        'user.email',
        'user.age',
        'user.address',
      ]);
      expect(getSchemaPropertyInfo(schema!, 'items')?.type).toBe('array');
    });
  });
});
