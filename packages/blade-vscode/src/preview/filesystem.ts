/**
 * The filesystem the preview compiles through.
 *
 * Two things the real one cannot do, and the preview needs both:
 *
 * 1. **Unsaved buffers.** A live preview renders what the user is typing, not
 *    what is on disk. Every open document is served from the editor's own copy,
 *    so a component edited in another tab is picked up with no save and no
 *    special case in the compiler.
 * 2. **Not re-reading the project on every keystroke.** The preview used to do
 *    a `readdirSync`, a `statSync` per entry and a `readFileSync` + full
 *    `compile()` for every component in the project, synchronously, on the
 *    extension-host thread that every other installed extension shares - every
 *    300 ms of sustained typing, to rebuild a byte-identical component set.
 *    Reads are cached and invalidated from the file watcher; the compiler above
 *    caches the compiles.
 *
 * Nothing here is time-based. A cached read is dropped when the watcher says
 * the file changed, and an open document is never cached at all.
 */

import { dirname, resolve } from 'path';
import { nodeFileSystem } from '@bladets/template/node';
import type { DirectoryEntry, FileSystem } from '@bladets/template/node';

/** A {@link FileSystem} whose cache the host can invalidate. */
export interface PreviewFileSystem extends FileSystem {
  /** Forget everything read from `path`, and the listing of its directory. */
  invalidate(path: string): void;
  /** Forget everything. */
  clear(): void;
}

export interface PreviewFileSystemOptions {
  /** What to read through when a file is not open and not cached. */
  readonly base?: FileSystem;
  /**
   * The editor's current text for a path, or undefined when it is not open.
   *
   * Consulted on every read and never cached: the editor's copy is by
   * definition current, and a stale one is the whole bug class this avoids.
   */
  readonly openText?: (path: string) => string | undefined;
}

/**
 * Creates the preview's filesystem.
 *
 * @param options - Underlying filesystem and open-buffer lookup
 * @returns A caching, buffer-aware {@link FileSystem}
 */
export function createPreviewFileSystem(
  options?: PreviewFileSystemOptions
): PreviewFileSystem {
  const base = options?.base ?? nodeFileSystem;
  const openText = options?.openText;
  const files = new Map<string, Promise<string>>();
  const directories = new Map<string, Promise<readonly DirectoryEntry[]>>();

  /**
   * Caches a promise, and drops it if it rejects.
   *
   * A failed read is never cached: a file that does not exist yet is created a
   * moment later by the very workflow this feature exists to support.
   */
  const memo = <T>(
    cache: Map<string, Promise<T>>,
    key: string,
    compute: () => Promise<T>
  ): Promise<T> => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const pending = compute();
    cache.set(key, pending);
    return pending.catch((error: unknown) => {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    });
  };

  return {
    readFile(path) {
      const key = resolve(path);
      const buffer = openText?.(key);
      if (buffer !== undefined) return Promise.resolve(buffer);
      return memo(files, key, () => base.readFile(key));
    },

    readDirectory(path) {
      const key = resolve(path);
      return memo(directories, key, () => base.readDirectory(key));
    },

    // Not cached: one syscall, and caching a link resolution means holding an
    // answer about a path that may not exist yet.
    realPath(path) {
      return base.realPath(path);
    },

    invalidate(path) {
      const key = resolve(path);
      files.delete(key);
      // A created or deleted file changes its directory's listing, and a
      // directory event names the directory itself.
      directories.delete(key);
      directories.delete(dirname(key));
    },

    clear() {
      files.clear();
      directories.clear();
    },
  };
}
