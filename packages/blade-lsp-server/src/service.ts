/**
 * The Blade language service: everything the server does, minus the protocol.
 *
 * `server.ts` is now a thin adapter over this class. It was not: it owned a
 * module-level project cache that was never invalidated, resolved the project
 * root as `dirname(file)`, hand-rolled a parse-error conversion that the
 * diagnostic provider already implemented correctly, and answered
 * `textDocument/definition` and `textDocument/references` with `null` while
 * advertising both capabilities - leaving ~700 lines of tested provider code
 * unreachable. None of that could be tested, because importing the module
 * opened a JSON-RPC connection on stdio.
 *
 * Everything here is driveable from a test: give it a {@link LanguageServiceHost}
 * and a filesystem and it answers requests.
 */

import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import type { FileSystem } from '@bladets/template/node';
import { nodeFileSystem } from '@bladets/template/node';
import { findProjectRoot } from '@bladets/template/node';
import { SCHEMA_FILE } from '@bladets/template/node';

import type {
  BladeDocument,
  HelperDefinition,
  LspConfig,
  Position,
} from './types.js';
import { DEFAULT_LSP_CONFIG } from './types.js';
import { WorkspaceManager } from './analyzer/workspace.js';
import { Logger, silentSink } from './logger.js';
import type { LogSink } from './logger.js';
import { ProjectContextCache } from './project-context.js';
import type { ProjectLspContext } from './project-context.js';
import {
  getCompletionContext,
  getCompletions,
} from './providers/completion.js';
import type { CompletionItem } from './providers/completion.js';
import { getHoverInfo } from './providers/hover.js';
import type { HoverInfo } from './providers/hover.js';
import { findDefinition, findReferences } from './providers/definition.js';
import type { DefinitionLocation } from './providers/definition.js';
import {
  generateDiagnostics,
  getProjectDiagnostics,
  LspDiagnosticSeverityEnum,
} from './providers/diagnostic.js';
import type { LspDiagnostic } from './providers/diagnostic.js';
import { offsetOfPosition } from './document.js';

/** What the service needs from whatever is driving it. */
export interface LanguageServiceHost {
  /** Send diagnostics for one file. */
  publishDiagnostics(uri: string, diagnostics: LspDiagnostic[]): void;
  /** Where log lines go. Defaults to discarding them. */
  readonly sink?: LogSink;
  /** Filesystem for project discovery. Defaults to the real one. */
  readonly io?: FileSystem;
}

/**
 * The language service.
 *
 * One instance per server process. Every public method is total: a request for
 * an unknown document, an unparseable URI or a project that does not exist
 * returns an empty answer rather than throwing, because a rejected promise
 * inside an LSP handler ends the session.
 */
export class BladeLanguageService {
  readonly logger: Logger;

  private readonly host: LanguageServiceHost;
  private readonly io: FileSystem;
  private readonly workspace: WorkspaceManager;
  private readonly projects: ProjectContextCache;
  /** Document URI to project root, cached because resolving it walks the disk. */
  private readonly roots = new Map<string, Promise<string | null>>();
  /** Helper definition files, by resolved path. */
  private readonly helperFiles = new Map<
    string,
    Promise<readonly HelperDefinition[]>
  >();
  private workspaceFolders: readonly string[] = [];
  /** Sample files we have published diagnostics for, so they can be cleared. */
  private publishedSamples = new Set<string>();
  /**
   * Contexts whose project-level diagnostics have been published.
   *
   * A context is immutable and is replaced wholesale when its project changes,
   * so identity is exactly the right key: validating a document on every parse
   * must not re-run the schema over every sample file on every keystroke.
   */
  private readonly reportedProjects = new WeakSet<ProjectLspContext>();
  private config: LspConfig;

  constructor(
    host: LanguageServiceHost,
    config: LspConfig = DEFAULT_LSP_CONFIG
  ) {
    this.host = host;
    this.io = host.io ?? nodeFileSystem;
    this.config = config;
    this.logger = new Logger(host.sink ?? silentSink, config.trace);
    this.workspace = new WorkspaceManager(config);
    this.projects = new ProjectContextCache({
      optionsFor: root => ({
        io: this.io,
        dataSchemaPath: this.resolveSetting(
          this.config.completion.dataSchemaPath,
          root
        ),
      }),
    });

    // The single point at which a new parse becomes visible, and therefore the
    // single point from which diagnostics are published.
    this.workspace.onDocumentParsed(doc => {
      void this.publishFor(doc).catch(error =>
        this.logger.error(`diagnostics failed for ${doc.uri}`, error)
      );
    });
  }

  // ===========================================================================
  // Configuration and workspace
  // ===========================================================================

  getConfig(): LspConfig {
    return this.config;
  }

  /**
   * Apply new settings.
   *
   * Anything that changes what a project *is* - the schema file it uses, the
   * directories discovery skips - drops the cached contexts, because they were
   * loaded under the old answer.
   */
  updateConfig(config: LspConfig): void {
    const before = this.config;
    this.config = config;
    this.logger.setLevel(config.trace);
    this.workspace.updateConfig(config);

    if (
      before.completion.dataSchemaPath !== config.completion.dataSchemaPath ||
      before.completion.helpersDefinitionPath !==
        config.completion.helpersDefinitionPath
    ) {
      this.projects.clear();
      this.helperFiles.clear();
    }
  }

  /** The workspace folders, which bound the upward search for a project root. */
  setWorkspaceFolders(folders: readonly string[]): void {
    this.workspaceFolders = folders.map(folder => resolve(folder));
    this.roots.clear();
    this.projects.clear();
  }

  // ===========================================================================
  // Documents
  // ===========================================================================

  openDocument(uri: string, content: string, version: number): BladeDocument {
    return this.workspace.openDocument(uri, content, version);
  }

  changeDocument(uri: string, content: string, version: number): void {
    this.workspace.changeDocument(uri, content, version);
  }

  closeDocument(uri: string): void {
    this.workspace.closeDocument(uri);
    this.roots.delete(uri);
    this.host.publishDiagnostics(uri, []);
    void this.retainOpenProjects().catch(error =>
      this.logger.error('failed to prune project cache', error)
    );
  }

  getDocument(uri: string): BladeDocument | undefined {
    return this.workspace.getDocument(uri);
  }

  // ===========================================================================
  // Projects
  // ===========================================================================

  /**
   * The project root a document belongs to.
   *
   * The nearest ancestor directory containing `index.blade`, bounded by the
   * workspace folder. `dirname(file)` was true only for the entry file itself.
   */
  projectRootFor(uri: string): Promise<string | null> {
    const cached = this.roots.get(uri);
    if (cached) return cached;

    // The outcome is cached, not just the success: a miss used to be thrown
    // away, so a file outside any project re-ran the whole directory walk on
    // every keystroke.
    const pending = this.resolveProjectRoot(uri);
    this.roots.set(uri, pending);
    return pending;
  }

  private async resolveProjectRoot(uri: string): Promise<string | null> {
    const filePath = toFilePath(uri);
    if (filePath === undefined) return null;

    const directory = dirname(filePath);
    const stopAt = this.workspaceFolders.find(
      folder => directory === folder || directory.startsWith(folder)
    );

    try {
      return await findProjectRoot(directory, { io: this.io, stopAt });
    } catch (error) {
      this.logger.error(`project root lookup failed for ${uri}`, error);
      return null;
    }
  }

  /** The project context for a document, or null when it has no project. */
  async projectContextFor(uri: string): Promise<ProjectLspContext | null> {
    const root = await this.projectRootFor(uri);
    if (root === null) return null;
    return this.projects.get(root);
  }

  /**
   * Forget everything derived from a path that changed on disk.
   *
   * Driven by `workspace/didChangeWatchedFiles`. The extension already creates
   * a `**\/*.blade` watcher and hands it to the client's synchronize block, so
   * those notifications were already arriving and being ignored.
   */
  invalidatePath(path: string): void {
    const dropped = this.projects.invalidateForPath(path);
    if (dropped.length > 0) {
      this.logger.info(
        () => `invalidated ${dropped.length} project context(s) for ${path}`
      );
    }
    // A new `index.blade` changes which project an open file belongs to.
    this.roots.clear();
  }

  /** Drop contexts no open document needs any more. */
  private async retainOpenProjects(): Promise<void> {
    const roots = await Promise.all(
      this.workspace.getAllDocuments().map(doc => this.projectRootFor(doc.uri))
    );
    this.projects.retain(roots.filter((root): root is string => root !== null));
  }

  // ===========================================================================
  // Requests
  // ===========================================================================

  async complete(uri: string, position: Position): Promise<CompletionItem[]> {
    const doc = this.getDocument(uri);
    if (!doc) return [];

    const projectContext = await this.projectContextFor(uri);
    const offset = offsetOfPosition(doc, position);
    const context = getCompletionContext(doc, offset);

    this.logger.verbose(
      () => `completion at ${offset} resolved to ${context.contextKind}`
    );

    return getCompletions(context, {
      projectContext,
      config: this.config,
      helpers: await this.helpersFor(uri),
    });
  }

  async hover(uri: string, position: Position): Promise<HoverInfo | null> {
    const doc = this.getDocument(uri);
    if (!doc) return null;
    return getHoverInfo(doc, position, await this.projectContextFor(uri));
  }

  async definition(
    uri: string,
    position: Position
  ): Promise<DefinitionLocation | null> {
    const doc = this.getDocument(uri);
    if (!doc) return null;
    return findDefinition(doc, position, await this.projectContextFor(uri));
  }

  async references(
    uri: string,
    position: Position,
    includeDeclaration = true
  ): Promise<DefinitionLocation[]> {
    const doc = this.getDocument(uri);
    if (!doc) return [];
    return findReferences(doc, position, includeDeclaration);
  }

  /**
   * Compute a document's diagnostics.
   *
   * @param uri - Document to validate
   * @returns The diagnostics, which have also been published
   */
  async validate(uri: string): Promise<LspDiagnostic[]> {
    const doc = this.getDocument(uri);
    if (!doc) return [];
    return this.publishFor(doc);
  }

  private async publishFor(doc: BladeDocument): Promise<LspDiagnostic[]> {
    if (!this.config.diagnostics.enabled) {
      this.host.publishDiagnostics(doc.uri, []);
      return [];
    }

    const projectContext = await this.projectContextFor(doc.uri);
    const diagnostics = generateDiagnostics(doc, this.config, {
      projectContext,
      helpers: await this.helpersFor(doc.uri),
    });

    this.host.publishDiagnostics(doc.uri, diagnostics);

    if (projectContext && !this.reportedProjects.has(projectContext)) {
      this.reportedProjects.add(projectContext);
      this.publishProjectDiagnostics(projectContext);
    }

    return diagnostics;
  }

  /**
   * Publish the project's own problems: samples that contradict the schema, and
   * a `schema.json` that could not be used.
   *
   * A file that has become clean is published with an empty list, or its
   * squiggles would outlive the problem.
   */
  private publishProjectDiagnostics(context: ProjectLspContext): void {
    const byFile = getProjectDiagnostics(context);

    const schemaPath = resolve(context.projectRoot, SCHEMA_FILE);
    const schemaProblems = context.diagnostics.filter(
      diagnostic => diagnostic.code === 'INVALID_SCHEMA'
    );
    if (schemaProblems.length > 0) {
      byFile.set(
        schemaPath,
        schemaProblems.map(diagnostic => ({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          severity: LspDiagnosticSeverityEnum.Warning,
          source: 'blade',
          message: diagnostic.message,
        }))
      );
    }

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code !== 'INVALID_SCHEMA') {
        this.logger.info(() => `${context.projectRoot}: ${diagnostic.message}`);
      }
    }

    for (const [filePath, diagnostics] of byFile) {
      this.host.publishDiagnostics(pathToFileURL(filePath).href, diagnostics);
      this.publishedSamples.add(filePath);
    }

    for (const filePath of [...this.publishedSamples]) {
      if (byFile.has(filePath)) continue;
      if (!filePath.startsWith(context.projectRoot)) continue;
      this.host.publishDiagnostics(pathToFileURL(filePath).href, []);
      this.publishedSamples.delete(filePath);
    }
  }

  // ===========================================================================
  // Helper definitions
  // ===========================================================================

  /**
   * Helper definitions from `completion.helpersDefinitionPath`.
   *
   * Resolved against the document's project root, then against the workspace
   * folders. The setting was read into configuration and never used for
   * anything.
   */
  private async helpersFor(
    uri: string
  ): Promise<readonly HelperDefinition[] | undefined> {
    const configured = this.config.completion.helpersDefinitionPath;
    if (!configured) return undefined;

    const root = await this.projectRootFor(uri);
    const candidates = isAbsolute(configured)
      ? [configured]
      : root
        ? [resolve(root, configured)]
        : this.workspaceFolders.map(folder => resolve(folder, configured));

    for (const candidate of candidates) {
      const helpers = await this.loadHelperFile(candidate);
      if (helpers.length > 0) return helpers;
    }
    return undefined;
  }

  /**
   * A path setting, as an absolute path.
   *
   * One rule for both file settings: an absolute path is used as written, and
   * a relative one resolves against the project root.
   */
  private resolveSetting(
    configured: string | undefined,
    root: string
  ): string | undefined {
    if (!configured) return undefined;
    return isAbsolute(configured) ? configured : resolve(root, configured);
  }

  private loadHelperFile(path: string): Promise<readonly HelperDefinition[]> {
    const cached = this.helperFiles.get(path);
    if (cached) return cached;

    const pending = this.io
      .readFile(path)
      .then(content => parseHelperDefinitions(content))
      .catch(() => [] as readonly HelperDefinition[]);
    this.helperFiles.set(path, pending);
    return pending;
  }

  /** Stop every timer the service owns. */
  dispose(): void {
    this.workspace.dispose();
    this.projects.clear();
    this.roots.clear();
    this.helperFiles.clear();
  }
}

/**
 * The helper definitions in a helpers file.
 *
 * Accepts either a bare array or `{ "helpers": [...] }`; anything that is not
 * an object with a name is ignored rather than crashing the server over a
 * user-supplied file.
 */
export function parseHelperDefinitions(
  content: string
): readonly HelperDefinition[] {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch {
    return [];
  }

  const entries = Array.isArray(document)
    ? document
    : Array.isArray((document as { helpers?: unknown }).helpers)
      ? ((document as { helpers: unknown[] }).helpers ?? [])
      : [];

  const helpers: HelperDefinition[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== 'string') continue;
    helpers.push({
      name: record.name,
      signature:
        typeof record.signature === 'string' ? record.signature : record.name,
      description:
        typeof record.description === 'string' ? record.description : undefined,
      deprecated: record.deprecated === true,
      deprecatedMessage:
        typeof record.deprecatedMessage === 'string'
          ? record.deprecatedMessage
          : undefined,
      sourceFile:
        typeof record.sourceFile === 'string' ? record.sourceFile : undefined,
    });
  }
  return helpers;
}

/**
 * The filesystem path of a URI, or undefined when it has none.
 *
 * `fileURLToPath` throws synchronously for any non-`file:` URI, and the scheme
 * filter lives in the *client's* document selector - not in the server, which
 * is a published entry point any client may drive. That throw was inside an
 * async notification handler whose promise nothing awaited, so it became an
 * unhandled rejection, which on Node >= 15 ends the process.
 */
export function toFilePath(uri: string): string | undefined {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}
