// @bladets/tempo - What an update costs
//
// A reactive renderer earns its complexity by doing less work than a re-render
// would. This one did more: every expression in the template depended on the
// whole data object, so replacing one field re-walked every expression's AST;
// a loop rebuilt a copy of the caller's data per row per update, which gave
// every row a fresh object identity and invalidated everything downstream of
// it; and a component's props were a new object on every tick of the caller's
// data, so the invalidation crossed into every component the body nested.
//
// Expression evaluations are counted through a helper, because a helper call is
// the one part of an evaluation a test can see. Each `tally(...)` in these
// templates stands for one expression that had to be walked.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import type { HelperRegistry } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

describe('update cost', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;
  let calls: number;

  /** Counts each evaluation and returns its argument unchanged. */
  const helpers: HelperRegistry = {
    tally: () => (value: unknown) => {
      calls++;
      return value;
    },
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    calls = 0;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    container.remove();
  });

  function mount<T>(source: string, data: T): Prop<T> {
    const cell = prop(data);
    cleanup = render(
      createTempoRenderer<T>(compileOrThrow(source), { helpers })(cell),
      container
    );
    return cell;
  }

  const rows = (count: number): { a: number; b: number; c: number }[] =>
    Array.from({ length: count }, (_, i) => ({ a: i, b: i * 2, c: i * 3 }));

  // ==========================================================================
  // Finding 9 - an expression depends on what it reads, not on the whole data
  // ==========================================================================

  it('does not re-evaluate a table when an unrelated field changes', async () => {
    const table =
      '<h1>${title}</h1><table>@for(row of rows) { <tr>' +
      '<td>${tally(row.a)}</td><td>${tally(row.b)}</td><td>${tally(row.c)}</td>' +
      '</tr> }</table>';
    const payload = { title: 'before', rows: rows(200) };
    const data = mount(table, payload);

    expect(calls).toBe(600);
    expect(container.querySelectorAll('td')).toHaveLength(600);

    calls = 0;
    data.value = { ...payload, title: 'after' };
    await Promise.resolve();

    expect(container.querySelector('h1')!.textContent).toBe('after');
    expect(calls).toBe(0);
  });

  it('re-evaluates only the column whose field changed', async () => {
    const data = mount('<p>${tally(left)}</p><p>${tally(right)}</p>', {
      left: 1,
      right: 2,
    });
    calls = 0;

    data.value = { left: 9, right: 2 };
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(container.textContent).toBe('92');
  });

  // ==========================================================================
  // Finding 8 - a loop binds its item, it does not copy the caller's data
  // ==========================================================================

  it('evaluates a loop body once per item, not twice', async () => {
    const data = mount(
      '<ul>@for(item of items) { <li>${tally(item)}</li> }</ul>',
      { items: Array.from({ length: 100 }, (_, i) => i), other: 0 }
    );
    expect(calls).toBe(100);

    calls = 0;
    data.value = {
      items: data.value.items,
      other: 1,
    };
    await Promise.resolve();

    expect(calls).toBe(0);
  });

  it('re-evaluates a row when its item changes, and no more than the list', async () => {
    // How finely a changed list narrows to changed rows is Tempo's `ForEach` to
    // decide. What this renderer owes is that the work is bounded by the list
    // that changed rather than by the template as a whole.
    const data = mount(
      '<ul>@for(item of items) { <li>${tally(item)}</li> }</ul>' +
        '<p>${tally(other)}</p>',
      { items: [1, 2, 3], other: 'x' }
    );
    calls = 0;

    data.value = { items: [1, 99, 3], other: 'x' };
    await Promise.resolve();

    expect(
      [...container.querySelectorAll('li')].map(li => li.textContent)
    ).toEqual(['1', '99', '3']);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('does not copy the caller’s data object per row', async () => {
    // The body reads a field of the payload directly. A loop that spread the
    // payload into a per-row object would hand that read a new object identity
    // every update, and every row would re-evaluate.
    const shared = { v: 0 };
    const data = mount(
      '<ul>@for(item of items) { <li>${item}${tally(shared.v)}</li> }</ul>',
      { items: [1, 2, 3, 4, 5], shared }
    );
    expect(calls).toBe(5);

    calls = 0;
    data.value = { items: [1, 2, 3, 4, 5], shared };
    await Promise.resolve();
    expect(calls).toBe(0);
  });

  // ==========================================================================
  // Finding 10 - a component body depends on the props it reads
  // ==========================================================================

  it('does not re-evaluate a component when the caller’s other data changes', async () => {
    const source =
      '<template:Cell v!><td>${tally(v)}</td></template:Cell>' +
      '<h1>${title}</h1><table>@for(row of rows) { <tr><Cell v=$row.a/></tr> }</table>';
    const payload = { title: 'before', rows: rows(50) };
    const data = mount(source, payload);

    expect(calls).toBe(50);

    calls = 0;
    data.value = { ...payload, title: 'after' };
    await Promise.resolve();

    expect(container.querySelector('h1')!.textContent).toBe('after');
    expect(calls).toBe(0);
  });

  it('does not propagate an unchanged prop set', async () => {
    const source =
      '<template:Cell v!><td>${tally(v)}</td></template:Cell>' +
      '<div>${other}</div><Cell v=$fixed/>';
    const data = mount(source, { fixed: 7, other: 1 });
    calls = 0;

    data.value = { fixed: 7, other: 2 };
    await Promise.resolve();

    expect(container.querySelector('td')!.textContent).toBe('7');
    expect(calls).toBe(0);
  });

  // ==========================================================================
  // Finding 6 - `@match` evaluates its subject once, not once per case
  // ==========================================================================

  it('evaluates a match subject once however many cases there are', () => {
    mount(
      '@match(tally(v)) { when 1 { <p>one</p> } when 2 { <p>two</p> } _ > 2 { <p>many</p> } * { <p>none</p> } }',
      { v: 3 }
    );
    expect(container.querySelector('p')!.textContent).toBe('many');
    expect(calls).toBe(1);
  });

  // ==========================================================================
  // A constant expression is not a signal at all
  // ==========================================================================

  it('builds a static text node for an expression that reads nothing', async () => {
    const data = mount('<p>${1 + 1}</p><b>${n}</b>', { n: 1 });
    expect(container.querySelector('p')!.textContent).toBe('2');

    data.value = { n: 2 };
    await Promise.resolve();
    expect(container.querySelector('b')!.textContent).toBe('2');
  });
});
