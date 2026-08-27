// @bladets/tempo - The failure channel
//
// A reactive render has no caller to throw at: by the time an expression
// misbehaves, the call that mounted the tree returned long ago. Everything goes
// through `onError` instead - which used to mean one bad expression in a
// 200-row table produced 200 warnings at mount and 200 more on every change,
// each one retained by DevTools with all its arguments.
//
// A failure is a property of an *expression*, not of an evaluation. It is
// reported once per pass, with the number of times it happened and the loop
// position where it was first seen, so the report says "this expression, 200
// rows" rather than saying "this expression" 200 times.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import type { HelperRegistry, SourceLocation } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { FailureDetail, TempoRenderOptions } from '../src/types.js';

/** Lets a pass finish: Tempo's flush, then the report that follows it. */
const settled = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

interface Report {
  message: string;
  location: SourceLocation;
  detail: FailureDetail;
}

/** A helper that throws for every value; one expression, many evaluations. */
const throwing: HelperRegistry = {
  boom: () => () => {
    throw new Error('boom');
  },
  fine: () => (value: unknown) => value,
};

describe('reporting', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;
  let reports: Report[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    reports = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    container.remove();
  });

  function mount<T>(
    source: string,
    data: T,
    options: TempoRenderOptions = {}
  ): Prop<T> {
    const cell = prop(data);
    cleanup = render(
      createTempoRenderer<T>(compileOrThrow(source), {
        helpers: throwing,
        ...options,
        onError: (error, location, detail) =>
          reports.push({ message: error.message, location, detail }),
      })(cell),
      container
    );
    return cell;
  }

  const rows = (n: number): { rows: number[] } => ({
    rows: Array.from({ length: n }, (_, i) => i),
  });

  it('reports one failing expression once, however many rows it ran in', async () => {
    mount('@for(r of rows) { <li>${boom(r)}</li> }', rows(200));
    await settled();

    expect(reports).toHaveLength(1);
    expect(reports[0]!.detail.occurrences).toBe(200);
  });

  it('reports each distinct expression separately', async () => {
    mount('<i>${boom(1)}</i><b>${boom(2)}</b>', {});
    await settled();

    expect(reports).toHaveLength(2);
    expect(reports[0]!.location.start.column).not.toBe(
      reports[1]!.location.start.column
    );
  });

  it('says where in the loop the failure was first seen', async () => {
    mount('@for(r of rows) { <li>@if(r > 2) { ${boom(r)} }</li> }', rows(6));
    await settled();

    expect(reports).toHaveLength(1);
    expect(reports[0]!.detail.indices).toEqual([3]);
  });

  it('leaves the indices empty outside any loop', async () => {
    mount('<i>${boom(1)}</i>', {});
    await settled();

    expect(reports[0]!.detail.indices).toEqual([]);
  });

  it('reports again on the next pass, not once for the life of the tree', async () => {
    const data = mount('@for(r of rows) { <li>${boom(r)}</li> }', rows(3));
    await settled();
    expect(reports).toHaveLength(1);

    data.value = rows(4);
    await settled();
    expect(reports).toHaveLength(2);
    // One occurrence, not four: the three rows that did not change were not
    // re-evaluated, so they did not fail again either. The count reports what
    // actually happened in the pass, not how big the list is.
    expect(reports[1]!.detail.occurrences).toBe(1);
    expect(reports[1]!.detail.indices).toEqual([3]);
  });

  it('says nothing when nothing failed', async () => {
    mount('@for(r of rows) { <li>${fine(r)}</li> }', rows(10));
    await settled();
    expect(reports).toEqual([]);
  });

  it('carries a substitution the render made, not only a thrown error', async () => {
    mount('<a href="${u}">go</a>', { u: 'javascript:alert(1)' });
    await settled();

    expect(reports).toHaveLength(1);
    expect(reports[0]!.detail.severity).toBe('warning');
    expect(reports[0]!.message).toContain('href');
  });

  it('attributes a substitution to the row it happened in', async () => {
    mount('@for(r of rows) { <a href="${r}">x</a> }', {
      rows: ['/ok', '/fine', 'javascript:alert(1)'],
    });
    await settled();

    expect(reports).toHaveLength(1);
    expect(reports[0]!.detail.severity).toBe('warning');
    expect(reports[0]!.detail.indices).toEqual([2]);
  });

  it('marks a thrown expression as an error', async () => {
    mount('<i>${boom(1)}</i>', {});
    await settled();
    expect(reports[0]!.detail.severity).toBe('error');
  });
});
