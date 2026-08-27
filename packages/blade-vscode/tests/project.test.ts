/**
 * The preview compiles the project the engine describes - not its own idea of
 * one.
 *
 * The three defects this replaces: a flat `readdirSync` that explicitly skipped
 * directories, so a namespaced component compiled in a build and was invisible
 * in the preview; a PascalCase rule that split on `-` alone, so `my_widget.blade`
 * was `My_widget` here and `MyWidget` to the compiler; and a full re-read and
 * re-compile of every component on every keystroke.
 */

import { describe, it, expect } from 'vitest';
import { createMemoryFileSystem } from '@bladets/template/node';
import type { FileSystem } from '@bladets/template/node';
import { createPreviewFileSystem } from '../src/preview/filesystem.js';
import { PreviewWorkspace } from '../src/preview/project.js';

const ROOT = '/project';

function workspaceOver(
  files: Record<string, string>,
  openText?: (path: string) => string | undefined
): { workspace: PreviewWorkspace; reads: string[] } {
  const memory = createMemoryFileSystem(files, ROOT);
  const reads: string[] = [];
  const base: FileSystem = {
    readFile(path) {
      reads.push(path);
      return memory.readFile(path);
    },
    readDirectory: path => memory.readDirectory(path),
    realPath: path => memory.realPath(path),
  };
  return {
    reads,
    workspace: new PreviewWorkspace(
      createPreviewFileSystem({ base, openText })
    ),
  };
}

describe('PreviewWorkspace', () => {
  it('discovers a component in a subdirectory, with its namespace', async () => {
    const { workspace } = workspaceOver({
      'index.blade': '<Components.Form.Input name="a"/>',
      'components/form/input.blade': '@props(name)\n<input name="${name}">',
    });

    const compilation = await workspace.compile(ROOT);

    expect(compilation.ok).toBe(true);
    if (!compilation.ok) return;
    expect([...compilation.result.context.components.keys()]).toContain(
      'Components.Form.Input'
    );
    expect(compilation.result.errors).toEqual([]);
  });

  it('names a component the way the compiler does', async () => {
    const { workspace } = workspaceOver({
      'index.blade': '<MyWidget/>',
      'my_widget.blade': '<div>widget</div>',
    });

    const compilation = await workspace.compile(ROOT);

    expect(compilation.ok).toBe(true);
    if (!compilation.ok) return;
    // The old preview produced `My_widget` here, so the preview resolved a
    // component name the build never would.
    expect([...compilation.result.context.components.keys()]).toEqual([
      'MyWidget',
    ]);
    expect(compilation.result.errors).toEqual([]);
  });

  it('renders the buffer being typed, not the file on disk', async () => {
    let buffer = '<div>typing</div>';
    const { workspace } = workspaceOver(
      { 'index.blade': '<div>saved</div>' },
      path => (path.endsWith('index.blade') ? buffer : undefined)
    );

    const first = await workspace.compile(ROOT);
    expect(first.ok && first.result.template).not.toBeNull();

    buffer = '<div>typing more</div>';
    const second = await workspace.compile(ROOT);

    expect(second.ok).toBe(true);
    if (!second.ok || second.result.template === null)
      throw new Error('no template');
    expect(JSON.stringify(second.result.template.root)).toContain(
      'typing more'
    );
  });

  it('re-reads nothing and recompiles nothing but the entry buffer', async () => {
    let buffer = '<Card title="a"/>';
    const { workspace, reads } = workspaceOver(
      {
        'index.blade': '<Card title="a"/>',
        'card.blade': '@props(title)\n<div>${title}</div>',
        'badge.blade': '@props(label = "x")\n<span>${label}</span>',
      },
      path => (path.endsWith('index.blade') ? buffer : undefined)
    );

    const first = await workspace.compile(ROOT);
    reads.length = 0;

    buffer = '<Card title="b"/>';
    const second = await workspace.compile(ROOT);

    // No template was read from disk: the entry came from the buffer and the
    // components came from the cache. (`schema.json` is probed every pass -
    // a failed read is deliberately never cached, so that creating the file
    // takes effect.)
    expect(reads.filter(path => path.endsWith('.blade'))).toEqual([]);
    if (!first.ok || !second.ok) throw new Error('compile failed');
    // And nothing was recompiled: the component definitions are the very
    // objects the previous compile produced.
    const before = first.result.template?.root.components.get('Card');
    const after = second.result.template?.root.components.get('Card');
    expect(after).toBe(before);
  });

  it('recompiles a component once its bytes are invalidated', async () => {
    const files: Record<string, string> = {
      'index.blade': '<Card title="a"/>',
      'card.blade': '@props(title)\n<div>${title}</div>',
    };
    const memory = createMemoryFileSystem(files, ROOT);
    let cardSource = files['card.blade'] as string;
    const io = createPreviewFileSystem({
      base: {
        readFile: path =>
          path.endsWith('card.blade')
            ? Promise.resolve(cardSource)
            : memory.readFile(path),
        readDirectory: path => memory.readDirectory(path),
        realPath: path => memory.realPath(path),
      },
    });
    const workspace = new PreviewWorkspace(io);

    const first = await workspace.compile(ROOT);
    cardSource = '@props(title)\n<section>${title}</section>';
    const stale = await workspace.compile(ROOT);
    workspace.invalidate(`${ROOT}/card.blade`);
    const fresh = await workspace.compile(ROOT);

    if (!first.ok || !stale.ok || !fresh.ok) throw new Error('compile failed');
    expect(stale.result.template?.root.components.get('Card')).toBe(
      first.result.template?.root.components.get('Card')
    );
    expect(fresh.result.template?.root.components.get('Card')).not.toBe(
      first.result.template?.root.components.get('Card')
    );
  });

  it('parses each sample once, not once per keystroke', async () => {
    const { workspace, reads } = workspaceOver({
      'index.blade': '<p>${title}</p>',
      'samples/a.json': '{"title":"Alpha"}',
      'samples/b.json': '{"title":"Beta"}',
    });

    const first = await workspace.sampleListing(ROOT);
    reads.length = 0;
    const second = await workspace.sampleListing(ROOT);

    expect(second).toBe(first);
    expect(reads).toEqual([]);
  });

  it('re-reads the samples once a file event invalidates them', async () => {
    const { workspace, reads } = workspaceOver({
      'index.blade': '<p>${title}</p>',
      'samples/a.json': '{"title":"Alpha"}',
    });

    await workspace.sampleListing(ROOT);
    reads.length = 0;
    workspace.invalidate(`${ROOT}/samples/a.json`);
    await workspace.sampleListing(ROOT);

    expect(reads).toEqual([`${ROOT}/samples/a.json`]);
  });

  it('reports a directory that is not a project rather than throwing', async () => {
    const { workspace } = workspaceOver({ 'notes.txt': 'hello' });

    const compilation = await workspace.compile(ROOT);

    expect(compilation.ok).toBe(false);
    if (compilation.ok) return;
    expect(compilation.message).toContain('index.blade');
  });

  it('validates every component, not only the entry file', async () => {
    const { workspace } = workspaceOver({
      'index.blade': '<Card/>',
      'card.blade': '<Buton/>',
    });

    const compilation = await workspace.compile(ROOT);

    expect(compilation.ok).toBe(true);
    if (!compilation.ok) return;
    expect(
      compilation.result.errors.some(error => error.message.includes('Buton'))
    ).toBe(true);
  });
});
