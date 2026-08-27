/**
 * Every node knows where it came from.
 *
 * `SourceLocation` is required on `BaseNode`, and its doc comment says the point
 * of it is error reporting, debugging and source map generation. The builders
 * used to make it OPTIONAL and default it to line 1, column 1, offset 0 - so a
 * caller that forgot the argument produced a node that type-checked, rendered
 * fine, and reported a diagnostic as a zero-width squiggle in the corner of the
 * file. Two call sites in validation/index.ts had written
 * `expr.location ?? fallback` on a NON-OPTIONAL field: the authors did not trust
 * the type, and they were right not to.
 *
 * `location` is now a required argument on every builder, and `syntheticLoc()`
 * is the single, greppable way to say a node genuinely has no source. These
 * tests hold the parser and the compiler to the consequence: what comes out of
 * real source text points at real source text.
 */

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../../src/parser/index.js';
import { compile } from '../../src/compiler/index.js';
import { standardLibrary } from '../../src/helpers/index.js';
import {
  walkNodes,
  expressionsOf,
  walkExpressions,
} from '../../src/ast/visitor.js';
import { syntheticLoc, location } from '../../src/ast/builders.js';
import type { SourceLocation, TemplateNode } from '../../src/ast/types.js';

/**
 * A template that puts every construct on a line of its own, well past line 1.
 *
 * The defaulted location was 1:1:0, so anything that still reports 1:1 from
 * below the first line is a node that never got told where it was.
 */
const SOURCE = [
  '<!doctype html>',
  '<!-- a comment -->',
  '<div class="card" data-x="v-${kind}" on:click=${onClick}>',
  '  Hello $name, you have ${count} messages',
  '  @if(ready) {',
  '    <span>${upper(name)}</span>',
  '  } @else {',
  '    <em>waiting</em>',
  '  }',
  '  @for(item, i of items key item.id) {',
  '    <li>${item.label}</li>',
  '  }',
  '  @match(status) {',
  '    when "paid" { <b>paid</b> }',
  '    * { <b>other</b> }',
  '  }',
  '  @let total = count * 2;',
  '  <>',
  '    <slot name="footer"><i>none</i></slot>',
  '  </>',
  '  <Card title="T">',
  '    <slot:header>H</slot:header>',
  '  </Card>',
  '  <script>var d = ${count};</script>',
  '</div>',
].join('\n');

/** The line and column a byte offset falls on, counting from 1. */
function positionOf(source: string, offset: number): [number, number] {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return [lines.length, (lines[lines.length - 1] ?? '').length + 1];
}

/** Every node and expression location in a parse, with a label. */
function allLocations(
  nodes: readonly TemplateNode[]
): Array<[string, SourceLocation]> {
  const found: Array<[string, SourceLocation]> = [];
  walkNodes(nodes, node => {
    found.push([node.kind === 'element' ? node.tag : node.kind, node.location]);
    for (const expr of expressionsOf(node)) {
      walkExpressions(expr, sub => {
        found.push([`${node.kind}/${sub.kind}`, sub.location]);
      });
    }
  });
  return found;
}

describe('parsed locations are real', () => {
  const parsed = parseTemplate(SOURCE);

  it('parses the fixture without errors', () => {
    expect(parsed.errors).toEqual([]);
  });

  it('gives every node and expression a non-empty forward span', () => {
    for (const [label, loc] of allLocations(parsed.value)) {
      expect(
        loc.end.offset,
        `${label} span runs backwards`
      ).toBeGreaterThanOrEqual(loc.start.offset);
    }
  });

  it('keeps every offset consistent with its line and column', () => {
    for (const [label, loc] of allLocations(parsed.value)) {
      expect(
        positionOf(SOURCE, loc.start.offset),
        `${label} start offset disagrees with its line/column`
      ).toEqual([loc.start.line, loc.start.column]);
      expect(
        positionOf(SOURCE, loc.end.offset),
        `${label} end offset disagrees with its line/column`
      ).toEqual([loc.end.line, loc.end.column]);
    }
  });

  // The defaulted location was exactly this: 1:1:0. Only the first node of the
  // document may legitimately report it.
  it('never reports the 1:1:0 placeholder for anything below line 1', () => {
    const placeholders = allLocations(parsed.value)
      .filter(([, loc]) => loc.start.offset > 0)
      .filter(([, loc]) => loc.start.line === 1 && loc.start.column === 1);
    expect(placeholders).toEqual([]);
  });

  it('points every construct at the line it was written on', () => {
    const lineOf = (needle: string): number =>
      SOURCE.slice(0, SOURCE.indexOf(needle)).split('\n').length;
    const byKind = new Map<string, number[]>();
    walkNodes(parsed.value, node => {
      const key = node.kind === 'element' ? node.tag : node.kind;
      byKind.set(key, [...(byKind.get(key) ?? []), node.location.start.line]);
    });

    expect(byKind.get('doctype')).toEqual([lineOf('<!doctype')]);
    expect(byKind.get('comment')).toEqual([lineOf('<!--')]);
    expect(byKind.get('if')).toEqual([lineOf('@if(ready)')]);
    expect(byKind.get('for')).toEqual([lineOf('@for(item')]);
    expect(byKind.get('match')).toEqual([lineOf('@match(status)')]);
    expect(byKind.get('let')).toEqual([lineOf('@let total')]);
    expect(byKind.get('slot')).toEqual([lineOf('<slot name')]);
    expect(byKind.get('slot-fill')).toEqual([lineOf('<slot:header>')]);
    expect(byKind.get('component')).toEqual([lineOf('<Card')]);
    expect(byKind.get('script')).toEqual([lineOf('<script>')]);
  });

  it('slices back to the source text it names', () => {
    const div = parsed.value.find(
      node => node.kind === 'element' && node.tag === 'div'
    );
    expect(div).toBeDefined();
    const loc = div!.location;
    expect(SOURCE.slice(loc.start.offset, loc.end.offset)).toContain(
      '<div class="card"'
    );
  });
});

describe('diagnostics carry a usable span', () => {
  // The concrete cost of a defaulted location: an editor squiggle over zero
  // characters at the top of the file, whatever line the problem is on.
  it('reports a parse error at its own line with a non-zero-width span', () => {
    const source = 'line one\nline two\n@if(unclosed) {\n';
    const result = compile(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.diagnostics.find(d => d.level === 'error');
    expect(error).toBeDefined();
    expect(error!.location.start.line).toBeGreaterThan(1);
    expect(error!.location.start.offset).toBeGreaterThan(0);
    expect(error!.location.end.offset).toBeGreaterThan(
      error!.location.start.offset
    );
  });

  it('reports an unknown helper at the call, not at the top of the file', () => {
    const source = '<p>one</p>\n<p>two</p>\n<p>${noSuchHelper(x)}</p>';
    const result = compile(source, { helpers: standardLibrary });
    const diagnostics = result.ok
      ? result.template.diagnostics
      : result.diagnostics;

    const found = diagnostics.find(d => d.code === 'UNKNOWN_HELPER');
    expect(found).toBeDefined();
    // The call expression's own span - which is what the editor squiggles.
    expect(found!.location.start.line).toBe(3);
    expect(
      source.slice(found!.location.start.offset, found!.location.end.offset)
    ).toBe('noSuchHelper(x)');
  });
});

describe('the synthetic location is explicit', () => {
  it('is the 1:1 one-character span, and nothing builds it by accident', () => {
    expect(syntheticLoc()).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 2, offset: 1 },
    });
  });

  it('is a fresh object each time, so no two nodes share one', () => {
    expect(syntheticLoc()).not.toBe(syntheticLoc());
  });

  it('builds a real span from two positions', () => {
    const loc = location(
      { line: 3, column: 5, offset: 42 },
      { line: 3, column: 9, offset: 46 }
    );
    expect(loc).toEqual({
      start: { line: 3, column: 5, offset: 42 },
      end: { line: 3, column: 9, offset: 46 },
      source: undefined,
    });
  });
});
