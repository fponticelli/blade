/**
 * Cost tests for source tracking.
 *
 * Source tracking is on in production for the consumers who need provenance,
 * so its price is paid on every element of every response. Everything it
 * derives is a property of the template, not of the data, and these tests hold
 * the line on that: the expensive work must run a number of times proportional
 * to the size of the template, never to the number of rows rendered through it,
 * and work whose output is discarded must not run at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { compileOrThrow } from '../src/compiler/index.js';
import { createStringRenderer } from '../src/renderer/index.js';
import { standardLibrary } from '../src/helpers/index.js';
import { parseExpression } from '../src/parser/index.js';
import type { RenderConfig } from '../src/renderer/index.js';
import {
  buildSourceExpression,
  classifyExpression,
  collectElementExpressions,
  collectPaths,
  describeExpression,
  loopAliases,
  resetSourceTrackingCaches,
  sourceTrackingCacheStats,
} from '../src/source-tracking/index.js';
import type { ElementNode } from '../src/ast/types.js';

function expr(source: string) {
  const result = parseExpression(source);
  if (!result.value) throw new Error(`failed to parse "${source}"`);
  return result.value;
}

function rows(count: number): { rows: { a: number; b: number }[] } {
  return {
    rows: Array.from({ length: count }, (_, i) => ({ a: i, b: i * 2 })),
  };
}

const TABLE = `<table>@for(row of rows) { <tr><td>\${row.a}</td><td>\${row.b}</td><td>\${row.a + row.b}</td></tr> }</table>`;

/** Distinct element nodes in TABLE: table, tr, and three td. */
const TABLE_ELEMENTS = 5;
/** Distinct expressions the elements of TABLE claim: rows, a, b, a + b. */
const TABLE_EXPRESSIONS = 4;

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

beforeEach(() => {
  resetSourceTrackingCaches();
});

describe('per-node memoisation', () => {
  it('collects an expression’s paths once per node', () => {
    const node = expr('$order.subtotal + $order.tax');
    const first = collectPaths(node);
    const second = collectPaths(node);

    expect(second).toBe(first);
    expect([...first]).toEqual(['order.subtotal', 'order.tax']);
    expect(sourceTrackingCacheStats().paths).toEqual({ hits: 1, misses: 1 });
  });

  it('classifies an expression once per node and op table', () => {
    const node = expr('vwap($lines[*].price)');
    const table = { vwap: { category: 'aggregate' as const, detail: 'vwap' } };

    expect(classifyExpression(node)).toEqual({ category: 'none' });
    expect(classifyExpression(node)).toEqual({ category: 'none' });
    expect(classifyExpression(node, table)).toEqual({
      category: 'aggregate',
      detail: 'vwap',
    });
    expect(classifyExpression(node, table)).toEqual({
      category: 'aggregate',
      detail: 'vwap',
    });

    // Two tables asked, two answers computed - and no more.
    expect(sourceTrackingCacheStats().classifications).toEqual({
      hits: 2,
      misses: 2,
    });
  });

  it('builds a note’s prose once and refills its paths per alias set', () => {
    const node = expr('formatCurrency($amount)');
    const invoice = new Map([['amount', ['invoice.total']]]);
    const order = new Map([['amount', ['order.total']]]);

    expect(describeExpression(node)).toBe('format currency of amount');
    expect(describeExpression(node, invoice)).toBe(
      'format currency of invoice.total'
    );
    expect(describeExpression(node, order)).toBe(
      'format currency of order.total'
    );

    expect(sourceTrackingCacheStats().notes).toEqual({ hits: 2, misses: 1 });
  });

  it('collects an element’s expressions once per node', () => {
    const template = compileOrThrow('<p>${a} ${b}</p>');
    const element = template.root.children.find(
      (child): child is ElementNode => child.kind === 'element'
    );
    if (!element) throw new Error('no element compiled');

    const first = collectElementExpressions(element);
    expect(collectElementExpressions(element)).toBe(first);
    expect(first).toHaveLength(2);
    expect(sourceTrackingCacheStats().elementExpressions).toEqual({
      hits: 1,
      misses: 1,
    });
  });

  it('forgets everything on reset', () => {
    const node = expr('$a + $b');
    collectPaths(node);
    resetSourceTrackingCaches();

    expect(sourceTrackingCacheStats().paths).toEqual({ hits: 0, misses: 0 });
    collectPaths(node);
    expect(sourceTrackingCacheStats().paths).toEqual({ hits: 0, misses: 1 });
  });
});

describe('work whose output is discarded', () => {
  it('does not classify or describe an expression unless asked', () => {
    const built = buildSourceExpression(expr('formatCurrency($order.total)'));

    expect([...built.paths]).toEqual(['order.total']);
    expect(sourceTrackingCacheStats().classifications.misses).toBe(0);
    expect(sourceTrackingCacheStats().notes.misses).toBe(0);

    // Asking for them still answers, and answers correctly.
    expect(built.op).toEqual({ category: 'format', detail: 'currency' });
    expect(built.note).toBe('format currency of order.total');
    expect(sourceTrackingCacheStats().classifications.misses).toBe(1);
    expect(sourceTrackingCacheStats().notes.misses).toBe(1);
  });

  it('renders rd-source without ever building an op or a note', () => {
    const html = render(TABLE, rows(50));

    expect(html).toContain('rd-source="rows[*].a"');
    expect(html).not.toContain('rd-source-op');
    expect(html).not.toContain('rd-source-note');

    const stats = sourceTrackingCacheStats();
    expect(stats.classifications.misses).toBe(0);
    expect(stats.notes.misses).toBe(0);
  });

  it('builds ops and notes only when their attributes were asked for', () => {
    render(TABLE, rows(50), {
      includeOperationTracking: true,
      includeNoteGeneration: true,
    });

    const stats = sourceTrackingCacheStats();
    expect(stats.classifications.misses).toBeGreaterThan(0);
    expect(stats.classifications.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
    expect(stats.notes.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
  });
});

describe('cost is proportional to the template, not to the data', () => {
  it('derives each element’s attributes once however many rows render', () => {
    const html = render(TABLE, rows(1000));

    const stats = sourceTrackingCacheStats();
    expect(stats.elements.misses).toBeLessThanOrEqual(TABLE_ELEMENTS);
    expect(stats.paths.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
    expect(stats.elementExpressions.misses).toBeLessThanOrEqual(TABLE_ELEMENTS);
    // The rows really did render, and really are tracked.
    expect(stats.elements.hits).toBeGreaterThan(1000);
    expect(html.split('rd-source="rows[*].a"')).toHaveLength(1001);
  });

  it('spends the same on 10 rows as on 1000', () => {
    render(TABLE, rows(10), {
      includeOperationTracking: true,
      includeNoteGeneration: true,
    });
    const small = sourceTrackingCacheStats();

    resetSourceTrackingCaches();
    render(TABLE, rows(1000), {
      includeOperationTracking: true,
      includeNoteGeneration: true,
    });
    const large = sourceTrackingCacheStats();

    expect(large.elements.misses).toBe(small.elements.misses);
    expect(large.paths.misses).toBe(small.paths.misses);
    expect(large.notes.misses).toBe(small.notes.misses);
    expect(large.classifications.misses).toBe(small.classifications.misses);
  });

  it('shares one alias map across every iteration of a loop', () => {
    render(TABLE, rows(500));

    const stats = sourceTrackingCacheStats();
    expect(stats.loopAliases.misses).toBe(1);
    expect(stats.loopAliases.hits).toBe(499);
  });

  it('derives a component’s aliases once per call site, not per row', () => {
    const template = `
<template:Cell value!>
  <td>\${formatCurrency(value)}</td>
</template:Cell>
<table>@for(row of rows) { <tr><Cell value=$row.a /></tr> }</table>`;
    const html = render(template, rows(200));

    const stats = sourceTrackingCacheStats();
    expect(stats.componentAliases.misses).toBe(1);
    expect(stats.componentAliases.hits).toBe(199);
    expect(html).toContain('rd-source="rows[*].a"');
  });

  it('keeps per-expression work static even with concrete loop indices', () => {
    render(TABLE, rows(500), {
      resolveLoopIndices: true,
      includeNoteGeneration: true,
      includeOperationTracking: true,
    });

    const stats = sourceTrackingCacheStats();
    // Every row has its own alias map by construction, so the finished
    // attributes differ per row - but the AST walks behind them must not.
    expect(stats.paths.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
    expect(stats.notes.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
    expect(stats.classifications.misses).toBeLessThanOrEqual(TABLE_EXPRESSIONS);
    expect(stats.elementExpressions.misses).toBeLessThanOrEqual(TABLE_ELEMENTS);
  });
});

describe('memoisation is invisible', () => {
  it('gives every row of an indexed loop its own paths', () => {
    const html = render(
      '<ul>@for(p of positions) { <li>${p.weight}</li> }</ul>',
      { positions: [{ weight: 1 }, { weight: 2 }, { weight: 3 }] },
      { resolveLoopIndices: true }
    );

    expect(html).toContain('rd-source="positions[0].weight"');
    expect(html).toContain('rd-source="positions[1].weight"');
    expect(html).toContain('rd-source="positions[2].weight"');
  });

  it('renders the same attributes on a warm cache as on a cold one', () => {
    const compiled = compileOrThrow(TABLE);
    const renderer = createStringRenderer(compiled);
    const options = {
      helpers: standardLibrary,
      config: {
        includeSourceTracking: true,
        includeOperationTracking: true,
        includeNoteGeneration: true,
      },
    } as const;

    const cold = renderer(rows(3), options).html;
    const warm = renderer(rows(3), options).html;
    expect(warm).toBe(cold);

    resetSourceTrackingCaches();
    expect(renderer(rows(3), options).html).toBe(cold);
  });

  it('keeps prefixes and flags apart on the same element', () => {
    const compiled = compileOrThrow('<p>$name</p>');
    const renderer = createStringRenderer(compiled);
    const data = { name: 'Ada' };

    const plain = renderer(data, {
      helpers: standardLibrary,
      config: { includeSourceTracking: true },
    }).html;
    const noted = renderer(data, {
      helpers: standardLibrary,
      config: { includeSourceTracking: true, includeNoteGeneration: true },
    }).html;
    const prefixed = renderer(data, {
      helpers: standardLibrary,
      config: { includeSourceTracking: true, sourceTrackingPrefix: 'data-x-' },
    }).html;

    expect(plain).toBe('<p rd-source="name">Ada</p>');
    expect(noted).toBe('<p rd-source="name" rd-source-note="name">Ada</p>');
    expect(prefixed).toBe('<p data-x-source="name">Ada</p>');
  });

  it('reuses one alias map per loop but never retains the indexed ones', () => {
    const items = expr('invoice.lines');

    const first = loopAliases(items, 'line', 'of');
    const second = loopAliases(items, 'line', 'of');
    expect(second).toBe(first);
    expect(first?.get('line')).toEqual(['invoice.lines[*]']);

    // A different variable over the same array is a different alias map.
    expect(loopAliases(items, 'row', 'of')).not.toBe(first);
    // As is key iteration.
    expect(loopAliases(items, 'line', 'in')).not.toBe(first);

    // Indexed maps are per row, so they are built fresh and dropped.
    const indexed = loopAliases(items, 'line', 'of', undefined, 4);
    expect(loopAliases(items, 'line', 'of', undefined, 4)).not.toBe(indexed);
    expect(indexed?.get('line')).toEqual(['invoice.lines[4]']);
  });
});
