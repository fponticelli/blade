/**
 * Hover.
 *
 * Untested until now, which is how it came to carry five backward-scanning
 * predicates of its own - three with a counterpart in the completion provider
 * and a different cutoff.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { createDocument } from '../src/document.js';
import { getHoverInfo } from '../src/providers/hover.js';
import { initializeProjectContext } from '../src/project-context.js';
import type { ProjectLspContext } from '../src/project-context.js';
import { positionAt } from '../src/line-index.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixtures = PROJECT_FIXTURES_ROOT;

/** Hover at the `|` marker, which is removed from the source. */
function hoverAt(marked: string, context?: ProjectLspContext | null) {
  const offset = marked.indexOf('|');
  expect(offset).toBeGreaterThan(-1);
  const content = marked.slice(0, offset) + marked.slice(offset + 1);
  const doc = createDocument('test://hover.blade', content);
  return getHoverInfo(doc, positionAt(doc.lines, offset), context);
}

let schemaContext: ProjectLspContext | null = null;

async function withSchema(): Promise<ProjectLspContext> {
  schemaContext ??= await initializeProjectContext(
    resolve(fixtures, 'with-schema')
  );
  expect(schemaContext).not.toBeNull();
  return schemaContext!;
}

describe('hover without a project', () => {
  it('describes a directive keyword', () => {
    expect(hoverAt('@i|f(a) {\n<i>x</i>\n}')?.contents).toContain('@if');
  });

  it('describes a prop declared by @props', () => {
    expect(hoverAt('@props(ti|tle)\n<p>x</p>')?.contents).toContain(
      'Component prop'
    );
  });

  it('describes a loop item variable', () => {
    const info = hoverAt('@for(item of items) {\n<li>$it|em</li>\n}');
    expect(info?.contents).toContain('Loop item');
  });

  it('describes a loop item where it is declared', () => {
    const info = hoverAt('@for(it|em of items) {\n<li>x</li>\n}');
    expect(info?.contents).toContain('Loop item');
  });

  it('describes a builtin helper', () => {
    const info = hoverAt('<p>${formatCu|rrency(1)}</p>');
    expect(info?.contents).toContain('formatCurrency');
    expect(info?.contents).toContain('Examples');
  });

  it('describes a component defined in the document', () => {
    const info = hoverAt(
      '<template:Card title!>\n<div>x</div>\n</template:Card>\n<Ca|rd />'
    );
    expect(info?.contents).toContain('Component Card');
  });

  it('describes a prop of a template definition', () => {
    const info = hoverAt('<template:Card ti|tle!>\n<i>x</i>\n</template:Card>');
    expect(info?.contents).toContain('Template prop definition');
    expect(info?.contents).toContain('required');
  });

  it('says nothing in prose', () => {
    expect(hoverAt('<p>hello wo|rld</p>')).toBeNull();
  });

  it('says nothing on an empty position', () => {
    expect(hoverAt('<p> | </p>')).toBeNull();
  });
});

describe('hover with a schema', () => {
  it('types a schema path', async () => {
    const info = hoverAt('<p>${user.na|me}</p>', await withSchema());
    expect(info?.contents).toContain('`string`');
    expect(info?.contents).toContain("User's display name");
  });

  it('types a prop inside @props, on a long line', async () => {
    // Hover used a 100-character window and completion a 50-character one; on
    // a long @props line the two disagreed about the same offset.
    const marked =
      '@props(user, items, settings, alpha, beta, gamma, delta, epsilon, zeta, se|ttings)\n<p>x</p>';
    const info = hoverAt(marked, await withSchema());
    expect(info?.contents).toContain('Component prop');
  });

  it('narrows a loop item to its element type', async () => {
    const info = hoverAt(
      '@for(item of items) {\n<li>$it|em</li>\n}',
      await withSchema()
    );
    expect(info?.contents).toContain('Loop item from items');
    expect(info?.contents).toContain('price');
  });

  it('types a property of a loop item', async () => {
    const info = hoverAt(
      '@for(item of items) {\n<li>$item.pr|ice</li>\n}',
      await withSchema()
    );
    expect(info?.contents).toContain('`number`');
  });

  it('types the source array in a @for header', async () => {
    const info = hoverAt(
      '@for(item of it|ems) {\n<li>x</li>\n}',
      await withSchema()
    );
    expect(info?.contents).toContain('`array`');
  });

  it('falls back to the loop role when the schema knows nothing', () => {
    const info = hoverAt(
      '@for(item of mystery) {\n<li>x</li>\n}'.replace('mystery', 'myst|ery')
    );
    expect(info?.contents).toContain('Source array for @for loop');
  });

  it('types a wildcard path as a collection', async () => {
    const info = hoverAt('<p>${items[*].pr|ice}</p>', await withSchema());
    expect(info?.contents).toContain('number[]');
  });
});
