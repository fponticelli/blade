/**
 * Scope analysis: what the cursor can see, and what the lint rules need.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../src/document.js';
import {
  getVariablesAtOffset,
  findVariableAtOffset,
  findVariableByName,
  isVariableUsed,
} from '../src/analyzer/scope.js';
import type { BladeDocument } from '../src/types.js';

function doc(content: string): BladeDocument {
  return createDocument('test://scope.blade', content);
}

function namesAt(document: BladeDocument, marker: string): string[] {
  const offset = document.content.indexOf(marker);
  expect(offset, `marker ${marker} not found`).toBeGreaterThanOrEqual(0);
  return getVariablesAtOffset(document.scope, offset).map(v => v.name);
}

describe('scope segments', () => {
  it('is a sorted, disjoint table rather than one entry per node', () => {
    const document = doc(
      '@props(title)\n<div><span>$title</span><span>$title</span></div>\n'
    );

    const starts = document.scope.segments.map(s => s.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    // Two segments: before the @props directive and after it. The old map
    // stored two entries per AST node.
    expect(document.scope.segments.length).toBeLessThanOrEqual(3);
  });

  it('binds @props for the rest of the document', () => {
    const document = doc('@props(title, items)\n<div>$title</div>\n');
    expect(namesAt(document, '<div>')).toEqual(['title', 'items']);
  });

  it('does not bind @props before the directive', () => {
    const document = doc('<p>x</p>\n@props(title)\n<div>$title</div>');
    expect(namesAt(document, '<p>')).toEqual([]);
  });

  it('binds loop variables only inside the loop', () => {
    const document = doc(
      '@props(items)\n@for(item, index of items) {\n  <li>$item</li>\n}\n<p>after</p>\n'
    );

    expect(namesAt(document, '<li>')).toEqual(['items', 'item', 'index']);
    expect(namesAt(document, '<p>after')).toEqual(['items']);
  });

  it('nests loop variables', () => {
    const document = doc(
      '@props(data)\n@for(outer of data) {\n  @for(inner of outer) {\n    <b>x</b>\n  }\n}\n'
    );
    expect(namesAt(document, '<b>')).toEqual(['data', 'outer', 'inner']);
  });

  it('binds a @let for the rest of its block only', () => {
    const document = doc(
      '@if(ok) {\n  @@ { let total = 1; }\n  <i>$total</i>\n}\n<u>after</u>\n'
    );
    expect(namesAt(document, '<i>')).toContain('total');
    expect(namesAt(document, '<u>after')).not.toContain('total');
  });

  it('gives a component definition body its own props and nothing else', () => {
    // A `<template:>` body renders with only its props bound, so offering the
    // enclosing file's @props inside it offered names that evaluate to nothing.
    const document = doc(
      '@props(title, items)\n\n<template:Card subtitle="d">\n  <h2>$subtitle</h2>\n</template:Card>\n\n<Card />\n'
    );

    expect(namesAt(document, '<h2>')).toEqual(['subtitle']);
    expect(namesAt(document, '<Card />')).toEqual(['title', 'items']);
  });

  it('records the source array of a loop item', () => {
    const document = doc(
      '@props(items)\n@for(item of items) {\n<li>$item</li>\n}\n'
    );
    const offset = document.content.indexOf('<li>');
    expect(
      findVariableAtOffset(document.scope, 'item', offset)?.sourceVar
    ).toBe('items');
  });

  it('resolves an offset before every segment to nothing', () => {
    const document = doc('@props(a)');
    expect(getVariablesAtOffset(document.scope, -1)).toEqual([]);
  });
});

describe('usage analysis', () => {
  it('records the names expressions read', () => {
    const document = doc('@props(a, b)\n<div>${a + 1}</div>\n');
    expect(isVariableUsed(document.scope, 'a')).toBe(true);
    expect(isVariableUsed(document.scope, 'b')).toBe(false);
  });

  it('does not count a global as a template variable', () => {
    const document = doc('<div>${$.currency}</div>');
    expect(document.scope.usedVariables.has('currency')).toBe(false);
  });

  it('sees reads inside a component definition body', () => {
    const document = doc(
      '<template:Card title!>\n  <h2>$title</h2>\n</template:Card>\n'
    );
    expect(isVariableUsed(document.scope, 'title')).toBe(true);
  });

  it('records helper calls with their locations', () => {
    const document = doc('<div>${formatCurrency(1)}</div>');
    expect(document.scope.helpersUsed.has('formatCurrency')).toBe(true);
    const call = document.scope.helperCalls[0];
    expect(call?.helperName).toBe('formatCurrency');
    expect(call?.location.start.offset).toBeGreaterThan(0);
  });

  it('records control-flow nesting depth', () => {
    const document = doc(
      '@if(a) {\n @for(x of y) {\n  @if(b) {\n   <i>d</i>\n  }\n }\n}\n'
    );
    expect(document.scope.maxNestingDepth).toBe(3);
    expect(document.scope.nestingSites.map(s => s.depth).sort()).toEqual([
      1, 2, 3,
    ]);
  });

  it('lists every declaration for the unused-variable rule', () => {
    const document = doc('@props(a)\n@for(item of a) {\n<i>x</i>\n}\n');
    expect(document.scope.declarations.map(d => d.name)).toEqual(['a', 'item']);
    expect(findVariableByName(document.scope, 'item')?.kind).toBe('for-item');
  });
});
