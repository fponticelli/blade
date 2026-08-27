// @bladets/tempo - Resource ceilings
//
// The reactive renderer used to enforce none at all: a 50,000-row `@for`
// rendered, and a self-recursive component died with a `RangeError` thrown from
// inside the call stack. Unlike a server render, the machine that pays for
// either is the reader's own browser tab.
//
// The accounting is render-target-independent and lives in the shared
// traversal, so what is tested here is that this renderer is subject to it, and
// that a breach arrives through `onError` - the reactive renderer's failure
// channel - rather than as an exception thrown at nobody.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow, ResourceLimitError } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

/**
 * Lets a pass finish.
 *
 * A breach is reported once for the pass it happened in, with the number of
 * times it happened - a count that only exists once the pass is over. So the
 * report arrives after the task that provoked it, never during.
 */
const settled = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
import type { TempoRenderOptions } from '../src/types.js';

describe('resource limits', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;
  let errors: Error[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    errors = [];
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
  ): void {
    cleanup = render(
      createTempoRenderer<T>(compileOrThrow(source), {
        ...options,
        onError: error => errors.push(error),
      })(prop(data)),
      container
    );
  }

  const loop = '<ul>@for(i of items) { <li>${i}</li> }</ul>';

  it('renders a loop that stays inside the default ceiling', async () => {
    mount(loop, { items: Array.from({ length: 1000 }, (_, i) => i) });
    expect(container.querySelectorAll('li')).toHaveLength(1000);
    await settled();
    expect(errors).toEqual([]);
  });

  it('refuses a loop that exceeds the default ceiling', async () => {
    mount(loop, { items: Array.from({ length: 1001 }, (_, i) => i) });
    expect(container.querySelectorAll('li')).toHaveLength(0);
    await settled();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
    expect((errors[0] as ResourceLimitError).limitType).toBe('iterations');
  });

  it('reports the breach instead of throwing at the mounting code', async () => {
    expect(() =>
      mount(loop, { items: Array.from({ length: 50_000 }, (_, i) => i) })
    ).not.toThrow();
    await settled();
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
  });

  it('honours a ceiling the caller lowered', async () => {
    mount(loop, { items: [1, 2, 3] }, { limits: { maxIterationsPerLoop: 2 } });
    expect(container.querySelectorAll('li')).toHaveLength(0);
    await settled();
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
  });

  it('honours a ceiling the caller raised', async () => {
    mount(
      loop,
      { items: Array.from({ length: 2000 }, (_, i) => i) },
      { limits: { maxIterationsPerLoop: 5000 } }
    );
    expect(container.querySelectorAll('li')).toHaveLength(2000);
    await settled();
    expect(errors).toEqual([]);
  });

  it('keeps enforcing the ceiling on every later update', async () => {
    const data = prop({ items: [1, 2] as number[] });
    cleanup = render(
      createTempoRenderer(compileOrThrow(loop), {
        limits: { maxIterationsPerLoop: 3 },
        onError: error => errors.push(error),
      })(data),
      container
    );
    expect(container.querySelectorAll('li')).toHaveLength(2);

    data.value = { items: [1, 2, 3, 4] };
    await settled();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
  });

  it('does not refuse an honest update just because there have been many', async () => {
    // The run-wide total bounds one pass of the traversal, and re-measuring a
    // list replays that loop's contribution rather than adding to it. A counter
    // that only ever grew would refuse the hundredth honest update of a
    // three-row list as if it were the ten-thousandth row of one.
    const data = prop({ items: [1, 2, 3] as number[] });
    cleanup = render(
      createTempoRenderer(compileOrThrow(loop), {
        limits: { maxTotalIterations: 10 },
        onError: error => errors.push(error),
      })(data),
      container
    );

    for (let pass = 0; pass < 100; pass++) {
      data.value = { items: [pass, pass + 1, pass + 2] };
      await settled();
    }

    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  it('bounds a component that calls itself', async () => {
    const source =
      '<template:R depth><div>@if(depth < 100) { <R depth=$depth/> }</div></template:R>' +
      '<R depth=1/>';
    expect(() => mount(source, {})).not.toThrow();

    await settled();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
    expect((errors[0] as ResourceLimitError).limitType).toBe('componentDepth');
    // Ten frames deep, then it stops - rather than as many as the call stack
    // happened to allow before a RangeError.
    expect(container.querySelectorAll('div')).toHaveLength(10);
  });

  it('honours a component depth the caller chose', () => {
    const source =
      '<template:R depth><div>@if(depth < 100) { <R depth=$depth/> }</div></template:R>' +
      '<R depth=1/>';
    mount(source, {}, { limits: { maxComponentDepth: 3 } });
    expect(container.querySelectorAll('div')).toHaveLength(3);
  });

  it('bounds nested loops by the run-wide total', async () => {
    mount(
      '<ul>@for(g of groups) { @for(r of g.rows) { <li>${r}</li> } }</ul>',
      {
        groups: Array.from({ length: 5 }, () => ({ rows: [1, 2, 3, 4] })),
      },
      { limits: { maxTotalIterations: 10 } }
    );
    await settled();
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
  });

  it('reports a failing expression without losing the rest of the document', async () => {
    mount('<p>${nosuch(1)}</p><b>after</b>', {});
    expect(container.querySelector('b')!.textContent).toBe('after');
    await settled();
    expect(errors).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // The output-size ceiling
  //
  // `maxOutputChars` and `maxRenderMillis` are the two ceilings counted at the
  // SINK rather than in the traversal, and this sink used to be handed the
  // budget by `renderTo` and drop it. Every other ceiling was enforced here,
  // which is exactly why the hole survived: the suite proved the renderer was
  // "subject to the limits" without ever checking the two that a target has to
  // opt into. A 900-row table of 5 kB rows rendered 4.5 MB into the tab with
  // `maxOutputChars: 10000` set, and reported nothing.
  // ---------------------------------------------------------------------------

  it('refuses a render that exceeds the output-size ceiling', async () => {
    mount(
      '<p>${v}</p>',
      { v: 'x'.repeat(100) },
      { limits: { maxOutputChars: 20 } }
    );
    await settled();
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
    expect((errors[0] as ResourceLimitError).limitType).toBe('outputSize');
  });

  it('stops allocating once the output ceiling is reached', async () => {
    // Well inside every iteration ceiling, and 4.5 MB of text if nothing counts
    // it.
    mount(
      '<ul>@for(r of rows) { <li>${r}</li> }</ul>',
      { rows: Array.from({ length: 900 }, () => 'y'.repeat(5000)) },
      { limits: { maxOutputChars: 10000 } }
    );
    await settled();
    expect(errors[0]).toBeInstanceOf(ResourceLimitError);
    // The bound is what matters, not the exact row the budget ran out on.
    expect(container.textContent!.length).toBeLessThan(20000);
  });

  it('reports a breached ceiling once, not once per row', async () => {
    // A ceiling reports how much has been written, which is a different number
    // every time it is checked - so keying the report on its message would give
    // one report per refused row. It keys on which ceiling it was instead.
    mount(
      '<ul>@for(r of rows) { <li>${r}</li> }</ul>',
      { rows: Array.from({ length: 900 }, () => 'y'.repeat(5000)) },
      { limits: { maxOutputChars: 10000 } }
    );
    await settled();
    expect(errors).toHaveLength(1);
  });

  it('does not charge an update against the budget the build pass spent', async () => {
    // Only the build pass is accounted. A mounted tree that swaps one value for
    // another has not allocated a second document, and charging it as though it
    // had would make a page fail some time after it successfully mounted.
    const data = prop({ v: 'a'.repeat(50) });
    cleanup = render(
      createTempoRenderer(compileOrThrow('<p>${v}</p>'), {
        limits: { maxOutputChars: 200 },
        onError: error => errors.push(error),
      })(data),
      container
    );
    await settled();
    expect(errors).toHaveLength(0);

    // Twenty updates of 50 characters each: 1000 characters written to a tree
    // whose whole budget is 200, and none of it is a second document.
    for (let i = 0; i < 20; i++) {
      data.value = { v: String.fromCharCode(97 + i).repeat(50) };
      await settled();
    }
    expect(errors).toHaveLength(0);
    expect(container.querySelector('p')!.textContent).toHaveLength(50);
  });
});
