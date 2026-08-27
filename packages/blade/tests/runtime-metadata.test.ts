/**
 * @vitest-environment jsdom
 */
// Runtime metadata
//
// `RenderResult.metadata` reports what a *particular* render did, as opposed to
// `compiled.root.metadata`, which reports what the template *could* do. The two
// use the same path notation on purpose: subtracting one from the other is how
// a consumer answers "which fields did this render never touch".

import { describe, it, expect } from 'vitest';
import { compileOrThrow } from '../src/compiler/index.js';
import {
  createDomRenderer,
  createStringRenderer,
} from '../src/renderer/index.js';
import { standardLibrary } from '../src/helpers/index.js';
import type { RuntimeMetadata } from '../src/renderer/index.js';

function renderMeta(source: string, data: unknown): RuntimeMetadata {
  return createStringRenderer(compileOrThrow(source))(data, {
    helpers: standardLibrary,
  }).metadata;
}

describe('runtime pathsAccessed', () => {
  it('records the paths a render actually read', () => {
    const meta = renderMeta('<p>${name} ${age}</p>', { name: 'Ada', age: 36 });
    expect([...meta.pathsAccessed].sort()).toEqual(['age', 'name']);
  });

  it('records nested paths whole', () => {
    const meta = renderMeta('<p>${customer.address.city}</p>', {
      customer: { address: { city: 'Turin' } },
    });
    expect([...meta.pathsAccessed]).toEqual(['customer.address.city']);
  });

  it('omits the branch that was not taken', () => {
    const meta = renderMeta('<p>@if(flag) { ${yes} } else { ${no} }</p>', {
      flag: true,
      yes: 'y',
      no: 'n',
    });
    expect([...meta.pathsAccessed].sort()).toEqual(['flag', 'yes']);
  });

  it('omits the right-hand side of a short-circuited operator', () => {
    const meta = renderMeta('<p>${a || b}</p>', { a: 1, b: 2 });
    expect([...meta.pathsAccessed]).toEqual(['a']);
  });

  it('records a path once however often it is read', () => {
    const meta = renderMeta('<ul>@for(r of rows) { <li>${r.n}</li> }</ul>', {
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }],
    });
    expect([...meta.pathsAccessed].sort()).toEqual(['r.n', 'rows']);
  });

  it('marks a global so it is never mistaken for a data path', () => {
    const meta = createStringRenderer(compileOrThrow('<p>${$.site}</p>'))(
      {},
      { globals: { site: 'blade' } }
    ).metadata;
    expect([...meta.pathsAccessed]).toEqual(['$.site']);
  });

  it('records the base of a wildcard expansion', () => {
    const meta = renderMeta('<p>${sum(order.lines[*].amount)}</p>', {
      order: { lines: [{ amount: 1 }, { amount: 2 }] },
    });
    expect([...meta.pathsAccessed]).toEqual(['order.lines[*].amount']);
  });

  it('uses the same notation as the compile-time metadata', () => {
    const template = compileOrThrow('<p>${rows[0].n}</p>');
    const meta = createStringRenderer(template)(
      { rows: [{ n: 1 }] },
      { helpers: standardLibrary }
    ).metadata;
    expect([...meta.pathsAccessed]).toEqual(['rows[0].n']);
    expect([...template.root.metadata.pathsAccessed]).toEqual(['rows[0].n']);
  });

  it('is a subset of what the compiler found statically', () => {
    const source = '<p>@if(flag) { ${yes} } else { ${no} }</p>';
    const template = compileOrThrow(source);
    const meta = createStringRenderer(template)(
      { flag: false, yes: 'y', no: 'n' },
      { helpers: standardLibrary }
    ).metadata;
    for (const path of meta.pathsAccessed) {
      expect(template.root.metadata.pathsAccessed.has(path)).toBe(true);
    }
    expect(meta.pathsAccessed.has('yes')).toBe(false);
  });

  it('collects afresh for each render', () => {
    const renderer = createStringRenderer(
      compileOrThrow('<p>@if(flag) { ${yes} } else { ${no} }</p>')
    );
    const first = renderer({ flag: true, yes: 'y', no: 'n' }).metadata;
    const second = renderer({ flag: false, yes: 'y', no: 'n' }).metadata;
    expect([...first.pathsAccessed].sort()).toEqual(['flag', 'yes']);
    expect([...second.pathsAccessed].sort()).toEqual(['flag', 'no']);
  });
});

describe('runtime helpersUsed', () => {
  it('records the helpers a render actually called', () => {
    const meta = renderMeta('<p>${upper(name)} ${count(rows)}</p>', {
      name: 'ada',
      rows: [1, 2],
    });
    expect([...meta.helpersUsed].sort()).toEqual(['count', 'upper']);
  });

  it('omits a helper in a branch that was not taken', () => {
    const meta = renderMeta('<p>@if(flag) { ${upper(a)} } else { $a }</p>', {
      flag: false,
      a: 'x',
    });
    expect([...meta.helpersUsed]).toEqual([]);
  });

  it('records nested helper calls', () => {
    const meta = renderMeta('<p>${upper(join(parts, "-"))}</p>', {
      parts: ['a', 'b'],
    });
    expect([...meta.helpersUsed].sort()).toEqual(['join', 'upper']);
  });
});

describe('runtime recursionDepth', () => {
  it('is zero for a template with no components', () => {
    expect(renderMeta('<p>$a</p>', { a: 1 }).recursionDepth).toBe(0);
  });

  it('reports the deepest component nesting reached', () => {
    const template = `
<template:Inner v!>
  <b>\${v}</b>
</template:Inner>
<template:Outer v!>
  <span><Inner v=\${v} /></span>
</template:Outer>
<div><Outer v=$a /></div>`;
    expect(renderMeta(template, { a: 1 }).recursionDepth).toBe(2);
  });

  it('reports the deepest branch, not the last one', () => {
    const template = `
<template:Inner v!>
  <b>\${v}</b>
</template:Inner>
<template:Outer v!>
  <span><Inner v=\${v} /></span>
</template:Outer>
<div><Outer v=$a /><Inner v=$a /></div>`;
    expect(renderMeta(template, { a: 1 }).recursionDepth).toBe(2);
  });
});

describe('runtime iterationCount', () => {
  it('counts a flat loop', () => {
    const meta = renderMeta('<ul>@for(r of rows) { <li>$r</li> }</ul>', {
      rows: [1, 2, 3],
    });
    expect(meta.iterationCount).toBe(3);
  });

  it('counts nested loops at every level', () => {
    const meta = renderMeta(
      '<ul>@for(g of groups) { @for(r of g.rows) { <li>$r</li> } }</ul>',
      { groups: [{ rows: [1, 2, 3] }, { rows: [4, 5, 6] }] }
    );
    // 2 outer passes, 3 inner passes each.
    expect(meta.iterationCount).toBe(8);
  });

  it('bounds the render as a whole, not just one loop', () => {
    // 4 outer passes x 4 inner = 20 iterations, under maxIterationsPerLoop for
    // either loop alone but over the render's budget. Before the counters were
    // shared, the inner passes were lost on the `{...ctx}` copy and this
    // template rendered straight through the limit.
    const render = createStringRenderer(
      compileOrThrow(
        '<ul>@for(g of groups) { @for(r of g.rows) { <li>$r</li> } }</ul>'
      )
    );
    const rows = [1, 2, 3, 4];
    const data = { groups: [{ rows }, { rows }, { rows }, { rows }] };

    expect(() =>
      render(data, { limits: { maxTotalIterations: 10 } })
    ).toThrowError(/Iteration limit exceeded/);

    expect(
      render(data, { limits: { maxTotalIterations: 20 } }).metadata
        .iterationCount
    ).toBe(20);
  });

  it('counts iterations inside a component', () => {
    const template = `
<template:List rows!>
  <ul>@for(r of rows) { <li>\${r}</li> }</ul>
</template:List>
<div><List rows=$a /><List rows=$b /></div>`;
    const meta = renderMeta(template, { a: [1, 2], b: [3, 4, 5] });
    expect(meta.iterationCount).toBe(5);
  });
});

describe('runtime metadata from the DOM renderer', () => {
  it('matches the string renderer for the same template and data', () => {
    const source = '<p>${upper(name)} ${age}</p>';
    const data = { name: 'ada', age: 36 };
    const domMeta = createDomRenderer(compileOrThrow(source))(data, {
      helpers: standardLibrary,
    }).metadata;
    const stringMeta = renderMeta(source, data);
    expect([...domMeta.pathsAccessed].sort()).toEqual(
      [...stringMeta.pathsAccessed].sort()
    );
    expect([...domMeta.helpersUsed].sort()).toEqual(
      [...stringMeta.helpersUsed].sort()
    );
  });
});
