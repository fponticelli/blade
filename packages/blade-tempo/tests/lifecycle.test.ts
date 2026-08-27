// @bladets/tempo - What an unmounted template costs
//
// Every cell this renderer derives is created while the traversal runs, and the
// traversal used to run *before* `render()` had established a disposal scope:
// `createTempoRenderer(t)(data)` built the whole graph, `Computed` registered
// with the scope that was current - null - and nothing was ever tracked. The
// cells stayed attached to the caller's own signal, so a single-page app that
// navigated ten times paid for eleven copies of every expression on every data
// change, ten of which had no DOM on screen at all.
//
// The leak is created BY mounting, which is why it hit exactly the real usage:
// a renderer that is never mounted leaves its cells dirty, and a dirty cell
// costs nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import type { HelperRegistry } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';

/** How many computed cells hang off a signal. Tempo's own bookkeeping. */
function derivativeCount(signal: unknown): number {
  const derivatives = (signal as { _derivatives: unknown[] | null })
    ._derivatives;
  return derivatives === null || derivatives === undefined
    ? 0
    : derivatives.length;
}

describe('an unmounted template', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  const source = '<p>${tally(a)}</p><p>${tally(b)}</p><p>${tally(c)}</p>';

  function counting(): { helpers: HelperRegistry; count: () => number } {
    let calls = 0;
    return {
      helpers: {
        tally:
          () =>
          (value: unknown): unknown => {
            calls++;
            return value;
          },
      },
      count: () => calls,
    };
  }

  it('leaves nothing attached to the data it was rendered from', () => {
    const { helpers } = counting();
    const data = prop({ a: 1, b: 2, c: 3 });
    const baseline = derivativeCount(data);

    for (let pass = 0; pass < 5; pass++) {
      const clear = render(
        createTempoRenderer(compileOrThrow(source), { helpers })(data),
        container
      );
      clear();
    }

    expect(derivativeCount(data)).toBe(baseline);
  });

  it('costs nothing when the data it was rendered from changes', async () => {
    const { helpers, count } = counting();
    const data = prop({ a: 1, b: 2, c: 3 });

    for (let pass = 0; pass < 5; pass++) {
      const clear = render(
        createTempoRenderer(compileOrThrow(source), { helpers })(data),
        container
      );
      clear();
    }

    const afterMounting = count();
    data.value = { a: 9, b: 9, c: 9 };
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(container.innerHTML).toBe('');
    expect(count()).toBe(afterMounting);
  });

  it('still updates the copy that is still on screen', async () => {
    const { helpers } = counting();
    const data = prop({ a: 1, b: 2, c: 3 });

    const first = render(
      createTempoRenderer(compileOrThrow(source), { helpers })(data),
      container
    );
    const second = document.createElement('div');
    document.body.appendChild(second);
    const clearSecond = render(
      createTempoRenderer(compileOrThrow(source), { helpers })(data),
      second
    );
    first();

    data.value = { a: 7, b: 8, c: 9 };
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(second.textContent).toBe('789');
    clearSecond();
    second.remove();
  });

  it('builds its graph inside the render, not before it', () => {
    const { helpers, count } = counting();
    const data = prop({ a: 1, b: 2, c: 3 });
    const renderable = createTempoRenderer(compileOrThrow(source), { helpers })(
      data
    );

    // Nothing has been evaluated yet: the Renderable is a recipe, and the
    // scope it needs does not exist until Tempo mounts it.
    expect(count()).toBe(0);

    const clear = render(renderable, container);
    expect(count()).toBeGreaterThan(0);
    clear();
  });
});
