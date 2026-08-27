/**
 * The filesystem, as the project layer sees it.
 *
 * Everything under `project/` that touches a disk goes through {@link FileSystem}.
 * Two things follow from that, and both were missing:
 *
 * 1. The project loader is testable without materialising a directory. Every
 *    fixture that used to be a tree of files on disk can be an inline string
 *    map - see {@link createMemoryFileSystem}.
 * 2. There is exactly one place that decides whether a path is inside the
 *    project. `compileProject`'s `entry` option used to be joined to the root
 *    and read, so `entry: '../../../etc/passwd'` escaped the project and had
 *    its contents parsed as a template and quoted back in diagnostics.
 *    {@link resolveWithinRoot} is the check, and it is exported because the
 *    VS Code preview needs the identical one for sample filenames that arrive
 *    from webview messages.
 *
 * The interface is asynchronous throughout. The language server is
 * single-threaded, and the synchronous walk this replaced blocked every
 * completion, hover and diagnostic for as long as it ran.
 */

import { readdir, readFile, realpath } from 'fs/promises';
import { isAbsolute, join, resolve, sep } from 'path';

/**
 * One entry of a directory listing.
 *
 * A symbolic link is neither a file nor a directory here, which is deliberate:
 * following one would let a link inside the project reach code outside it, and
 * `Dirent` already reports links as neither. Both flags false means "skip".
 */
export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
}

/**
 * The filesystem operations the project layer performs.
 *
 * Implementations must reject - not throw synchronously - when a path does not
 * exist, so that callers can uniformly `catch` on the promise.
 */
export interface FileSystem {
  /** UTF-8 contents of a file. Rejects when it does not exist. */
  readFile(path: string): Promise<string>;
  /** One directory's entries. Rejects when it does not exist. */
  readDirectory(path: string): Promise<readonly DirectoryEntry[]>;
  /**
   * The path with every symbolic link resolved. Rejects when the path does not
   * exist, which {@link resolveWithinRoot} treats as "check it lexically".
   */
  realPath(path: string): Promise<string>;
}

/** The real filesystem, through `fs/promises`. */
export const nodeFileSystem: FileSystem = {
  readFile(path) {
    return readFile(path, 'utf-8');
  },
  async readDirectory(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  },
  realPath(path) {
    return realpath(path);
  },
};

/**
 * A filesystem held in memory, for tests and for editors with unsaved buffers.
 *
 * Keys are paths; a relative key is resolved against `root`. Directories are
 * implied by the paths of the files they contain, so nothing has to declare
 * them.
 *
 * @param files - Path to UTF-8 contents
 * @param root - Base for relative keys
 * @returns A {@link FileSystem} over exactly those files
 *
 * @example
 * ```typescript
 * const io = createMemoryFileSystem(
 *   { 'index.blade': '<Card/>', 'card.blade': '<div></div>' },
 *   '/project'
 * );
 * ```
 */
export function createMemoryFileSystem(
  files: Readonly<Record<string, string>>,
  root = '/project'
): FileSystem {
  const contents = new Map<string, string>();
  for (const [path, source] of Object.entries(files)) {
    contents.set(
      isAbsolute(path) ? normalize(path) : normalize(join(root, path)),
      source
    );
  }

  const directories = new Set<string>();
  for (const path of contents.keys()) {
    let parent = parentOf(path);
    while (parent !== undefined && !directories.has(parent)) {
      directories.add(parent);
      parent = parentOf(parent);
    }
  }

  return {
    async readFile(path) {
      const source = contents.get(normalize(path));
      if (source === undefined) {
        throw new Error(`ENOENT: no such file, open '${path}'`);
      }
      return source;
    },
    async readDirectory(path) {
      const dir = normalize(path);
      if (!directories.has(dir)) {
        throw new Error(`ENOENT: no such directory, scandir '${path}'`);
      }
      const prefix = dir === sep ? sep : dir + sep;
      const entries = new Map<string, DirectoryEntry>();
      for (const filePath of contents.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const remainder = filePath.slice(prefix.length);
        const slash = remainder.indexOf(sep);
        const name = slash === -1 ? remainder : remainder.slice(0, slash);
        entries.set(name, {
          name,
          isDirectory: slash !== -1,
          isFile: slash === -1,
        });
      }
      return Array.from(entries.values());
    },
    async realPath(path) {
      const normalized = normalize(path);
      if (!contents.has(normalized) && !directories.has(normalized)) {
        throw new Error(`ENOENT: no such file or directory, lstat '${path}'`);
      }
      return normalized;
    },
  };
}

function normalize(path: string): string {
  return resolve(path);
}

function parentOf(path: string): string | undefined {
  const index = path.lastIndexOf(sep);
  if (index <= 0) return index === 0 ? sep : undefined;
  return path.slice(0, index);
}

/**
 * Thrown when a path resolves outside the project root.
 *
 * Its own class so that a caller can tell a containment refusal from a missing
 * file and report it as a refusal rather than as "not found".
 */
export class PathEscapeError extends Error {
  readonly root: string;
  readonly requested: string;
  readonly resolved: string;

  constructor(root: string, requested: string, resolved: string) {
    super(
      `Path escapes the project root.\n` +
        `  Requested: ${requested}\n` +
        `  Resolves to: ${resolved}\n` +
        `  Project root: ${root}\n` +
        `\n` +
        `  Tip: paths are relative to the project root and may not leave it.`
    );
    this.name = 'PathEscapeError';
    this.root = root;
    this.requested = requested;
    this.resolved = resolved;
  }
}

/**
 * Resolves a path against a project root and proves it stays inside it.
 *
 * Both sides are resolved through symbolic links before they are compared, so
 * a link inside the project that points outside it is refused too. A candidate
 * that does not exist yet is compared lexically - the caller is about to fail
 * on the missing file anyway, and refusing to answer would turn "no such file"
 * into a confusing security error.
 *
 * @param root - The project root; must exist
 * @param candidate - A path relative to the root, or an absolute path
 * @param io - Filesystem to resolve through
 * @returns The absolute, link-resolved path
 * @throws {PathEscapeError} When the path resolves outside the root
 */
export async function resolveWithinRoot(
  root: string,
  candidate: string,
  io: FileSystem = nodeFileSystem
): Promise<string> {
  const rootReal = await canonical(root, io);
  const requested = isAbsolute(candidate)
    ? candidate
    : join(rootReal, candidate);
  const resolved = await canonical(requested, io);

  if (resolved !== rootReal && !resolved.startsWith(rootReal + sep)) {
    throw new PathEscapeError(rootReal, candidate, resolved);
  }
  return resolved;
}

/** The link-resolved path, or the lexically resolved one when it does not exist. */
async function canonical(path: string, io: FileSystem): Promise<string> {
  try {
    return await io.realPath(path);
  } catch {
    return resolve(path);
  }
}
