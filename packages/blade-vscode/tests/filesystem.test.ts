/**
 * The preview's caching, buffer-aware filesystem.
 *
 * The cost this replaces: a `readdirSync`, a `statSync` per entry and a
 * `readFileSync` + full `compile()` for every component in the project,
 * synchronously, on the extension-host thread, every 300 ms of typing.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMemoryFileSystem } from '@bladets/template/node';
import type { FileSystem } from '@bladets/template/node';
import { createPreviewFileSystem } from '../src/preview/filesystem.js';

function counting(files: Record<string, string>): {
  io: FileSystem;
  reads: string[];
  listings: string[];
} {
  const base = createMemoryFileSystem(files, '/project');
  const reads: string[] = [];
  const listings: string[] = [];
  return {
    reads,
    listings,
    io: {
      readFile(path) {
        reads.push(path);
        return base.readFile(path);
      },
      readDirectory(path) {
        listings.push(path);
        return base.readDirectory(path);
      },
      realPath(path) {
        return base.realPath(path);
      },
    },
  };
}

describe('createPreviewFileSystem', () => {
  it('reads a file once, however many times it is asked for', async () => {
    const { io, reads } = counting({ 'a.blade': 'one' });
    const fs = createPreviewFileSystem({ base: io });

    expect(await fs.readFile('/project/a.blade')).toBe('one');
    expect(await fs.readFile('/project/a.blade')).toBe('one');
    expect(await fs.readFile('/project/a.blade')).toBe('one');

    expect(reads).toHaveLength(1);
  });

  it('lists a directory once', async () => {
    const { io, listings } = counting({ 'a.blade': 'one', 'b.blade': 'two' });
    const fs = createPreviewFileSystem({ base: io });

    await fs.readDirectory('/project');
    await fs.readDirectory('/project');

    expect(listings).toHaveLength(1);
  });

  it('re-reads exactly the file that was invalidated', async () => {
    const { io, reads } = counting({ 'a.blade': 'one', 'b.blade': 'two' });
    const fs = createPreviewFileSystem({ base: io });

    await fs.readFile('/project/a.blade');
    await fs.readFile('/project/b.blade');
    reads.length = 0;

    fs.invalidate('/project/a.blade');
    await fs.readFile('/project/a.blade');
    await fs.readFile('/project/b.blade');

    expect(reads).toEqual(['/project/a.blade']);
  });

  it('drops the directory listing when a file in it changes', async () => {
    const { io, listings } = counting({ 'a.blade': 'one' });
    const fs = createPreviewFileSystem({ base: io });

    await fs.readDirectory('/project');
    listings.length = 0;

    fs.invalidate('/project/b.blade');
    await fs.readDirectory('/project');

    expect(listings).toEqual(['/project']);
  });

  it('normalises paths, so one file is one cache entry', async () => {
    const { io, reads } = counting({ 'a.blade': 'one' });
    const fs = createPreviewFileSystem({ base: io });

    await fs.readFile('/project/a.blade');
    await fs.readFile('/project/./a.blade');
    await fs.readFile('/project/nested/../a.blade');

    expect(reads).toHaveLength(1);
  });

  it('serves an open buffer instead of the disk, and never caches it', async () => {
    const { io, reads } = counting({ 'a.blade': 'on disk' });
    let buffer = 'first keystroke';
    const fs = createPreviewFileSystem({
      base: io,
      openText: path => (path.endsWith('a.blade') ? buffer : undefined),
    });

    expect(await fs.readFile('/project/a.blade')).toBe('first keystroke');
    buffer = 'second keystroke';
    expect(await fs.readFile('/project/a.blade')).toBe('second keystroke');
    expect(reads).toEqual([]);
  });

  it('does not cache a failed read', async () => {
    const { io } = counting({ 'a.blade': 'one' });
    const fs = createPreviewFileSystem({ base: io });

    await expect(fs.readFile('/project/missing.blade')).rejects.toThrow();
    // The file the user is about to create must not be permanently missing.
    fs.invalidate('/project/missing.blade');
    await expect(fs.readFile('/project/missing.blade')).rejects.toThrow();
  });

  it('clear forgets everything', async () => {
    const { io, reads } = counting({ 'a.blade': 'one' });
    const fs = createPreviewFileSystem({ base: io });

    await fs.readFile('/project/a.blade');
    fs.clear();
    await fs.readFile('/project/a.blade');

    expect(reads).toHaveLength(2);
  });

  it('does not cache link resolution', async () => {
    const base = createMemoryFileSystem({ 'a.blade': 'one' }, '/project');
    const spy = vi.spyOn(base, 'realPath');
    const fs = createPreviewFileSystem({ base });

    await fs.realPath('/project/a.blade');
    await fs.realPath('/project/a.blade');

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
