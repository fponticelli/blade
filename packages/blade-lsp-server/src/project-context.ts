/**
 * Project Context for Blade LSP
 *
 * The components, schema and samples that belong to one project root, and the
 * cache that keeps them.
 *
 * The cache is the point of this file. There used to be a module-level `Map` in
 * `server.ts` that was written once per root and never invalidated: editing
 * `schema.json` changed nothing until the window was reloaded, and every root a
 * session ever touched stayed resident - the flattened schema, every parsed
 * sample and a duplicate flattened map of every path in every sample - for the
 * life of the process. Failures were not cached at all, so a directory without
 * an entry file re-ran the whole recursive filesystem walk on *every keystroke*
 * and threw the result away.
 *
 * {@link ProjectContextCache} caches the outcome - including "there is no
 * project here" - bounds itself, de-duplicates concurrent loads, and evicts by
 * path when a watched file changes.
 */

import type { ComponentInfo, Diagnostic } from '@bladets/template';
import type { ProjectSchema, SchemaPropertyInfo } from '@bladets/template/node';
import type { ProjectSamples, SampleValue } from '@bladets/template/node';
import type { FileSystem } from '@bladets/template/node';
import { nodeFileSystem } from '@bladets/template/node';
import { discoverComponents } from '@bladets/template/node';
import {
  compileProjectSchema,
  getSchemaCompletions,
  loadProjectSchemaResult,
} from '@bladets/template/node';
import {
  loadProjectSamplesResult,
  getSampleValues,
  formatSampleHint,
} from '@bladets/template/node';
import { sep } from 'path';

/**
 * Project context for LSP operations
 */
export interface ProjectLspContext {
  /** Project root directory path */
  readonly projectRoot: string;
  /** Discovered components in the project */
  readonly components: Map<string, ComponentInfo>;
  /** Loaded schema (null if no schema.json) */
  readonly schema: ProjectSchema | null;
  /** Loaded samples (null if no samples/ directory) */
  readonly samples: ProjectSamples | null;
  /**
   * The raw text of each sample file, by path.
   *
   * Kept so that a validation error can be reported at the offending value
   * rather than at the first character of the file; `JSON.parse` discards the
   * positions and the sample loader only keeps the parsed data.
   */
  readonly sampleSources: ReadonlyMap<string, string>;
  /** Problems found while loading the project's metadata. */
  readonly diagnostics: readonly Diagnostic[];
  /** Last time the context was updated */
  readonly lastUpdated: number;
}

/** How a context is loaded; everything here has a real default. */
export interface ProjectContextOptions {
  /** Filesystem to read through. */
  readonly io?: FileSystem;
  /**
   * A schema file that replaces the project's own `schema.json`.
   *
   * `blade.lsp.completion.dataSchemaPath`, resolved by the caller.
   */
  readonly dataSchemaPath?: string;
  /** Directory names discovery must not descend into, beyond the defaults. */
  readonly exclude?: readonly string[];
}

/**
 * Initializes the project context for LSP features.
 *
 * @param projectRoot - Path to the project root directory
 * @param options - Filesystem and settings that affect loading
 * @returns Initialized project context or null if not a valid project
 */
export async function initializeProjectContext(
  projectRoot: string,
  options?: ProjectContextOptions
): Promise<ProjectLspContext | null> {
  const io = options?.io ?? nodeFileSystem;

  let components: Map<string, ComponentInfo>;
  try {
    components = await discoverComponents(projectRoot, {
      io,
      exclude: options?.exclude,
    });
  } catch {
    // No entry file, or the directory does not exist: not a project.
    return null;
  }

  const diagnostics: Diagnostic[] = [];

  const schemaResult = options?.dataSchemaPath
    ? await loadConfiguredSchema(options.dataSchemaPath, io)
    : await loadProjectSchemaResult(projectRoot, io);
  diagnostics.push(...schemaResult.diagnostics);

  const samplesResult = await loadProjectSamplesResult(projectRoot, io);
  diagnostics.push(...samplesResult.diagnostics);

  const sampleSources = new Map<string, string>();
  for (const sample of samplesResult.samples?.samples ?? []) {
    try {
      sampleSources.set(sample.filePath, await io.readFile(sample.filePath));
    } catch {
      // The loader has just read it; if it has gone now, diagnostics for it
      // simply fall back to the top of the file.
    }
  }

  return {
    projectRoot,
    components,
    schema: schemaResult.schema,
    samples: samplesResult.samples,
    sampleSources,
    diagnostics,
    lastUpdated: Date.now(),
  };
}

/**
 * Loads the schema named by `completion.dataSchemaPath`.
 *
 * The setting was contributed by the extension manifest and never read from
 * disk by anything.
 */
async function loadConfiguredSchema(
  path: string,
  io: FileSystem
): Promise<{ schema: ProjectSchema | null; diagnostics: Diagnostic[] }> {
  let content: string;
  try {
    content = await io.readFile(path);
  } catch {
    return {
      schema: null,
      diagnostics: [
        settingDiagnostic(
          `blade.lsp.completion.dataSchemaPath points at '${path}', which cannot be read.`
        ),
      ],
    };
  }

  try {
    return {
      schema: compileProjectSchema(JSON.parse(content)),
      diagnostics: [],
    };
  } catch (error) {
    return {
      schema: null,
      diagnostics: [
        settingDiagnostic(
          `blade.lsp.completion.dataSchemaPath points at '${path}', which is not a usable JSON Schema: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
      ],
    };
  }
}

function settingDiagnostic(message: string): Diagnostic {
  return {
    level: 'warning',
    message,
    location: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    code: 'INVALID_SCHEMA',
  };
}

/**
 * The project contexts a session is holding, keyed by project root.
 *
 * Caches outcomes, not successes: a root with no project is remembered as
 * `null` so the directory walk is not repeated on the next keystroke.
 */
export class ProjectContextCache {
  private readonly entries = new Map<
    string,
    Promise<ProjectLspContext | null>
  >();
  private readonly optionsFor: (root: string) => ProjectContextOptions;
  private readonly maxEntries: number;
  private readonly load: (
    root: string,
    options: ProjectContextOptions
  ) => Promise<ProjectLspContext | null>;

  constructor(config?: {
    /**
     * Loading options for a root.
     *
     * A function, not a value: `dataSchemaPath` is a relative setting that
     * resolves against the project root, so the options differ per root.
     */
    readonly optionsFor?: (root: string) => ProjectContextOptions;
    /** Contexts to keep before the least recently loaded is dropped. */
    readonly maxEntries?: number;
    /** Loader, for tests. */
    readonly load?: (
      root: string,
      options: ProjectContextOptions
    ) => Promise<ProjectLspContext | null>;
  }) {
    this.optionsFor = config?.optionsFor ?? (() => ({}));
    this.maxEntries = config?.maxEntries ?? 24;
    this.load = config?.load ?? initializeProjectContext;
  }

  /**
   * The context for a root, loading it at most once.
   *
   * Concurrent requests for the same root share one load: completion and hover
   * arrive together, and the walk is expensive enough that doing it twice is a
   * visible stall.
   */
  get(root: string): Promise<ProjectLspContext | null> {
    const cached = this.entries.get(root);
    if (cached) return cached;

    const pending = this.load(root, this.optionsFor(root)).catch(() => null);
    this.entries.set(root, pending);
    this.evictOverflow();
    return pending;
  }

  /** Whether a root has been loaded (or is loading). */
  has(root: string): boolean {
    return this.entries.has(root);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Forget one root. */
  invalidate(root: string): boolean {
    return this.entries.delete(root);
  }

  /**
   * Forget every root a changed file belongs to.
   *
   * @param path - The file that changed
   * @returns The roots that were dropped
   */
  invalidateForPath(path: string): string[] {
    const dropped: string[] = [];
    for (const root of this.entries.keys()) {
      if (
        path === root ||
        path.startsWith(root.endsWith(sep) ? root : root + sep)
      ) {
        this.entries.delete(root);
        dropped.push(root);
      }
    }
    return dropped;
  }

  /** Forget everything. */
  clear(): void {
    this.entries.clear();
  }

  /** Keep only the named roots; used when the last document of a root closes. */
  retain(roots: Iterable<string>): void {
    const keep = new Set(roots);
    for (const root of this.entries.keys()) {
      if (!keep.has(root)) this.entries.delete(root);
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * Gets schema-based completions for a variable path.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user" or "$user.address")
 * @returns Array of schema property completions
 */
export function getProjectSchemaCompletions(
  context: ProjectLspContext,
  path: string
): SchemaPropertyInfo[] {
  if (!context.schema) {
    return [];
  }
  return getSchemaCompletions(context.schema, path);
}

/**
 * Gets component information by name.
 *
 * @param context - The project context
 * @param componentName - Component name (e.g., "Button" or "Form.Input")
 * @returns Component info or undefined if not found
 */
export function getProjectComponent(
  context: ProjectLspContext,
  componentName: string
): ComponentInfo | undefined {
  return context.components.get(componentName);
}

/**
 * Gets all available components in the project.
 *
 * @param context - The project context
 * @returns Array of component names
 */
export function getAllProjectComponents(context: ProjectLspContext): string[] {
  return Array.from(context.components.keys());
}

/**
 * Gets sample values for a variable path.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user.name")
 * @returns Array of sample values from all sample files
 */
export function getProjectSampleValues(
  context: ProjectLspContext,
  path: string
): SampleValue[] {
  if (!context.samples) {
    return [];
  }
  return getSampleValues(context.samples, path);
}

/**
 * Gets formatted sample hint for hover display.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user.name")
 * @returns Formatted hint string or empty string if no samples
 */
export function getProjectSampleHint(
  context: ProjectLspContext,
  path: string
): string {
  return formatSampleHint(getProjectSampleValues(context, path));
}
