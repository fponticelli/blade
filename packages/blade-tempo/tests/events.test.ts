// @bladets/tempo - Event bindings
//
// The one renderer where a handler can actually do something, and the one that
// used to throw them away: `on:click` was warned about and dropped, so an
// author who tested against the string renderer saw the attribute in the
// output and got a dead button in the app.
//
// A binding is a value, not text. What that buys is here: the handler is read
// from its cell when the event fires, so a handler that depends on the data is
// simply a different value in the same cell - no listener is torn down, and no
// row in a list is rebuilt to change what its button does.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { TempoRenderOptions } from '../src/types.js';

/** Lets an update, and the report that may follow it, settle. */
const settled = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('on: bindings', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
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
      createTempoRenderer<T>(compileOrThrow(source), options)(cell),
      container
    );
    return cell;
  }

  it('runs the handler when the event fires', () => {
    let clicks = 0;
    mount('<button on:click=${go}>x</button>', {
      go: () => {
        clicks++;
      },
    });
    container.querySelector('button')!.click();
    expect(clicks).toBe(1);
  });

  it('hands the handler the event', () => {
    let seen: unknown = null;
    mount('<button on:click=${go}>x</button>', {
      go: (event: unknown) => {
        seen = event;
      },
    });
    container.querySelector('button')!.click();
    expect(seen).toBeInstanceOf(Event);
  });

  it('leaves no attribute on the element', () => {
    mount('<button on:click=${go}>x</button>', { go: () => undefined });
    const button = container.querySelector('button')!;
    expect(button.hasAttribute('on:click')).toBe(false);
    expect(container.innerHTML).toBe('<button>x</button>');
  });

  it('follows the data without rebuilding the element', async () => {
    const calls: string[] = [];
    const data = mount<{ go: () => void }>(
      '<button on:click=${go}>x</button>',
      {
        go: () => calls.push('first'),
      }
    );
    const before = container.querySelector('button')!;

    data.value = { go: () => calls.push('second') };
    await settled();

    const after = container.querySelector('button')!;
    expect(after).toBe(before);
    after.click();
    expect(calls).toEqual(['second']);
  });

  it('calls a handler declared with @let', () => {
    const calls: unknown[] = [];
    mount(
      '@@ { let go = (e) => record(e); }<button on:click=${go}>x</button>',
      {},
      {
        helpers: {
          record: () => (value: unknown) => {
            calls.push(value);
            return null;
          },
        },
      }
    );
    container.querySelector('button')!.click();
    expect(calls).toHaveLength(1);
  });

  it('gives each row of a loop its own handler', () => {
    const picked: unknown[] = [];
    mount('@for(r of rows) { <button on:click=${r.pick}>$r.id</button> }', {
      rows: [
        { id: 'a', pick: () => picked.push('a') },
        { id: 'b', pick: () => picked.push('b') },
      ],
    });
    const buttons = container.querySelectorAll('button');
    buttons[1]!.click();
    expect(picked).toEqual(['b']);
  });

  it('stops listening when the tree is unmounted', () => {
    let clicks = 0;
    mount('<button on:click=${go}>x</button>', {
      go: () => {
        clicks++;
      },
    });
    const button = container.querySelector('button')!;
    cleanup!();
    cleanup = undefined;

    button.click();
    expect(clicks).toBe(0);
  });

  it('reports a handler that is not callable, once', async () => {
    const failures: Error[] = [];
    mount(
      '<button on:click=${go}>x</button>',
      { go: 'not a function' },
      { onError: error => failures.push(error) }
    );
    await settled();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.message).toContain('on:click');
  });

  it('does nothing at all when the handler is missing', () => {
    mount('<button on:click=${go}>x</button>', {});
    expect(() => container.querySelector('button')!.click()).not.toThrow();
  });
});
