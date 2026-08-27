/**
 * Sample validation.
 *
 * The LSP used to walk the schema itself. That implementation skipped absent
 * properties outright - so a sample *missing* a required field validated clean
 * and the template rendered an empty cell with nothing flagged - and it
 * compared `typeof 42` against `"integer"`, so every integer field produced a
 * false "expected integer, got number". It also understood no `$ref`, no
 * `$defs`, no `oneOf` and no `additionalProperties`, and the four fixtures that
 * existed happened to use none of them.
 *
 * There is now one implementation of what a schema means - `ProjectSchema`,
 * compiled by Ajv in the project layer - and these tests pin the cases the old
 * one got wrong, by count and by path.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  validateSamples,
  getProjectDiagnostics,
  initializeProjectContext,
} from '../src/index.js';
import type {
  ProjectLspContext,
  SampleValidationResult,
} from '../src/index.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

async function context(name: string): Promise<ProjectLspContext> {
  const projectContext = await initializeProjectContext(
    resolve(fixturesPath, name)
  );
  expect(projectContext, `fixture ${name} did not load`).not.toBeNull();
  return projectContext!;
}

function sample(
  results: SampleValidationResult[],
  name: string
): SampleValidationResult {
  const found = results.find(result => result.sampleFile.name === name);
  expect(found, `no result for sample ${name}`).toBeDefined();
  return found!;
}

describe('validateSamples', () => {
  it('returns empty for a project without a schema', async () => {
    expect(validateSamples(await context('simple'))).toHaveLength(0);
  });

  it('returns empty for a project without samples', async () => {
    expect(validateSamples(await context('with-schema'))).toHaveLength(0);
  });

  it('validates every sample file', async () => {
    const results = validateSamples(await context('with-invalid-samples'));
    expect(results).toHaveLength(3);
    expect(sample(results, 'valid').errors).toHaveLength(0);
  });

  it('reports a type mismatch at the offending path', async () => {
    const results = validateSamples(await context('with-invalid-samples'));
    const errors = sample(results, 'invalid-type').errors;

    expect(errors.map(e => e.path)).toEqual(['user.email', 'user.age']);
    expect(errors[0]!.message).toContain('string');
    expect(errors[1]!.message).toContain('number');
  });

  it('reports a value outside an enum', async () => {
    const results = validateSamples(await context('with-invalid-samples'));
    const errors = sample(results, 'invalid-enum').errors;

    expect(errors.map(e => e.path)).toEqual(['status']);
    expect(errors[0]!.message).toContain('allowed values');
  });
});

describe('schema features the hand-rolled validator could not see', () => {
  it('accepts a sample that satisfies $ref, $defs, integer and oneOf', async () => {
    const results = validateSamples(await context('with-strict-schema'));
    expect(sample(results, 'valid').errors).toHaveLength(0);
  });

  it('reports a missing required property, at the object that lacks it', async () => {
    // The old validator skipped absent properties, so this validated clean.
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'broken'
    ).errors;

    const missing = errors.find(e => e.path === 'customer.name');
    expect(missing).toBeDefined();
    expect(missing!.message).toContain('Missing required property');
  });

  it('distinguishes integer from number', async () => {
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'broken'
    ).errors;

    // 2.5 against `"type": "integer"` is a real error...
    expect(errors.find(e => e.path === 'order.quantity')?.message).toContain(
      'integer'
    );

    // ...and 2 against the same schema is not, which is what the old
    // `typeof` comparison could never express.
    const valid = sample(
      validateSamples(await context('with-strict-schema')),
      'valid'
    );
    expect(valid.errors).toHaveLength(0);
  });

  it('distinguishes an object from an array', async () => {
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'broken'
    ).errors;
    expect(errors.find(e => e.path === 'tags')?.message).toContain('array');
  });

  it('enforces additionalProperties: false', async () => {
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'broken'
    ).errors;
    expect(errors.find(e => e.path === '(root)')?.message).toContain(
      'additional properties'
    );
  });

  it('reports exactly the four problems the broken sample has', async () => {
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'broken'
    ).errors;
    expect(errors.map(e => e.path).sort()).toEqual([
      '(root)',
      'customer.name',
      'order.quantity',
      'tags',
    ]);
  });

  it('reports a oneOf branch that nothing matches', async () => {
    const errors = sample(
      validateSamples(await context('with-strict-schema')),
      'bad-union'
    ).errors;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(e => e.path === 'customer.tier')).toBe(true);
    expect(errors.some(e => e.message.includes('oneOf'))).toBe(true);
  });
});

describe('getProjectDiagnostics', () => {
  it('returns diagnostics grouped by file', async () => {
    const projectContext = await context('with-invalid-samples');
    const diagnostics = getProjectDiagnostics(projectContext);

    expect(diagnostics.size).toBe(2);
    expect(
      diagnostics.has(
        resolve(fixturesPath, 'with-invalid-samples', 'samples/valid.json')
      )
    ).toBe(false);
  });

  it('returns an empty map for a project with nothing to check', async () => {
    expect(getProjectDiagnostics(await context('with-samples')).size).toBe(0);
  });

  it('points each diagnostic at the value the schema rejected', async () => {
    // Every one of these used to be emitted at line 0, character 0.
    const diagnostics = getProjectDiagnostics(
      await context('with-strict-schema')
    );
    const broken = diagnostics.get(
      resolve(fixturesPath, 'with-strict-schema', 'samples/broken.json')
    );
    expect(broken).toBeDefined();

    const quantity = broken!.find(d => d.message.startsWith('order.quantity'));
    expect(quantity!.range).toEqual({
      start: { line: 3, character: 16 },
      end: { line: 3, character: 19 },
    });

    const tags = broken!.find(d => d.message.startsWith('tags'));
    expect(tags!.range.start.line).toBe(6);
  });

  it('includes the path in the message', async () => {
    const diagnostics = getProjectDiagnostics(
      await context('with-invalid-samples')
    );
    const messages = [...diagnostics.values()].flat().map(d => d.message);
    expect(messages.some(m => m.startsWith('user.email'))).toBe(true);
  });
});
