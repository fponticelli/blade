/**
 * `RootNode.metadata` is the package's auditability claim: the static set of
 * paths a template *can* read, subtractable from the runtime set a render
 * *did* read to answer "which fields went untouched".
 *
 * The claim was false. The compiler walked expressions with its own
 * hand-rolled, `any`-typed switch that omitted the `array` and `member` kinds,
 * so `${[x, y]}` and `${upper(z)[0]}` contributed nothing at all - the static
 * set was not a superset of the runtime set, and the difference could be
 * negative.
 *
 * These tests pin the exact set contents for one input per `ExprAst` kind.
 * `toBeDefined()` is what let this survive.
 */

import { describe, it, expect } from 'vitest';
import { compileOrThrow } from '../src/compiler/index.js';
import type { TemplateMetadata } from '../src/ast/types.js';

function metadataOf(source: string): TemplateMetadata {
  return compileOrThrow(source).root.metadata;
}

function paths(source: string): string[] {
  return [...metadataOf(source).pathsAccessed].sort();
}

function helpers(source: string): string[] {
  return [...metadataOf(source).helpersUsed].sort();
}

describe('collectMetadata - one input per expression kind', () => {
  it('literal contributes nothing', () => {
    expect(paths('${1}')).toEqual([]);
    expect(helpers('${1}')).toEqual([]);
  });

  it('path contributes its serialized path', () => {
    expect(paths('${a.b}')).toEqual(['a.b']);
  });

  it('unary descends into its operand', () => {
    expect(paths('${!flag}')).toEqual(['flag']);
  });

  it('binary descends into both sides', () => {
    expect(paths('${x + y}')).toEqual(['x', 'y']);
  });

  it('ternary descends into all three branches', () => {
    expect(paths('${c ? t : f}')).toEqual(['c', 'f', 't']);
  });

  it('call records the helper and descends into arguments', () => {
    expect(helpers('${upper(z)}')).toEqual(['upper']);
    expect(paths('${upper(z)}')).toEqual(['z']);
  });

  it('wildcard descends into its path', () => {
    expect(paths('${sum(items[*].price)}')).toEqual(['items[*].price']);
  });

  it('array descends into every element', () => {
    expect(paths('${[x, y]}')).toEqual(['x', 'y']);
  });

  it('member descends into its object', () => {
    expect(helpers('${upper(z)[0]}')).toEqual(['upper']);
    expect(paths('${upper(z)[0]}')).toEqual(['z']);
  });

  it('function descends into its body', () => {
    expect(paths('@@ { let f = (a) => a + outer; }')).toContain('outer');
    expect(helpers('@@ { let f = (a) => upper(outer); }')).toEqual(['upper']);
  });

  it('records the exact sets for the audit regression case', () => {
    const source = '${(a || b).length} ${[x, y]} ${upper(z)} ${plain}';
    expect(paths(source)).toEqual(['a', 'b', 'plain', 'x', 'y', 'z']);
    expect(helpers(source)).toEqual(['upper']);
  });

  it('records globals separately from paths', () => {
    const meta = metadataOf('${$.site} ${name}');
    expect([...meta.globalsUsed]).toEqual(['site']);
    expect([...meta.pathsAccessed].sort()).toEqual(['$.site', 'name']);
  });

  it('records components, including one used only in a slot fallback', () => {
    const source = `<template:Wrapper>
  <slot><Inner /></slot>
</template:Wrapper>
<Wrapper />`;
    const meta = compileOrThrow(source, {
      components: { Inner: { props: [] } },
    }).root.metadata;
    expect([...meta.componentsUsed].sort()).toEqual(['Inner', 'Wrapper']);
  });

  it('collects expressions from component definition bodies', () => {
    const source = `<template:Row amount!>
  <td>${'${format(amount)}'}</td>
</template:Row>
<Row amount="1" />`;
    expect(helpers(source)).toEqual(['format']);
  });

  it('collects a @props default value expression', () => {
    // `fallbackSize` is reachable from nowhere but the declaration's default;
    // `size` is the ordinary path the body reads.
    expect(paths('@props(size = fallbackSize)\n<p>$size</p>')).toEqual([
      'fallbackSize',
      'size',
    ]);
  });
});

describe('the static path set is a superset of the runtime set', () => {
  it('never reports fewer paths than a render touches', async () => {
    const { createStringRenderer } = await import('../src/renderer/index.js');
    const source = '${[x, y]} ${up(z)[0]} ${plain}';
    const template = compileOrThrow(source);
    const meta = createStringRenderer(template)(
      { x: 1, y: 2, z: 'q', plain: 'p' },
      // Helpers are curried: scope first, then the call's arguments.
      { helpers: { up: () => (v: unknown) => String(v).toUpperCase() } }
    ).metadata;

    for (const accessed of meta.pathsAccessed) {
      expect(
        [...template.root.metadata.pathsAccessed],
        `runtime path ${accessed} missing from the static set`
      ).toContain(accessed);
    }
  });
});
