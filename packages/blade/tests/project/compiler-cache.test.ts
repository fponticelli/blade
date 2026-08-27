/**
 * The incremental project compiler.
 *
 * The property under test is not "it is faster" but "it reuses exactly the work
 * that is still valid, and nothing else". Reuse is observed through object
 * identity: a component definition the compiler did not recompute is the *same
 * object* it returned last time, and one it recomputed is a different object
 * carrying the new source.
 */

import { describe, it, expect } from 'vitest';
import { createProjectCompiler } from '../../src/project/compile.js';
import { sourcesOf } from './support/memory-project.js';
import type { ComponentDefinition } from '../../src/ast/types.js';

function definitionOf(
  template: { root: { components: ReadonlyMap<string, ComponentDefinition> } },
  name: string
): ComponentDefinition {
  const definition = template.root.components.get(name);
  if (!definition) throw new Error(`no component named ${name}`);
  return definition;
}

const CARD = '@props(title)\n<div class="card">${title}</div>';
const BADGE = '@props(label)\n<span>${label}</span>';

describe('createProjectCompiler', () => {
  it('reuses every component when only the entry file changed', async () => {
    const compiler = createProjectCompiler();

    const first = compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': CARD,
        'badge.blade': BADGE,
      })
    );
    const second = compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="b"/><Badge label="x"/>',
        'card.blade': CARD,
        'badge.blade': BADGE,
      })
    );

    expect(first.template).not.toBeNull();
    expect(second.template).not.toBeNull();
    expect(definitionOf(second.template!, 'Card')).toBe(
      definitionOf(first.template!, 'Card')
    );
    expect(definitionOf(second.template!, 'Badge')).toBe(
      definitionOf(first.template!, 'Badge')
    );
  });

  it('recompiles the components when one of them changed', async () => {
    const compiler = createProjectCompiler();

    const first = compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': CARD,
        'badge.blade': BADGE,
      })
    );
    const second = compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': '@props(title)\n<div class="card v2">${title}</div>',
        'badge.blade': BADGE,
      })
    );

    expect(definitionOf(second.template!, 'Card')).not.toBe(
      definitionOf(first.template!, 'Card')
    );
    // A sibling's change can change this component's own diagnostics, so it is
    // recompiled too - deliberately, not incidentally.
    expect(definitionOf(second.template!, 'Badge')).not.toBe(
      definitionOf(first.template!, 'Badge')
    );
  });

  it('drops a component that no longer exists', async () => {
    const compiler = createProjectCompiler();

    compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': CARD,
        'badge.blade': BADGE,
      })
    );
    const second = compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': CARD,
      })
    );

    expect(second.template!.root.components.has('Badge')).toBe(false);
  });

  it('discards everything when handed a different project', async () => {
    const compiler = createProjectCompiler();

    compiler.compile(
      await sourcesOf({
        'index.blade': '<Card title="a"/>',
        'card.blade': CARD,
      })
    );
    const other = compiler.compile(
      await sourcesOf(
        { 'main.blade': '<Card title="a"/>', 'card.blade': CARD },
        { entry: 'main.blade' }
      )
    );

    expect(other.errors).toEqual([]);
    expect(other.template!.root.components.has('Card')).toBe(true);
  });

  it('produces the same result as a one-shot compile, call after call', async () => {
    const compiler = createProjectCompiler();
    const files = {
      'index.blade': '<Card title="a"/><Missing/>',
      'card.blade': CARD,
    };

    const first = compiler.compile(await sourcesOf(files));
    const second = compiler.compile(await sourcesOf(files));

    expect(second.errors.map(e => e.message)).toEqual(
      first.errors.map(e => e.message)
    );
    expect(second.warnings.map(w => w.code)).toEqual(
      first.warnings.map(w => w.code)
    );
    // Diagnostics are replayed, not accumulated.
    expect(second.errors).toHaveLength(first.errors.length);
  });

  it('replays a component-level diagnostic on a cached call', async () => {
    const compiler = createProjectCompiler();
    const files = {
      'index.blade': '<Card title="a"/>',
      'card.blade': '@props(title)\n<Nope/>',
    };

    const first = compiler.compile(await sourcesOf(files));
    const second = compiler.compile(await sourcesOf(files));

    expect(first.errors.length).toBeGreaterThan(0);
    expect(second.errors.map(e => e.message)).toEqual(
      first.errors.map(e => e.message)
    );
  });
});
