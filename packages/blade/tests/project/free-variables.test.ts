import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../../src/parser/index.js';
import { collectFreeVariables } from '../../src/project/free-variables.js';

/** The names a template reads without binding, in first-reference order. */
function freeIn(source: string): string[] {
  const parsed = parseTemplate(source);
  expect(parsed.errors, source).toEqual([]);
  return Array.from(collectFreeVariables(parsed.value).keys());
}

describe('collectFreeVariables', () => {
  it('reports a name read in an interpolation', () => {
    expect(freeIn('<p>$title</p>')).toEqual(['title']);
  });

  it('reports a name read in a block expression', () => {
    // The regular expression this replaces matched `$name` but could not see
    // `${...}`, so genuinely required props expressed that way went missing.
    expect(freeIn('<p>${first + last}</p>')).toEqual(['first', 'last']);
  });

  it('reports names read in attributes', () => {
    expect(freeIn('<a href={$url} class="x">go</a>')).toEqual(['url']);
  });

  it('does not report a @for item or index variable', () => {
    expect(
      freeIn('@for(item, i of items) { <li>${item.name} $i</li> }')
    ).toEqual(['items']);
  });

  it('does not report a @let binding, but does report what it reads', () => {
    expect(freeIn('@let total = price * 2\n<p>$total</p>')).toEqual(['price']);
  });

  it('reads a @let value in the scope before the binding', () => {
    // `@let x = x` reads the outer `x`, which is free.
    expect(freeIn('@let x = x\n<p>$x</p>')).toEqual(['x']);
  });

  it('does not report a @props declaration', () => {
    expect(freeIn('@props(label)\n<button>$label</button>')).toEqual([]);
  });

  it('does not report an arrow function parameter', () => {
    expect(freeIn('@let f = (x) => x + offset\n<p>${f(1)}</p>')).toEqual([
      'offset',
    ]);
  });

  it('does not report a global', () => {
    expect(freeIn('<p>${$.currency} $amount</p>')).toEqual(['amount']);
  });

  it('descends into every branch, case, slot fallback and fragment', () => {
    const source = `@if(a) { <p>$b</p> } @else { <p>$c</p> }
@match(d) { when 1 { <p>$e</p> } * { <p>$f</p> } }
<slot>$g</slot>`;
    expect(freeIn(source)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('accepts names already in scope', () => {
    const parsed = parseTemplate('<p>$a $b</p>');
    expect(
      Array.from(collectFreeVariables(parsed.value, ['a']).keys())
    ).toEqual(['b']);
  });

  it('locates a free variable at its first reference', () => {
    const parsed = parseTemplate('<p>\n  $title\n</p>');
    const location = collectFreeVariables(parsed.value).get('title');
    expect(location?.start.line).toBe(2);
  });
});
