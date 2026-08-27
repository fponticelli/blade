/**
 * @vitest-environment jsdom
 *
 * `@for(item of items key item.id)`.
 *
 * A key names what a row *is*, as opposed to where it sits. Without one the
 * only identity a rendered row has is its position, and a reactive render that
 * reuses position `i` for element `i` hands row 0's DOM node - with the focus,
 * the caret, the half-typed value and the third-party widget attached to it -
 * to whatever item happens to sort into first place next.
 *
 * An eager render cannot tell the difference, because it builds every row from
 * scratch, so the key changes nothing it does. That is the point: the same
 * template renders identically to a string, to DOM nodes and to a reactive
 * tree, and only the reactive tree is any better for the key being there.
 */

import { describe, it, expect } from 'vitest';
import { compile, compileOrThrow } from '../src/compiler/index.js';
import { createDomRenderer, render } from '../src/renderer/index.js';
import type { Diagnostic, ForNode } from '../src/ast/types.js';

function diagnostics(src: string): readonly Diagnostic[] {
  const result = compile(src);
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

function errorCodes(src: string): string[] {
  return diagnostics(src)
    .filter(d => d.level === 'error')
    .map(d => d.code ?? '');
}

function warningCodes(src: string): string[] {
  return diagnostics(src)
    .filter(d => d.level === 'warning')
    .map(d => d.code ?? '');
}

function html(src: string, data: unknown = {}): string {
  return render(compileOrThrow(src), data).html;
}

function firstFor(src: string): ForNode {
  const found = compileOrThrow(src).root.children.find(
    (n): n is ForNode => n.kind === 'for'
  );
  if (!found) throw new Error('no @for in template');
  return found;
}

// =============================================================================
// Parsing
// =============================================================================

describe('parsing a keyed @for', () => {
  it('separates the key expression from the iterable', () => {
    const node = firstFor('@for(row of rows key row.id) { <li>$row.n</li> }');
    expect(node.itemsExpr.kind).toBe('path');
    expect(node.key).toBeDefined();
    expect(node.key!.kind).toBe('path');
  });

  it('leaves a keyless loop without one', () => {
    expect(
      firstFor('@for(row of rows) { <li>$row.n</li> }').key
    ).toBeUndefined();
  });

  it('accepts a key on an index loop and on a named-index loop', () => {
    expect(errorCodes('@for(k in obj key k) { <li>$k</li> }')).toEqual([]);
    expect(
      errorCodes('@for(row, i of rows key row.id) { <li>$i</li> }')
    ).toEqual([]);
  });

  it('accepts a call as a key', () => {
    const node = firstFor(
      '@for(row of rows key concat(row.a, row.b)) { <li>x</li> }'
    );
    expect(node.key!.kind).toBe('call');
  });

  it('still reads a data field actually named key', () => {
    expect(html('@for(x of key) { <i>$x</i> }', { key: [1, 2] })).toBe(
      '<i>1</i><i>2</i>'
    );
  });

  it('refuses a key with nothing after it', () => {
    const messages = diagnostics('@for(row of rows key) { <li>x</li> }')
      .filter(d => d.level === 'error')
      .map(d => d.message);
    expect(messages.join(' ')).toContain('for key');
  });

  it('refuses a key that depends on the position rather than the item', () => {
    expect(errorCodes('@for(row, i of rows key i) { <li>x</li> }')).toContain(
      'KEY_USES_INDEX'
    );
  });
});

// =============================================================================
// What it does and does not change
// =============================================================================

describe('an eager render', () => {
  it('produces the same document with and without a key', () => {
    const data = { rows: [{ id: 'a' }, { id: 'b' }] };
    expect(html('@for(r of rows key r.id) { <li>$r.id</li> }', data)).toBe(
      html('@for(r of rows) { <li>$r.id</li> }', data)
    );
  });

  it('does not put the key on the page', () => {
    expect(
      html('@for(r of rows key r.id) { <li>$r.id</li> }', {
        rows: [{ id: 'a' }],
      })
    ).toBe('<li>a</li>');
  });

  it('reports duplicate keys, which make identity a lie', () => {
    const warnings = render(
      compileOrThrow('@for(r of rows key r.id) { <li>$r.id</li> }'),
      { rows: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }
    ).metadata.warnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('duplicate');
  });

  it('reports duplicates once per render, not once per repeat', () => {
    const warnings = render(
      compileOrThrow('@for(r of rows key r.id) { <li>x</li> }'),
      { rows: [{ id: 'a' }, { id: 'a' }, { id: 'a' }, { id: 'a' }] }
    ).metadata.warnings;
    expect(warnings).toHaveLength(1);
  });

  it('says nothing when the keys are distinct', () => {
    expect(
      render(compileOrThrow('@for(r of rows key r.id) { <li>x</li> }'), {
        rows: [{ id: 'a' }, { id: 'b' }],
      }).metadata.warnings
    ).toEqual([]);
  });

  it('applies the same rules to the DOM sink', () => {
    const result = createDomRenderer(
      compileOrThrow('@for(r of rows key r.id) { <li>$r.id</li> }')
    )({ rows: [{ id: 'a' }, { id: 'b' }] });
    const host = document.createElement('div');
    for (const node of result.nodes) host.appendChild(node);
    expect(host.innerHTML).toBe('<li>a</li><li>b</li>');
  });
});

// =============================================================================
// Telling the author when the key matters
// =============================================================================

describe('the keyless-loop warning', () => {
  it('fires when a row holds a form control, whose state follows the node', () => {
    expect(warningCodes('@for(r of rows) { <input value=$r.v/> }')).toContain(
      'UNKEYED_LOOP'
    );
  });

  it('fires when a row holds a component, which owns state of its own', () => {
    expect(
      warningCodes(
        '<template:Row v!><li>$v</li></template:Row>' +
          '@for(r of rows) { <Row v=$r/> }'
      )
    ).toContain('UNKEYED_LOOP');
  });

  it('is silent once the loop has a key', () => {
    expect(
      warningCodes('@for(r of rows key r.id) { <input value=$r.v/> }')
    ).not.toContain('UNKEYED_LOOP');
  });

  it('is silent for a row that is only text and markup', () => {
    expect(warningCodes('@for(r of rows) { <li>$r.v</li> }')).not.toContain(
      'UNKEYED_LOOP'
    );
  });
});
