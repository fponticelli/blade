/**
 * Component Discovery for Blade Projects
 *
 * Finds the `.blade` files of a project and names them, applying dot-notation
 * namespacing for nested folders.
 *
 * The walk is bounded and asynchronous, and both properties are load-bearing.
 * It used to be `readdirSync` plus a `statSync` per subdirectory, recursing
 * into every folder that did not itself contain an `index.blade` - which meant
 * `node_modules`, `dist`, `.turbo` and every vendored asset tree. A dependency
 * tree routinely holds a hundred thousand files, and because the language
 * server is single-threaded, that walk stopped completion, hover and
 * diagnostics for as long as it ran. `lsp/project-context.ts` even `await`ed
 * the result, which did nothing, because the result was not a promise.
 */

import { basename, join } from 'path';
import type { ComponentInfo } from '../ast/types.js';
import { toPascalCase, isHiddenFile } from './utils.js';
import { nodeFileSystem } from './fs.js';
import type { DirectoryEntry, FileSystem } from './fs.js';

const BLADE_EXTENSION = '.blade';

/** The entry file of a project, unless the caller names another one. */
export const DEFAULT_ENTRY = 'index.blade';

/**
 * Directories a component never lives in.
 *
 * Discovery is looking for `.blade` files that the author wrote. It must never
 * descend into a dependency tree or a build output, both because there is
 * nothing there to find and because the cost is unbounded.
 */
export const DEFAULT_EXCLUDED_DIRECTORIES: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
  '.turbo',
  '.next',
  '.cache',
  'vendor',
];

/**
 * How deep the walk goes below the project root.
 *
 * A component namespace this deep is already unreadable; the limit exists so
 * that a pathological tree cannot make discovery unbounded.
 */
export const DEFAULT_MAX_DEPTH = 16;

/** Why a directory was not walked. */
export type SkipReason = 'excluded' | 'depth' | 'project-boundary';

export interface SkippedDirectory {
  readonly path: string;
  readonly reason: SkipReason;
}

export interface DiscoveryOptions {
  /** Filesystem to read through. Defaults to the real one. */
  readonly io?: FileSystem;
  /**
   * The project's entry file. It is excluded from the component set, and a
   * subdirectory that has one of its own is a separate project and is skipped.
   * @default 'index.blade'
   */
  readonly entry?: string;
  /** Directory names to skip, in addition to {@link DEFAULT_EXCLUDED_DIRECTORIES}. */
  readonly exclude?: Iterable<string>;
  /** @default DEFAULT_MAX_DEPTH */
  readonly maxDepth?: number;
  /**
   * Called for every directory the walk refused to enter.
   *
   * A depth cut-off silently dropping components is exactly the kind of
   * invisible failure this module is being repaired for, so the loader turns
   * those into warnings rather than letting them vanish.
   */
  readonly onSkipped?: (skipped: SkippedDirectory) => void;
}

/**
 * Discovers all components in a project directory.
 *
 * @param projectRoot - The root directory of the project (must contain the entry file)
 * @param options - Discovery configuration
 * @returns A map of component tag names to their info
 * @throws Error if projectRoot doesn't exist or doesn't contain the entry file
 */
export async function discoverComponents(
  projectRoot: string,
  options?: DiscoveryOptions
): Promise<Map<string, ComponentInfo>> {
  const io = options?.io ?? nodeFileSystem;
  const entry = options?.entry ?? DEFAULT_ENTRY;

  let entries: readonly DirectoryEntry[];
  try {
    entries = await io.readDirectory(projectRoot);
  } catch {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }

  if (
    !entries.some(candidate => candidate.isFile && candidate.name === entry)
  ) {
    throw new Error(
      `Project root must contain ${entry}.\n` +
        `  Expected at: ${join(projectRoot, entry)}\n` +
        `  Tip: Create an ${entry} file as the entry point for your project.`
    );
  }

  const excluded = new Set<string>([
    ...DEFAULT_EXCLUDED_DIRECTORIES,
    ...(options?.exclude ?? []),
  ]);

  const components = new Map<string, ComponentInfo>();
  await scanDirectory(
    { dir: projectRoot, entries, namespace: [], depth: 0 },
    {
      io,
      entry,
      excluded,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
      onSkipped: options?.onSkipped,
      components,
    }
  );
  return components;
}

interface ScanTarget {
  readonly dir: string;
  /** Already read by the caller: nothing reads a directory twice. */
  readonly entries: readonly DirectoryEntry[];
  readonly namespace: readonly string[];
  readonly depth: number;
}

interface ScanContext {
  readonly io: FileSystem;
  readonly entry: string;
  readonly excluded: ReadonlySet<string>;
  readonly maxDepth: number;
  readonly onSkipped: ((skipped: SkippedDirectory) => void) | undefined;
  readonly components: Map<string, ComponentInfo>;
}

/**
 * Scans one directory, then the subdirectories worth scanning.
 *
 * A subdirectory's listing is read once and reused for both decisions it
 * feeds - "is this a separate project?" and "what is in it?" - which is what
 * removes the `statSync` per directory the previous version paid for.
 */
async function scanDirectory(
  target: ScanTarget,
  ctx: ScanContext
): Promise<void> {
  const subdirectories: string[] = [];

  for (const entry of target.entries) {
    // Hidden files and folders, and anything that is neither (a symbolic link
    // reports as neither, and following one would leave the project).
    if (isHiddenFile(entry.name)) continue;

    if (entry.isDirectory) {
      subdirectories.push(entry.name);
      continue;
    }

    if (!entry.isFile || !entry.name.endsWith(BLADE_EXTENSION)) continue;
    // The entry file is the project, not a component of it.
    if (entry.name === ctx.entry) continue;

    const componentName = toPascalCase(basename(entry.name, BLADE_EXTENSION));
    const tagName =
      target.namespace.length > 0
        ? [...target.namespace, componentName].join('.')
        : componentName;

    ctx.components.set(tagName, {
      tagName,
      filePath: join(target.dir, entry.name),
      namespace: [...target.namespace],
      props: undefined,
      propsInferred: false,
    });
  }

  for (const name of subdirectories) {
    const fullPath = join(target.dir, name);

    if (ctx.excluded.has(name)) {
      ctx.onSkipped?.({ path: fullPath, reason: 'excluded' });
      continue;
    }

    if (target.depth + 1 > ctx.maxDepth) {
      ctx.onSkipped?.({ path: fullPath, reason: 'depth' });
      continue;
    }

    let entries: readonly DirectoryEntry[];
    try {
      entries = await ctx.io.readDirectory(fullPath);
    } catch {
      // Unreadable directory: nothing to discover, and the project is not
      // broken by a folder it cannot list.
      continue;
    }

    if (entries.some(child => child.isFile && child.name === ctx.entry)) {
      ctx.onSkipped?.({ path: fullPath, reason: 'project-boundary' });
      continue;
    }

    await scanDirectory(
      {
        dir: fullPath,
        entries,
        namespace: [...target.namespace, toPascalCase(name)],
        depth: target.depth + 1,
      },
      ctx
    );
  }
}
