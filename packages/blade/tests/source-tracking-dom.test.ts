/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler/index.js';
import { createDomRenderer } from '../src/renderer/index.js';
import { standardLibrary } from '../src/helpers/index.js';
import type { RenderConfig } from '../src/renderer/index.js';

function renderToElement(
  source: string,
  data: unknown,
  config: Partial<RenderConfig> = {}
): Element {
  const renderer = createDomRenderer(compile(source));
  const { nodes } = renderer(data, {
    helpers: standardLibrary,
    config: { includeSourceTracking: true, ...config },
  });
  const element = nodes.find((node): node is Element => node.nodeType === 1);
  if (!element) throw new Error('no element rendered');
  return element;
}

describe('source tracking in the DOM renderer', () => {
  it('is off unless asked for', () => {
    const el = renderToElement(
      '<p>$name</p>',
      { name: 'Ada' },
      {
        includeSourceTracking: false,
      }
    );
    expect(el.hasAttribute('rd-source')).toBe(false);
  });

  it("sets rd-source from the element's own expressions", () => {
    const el = renderToElement('<div>${subtotal} ${tax}</div>', {
      subtotal: 100,
      tax: 12,
    });
    expect(el.getAttribute('rd-source')).toBe('subtotal;tax');
  });

  it('sets ops and notes when asked', () => {
    const el = renderToElement(
      '<p>${formatCurrency(order.total)}</p>',
      { order: { total: 1 } },
      { includeOperationTracking: true, includeNoteGeneration: true }
    );
    expect(el.getAttribute('rd-source')).toBe('order.total');
    expect(el.getAttribute('rd-source-op')).toBe('format:currency');
    expect(el.getAttribute('rd-source-note')).toBe(
      'format currency of order.total'
    );
  });

  it('resolves component props to caller paths', () => {
    const template = `
<template:Money amount!>
  <span>\${formatCurrency(amount)}</span>
</template:Money>
<Money amount=$order.total />`;
    const el = renderToElement(template, { order: { total: 5 } });
    expect(el.getAttribute('rd-source')).toBe('order.total');
  });

  it('resolves loop variables to the iterated array', () => {
    const el = renderToElement(
      '<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      { items: [{ name: 'a' }] }
    );
    expect(el.querySelector('li')?.getAttribute('rd-source')).toBe(
      'items[*].name'
    );
  });

  it('honours the configured prefix', () => {
    const el = renderToElement(
      '<p>$name</p>',
      { name: 'Ada' },
      {
        sourceTrackingPrefix: 'data-track-',
      }
    );
    expect(el.getAttribute('data-track-source')).toBe('name');
    expect(el.hasAttribute('rd-source')).toBe(false);
  });
});
