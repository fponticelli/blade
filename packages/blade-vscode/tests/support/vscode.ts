/**
 * The `vscode` module, as a test double.
 *
 * `vscode` is not a package: the extension host injects it at run time, so an
 * extension can only be tested against something that stands in for it. This
 * implements the surface `src/` actually uses and, crucially, *records* what
 * the extension did with it - how many listeners it registered, how many
 * watchers it created and over which patterns, what it posted to the webview -
 * because those are the behaviours that went wrong.
 *
 * Vitest aliases the bare specifier `vscode` to this file; tests import
 * {@link harness} from it directly, which is the same module instance.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'path';

// ============================================================================
// Events
// ============================================================================

export interface Disposable {
  dispose(): void;
}

/** A minimal `vscode.Event` source that can say how many listeners it has. */
export class Emitter<T> {
  private listeners: ((value: T) => unknown)[] = [];

  readonly event = (listener: (value: T) => unknown): Disposable => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter(other => other !== listener);
      },
    };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  get listenerCount(): number {
    return this.listeners.length;
  }
}

// ============================================================================
// Uri
// ============================================================================

const WEBVIEW_ORIGIN = 'https://file+.vscode-resource.vscode-cdn.net';

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
    private readonly external: string | null = null
  ) {}

  static file(path: string): Uri {
    return new Uri('file', resolvePath(path));
  }

  static parse(value: string): Uri {
    return value.startsWith('file://')
      ? Uri.file(value.slice('file://'.length))
      : new Uri(value.split(':')[0] ?? 'untitled', value, value);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, resolvePath(join(base.fsPath, ...segments)));
  }

  /** Only used by the double's own `asWebviewUri`. */
  static webview(path: string): Uri {
    return new Uri('https', path, WEBVIEW_ORIGIN + toPosix(path));
  }

  get path(): string {
    return toPosix(this.fsPath);
  }

  toString(): string {
    return this.external ?? `file://${toPosix(this.fsPath)}`;
  }
}

function toPosix(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

// ============================================================================
// Webview
// ============================================================================

export class FakeWebview {
  html = '';
  readonly cspSource = WEBVIEW_ORIGIN;
  /** Every message the extension posted, oldest first. */
  readonly posted: unknown[] = [];
  private readonly incoming = new Emitter<unknown>();

  onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable {
    return this.incoming.event(listener);
  }

  postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message);
    return Promise.resolve(true);
  }

  asWebviewUri(uri: Uri): Uri {
    return Uri.webview(uri.fsPath);
  }

  /** Drive a message from the webview into the extension. */
  send(message: unknown): void {
    this.incoming.fire(message);
  }

  get messageListenerCount(): number {
    return this.incoming.listenerCount;
  }
}

export interface WebviewPanelOptions {
  enableScripts?: boolean;
  retainContextWhenHidden?: boolean;
  localResourceRoots?: Uri[];
}

export class FakeWebviewPanel {
  readonly webview = new FakeWebview();
  revealCount = 0;
  disposed = false;
  private readonly disposeEmitter = new Emitter<void>();

  constructor(
    readonly viewType: string,
    readonly title: string,
    readonly options: WebviewPanelOptions
  ) {}

  reveal(): void {
    this.revealCount++;
  }

  onDidDispose(listener: () => unknown): Disposable {
    return this.disposeEmitter.event(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeEmitter.fire();
  }
}

// ============================================================================
// File system watcher
// ============================================================================

export class RelativePattern {
  readonly base: string;

  constructor(
    base: string | { uri: Uri },
    readonly pattern: string
  ) {
    this.base = typeof base === 'string' ? base : base.uri.fsPath;
  }
}

export class FakeFileSystemWatcher {
  disposed = false;
  private readonly changed = new Emitter<Uri>();
  private readonly created = new Emitter<Uri>();
  private readonly deleted = new Emitter<Uri>();

  constructor(readonly pattern: RelativePattern | string) {}

  onDidChange(listener: (uri: Uri) => unknown): Disposable {
    return this.changed.event(listener);
  }
  onDidCreate(listener: (uri: Uri) => unknown): Disposable {
    return this.created.event(listener);
  }
  onDidDelete(listener: (uri: Uri) => unknown): Disposable {
    return this.deleted.event(listener);
  }

  dispose(): void {
    this.disposed = true;
  }

  fireChange(path: string): void {
    this.changed.fire(Uri.file(path));
  }
  fireCreate(path: string): void {
    this.created.fire(Uri.file(path));
  }
  fireDelete(path: string): void {
    this.deleted.fire(Uri.file(path));
  }
}

// ============================================================================
// Documents and editors
// ============================================================================

export class FakeTextDocument {
  constructor(
    readonly uri: Uri,
    readonly languageId: string,
    private text: string
  ) {}

  getText(): string {
    return this.text;
  }

  setText(text: string): void {
    this.text = text;
  }
}

export interface FakeTextEditor {
  document: FakeTextDocument;
}

// ============================================================================
// Harness
// ============================================================================

class Harness {
  documents: FakeTextDocument[] = [];
  activeEditor: FakeTextEditor | undefined = undefined;
  workspaceFolders: { uri: Uri; name: string; index: number }[] = [];
  panels: FakeWebviewPanel[] = [];
  watchers: FakeFileSystemWatcher[] = [];
  commands = new Map<string, (...args: unknown[]) => unknown>();
  serializers = new Map<
    string,
    {
      deserializeWebviewPanel(
        panel: FakeWebviewPanel,
        state: unknown
      ): Promise<void>;
    }
  >();
  info: string[] = [];
  warnings: string[] = [];
  errors: string[] = [];
  readonly documentChanges = new Emitter<{ document: FakeTextDocument }>();
  readonly documentSaves = new Emitter<FakeTextDocument>();
  readonly activeEditorChanges = new Emitter<FakeTextEditor | undefined>();

  reset(): void {
    this.documents = [];
    this.activeEditor = undefined;
    this.workspaceFolders = [];
    this.panels = [];
    this.watchers = [];
    this.commands = new Map();
    this.serializers = new Map();
    this.info = [];
    this.warnings = [];
    this.errors = [];
  }

  /** Opens a document and makes it the active editor. */
  open(path: string, text: string, languageId = 'blade'): FakeTextDocument {
    const document = new FakeTextDocument(Uri.file(path), languageId, text);
    this.documents.push(document);
    this.activeEditor = { document };
    return document;
  }

  /** Switches the active editor, firing the event the extension listens to. */
  activate(document: FakeTextDocument): void {
    this.activeEditor = { document };
    this.activeEditorChanges.fire(this.activeEditor);
  }

  /** Edits an open buffer, firing the change event. */
  edit(document: FakeTextDocument, text: string): void {
    document.setText(text);
    this.documentChanges.fire({ document });
  }

  /** The panel most recently created, which is the only live one. */
  get panel(): FakeWebviewPanel {
    const panel = this.panels[this.panels.length - 1];
    if (!panel) throw new Error('no webview panel was created');
    return panel;
  }

  /** Every watcher that has not been disposed. */
  get liveWatchers(): FakeFileSystemWatcher[] {
    return this.watchers.filter(watcher => !watcher.disposed);
  }

  /** Messages posted to the current panel, optionally filtered by type. */
  posted<T = Record<string, unknown>>(type?: string): T[] {
    const all = this.panel.webview.posted as T[];
    if (type === undefined) return all;
    return all.filter(message => (message as { type?: string }).type === type);
  }

  /** The last message of a given type, or undefined. */
  lastPosted<T = Record<string, unknown>>(type: string): T | undefined {
    const all = this.posted<T>(type);
    return all[all.length - 1];
  }
}

export const harness = new Harness();

// ============================================================================
// The `vscode` module surface
// ============================================================================

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 } as const;

export const window = {
  get activeTextEditor(): FakeTextEditor | undefined {
    return harness.activeEditor;
  },
  createWebviewPanel(
    viewType: string,
    title: string,
    _column: number,
    options: WebviewPanelOptions
  ): FakeWebviewPanel {
    const panel = new FakeWebviewPanel(viewType, title, options);
    harness.panels.push(panel);
    return panel;
  },
  onDidChangeActiveTextEditor: harness.activeEditorChanges.event,
  registerWebviewPanelSerializer(
    viewType: string,
    serializer: {
      deserializeWebviewPanel(
        panel: FakeWebviewPanel,
        state: unknown
      ): Promise<void>;
    }
  ): Disposable {
    harness.serializers.set(viewType, serializer);
    return { dispose: () => harness.serializers.delete(viewType) };
  },
  showInformationMessage(message: string): Promise<undefined> {
    harness.info.push(message);
    return Promise.resolve(undefined);
  },
  showWarningMessage(message: string): Promise<undefined> {
    harness.warnings.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(message: string): Promise<undefined> {
    harness.errors.push(message);
    return Promise.resolve(undefined);
  },
};

export const workspace = {
  get textDocuments(): FakeTextDocument[] {
    return harness.documents;
  },
  get workspaceFolders(): { uri: Uri; name: string; index: number }[] {
    return harness.workspaceFolders;
  },
  getWorkspaceFolder(
    uri: Uri
  ): { uri: Uri; name: string; index: number } | undefined {
    return harness.workspaceFolders.find(folder =>
      isWithin(folder.uri.fsPath, uri.fsPath)
    );
  },
  onDidChangeTextDocument: harness.documentChanges.event,
  onDidSaveTextDocument: harness.documentSaves.event,
  createFileSystemWatcher(
    pattern: RelativePattern | string
  ): FakeFileSystemWatcher {
    const watcher = new FakeFileSystemWatcher(pattern);
    harness.watchers.push(watcher);
    return watcher;
  },
  fs: {
    // Writes reach a real temporary directory, so that the code under test can
    // read back what it just created through the engine's own filesystem.
    createDirectory(uri: Uri): Promise<void> {
      mkdirSync(uri.fsPath, { recursive: true });
      return Promise.resolve();
    },
    writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      mkdirSync(dirname(uri.fsPath), { recursive: true });
      writeFileSync(uri.fsPath, content);
      return Promise.resolve();
    },
  },
};

export const commands = {
  registerCommand(
    id: string,
    callback: (...args: unknown[]) => unknown
  ): Disposable {
    harness.commands.set(id, callback);
    return { dispose: () => harness.commands.delete(id) };
  },
};

function isWithin(root: string, path: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(path)) return false;
  const base = resolvePath(root);
  const target = resolvePath(path);
  return target === base || target.startsWith(base + '/');
}
