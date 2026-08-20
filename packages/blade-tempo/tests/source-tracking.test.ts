// @bladets/tempo - Source tracking
// The reactive renderer must emit the same data provenance as the string and
// DOM renderers, in the wire format consumers parse.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compile, standardLibrary } from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { TempoRenderOptions } from '../src/types.js';

describe('source tracking', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    cleanup?.();
    container.remove();
  });

  function mount(
    source: string,
    data: unknown,
    options: TempoRenderOptions = {}
  ): HTMLElement {
    const renderer = createTempoRenderer(compile(source), options);
    cleanup = render(renderer(prop(data)), container);
    return container;
  }

  const tracking: TempoRenderOptions = {
    helpers: standardLibrary,
    includeSourceTracking: true,
  };

  it('emits nothing unless asked for', () => {
    const el = mount('<p>$name</p>', { name: 'Ada' }, {}).querySelector('p')!;
    expect(el.hasAttribute('rd-source')).toBe(false);
  });

  it('reports data paths, not template coordinates', () => {
    const el = mount('<p>$customer.name</p>', { customer: { name: 'Ada' } }, tracking)
      .querySelector('p')!;
    expect(el.getAttribute('rd-source')).toBe('customer.name');
    expect(el.getAttribute('rd-source')).not.toMatch(/^\d+:\d+/);
  });

  it('separates expressions with ";" and paths with ","', () => {
    const el = mount(
      '<div>${subtotal} ${tax} ${subtotal + tax}</div>',
      { subtotal: 100, tax: 12 },
      { ...tracking, includeOperationTracking: true }
    ).querySelector('div')!;
    expect(el.getAttribute('rd-source')).toBe('subtotal;tax;subtotal,tax');
    expect(el.getAttribute('rd-source-op')).toBe('none;none;calculated');
  });

  it('resolves component props to caller paths', () => {
    const template = `
<template:Money amount!>
  <span>\${formatCurrency(amount)}</span>
</template:Money>
<Money amount=$order.total />`;
    const el = mount(template, { order: { total: 5 } }, {
      ...tracking,
      includeOperationTracking: true,
    }).querySelector('span')!;
    expect(el.getAttribute('rd-source')).toBe('order.total');
    expect(el.getAttribute('rd-source-op')).toBe('format:currency');
  });

  it('resolves loop variables to the iterated array', () => {
    const el = mount(
      '<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      { items: [{ name: 'a' }] },
      tracking
    ).querySelector('li')!;
    expect(el.getAttribute('rd-source')).toBe('items[*].name');
  });

  it('honours the configured prefix', () => {
    const el = mount('<p>$name</p>', { name: 'Ada' }, {
      ...tracking,
      sourceTrackingPrefix: 'data-track-',
    }).querySelector('p')!;
    expect(el.getAttribute('data-track-source')).toBe('name');
  });
});
