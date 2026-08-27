import { describe, it, expect } from 'vitest';
import { compileOrThrow } from '../src/compiler/index.js';
import { createStringRenderer } from '../src/renderer/index.js';
import { standardLibrary } from '../src/helpers/index.js';
import type { RenderConfig } from '../src/renderer/index.js';

function render(
  source: string,
  data: unknown,
  config: Partial<RenderConfig> = {}
): string {
  const renderer = createStringRenderer(compileOrThrow(source));
  return renderer(data, {
    helpers: standardLibrary,
    config: { includeSourceTracking: true, ...config },
  }).html;
}

describe('source tracking emission', () => {
  it('is off unless asked for', () => {
    const template = compileOrThrow('<p>$name</p>');
    const html = createStringRenderer(template)(
      { name: 'Ada' },
      {
        helpers: standardLibrary,
      }
    ).html;
    expect(html).toBe('<p>Ada</p>');
  });

  it('emits rd-source for a single interpolation', () => {
    expect(render('<p>$customer.name</p>', { customer: { name: 'Ada' } })).toBe(
      '<p rd-source="customer.name">Ada</p>'
    );
  });

  it('emits one expression per interpolation, in document order', () => {
    const html = render('<div>${subtotal} ${tax} ${subtotal + tax}</div>', {
      subtotal: 100,
      tax: 12,
    });
    expect(html).toContain('rd-source="subtotal;tax;subtotal,tax"');
  });

  it('includes attribute expressions before content', () => {
    const html = render('<a href="/u/${user.id}">${user.name}</a>', {
      user: { id: 7, name: 'Ada' },
    });
    expect(html).toContain('rd-source="user.id;user.name"');
  });

  it('leaves elements with no expressions untouched', () => {
    expect(render('<p class="x">static</p>', {})).toBe(
      '<p class="x">static</p>'
    );
  });

  it("does not claim a parent owns its children's expressions", () => {
    const html = render('<div><span>$a</span></div>', { a: 1 });
    expect(html).toBe('<div><span rd-source="a">1</span></div>');
  });

  it('attributes local control flow to the enclosing element', () => {
    const html = render('<div>@if(isAdmin) { ${role} }</div>', {
      isAdmin: true,
      role: 'admin',
    });
    expect(html).toContain('rd-source="isAdmin;role"');
  });

  it('attributes a loop iterable to the enclosing element', () => {
    const html = render('<ul>@for(item of items) { <li>${item}</li> }</ul>', {
      items: ['a', 'b'],
    });
    expect(html).toContain('<ul rd-source="items">');
  });

  it('respects a configured prefix', () => {
    const html = render(
      '<p>$name</p>',
      { name: 'Ada' },
      {
        sourceTrackingPrefix: 'data-track-',
      }
    );
    expect(html).toBe('<p data-track-source="name">Ada</p>');
  });

  it('resolves a loop variable back to the array it came from', () => {
    const html = render(
      '<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      { items: [{ name: 'a' }] }
    );
    expect(html).toContain('<li rd-source="items[*].name">');
  });

  it('never overwrites an author-written source attribute', () => {
    const html = render('<p rd-source="ledger.total">$name</p>', {
      name: 'Ada',
    });
    expect(html).toBe('<p rd-source="ledger.total">Ada</p>');
  });
});

describe('operation tracking', () => {
  const opts = { includeOperationTracking: true };

  it('is off unless asked for', () => {
    expect(
      render('<p>${formatCurrency(total)}</p>', { total: 1 })
    ).not.toContain('rd-source-op');
  });

  it('emits one op per expression, aligned with rd-source', () => {
    const html = render(
      '<div>${formatCurrency(subtotal)} ${subtotal + tax} ${label}</div>',
      { subtotal: 100, tax: 12, label: 'x' },
      opts
    );
    expect(html).toContain('rd-source="subtotal;subtotal,tax;label"');
    expect(html).toContain('rd-source-op="format:currency;calculated;none"');
  });

  it('classifies an aggregate under a formatter as the formatter', () => {
    const html = render(
      '<p>${formatCurrency(sum(lines[*].amount))}</p>',
      { lines: [{ amount: 1 }] },
      opts
    );
    expect(html).toContain('rd-source-op="format:currency"');
  });
});

describe('note generation', () => {
  it('is off unless asked for', () => {
    expect(render('<p>${a + b}</p>', { a: 1, b: 2 })).not.toContain(
      'rd-source-note'
    );
  });

  it('describes how the value was produced', () => {
    const html = render(
      '<p>${formatCurrency(sum(order.lines[*].amount))}</p>',
      { order: { lines: [{ amount: 1 }] } },
      { includeNoteGeneration: true }
    );
    expect(html).toContain(
      'rd-source-note="format currency of sum of order.lines[*].amount"'
    );
  });

  it('never emits a bare ";" separator into the note', () => {
    const html = render(
      '<div>${a} ${b}</div>',
      { a: 1, b: 2 },
      {
        includeNoteGeneration: true,
      }
    );
    const note = /rd-source-note="([^"]*)"/.exec(html)?.[1];
    expect(note).toBe('a + b');
    expect(note).not.toContain(';');
  });
});

describe('component path resolution', () => {
  const template = `
<template:PriceBreakdown subtotal! tax!>
  <div>\${formatCurrency(subtotal + tax)}</div>
</template:PriceBreakdown>
<PriceBreakdown subtotal=$order.subtotal tax=$order.tax />`;

  it('resolves prop names back to caller paths', () => {
    const html = render(
      template,
      { order: { subtotal: 100, tax: 12 } },
      {
        includeOperationTracking: true,
      }
    );
    expect(html).toContain('rd-source="order.subtotal,order.tax"');
    expect(html).toContain('rd-source-op="format:currency"');
  });

  it('carries paths through nested components', () => {
    const nested = `
<template:Inner value!>
  <span>\${value}</span>
</template:Inner>
<template:Outer data!>
  <Inner value=$data />
</template:Outer>
<Outer data=$order.total />`;
    const html = render(nested, { order: { total: 5 } });
    expect(html).toContain('rd-source="order.total"');
  });

  it('never names a local prop in the note while rd-source names the caller', () => {
    const html = render(
      template,
      { order: { subtotal: 100, tax: 12 } },
      {
        includeNoteGeneration: true,
      }
    );
    const note = /rd-source-note="([^"]*)"/.exec(html)?.[1];
    expect(note).toBe('format currency of order.subtotal + order.tax');
  });

  it('keeps the local name when a prop is not fed by data', () => {
    const literal = `
<template:Badge label!>
  <span>\${label}</span>
</template:Badge>
<Badge label="new" />`;
    const html = render(literal, {});
    expect(html).toContain('rd-source="label"');
  });
});

describe('loop index resolution', () => {
  const indices = { resolveLoopIndices: true };

  it('reports the pattern unless asked for concrete indices', () => {
    const html = render(
      '<ul>@for(p of positions) { <li>${p.weight}</li> }</ul>',
      { positions: [{ weight: 1 }, { weight: 2 }] }
    );
    expect(html).toContain('<li rd-source="positions[*].weight">1</li>');
    expect(html).toContain('<li rd-source="positions[*].weight">2</li>');
  });

  it('emits the live index for every iteration', () => {
    const html = render(
      '<ul>@for(p of positions) { <li>${p.weight}</li> }</ul>',
      { positions: [{ weight: 1 }, { weight: 2 }, { weight: 3 }] },
      indices
    );
    expect(html).toContain('<li rd-source="positions[0].weight">1</li>');
    expect(html).toContain('<li rd-source="positions[1].weight">2</li>');
    expect(html).toContain('<li rd-source="positions[2].weight">3</li>');
    expect(html).not.toContain('[*]');
  });

  it('uses the positional index even when the author named none', () => {
    const html = render('<ul>@for(p of rows) { <li>${p}</li> }</ul>', {
      rows: ['a', 'b'],
    });
    expect(html).toContain('rd-source="rows[*]"');

    const resolved = render(
      '<ul>@for(p of rows) { <li>${p}</li> }</ul>',
      { rows: ['a', 'b'] },
      indices
    );
    expect(resolved).toContain('<li rd-source="rows[0]">a</li>');
    expect(resolved).toContain('<li rd-source="rows[1]">b</li>');
  });

  it('composes through nested loops', () => {
    const template =
      '<div>@for(line of invoice.lines) { @for(tax of line.taxes) { <span>${tax.rate}</span> } }</div>';
    const data = {
      invoice: {
        lines: [
          { taxes: [{ rate: 1 }] },
          { taxes: [{ rate: 2 }, { rate: 3 }] },
        ],
      },
    };
    expect(render(template, data)).toContain(
      'rd-source="invoice.lines[*].taxes[*].rate"'
    );

    const html = render(template, data, indices);
    expect(html).toContain(
      '<span rd-source="invoice.lines[0].taxes[0].rate">1</span>'
    );
    expect(html).toContain(
      '<span rd-source="invoice.lines[1].taxes[0].rate">2</span>'
    );
    expect(html).toContain(
      '<span rd-source="invoice.lines[1].taxes[1].rate">3</span>'
    );
  });

  it('resolves indices through a component boundary', () => {
    const template = `
<template:Row weight!>
  <td>\${weight}</td>
</template:Row>
<table>@for(p of positions) { <Row weight=\${p.weight} /> }</table>`;
    const html = render(
      template,
      { positions: [{ weight: 1 }, { weight: 2 }] },
      indices
    );
    expect(html).toContain('<td rd-source="positions[0].weight">1</td>');
    expect(html).toContain('<td rd-source="positions[1].weight">2</td>');
  });

  it('leaves a computed iterable without an alias, index or not', () => {
    const template = '<ul>@for(p of reverse(rows)) { <li>${p.n}</li> }</ul>';
    const data = { rows: [{ n: 2 }, { n: 1 }] };
    expect(render(template, data, indices)).toContain('<li rd-source="p.n">');
  });

  it('leaves key iteration alone - the variable is a key, not an element', () => {
    const html = render(
      '<ul>@for(k in totals) { <li>${k}</li> }</ul>',
      { totals: { a: 1, b: 2 } },
      indices
    );
    expect(html).toContain('<li rd-source="totals">a</li>');
    expect(html).toContain('<li rd-source="totals">b</li>');
  });

  it('still never overwrites an author-written source attribute', () => {
    const html = render(
      '<ul>@for(p, i of rows) { <li rd-source="rows[${i}].n">${p.n}</li> }</ul>',
      { rows: [{ n: 7 }] },
      indices
    );
    expect(html).toContain('<li rd-source="rows[0].n">7</li>');
  });

  it('does nothing when source tracking is off', () => {
    const html = createStringRenderer(
      compileOrThrow('<ul>@for(p of rows) { <li>${p.n}</li> }</ul>')
    )({ rows: [{ n: 1 }] }, { config: { resolveLoopIndices: true } }).html;
    expect(html).toBe('<ul><li>1</li></ul>');
  });
});
