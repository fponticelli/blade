// @bladets/tempo - Keyed loops
//
// The renderer that reuses DOM, and therefore the only one for which "which
// row is this?" is a question at all. Without a key the answer is "whichever
// one sits here", so sorting a table hands row 0's node - with the caret in it,
// the value half-typed into it, and whatever widget attached itself to it - to
// whatever item sorted into first place.
//
// These tests tag a node with a property the renderer knows nothing about and
// then reorder the list. The tag is the only way to ask "is this the same
// node?", which is exactly the question the key exists to answer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileOrThrow } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import type { Prop } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { TempoRenderOptions } from '../src/types.js';

/**
 * Lets an update settle.
 *
 * An incremental render propagates over microtasks - Tempo flushes its own
 * queue in one, and the positions a keyed reconciliation moved settle in the
 * next - so "after the change" means after the task, not after the assignment.
 */
const settled = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

interface Row {
  id: string;
  label: string;
}

/** Marks a node so it can be recognised after the list has been rearranged. */
function tag(node: Element, name: string): void {
  (node as Element & { __tag?: string }).__tag = name;
}

function tagOf(node: Element): string | undefined {
  return (node as Element & { __tag?: string }).__tag;
}

describe('@for ... key', () => {
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

  const rows = (...ids: string[]): { rows: Row[] } => ({
    rows: ids.map(id => ({ id, label: id.toUpperCase() })),
  });

  it('moves a row rather than rewriting the row in its place', async () => {
    const keyed = '@for(r of rows key r.id) { <li>$r.label</li> }';
    const data = mount(keyed, rows('a', 'b', 'c'));
    tag(container.querySelectorAll('li')[0]!, 'a');

    data.value = rows('c', 'b', 'a');
    await settled();

    const items = container.querySelectorAll('li');
    expect([...items].map(li => li.textContent)).toEqual(['C', 'B', 'A']);
    // The tagged node followed its item to the end.
    expect(tagOf(items[2]!)).toBe('a');
    expect(tagOf(items[0]!)).toBeUndefined();
  });

  it('keeps what the browser holds for a row, not for a slot', async () => {
    const keyed =
      '@for(r of rows key r.id) { <input id=$r.id value=$r.label/> }';
    const data = mount(keyed, rows('a', 'b'));
    const first = container.querySelectorAll('input')[0]!;
    first.value = 'typed by the user';

    data.value = rows('b', 'a');
    await settled();

    const inputs = container.querySelectorAll('input');
    expect(inputs[1]!.value).toBe('typed by the user');
    expect(inputs[1]!.id).toBe('a');
  });

  it('identifies rows by position when the loop has no key', async () => {
    // Not a defect - it is what a keyless loop means, and the reason the
    // compiler warns when a row holds state of its own.
    const keyless = '@for(r of rows) { <li>$r.label</li> }';
    const data = mount(keyless, rows('a', 'b', 'c'));
    tag(container.querySelectorAll('li')[0]!, 'slot0');

    data.value = rows('c', 'b', 'a');
    await settled();

    const items = container.querySelectorAll('li');
    expect(items[0]!.textContent).toBe('C');
    expect(tagOf(items[0]!)).toBe('slot0');
  });

  it('renders the same elements as a keyless loop', () => {
    // The same document, not the same markup: a keyed reconciliation leaves a
    // marker comment of its own, which is Tempo's bookkeeping and not content.
    const data = rows('a', 'b');
    mount('@for(r of rows key r.id) { <li>$r.label</li> }', data);
    const keyed = [...container.querySelectorAll('li')].map(li => li.outerHTML);
    cleanup!();
    cleanup = undefined;
    container.innerHTML = '';

    mount('@for(r of rows) { <li>$r.label</li> }', data);
    expect(
      [...container.querySelectorAll('li')].map(li => li.outerHTML)
    ).toEqual(keyed);
  });

  it('adds and removes rows without disturbing the ones that stayed', async () => {
    const data = mount(
      '@for(r of rows key r.id) { <li>$r.label</li> }',
      rows('a', 'b')
    );
    tag(container.querySelectorAll('li')[1]!, 'b');

    data.value = rows('x', 'a', 'b', 'y');
    await settled();

    const items = container.querySelectorAll('li');
    expect([...items].map(li => li.textContent)).toEqual(['X', 'A', 'B', 'Y']);
    expect(tagOf(items[2]!)).toBe('b');
  });

  it('keeps the index binding honest as rows move', async () => {
    const data = mount(
      '@for(r, i of rows key r.id) { <li>${i}:${r.id}</li> }',
      rows('a', 'b')
    );
    expect(
      [...container.querySelectorAll('li')].map(li => li.textContent)
    ).toEqual(['0:a', '1:b']);

    data.value = rows('b', 'a');
    await settled();
    expect(
      [...container.querySelectorAll('li')].map(li => li.textContent)
    ).toEqual(['0:b', '1:a']);
  });

  it('reports duplicate keys through the failure channel', async () => {
    const failures: Error[] = [];
    mount(
      '@for(r of rows key r.id) { <li>$r.label</li> }',
      { rows: [{ id: 'a' }, { id: 'a' }] },
      { onError: error => failures.push(error) }
    );
    await settled();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.message).toContain('duplicate');
  });
});
