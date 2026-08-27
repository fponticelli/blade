/**
 * Reading a Blade project off a filesystem.
 *
 * Every byte a project compile needs is gathered here, and nothing here
 * inspects a template. The compile itself - {@link compileProjectSources} - is
 * a pure function of what this returns, which is what makes it testable
 * without materialising a directory: `createMemoryFileSystem` plus an inline
 * string map is a whole project.
 *
 * The two halves used to be one 148-line function that interleaved a directory
 * scan, a read, a compile, an AST walk, a closure that lazily read more files
 * while mutating an enclosing warnings array, and a validation loop - so not
 * one of its pure steps could be tested without a directory on disk, and all
 * nine tests in `tests/project/` built one.
 */

import { relative, sep } from 'path';
import type { ComponentInfo, Diagnostic } from '../ast/types.js';
import { createDiagnostic } from '../validation/index.js';
import { DEFAULT_ENTRY, discoverComponents } from './discovery.js';
import type { DiscoveryOptions, SkippedDirectory } from './discovery.js';
import { nodeFileSystem, resolveWithinRoot } from './fs.js';
import { loadProjectSchemaResult } from './schema.js';
import type { ProjectSchema } from './schema.js';
import { loadProjectSamplesResult } from './samples.js';
import type { ProjectSamples } from './samples.js';

/** One component file, read once. */
export interface ComponentSource {
  readonly info: ComponentInfo;
  /** Path relative to the project root, as a diagnostic should name it. */
  readonly path: string;
  /** UTF-8 source, or null when the file could not be read. */
  readonly source: string | null;
}

/** Everything a project compile reads. */
export interface ProjectSources {
  /** Absolute, symlink-resolved project root. */
  readonly root: string;
  /** Entry file name, relative to the root. */
  readonly entry: string;
  readonly entrySource: string;
  readonly components: ReadonlyMap<string, ComponentSource>;
  readonly schema: ProjectSchema | null;
  readonly samples: ProjectSamples | null;
  /** Findings about the *loading*: an unreadable file, an invalid schema. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Options shared by every entry point that reads a project. */
export interface ProjectLoadOptions extends Omit<
  DiscoveryOptions,
  'onSkipped'
> {
  /**
   * Entry point file name, relative to the project root.
   *
   * Must name a file *in* the root, and may not leave it: the previous version
   * joined this to the root and read it with no containment check at all, so
   * `entry: '../../../etc/passwd'` was parsed as a template and quoted back in
   * diagnostics.
   *
   * @default 'index.blade'
   */
  readonly entry?: string;
}

/**
 * Reads a project from disk.
 *
 * @param projectRoot - Path to the project root
 * @param options - Entry point, filesystem and discovery bounds
 * @returns Everything the compile needs
 * @throws {PathEscapeError} When `entry` resolves outside the project root
 * @throws Error When the root or the entry file does not exist
 */
export async function readProjectSources(
  projectRoot: string,
  options?: ProjectLoadOptions
): Promise<ProjectSources> {
  const io = options?.io ?? nodeFileSystem;
  const entry = options?.entry ?? DEFAULT_ENTRY;

  // Containment first, so that an escaping entry is refused as an escape
  // rather than as a missing file - and before the shape check below, so that
  // `../../../etc/passwd` is reported as what it is.
  const entryPath = await resolveWithinRoot(projectRoot, entry, io);

  if (entry.includes('/') || entry.includes(sep)) {
    throw new Error(
      `Entry point must be a file in the project root, not a path: ${entry}`
    );
  }

  const root = await resolveWithinRoot(projectRoot, '.', io);

  const diagnostics: Diagnostic[] = [];
  const skipped: SkippedDirectory[] = [];

  const discovered = await discoverComponents(root, {
    io,
    entry,
    exclude: options?.exclude,
    maxDepth: options?.maxDepth,
    onSkipped: item => skipped.push(item),
  });

  for (const item of skipped) {
    if (item.reason !== 'depth') continue;
    diagnostics.push(
      loadDiagnostic(
        `Stopped scanning '${relative(root, item.path)}': it is deeper than the ` +
          `discovery limit, so any component below it is invisible to this project.`
      )
    );
  }

  const entrySource = await io.readFile(entryPath);

  const components = new Map<string, ComponentSource>();
  for (const [tagName, info] of discovered) {
    const path = relative(root, info.filePath);
    try {
      components.set(tagName, {
        info,
        path,
        source: await io.readFile(info.filePath),
      });
    } catch (error) {
      components.set(tagName, { info, path, source: null });
      diagnostics.push(
        loadDiagnostic(
          `Component '${tagName}' could not be read from ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          path
        )
      );
    }
  }

  const [schema, samples] = await Promise.all([
    loadProjectSchemaResult(root, io),
    loadProjectSamplesResult(root, io),
  ]);
  diagnostics.push(...schema.diagnostics, ...samples.diagnostics);

  return {
    root,
    entry,
    entrySource,
    components,
    schema: schema.schema,
    samples: samples.samples,
    diagnostics,
  };
}

function loadDiagnostic(message: string, file?: string): Diagnostic {
  const diagnostic = createDiagnostic(
    'warning',
    message,
    {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    'PROJECT_LOAD'
  );
  return file === undefined ? diagnostic : { ...diagnostic, file };
}
