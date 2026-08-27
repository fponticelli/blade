/**
 * The Blade preview panel.
 *
 * Three properties this file is organised around, each of which was previously
 * violated:
 *
 * - **Listeners are registered once, when the panel is created.** `show()` used
 *   to call `setupListeners()` unconditionally, including on the branch that
 *   merely reveals an existing panel - so a command bound to cmd+shift+V and
 *   sitting in the editor title bar registered a fresh `onDidChangeTextDocument`,
 *   a fresh `onDidChangeActiveTextEditor` and a *new workspace-wide recursive*
 *   `createFileSystemWatcher` over a workspace-wide sample glob every time it
 *   was pressed, and orphaned the previous debouncer's pending timer. Pressing
 *   it five times
 *   turned one saved sample into five simultaneous full re-compiles.
 * - **The panel always has a state, and every state renders.** See
 *   {@link PreviewState}.
 * - **Nothing that arrives from the webview names a file.** See `./types.js`.
 */

import * as vscode from 'vscode';
import { basename, dirname, join, resolve, sep } from 'path';
import {
  DEFAULT_ENTRY,
  findProjectRoot,
  toPascalCase,
} from '@bladets/template/node';
import type { ProjectResult } from '@bladets/template';
import type {
  PreviewState,
  ToExtensionMessage,
  ToWebviewMessage,
} from './types.js';
import { debounce, getNonce, hashProjectPath } from './utils.js';
import type { Debounced } from './utils.js';
import { createPreviewFileSystem } from './filesystem.js';
import { PreviewWorkspace } from './project.js';
import { buildPreviewDocument, panelCsp } from './document.js';
import { renderProject } from './renderer.js';
import {
  isValidSampleName,
  propsSkeleton,
  resolveSamplePath,
  sampleContent,
  sampleNameFor,
  samplesDirectory,
  selectSample,
} from './samples.js';
import type { SampleListing } from './samples.js';

/** How long the preview waits after a keystroke before re-rendering. */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Singleton manager for the preview webview panel.
 */
export class PreviewPanelManager {
  /** The webview type, which is also the key VS Code restores a panel under. */
  private static readonly VIEW_TYPE = 'bladePreview';

  private static instance: PreviewPanelManager | null = null;

  private panel: vscode.WebviewPanel | null = null;
  private state: PreviewState = { kind: 'no-editor' };
  private readonly context: vscode.ExtensionContext;
  /** Panel-scoped subscriptions, released together when the panel closes. */
  private readonly disposables: vscode.Disposable[] = [];
  /** Watcher subscriptions, replaced only when the project root changes. */
  private watchers: vscode.Disposable[] = [];
  private watchedRoot: string | null = null;
  private readonly workspace: PreviewWorkspace;
  private readonly debouncedRefresh: Debounced<() => void>;
  /**
   * Whether the webview's script has announced itself.
   *
   * A message posted before that is dropped by VS Code with no error, which is
   * how the "Not a Blade Project" screen became unreachable: it was posted from
   * a panel created microseconds earlier, and nothing ever posted it again.
   */
  private ready = false;
  private pending: ToWebviewMessage[] = [];
  /** Whether the current state has produced a render yet. */
  private rendered = false;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.workspace = new PreviewWorkspace(
      createPreviewFileSystem({ openText: path => openDocumentText(path) })
    );
    this.debouncedRefresh = debounce(() => {
      void this.render();
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Get or create the singleton instance.
   *
   * @param context - The extension context
   * @returns The manager
   */
  public static getInstance(
    context: vscode.ExtensionContext
  ): PreviewPanelManager {
    if (!PreviewPanelManager.instance) {
      PreviewPanelManager.instance = new PreviewPanelManager(context);
    }
    return PreviewPanelManager.instance;
  }

  /**
   * Lets VS Code hand the panel back after a window reload.
   *
   * Without `retainContextWhenHidden` the webview is torn down when it is
   * hidden and rebuilt from the ready handshake, which is what makes dropping
   * that flag free. A window reload is the one case the handshake alone cannot
   * cover: VS Code re-creates the panel and needs someone to claim it, and an
   * unclaimed panel is a dead tab. The previous implementation did not restore
   * across a reload at all.
   *
   * @param context - The extension context
   * @returns A disposable that unregisters the serializer
   */
  public static registerSerializer(
    context: vscode.ExtensionContext
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(
      PreviewPanelManager.VIEW_TYPE,
      {
        async deserializeWebviewPanel(
          panel: vscode.WebviewPanel
        ): Promise<void> {
          const manager = PreviewPanelManager.getInstance(context);
          manager.adopt(panel);
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document.languageId === 'blade') {
            await manager.setActiveFile(editor.document.uri.fsPath);
          } else {
            await manager.render();
          }
        },
      }
    );
  }

  /** Closes the panel and forgets the singleton. Called on deactivation. */
  public static disposeInstance(): void {
    PreviewPanelManager.instance?.panel?.dispose();
    PreviewPanelManager.instance?.releaseAll();
    PreviewPanelManager.instance = null;
  }

  /**
   * Show the preview panel for the active editor.
   */
  public async show(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== 'blade') {
      vscode.window.showWarningMessage('Open a .blade file to preview');
      return;
    }

    // Create or reveal. Everything that must happen exactly once - listeners,
    // the webview's HTML - happens in createPanel().
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.createPanel();
    }

    await this.setActiveFile(editor.document.uri.fsPath);
  }

  // ==========================================================================
  // Panel lifecycle
  // ==========================================================================

  private createPanel(): void {
    const panel = vscode.window.createWebviewPanel(
      PreviewPanelManager.VIEW_TYPE,
      'Blade Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        // `retainContextWhenHidden` is deliberately absent. VS Code documents
        // it as memory-expensive and recommends it only when restoring state is
        // infeasible; here the whole state is a sample name that is already
        // persisted to workspaceState, and the ready handshake below rebuilds
        // the rest. It bought nothing and retained the rendered DOM of an
        // arbitrarily large template for the life of the panel, in a process
        // shared with every other installed extension.
        localResourceRoots: this.localResourceRoots(),
      }
    );
    this.adopt(panel);
  }

  /**
   * Takes ownership of a panel - one just created, or one VS Code restored.
   *
   * Everything that must happen exactly once per panel happens here, and
   * nowhere else. `show()` used to call the listener registration itself, on
   * every invocation, including the branch that only reveals.
   */
  private adopt(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    this.ready = false;
    this.pending = [];
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: this.localResourceRoots(),
    };

    panel.webview.html = this.getWebviewHtml(panel.webview);

    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: ToExtensionMessage) => {
        void this.handleMessage(message);
      }),
      panel.onDidDispose(() => this.handleDispose()),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (!this.affectsPreview(event.document.uri)) return;
        this.debouncedRefresh();
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (document.uri.scheme !== 'file') return;
        this.workspace.invalidate(document.uri.fsPath);
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        void this.handleEditorChange(editor);
      })
    );
  }

  /**
   * The directories the webview may load resources from.
   *
   * The extension's own `media`, plus every workspace folder - so that an image
   * referenced by a previewed template resolves. It used to be `media` alone,
   * which meant that even a correctly `asWebviewUri`-converted workspace image
   * would have been refused.
   */
  private localResourceRoots(): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ...(vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri),
    ];
  }

  private handleDispose(): void {
    this.releaseAll();
    this.panel = null;
    this.ready = false;
    this.pending = [];
    this.rendered = false;
    this.state = { kind: 'no-editor' };
  }

  private releaseAll(): void {
    this.debouncedRefresh.cancel();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    this.disposeWatchers();
    this.workspace.clear();
  }

  // ==========================================================================
  // Watching
  // ==========================================================================

  /**
   * Points the file watchers at `root`, and only when it actually changed.
   *
   * Scoped with a {@link vscode.RelativePattern} rather than a workspace-wide
   * a workspace-wide recursive glob: such a watcher is one of the more
   * expensive things an extension can ask VS Code for, and this one was created
   * afresh on every `show()`.
   */
  private updateWatchers(root: string | null): void {
    if (this.watchedRoot === root) return;

    this.disposeWatchers();
    this.watchedRoot = root;
    if (root === null) return;

    for (const pattern of ['samples/*.json', 'schema.json', '**/*.blade']) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, pattern)
      );
      this.watchers.push(
        watcher,
        // Every callback goes through the same debouncer. `onDidChange` used to
        // be wired straight to `refresh()`, so a saved sample bypassed the only
        // thing bounding the work.
        watcher.onDidChange(uri => this.onFileEvent(uri)),
        watcher.onDidCreate(uri => this.onFileEvent(uri)),
        watcher.onDidDelete(uri => this.onFileEvent(uri))
      );
    }
  }

  private disposeWatchers(): void {
    for (const disposable of this.watchers) disposable.dispose();
    this.watchers = [];
    this.watchedRoot = null;
  }

  private onFileEvent(uri: vscode.Uri): void {
    this.workspace.invalidate(uri.fsPath);
    this.debouncedRefresh();
  }

  /** Whether a document change could change what the preview shows. */
  private affectsPreview(uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file') return false;
    const path = resolve(uri.fsPath);
    if (this.state.kind === 'no-editor') return false;
    if (path === resolve(this.state.file)) return true;
    if (this.state.kind !== 'project') return false;
    return isWithin(resolve(this.state.projectRoot), path);
  }

  // ==========================================================================
  // State
  // ==========================================================================

  private async setActiveFile(rawFile: string): Promise<void> {
    // Canonicalised once, here, so that every later comparison - is this the
    // entry file? which discovered component is it? - is between two paths that
    // went through the same resolution. The engine canonicalises the root it is
    // given, so a workspace reached through a symbolic link (a macOS temporary
    // directory, a `~/src` symlink) otherwise produces two spellings of the
    // same file that never compare equal.
    const file = await this.canonical(rawFile);
    const found = await this.resolveProjectRoot(file);
    const projectRoot = found === null ? null : await this.canonical(found);

    this.state =
      projectRoot === null
        ? { kind: 'no-project', file }
        : {
            kind: 'project',
            file,
            projectRoot,
            selectedSample: this.restoreSelectedSample(projectRoot),
          };

    this.rendered = false;
    this.updateWatchers(projectRoot);
    await this.render();
  }

  /**
   * The project a file belongs to.
   *
   * The engine's definition: the nearest ancestor directory containing the
   * entry file, bounded by the workspace folder. The preview used to accept a
   * directory holding `samples/` *or* `index.blade`, so it could decide a
   * directory was a project that the compiler would then refuse to compile.
   */
  /** A path with symbolic links resolved, or the path itself when it has none. */
  private async canonical(path: string): Promise<string> {
    try {
      return await this.workspace.fileSystem.realPath(path);
    } catch {
      return resolve(path);
    }
  }

  private async resolveProjectRoot(file: string): Promise<string | null> {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
    return findProjectRoot(dirname(file), {
      io: this.workspace.fileSystem,
      stopAt: folder?.uri.fsPath,
    });
  }

  private async handleEditorChange(
    editor: vscode.TextEditor | undefined
  ): Promise<void> {
    if (!this.panel || !editor) return;
    if (editor.document.uri.scheme !== 'file') return;
    // Switching to a non-Blade file leaves the preview showing what it was
    // showing. It used to render "Not a Blade Project", which is a different
    // claim and an untrue one.
    if (editor.document.languageId !== 'blade') return;
    if (
      this.state.kind !== 'no-editor' &&
      resolve(this.state.file) === resolve(editor.document.uri.fsPath)
    ) {
      return;
    }
    await this.setActiveFile(editor.document.uri.fsPath);
  }

  // ==========================================================================
  // Messages from the webview
  // ==========================================================================

  private async handleMessage(message: ToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.handleReady();
        break;

      case 'selectSample':
        await this.handleSelectSample(message.file);
        break;

      case 'refresh':
        // An explicit refresh is the one place that distrusts the cache: the
        // user is asking because something changed that the watcher missed.
        this.workspace.clear();
        await this.render();
        break;

      case 'createSample':
        await this.handleCreateSample();
        break;
    }
  }

  private async handleReady(): Promise<void> {
    this.ready = true;

    if (this.pending.length > 0) {
      const queued = this.pending;
      this.pending = [];
      for (const message of queued) {
        await this.panel?.webview.postMessage(message);
      }
      return;
    }

    // No backlog: the webview was reloaded (VS Code discards a hidden panel's
    // context) and needs the current state rendered from scratch.
    await this.render();
  }

  /**
   * Adopts a sample the user picked.
   *
   * The name is checked against the set of samples the host itself discovered,
   * so it never reaches a `path.join`. It used to be stored verbatim and joined
   * to `<root>/samples`, where `../../../../.ssh/config` resolves outside the
   * project - and then persisted to workspaceState and restored in later
   * sessions, so a poisoned value survived a restart.
   */
  private async handleSelectSample(name: string): Promise<void> {
    if (this.state.kind !== 'project') return;
    if (!isValidSampleName(name)) return;

    const listing = await this.workspace.sampleListing(this.state.projectRoot);
    if (!listing.data.has(name)) return;

    this.state.selectedSample = name;
    this.saveSelectedSample(this.state.projectRoot, name);
    await this.render();
  }

  /**
   * Writes a sample skeleton for the component being previewed.
   *
   * The component is the file the host is tracking, and its name is the one the
   * compiler gave it. Both used to come from the webview: the name was derived
   * there by `templateFile.split('/').pop()`, a split on forward slashes only,
   * so on Windows an entire backslash path survived into `path.join`.
   */
  private async handleCreateSample(): Promise<void> {
    if (this.state.kind !== 'project') return;
    const { projectRoot, file } = this.state;

    try {
      const source = await this.workspace.fileSystem.readFile(file);
      const compilation = await this.workspace.compile(projectRoot);
      const componentName = compilation.ok
        ? componentNameFor(compilation.result, file)
        : toPascalCase(basename(file, '.blade'));

      const name = sampleNameFor(componentName);
      const samplePath = await resolveSamplePath(
        projectRoot,
        name,
        this.workspace.fileSystem
      );

      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(samplesDirectory(projectRoot))
      );
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(samplePath),
        Buffer.from(sampleContent(propsSkeleton(source)), 'utf-8')
      );

      this.workspace.invalidate(samplePath);
      this.state.selectedSample = name;
      this.saveSelectedSample(projectRoot, name);

      vscode.window.showInformationMessage(
        `Created sample: ${basename(samplePath)}`
      );
      await this.render();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not create sample: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  /**
   * Renders whatever the panel's current state is.
   *
   * Total over {@link PreviewState}: every case posts a screen, so there is no
   * path that leaves the webview on its initial "Loading preview..." markup.
   */
  private async render(): Promise<void> {
    if (!this.panel) return;

    switch (this.state.kind) {
      case 'no-editor':
        this.post({ type: 'samples', files: [], selected: null });
        this.post({ type: 'empty', reason: 'no-editor' });
        return;

      case 'no-project':
        this.post({ type: 'samples', files: [], selected: null });
        this.post({ type: 'empty', reason: 'no-project' });
        return;

      case 'project':
        await this.renderProject();
        return;
    }
  }

  private async renderProject(): Promise<void> {
    const state = this.state;
    if (state.kind !== 'project') return;
    const panel = this.panel;
    if (!panel) return;

    if (!this.rendered) this.post({ type: 'loading' });

    const listing: SampleListing = await this.workspace.sampleListing(
      state.projectRoot
    );
    state.selectedSample = selectSample(listing, state.selectedSample);
    this.post({
      type: 'samples',
      files: [...listing.names],
      selected: state.selectedSample,
    });

    const compilation = await this.workspace.compile(state.projectRoot);
    if (!compilation.ok) {
      this.rendered = true;
      this.post({
        type: 'error',
        message: compilation.message,
        errorType: 'validation',
        more: [],
      });
      return;
    }
    const project = compilation.result;

    if (!isEntryFile(state.projectRoot, state.file)) {
      this.rendered = true;
      this.post({
        type: 'empty',
        reason: 'component-file',
        componentName: componentNameFor(project, state.file),
      });
      return;
    }

    if (state.selectedSample === null) {
      this.rendered = true;
      this.post({ type: 'empty', reason: 'no-samples' });
      return;
    }

    const render = renderProject(
      project,
      listing.data.get(state.selectedSample)
    );
    this.rendered = true;

    if (render.html === null) {
      const [first, ...rest] = render.errors;
      this.post({
        type: 'error',
        message: first?.message ?? 'The template could not be rendered.',
        line: first?.location.start.line,
        column: first?.location.start.column,
        file: first?.file,
        errorType: 'syntax',
        more: rest.map(diagnostic => describe(diagnostic)),
      });
      return;
    }

    this.post({
      type: 'update',
      document: buildPreviewDocument(render.html, {
        cspSource: panel.webview.cspSource,
        baseHref: this.baseHrefFor(panel.webview, state.projectRoot),
      }),
      html: render.html,
      renderTime: render.renderTime,
      notices: [
        ...listing.notices,
        ...render.warnings.map(warning => describe(warning)),
      ],
    });
  }

  /** The project root as a URL the webview may load resources from. */
  private baseHrefFor(
    webview: vscode.Webview,
    projectRoot: string
  ): string | null {
    try {
      const uri = webview.asWebviewUri(vscode.Uri.file(projectRoot)).toString();
      return uri.endsWith('/') ? uri : `${uri}/`;
    } catch {
      // A project outside every workspace folder has no webview URI; relative
      // resources simply will not resolve, which is better than failing to
      // render at all.
      return null;
    }
  }

  private post(message: ToWebviewMessage): void {
    if (!this.panel) return;
    if (!this.ready) {
      this.pending.push(message);
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private saveSelectedSample(projectRoot: string, sample: string): void {
    void this.context.workspaceState.update(
      sampleStateKey(projectRoot),
      sample
    );
  }

  private restoreSelectedSample(projectRoot: string): string | null {
    const stored = this.context.workspaceState.get<string>(
      sampleStateKey(projectRoot)
    );
    // A stored value is data from a previous session, and the sample it names
    // may since have been deleted or renamed; `selectSample` checks it against
    // what the project actually has before anything reads a file.
    return stored !== undefined && isValidSampleName(stored) ? stored : null;
  }

  // ==========================================================================
  // Webview markup
  // ==========================================================================

  private getWebviewHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${panelCsp(webview.cspSource, nonce)}">
  <link href="${cssUri}" rel="stylesheet">
  <title>Blade Preview</title>
</head>
<body>
  <div class="preview-container">
    <header class="preview-header">
      <div class="preview-title">
        <span class="preview-icon">&#9889;</span>
        Blade Preview
      </div>
      <div class="preview-controls">
        <select id="sample-selector" class="sample-selector">
          <option value="">Loading samples...</option>
        </select>
        <button id="view-toggle-btn" class="view-toggle-btn" title="Toggle HTML view">
          <span class="view-icon">&#60;/&#62;</span>
        </button>
        <button id="refresh-btn" class="refresh-btn" title="Refresh">&#8635;</button>
      </div>
    </header>

    <main class="preview-content">
      <div id="status" class="preview-status">
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>Loading preview...</p>
        </div>
      </div>
      <!--
        Rendered template output lives in here and nowhere else: a sandboxed,
        unique-origin document with no scripting and no access to this page's
        \`acquireVsCodeApi()\`. It is never parsed by this page.
      -->
      <iframe id="preview-frame" class="preview-frame" sandbox=""
              title="Rendered template" hidden></iframe>
      <pre id="raw-html" class="raw-html-content" hidden><code></code></pre>
      <div id="notices" class="preview-notices" hidden></div>
      <div id="render-info" class="render-info" hidden></div>
    </main>
  </div>

  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const sampleSelector = document.getElementById('sample-selector');
      const viewToggleBtn = document.getElementById('view-toggle-btn');
      const refreshBtn = document.getElementById('refresh-btn');
      const status = document.getElementById('status');
      const frame = document.getElementById('preview-frame');
      const raw = document.getElementById('raw-html');
      const notices = document.getElementById('notices');
      const renderInfo = document.getElementById('render-info');

      const stored = vscode.getState() || {};
      let showRawHtml = stored.showRawHtml === true;
      let hasRender = false;

      function applyViewMode() {
        viewToggleBtn.classList.toggle('active', showRawHtml);
        viewToggleBtn.title = showRawHtml ? 'Show visual preview' : 'Show raw HTML';
        frame.hidden = !hasRender || showRawHtml;
        raw.hidden = !hasRender || !showRawHtml;
        renderInfo.hidden = !hasRender;
      }

      function clearRender() {
        hasRender = false;
        frame.removeAttribute('srcdoc');
        raw.firstChild.textContent = '';
        notices.hidden = true;
        notices.textContent = '';
        applyViewMode();
      }

      function showStatus(node) {
        status.textContent = '';
        status.hidden = false;
        status.appendChild(node);
      }

      function block(className, icon, heading, body) {
        const wrapper = document.createElement('div');
        wrapper.className = className;
        if (icon) {
          const iconEl = document.createElement('div');
          iconEl.className = 'empty-icon';
          iconEl.textContent = icon;
          wrapper.appendChild(iconEl);
        }
        const headingEl = document.createElement('h3');
        headingEl.textContent = heading;
        wrapper.appendChild(headingEl);
        for (const line of body) {
          const p = document.createElement('p');
          p.textContent = line;
          wrapper.appendChild(p);
        }
        return wrapper;
      }

      sampleSelector.addEventListener('change', () => {
        const selected = sampleSelector.value;
        if (selected) {
          vscode.postMessage({ type: 'selectSample', file: selected });
        }
      });

      viewToggleBtn.addEventListener('click', () => {
        showRawHtml = !showRawHtml;
        vscode.setState({ showRawHtml: showRawHtml });
        applyViewMode();
      });

      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
      });

      window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
          case 'update': {
            status.hidden = true;
            status.textContent = '';
            hasRender = true;
            frame.srcdoc = message.document;
            raw.firstChild.textContent = message.html;
            renderInfo.textContent = 'Rendered in ' + message.renderTime + ' ms';
            notices.textContent = '';
            notices.hidden = message.notices.length === 0;
            for (const notice of message.notices) {
              const line = document.createElement('div');
              line.className = 'preview-notice';
              line.textContent = notice;
              notices.appendChild(line);
            }
            applyViewMode();
            break;
          }

          case 'error': {
            const lines = [message.message];
            if (message.file) lines.push('In ' + message.file);
            if (message.line) {
              lines.push(
                'Line ' + message.line +
                (message.column ? ', column ' + message.column : '')
              );
            }
            for (const extra of message.more || []) lines.push(extra);
            showStatus(block('preview-error', '\\u26A0', 'Error', lines));
            break;
          }

          case 'loading': {
            const wrapper = document.createElement('div');
            wrapper.className = 'loading';
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            const text = document.createElement('p');
            text.textContent = 'Rendering...';
            wrapper.appendChild(spinner);
            wrapper.appendChild(text);
            showStatus(wrapper);
            break;
          }

          case 'samples': {
            sampleSelector.textContent = '';
            if (message.files.length === 0) {
              const option = document.createElement('option');
              option.value = '';
              option.textContent = 'No samples found';
              sampleSelector.appendChild(option);
              break;
            }
            for (const name of message.files) {
              const option = document.createElement('option');
              option.value = name;
              option.textContent = name;
              option.selected = name === message.selected;
              sampleSelector.appendChild(option);
            }
            break;
          }

          case 'empty': {
            clearRender();
            if (message.reason === 'no-samples') {
              showStatus(block('empty-state', '\\uD83D\\uDCC1', 'No Sample Data', [
                'Create JSON files in the samples/ folder to preview this template.',
              ]));
            } else if (message.reason === 'no-project') {
              showStatus(block('empty-state', '\\uD83D\\uDCC2', 'Not a Blade Project', [
                'Open a file in a directory containing index.blade.',
              ]));
            } else if (message.reason === 'no-editor') {
              showStatus(block('empty-state', '\\uD83D\\uDCC4', 'No Template Open', [
                'Open a .blade file to preview it.',
              ]));
            } else {
              const name = message.componentName || 'Component';
              const wrapper = block('empty-state', '\\uD83E\\uDDE9', 'Component File', [
                'The preview renders the project entry point. Create a sample for ' +
                  name + ' to see it on its own.',
              ]);
              const button = document.createElement('button');
              button.className = 'create-sample-btn';
              button.textContent = 'Create Sample for ' + name;
              button.addEventListener('click', () => {
                vscode.postMessage({ type: 'createSample' });
              });
              wrapper.appendChild(button);
              showStatus(wrapper);
            }
            break;
          }
        }
      });

      applyViewMode();
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** The editor's current text for a path, when it has the file open. */
function openDocumentText(path: string): string | undefined {
  const target = resolve(path);
  for (const document of vscode.workspace.textDocuments) {
    if (document.uri.scheme !== 'file') continue;
    if (resolve(document.uri.fsPath) === target) return document.getText();
  }
  return undefined;
}

/** Whether `file` is the project's entry point. */
function isEntryFile(projectRoot: string, file: string): boolean {
  return resolve(file) === resolve(join(projectRoot, DEFAULT_ENTRY));
}

/**
 * The tag name the compiler gives a component file.
 *
 * Read off the project the compiler just produced, so the preview and the build
 * can never disagree. The fallback is the engine's own naming function, not a
 * second implementation of it: the old one split on `-` alone and left the tail
 * untouched, so `my_widget.blade` was `My_widget` in the preview and `MyWidget`
 * everywhere else.
 */
function componentNameFor(project: ProjectResult, file: string): string {
  const target = resolve(file);
  for (const info of project.context.components.values()) {
    if (resolve(info.filePath) === target) return info.tagName;
  }
  return toPascalCase(basename(file, '.blade'));
}

function sampleStateKey(projectRoot: string): string {
  return `blade.preview.sample.${hashProjectPath(projectRoot)}`;
}

function describe(diagnostic: {
  message: string;
  file?: string;
  location: { start: { line: number; column: number } };
}): string {
  const where = diagnostic.file ? `${diagnostic.file}:` : '';
  return `${where}${diagnostic.location.start.line}:${diagnostic.location.start.column} ${diagnostic.message}`;
}

/** Whether `path` is `root` or sits inside it. */
function isWithin(root: string, path: string): boolean {
  return (
    path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
  );
}
