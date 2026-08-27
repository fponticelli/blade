/**
 * Which project a file belongs to.
 *
 * One definition, because there were three and they disagreed. The language
 * server called `dirname(file)` the project root - true only for `index.blade`
 * itself, so opening `myproj/components/card.blade` searched
 * `myproj/components` for an entry file, a `schema.json` and a `samples/`
 * folder, found none of them, and silently offered no schema completions, no
 * sample hints and no component tags for every template that is not the entry.
 * The VS Code preview walked up looking for `samples/` *or* `index.blade`, and
 * `discoverComponents` insists on the entry file - so the preview could decide
 * a directory was a project that the compiler would then refuse.
 *
 * A project is a directory containing the entry file. Nothing else is a
 * project, because nothing else can be compiled.
 */

import { dirname, resolve, sep } from 'path';
import { DEFAULT_ENTRY } from './discovery.js';
import { nodeFileSystem } from './fs.js';
import type { FileSystem } from './fs.js';

export interface FindProjectRootOptions {
  /** Filesystem to read through. Defaults to the real one. */
  readonly io?: FileSystem;
  /**
   * The entry file that marks a directory as a project.
   * @default 'index.blade'
   */
  readonly entry?: string;
  /**
   * Highest directory the search may reach, inclusive - the workspace folder.
   *
   * Without it the walk runs to the filesystem root, which on a machine with a
   * stray `index.blade` in a home directory would claim every file in it.
   */
  readonly stopAt?: string;
}

/**
 * The nearest ancestor directory of `start` that contains the entry file.
 *
 * `start` itself is considered first, so the entry file's own directory is its
 * own project.
 *
 * @param start - Directory to search upward from
 * @param options - Filesystem, entry name and workspace boundary
 * @returns The project root, or null when there is none
 */
export async function findProjectRoot(
  start: string,
  options?: FindProjectRootOptions
): Promise<string | null> {
  const io = options?.io ?? nodeFileSystem;
  const entry = options?.entry ?? DEFAULT_ENTRY;
  const boundary = options?.stopAt ? resolve(options.stopAt) : undefined;

  let directory = resolve(start);
  if (boundary !== undefined && !isWithin(boundary, directory)) {
    // The file is outside the workspace folder it was matched against; the
    // walk would immediately leave the boundary, so there is nothing to find.
    return null;
  }

  for (;;) {
    if (await containsEntry(io, directory, entry)) {
      return directory;
    }

    if (boundary !== undefined && directory === boundary) return null;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

async function containsEntry(
  io: FileSystem,
  directory: string,
  entry: string
): Promise<boolean> {
  try {
    const entries = await io.readDirectory(directory);
    return entries.some(
      candidate => candidate.isFile && candidate.name === entry
    );
  } catch {
    // Unreadable or missing: not a project root, and not an error either.
    return false;
  }
}

/** Whether `path` is `root` or sits inside it. */
function isWithin(root: string, path: string): boolean {
  return (
    path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
  );
}
