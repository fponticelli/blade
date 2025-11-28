/**
 * Webview panel management for Blade preview
 * Feature: 007-vscode-preview-mode
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type {
  ToWebviewMessage,
  ToExtensionMessage,
  SampleInfo,
  PreviewState,
} from './types';
import { findProjectRoot, isComponentFile, debounce, getNonce, hashProjectPath } from './utils';
import { discoverSamples, loadSample, loadAllSamples, getDefaultSample } from './samples';
import { renderTemplate, validateSampleData } from './renderer';

/**
 * Singleton manager for the preview webview panel.
 */
export class PreviewPanelManager {
  private static instance: PreviewPanelManager | null = null;
  private panel: vscode.WebviewPanel | null = null;
  private state: PreviewState | null = null;
  private context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];
  private debouncedRefresh: ReturnType<typeof debounce> | null = null;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get or create the singleton instance.
   */
  public static getInstance(context: vscode.ExtensionContext): PreviewPanelManager {
    if (!PreviewPanelManager.instance) {
      PreviewPanelManager.instance = new PreviewPanelManager(context);
    }
    return PreviewPanelManager.instance;
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

    const filePath = editor.document.uri.fsPath;
    const projectRoot = findProjectRoot(filePath);

    if (!projectRoot) {
      this.showEmptyState('no-project', filePath);
      return;
    }

    // Create or reveal the panel
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.createPanel();
    }

    // Initialize state
    this.state = {
      projectRoot,
      activeFile: filePath,
      selectedSample: this.restoreSelectedSample(projectRoot),
      lastSuccessfulHtml: null,
      isLoading: true,
    };

    // Setup listeners
    this.setupListeners();

    // Send initial data to webview
    await this.sendSamplesList();
    await this.refresh();
  }

  /**
   * Create a new webview panel.
   */
  private createPanel(): void {
    const mediaPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'media'
    );

    this.panel = vscode.window.createWebviewPanel(
      'bladePreview',
      'Blade Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaPath],
      }
    );

    // Set the webview HTML
    this.panel.webview.html = this.getWebviewHtml();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: ToExtensionMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel dispose
    this.panel.onDidDispose(
      () => this.handleDispose(),
      null,
      this.disposables
    );
  }

  /**
   * Setup event listeners for live preview.
   */
  private setupListeners(): void {
    // Debounced refresh on text change
    this.debouncedRefresh = debounce(() => this.refresh(), 300);

    // Listen for text document changes
    const textChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (
          e.document.languageId === 'blade' &&
          e.document.uri.fsPath === this.state?.activeFile
        ) {
          this.debouncedRefresh?.();
        }
      }
    );
    this.disposables.push(textChangeDisposable);

    // Listen for active editor changes
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
      (editor) => this.handleEditorChange(editor)
    );
    this.disposables.push(editorChangeDisposable);

    // Listen for sample file changes
    const sampleWatcher = vscode.workspace.createFileSystemWatcher(
      '**/samples/*.json'
    );
    sampleWatcher.onDidChange(() => this.refresh());
    sampleWatcher.onDidCreate(() => this.sendSamplesList());
    sampleWatcher.onDidDelete(() => this.sendSamplesList());
    this.disposables.push(sampleWatcher);
  }

  /**
   * Handle messages from the webview.
   */
  private async handleMessage(message: ToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.sendSamplesList();
        await this.refresh();
        break;

      case 'selectSample':
        if (this.state) {
          this.state.selectedSample = message.file;
          this.saveSelectedSample(this.state.projectRoot, message.file);
          await this.refresh();
        }
        break;

      case 'refresh':
        await this.refresh();
        break;

      case 'createSample':
        await this.handleCreateSample(message.componentName);
        break;
    }
  }

  /**
   * Handle active editor change.
   */
  private async handleEditorChange(
    editor: vscode.TextEditor | undefined
  ): Promise<void> {
    if (!this.panel || !editor) {
      return;
    }

    if (editor.document.languageId !== 'blade') {
      // Non-blade file - show message
      this.postMessage({
        type: 'empty',
        reason: 'no-project',
        templateFile: editor.document.uri.fsPath,
      });
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const projectRoot = findProjectRoot(filePath);

    if (!projectRoot) {
      this.showEmptyState('no-project', filePath);
      return;
    }

    // Update state
    this.state = {
      projectRoot,
      activeFile: filePath,
      selectedSample: this.restoreSelectedSample(projectRoot),
      lastSuccessfulHtml: null,
      isLoading: true,
    };

    // Check if component file
    if (isComponentFile(filePath)) {
      this.showEmptyState('component-file', filePath);
      return;
    }

    await this.sendSamplesList();
    await this.refresh();
  }

  /**
   * Handle panel dispose.
   */
  private handleDispose(): void {
    this.debouncedRefresh?.cancel();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    this.panel = null;
    this.state = null;
  }

  /**
   * Refresh the preview with current template and sample.
   */
  private async refresh(): Promise<void> {
    if (!this.panel || !this.state) {
      return;
    }

    const { projectRoot, activeFile, selectedSample } = this.state;

    // Check for component file
    if (isComponentFile(activeFile)) {
      this.showEmptyState('component-file', activeFile);
      return;
    }

    // Check for selected sample
    if (!selectedSample) {
      const samples = loadAllSamples(projectRoot);
      if (samples.length === 0) {
        this.showEmptyState('no-samples', activeFile);
        return;
      }
      // Select first sample
      this.state.selectedSample = getDefaultSample(samples);
      if (!this.state.selectedSample) {
        this.showEmptyState('no-samples', activeFile);
        return;
      }
    }

    // Send loading state
    this.postMessage({ type: 'loading' });

    // Load sample data
    const sample = loadSample(projectRoot, this.state.selectedSample!);
    if (!sample.isValid) {
      this.postMessage({
        type: 'error',
        message: sample.error ?? 'Failed to load sample',
        errorType: 'json',
      });
      return;
    }

    // Validate against schema
    const schemaWarnings = validateSampleData(projectRoot, sample.data);

    // Get template source
    const editor = vscode.window.activeTextEditor;
    const templateSource = editor?.document.uri.fsPath === activeFile
      ? editor.document.getText()
      : await this.readFile(activeFile);

    if (!templateSource) {
      this.postMessage({
        type: 'error',
        message: 'Failed to read template file',
        errorType: 'syntax',
      });
      return;
    }

    // Render template
    const result = await renderTemplate(templateSource, projectRoot, sample.data);

    if (result.success && result.html) {
      this.state.lastSuccessfulHtml = result.html;
      this.postMessage({
        type: 'update',
        html: result.html,
        renderTime: result.renderTime,
      });

      // Send any warnings
      for (const warning of [...result.warnings, ...schemaWarnings]) {
        console.warn(`[Blade Preview] ${warning.message}`);
      }
    } else if (result.errors.length > 0) {
      const error = result.errors[0];
      this.postMessage({
        type: 'error',
        message: error.message,
        line: error.line ?? undefined,
        column: error.column ?? undefined,
        file: error.file ?? undefined,
        errorType: error.type,
      });
    }
  }

  /**
   * Send the list of available samples to the webview.
   */
  private async sendSamplesList(): Promise<void> {
    if (!this.panel || !this.state) {
      return;
    }

    const samples = loadAllSamples(this.state.projectRoot);

    // Auto-select if no sample selected
    if (!this.state.selectedSample && samples.length > 0) {
      this.state.selectedSample = getDefaultSample(samples);
    }

    this.postMessage({
      type: 'samples',
      files: samples,
      selected: this.state.selectedSample,
    });
  }

  /**
   * Show an empty state message.
   */
  private showEmptyState(
    reason: 'no-samples' | 'no-project' | 'component-file',
    templateFile: string
  ): void {
    if (!this.panel) {
      this.createPanel();
    }

    this.postMessage({
      type: 'empty',
      reason,
      templateFile,
    });
  }

  /**
   * Handle create sample request from webview.
   */
  private async handleCreateSample(componentName: string): Promise<void> {
    if (!this.state) {
      return;
    }

    // Import sample creation function
    const { createComponentSample, parsePropsForSample } = await import('./samples');

    // Read the component file to parse props
    const componentPath = this.state.activeFile;
    const source = await this.readFile(componentPath);
    if (!source) {
      vscode.window.showErrorMessage('Failed to read component file');
      return;
    }

    const props = parsePropsForSample(source);
    const samplePath = await createComponentSample(
      this.state.projectRoot,
      componentName,
      props
    );

    vscode.window.showInformationMessage(`Created sample: ${path.basename(samplePath)}`);

    // Refresh samples list and preview
    await this.sendSamplesList();
    this.state.selectedSample = path.basename(samplePath);
    await this.refresh();
  }

  /**
   * Post a message to the webview.
   */
  private postMessage(message: ToWebviewMessage): void {
    this.panel?.webview.postMessage(message);
  }

  /**
   * Read a file's content.
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Save selected sample to workspace state.
   */
  private saveSelectedSample(projectRoot: string, sample: string): void {
    const key = `blade.preview.sample.${hashProjectPath(projectRoot)}`;
    this.context.workspaceState.update(key, sample);
  }

  /**
   * Restore selected sample from workspace state.
   */
  private restoreSelectedSample(projectRoot: string): string | null {
    const key = `blade.preview.sample.${hashProjectPath(projectRoot)}`;
    return this.context.workspaceState.get<string>(key) ?? null;
  }

  /**
   * Get the HTML content for the webview.
   */
  private getWebviewHtml(): string {
    const nonce = getNonce();
    const cssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${cssUri}" rel="stylesheet">
  <title>Blade Preview</title>
</head>
<body>
  <div class="preview-container">
    <header class="preview-header">
      <div class="preview-title">
        <span class="preview-icon">⚡</span>
        Blade Preview
      </div>
      <div class="preview-controls">
        <select id="sample-selector" class="sample-selector">
          <option value="">Loading samples...</option>
        </select>
        <button id="refresh-btn" class="refresh-btn" title="Refresh">↻</button>
      </div>
    </header>

    <main id="preview-content" class="preview-content">
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading preview...</p>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const sampleSelector = document.getElementById('sample-selector');
      const refreshBtn = document.getElementById('refresh-btn');
      const previewContent = document.getElementById('preview-content');

      let currentSamples = [];
      let lastHtml = '';

      // Handle sample selection
      sampleSelector.addEventListener('change', () => {
        const selected = sampleSelector.value;
        if (selected) {
          vscode.postMessage({ type: 'selectSample', file: selected });
        }
      });

      // Handle refresh button
      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
      });

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
          case 'update':
            lastHtml = message.html;
            previewContent.innerHTML = \`
              <div class="rendered-content">\${message.html}</div>
              <div class="render-info">Rendered in \${message.renderTime}ms</div>
            \`;
            break;

          case 'error':
            let errorHtml = \`
              <div class="preview-error">
                <div class="error-icon">⚠️</div>
                <h3>Error</h3>
                <p class="error-message">\${escapeHtml(message.message)}</p>
            \`;
            if (message.line) {
              errorHtml += \`<p class="error-location">Line \${message.line}\${message.column ? ', Column ' + message.column : ''}</p>\`;
            }
            errorHtml += '</div>';

            // Preserve last successful render
            if (lastHtml) {
              errorHtml += \`<div class="last-render"><h4>Last successful render:</h4><div class="rendered-content">\${lastHtml}</div></div>\`;
            }

            previewContent.innerHTML = errorHtml;
            break;

          case 'samples':
            currentSamples = message.files;
            sampleSelector.innerHTML = '';

            if (message.files.length === 0) {
              sampleSelector.innerHTML = '<option value="">No samples found</option>';
            } else {
              message.files.forEach(sample => {
                const option = document.createElement('option');
                option.value = sample.name;
                option.textContent = sample.name + (sample.isValid ? '' : ' ⚠️');
                option.selected = sample.name === message.selected;
                sampleSelector.appendChild(option);
              });
            }
            break;

          case 'loading':
            previewContent.innerHTML = \`
              <div class="loading">
                <div class="loading-spinner"></div>
                <p>Rendering...</p>
              </div>
            \`;
            break;

          case 'empty':
            let emptyHtml = '<div class="empty-state">';

            switch (message.reason) {
              case 'no-samples':
                emptyHtml += \`
                  <div class="empty-icon">📁</div>
                  <h3>No Sample Data</h3>
                  <p>Create JSON files in the <code>samples/</code> folder to preview this template.</p>
                \`;
                break;
              case 'no-project':
                emptyHtml += \`
                  <div class="empty-icon">📂</div>
                  <h3>Not a Blade Project</h3>
                  <p>Open a file in a Blade project (with <code>samples/</code> folder or <code>index.blade</code>).</p>
                \`;
                break;
              case 'component-file':
                const componentName = message.templateFile ? message.templateFile.split('/').pop().replace('.blade', '') : 'Component';
                emptyHtml += \`
                  <div class="empty-icon">🧩</div>
                  <h3>Component File</h3>
                  <p>This is a component file. Preview works with <code>index.blade</code> or create a sample for this component.</p>
                  <button id="create-sample-btn" class="create-sample-btn" data-component="\${escapeHtml(componentName)}">
                    Create Sample for \${escapeHtml(componentName)}
                  </button>
                \`;
                break;
            }

            emptyHtml += '</div>';
            previewContent.innerHTML = emptyHtml;

            // Attach event handler for create sample button
            const createBtn = document.getElementById('create-sample-btn');
            if (createBtn) {
              createBtn.addEventListener('click', () => {
                vscode.postMessage({
                  type: 'createSample',
                  componentName: createBtn.dataset.component
                });
              });
            }
            break;
        }
      });

      // Helper function to escape HTML
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // Signal that webview is ready
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
