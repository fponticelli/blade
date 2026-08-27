/**
 * The preview panel.
 *
 * Every case here is a defect that survived because this package had no tests:
 * listeners registered on every `show()`, an unreachable empty state, a
 * webview-supplied filesystem path, and `retainContextWhenHidden` on a panel
 * whose whole state is one string.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { PreviewPanelManager } from '../src/preview/panel.js';
import type { FakeExtensionContext } from './support/context.js';
import { createContext } from './support/context.js';
import { harness, Uri, window } from './support/vscode.js';
import type { FakeTextDocument } from './support/vscode.js';
import { createFixture } from './support/fixture.js';
import type { Fixture } from './support/fixture.js';

interface ExtensionContextLike {
  extensionUri: unknown;
  subscriptions: unknown[];
  workspaceState: unknown;
}

/** The panel manager takes a `vscode.ExtensionContext`; the double is one. */
function managerFor(context: FakeExtensionContext): PreviewPanelManager {
  return PreviewPanelManager.getInstance(
    context as unknown as Parameters<typeof PreviewPanelManager.getInstance>[0]
  );
}

let fixture: Fixture;
let context: FakeExtensionContext;

const ENTRY = '<h1>${title}</h1>';

function openFixture(files: Record<string, string>): FakeTextDocument {
  fixture = createFixture(files);
  harness.workspaceFolders = [
    { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
  ];
  const entry = fixture.path('index.blade');
  return harness.open(entry, files['index.blade'] ?? '');
}

/** Lets every promise the extension started settle. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 20));
}

/** Answers the webview's handshake, which is what unblocks message delivery. */
async function webviewReady(): Promise<void> {
  harness.panel.webview.send({ type: 'ready' });
  await flush();
}

beforeEach(() => {
  harness.reset();
  context = createContext();
});

afterEach(() => {
  PreviewPanelManager.disposeInstance();
  fixture?.dispose();
  fixture = undefined as unknown as Fixture;
});

describe('show', () => {
  it('refuses when the active editor is not a Blade file', async () => {
    harness.open('/tmp/notes.txt', 'hello', 'plaintext');

    await managerFor(context).show();

    expect(harness.panels).toHaveLength(0);
    expect(harness.warnings).toEqual(['Open a .blade file to preview']);
  });

  it('registers its listeners exactly once, however often it is invoked', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });
    const manager = managerFor(context);

    await manager.show();
    await webviewReady();
    const afterFirst = {
      documentChanges: harness.documentChanges.listenerCount,
      editorChanges: harness.activeEditorChanges.listenerCount,
      saves: harness.documentSaves.listenerCount,
      messages: harness.panel.webview.messageListenerCount,
      watchers: harness.liveWatchers.length,
    };

    // The command is bound to cmd+shift+V and sits in the editor title bar.
    for (let i = 0; i < 5; i++) await manager.show();

    expect(harness.documentChanges.listenerCount).toBe(
      afterFirst.documentChanges
    );
    expect(harness.activeEditorChanges.listenerCount).toBe(
      afterFirst.editorChanges
    );
    expect(harness.documentSaves.listenerCount).toBe(afterFirst.saves);
    expect(harness.panel.webview.messageListenerCount).toBe(
      afterFirst.messages
    );
    // And no new workspace-wide recursive watcher per press.
    expect(harness.liveWatchers).toHaveLength(afterFirst.watchers);
    expect(harness.panels).toHaveLength(1);
    expect(harness.panel.revealCount).toBe(5);
  });

  it('scopes its watchers to the project, not the whole workspace', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });

    await managerFor(context).show();

    expect(harness.liveWatchers.length).toBeGreaterThan(0);
    for (const watcher of harness.liveWatchers) {
      const pattern = watcher.pattern;
      expect(typeof pattern).not.toBe('string');
      if (typeof pattern === 'string') continue;
      expect(pattern.base).toBe(fixture.root);
      expect(pattern.pattern).not.toContain('**/samples');
    }
  });

  it('does not retain the webview context for the whole session', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });

    await managerFor(context).show();

    // VS Code documents this as memory-expensive and recommends it only when
    // restoring state is infeasible. Here the state is one sample name, already
    // persisted, and the ready handshake rebuilds the rest.
    expect(harness.panel.options.retainContextWhenHidden).toBeUndefined();
    expect(harness.panel.options.enableScripts).toBe(true);
  });

  it('lets the webview load resources from the workspace, not only from media', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });

    await managerFor(context).show();

    const roots = (harness.panel.options.localResourceRoots ?? []).map(
      uri => uri.fsPath
    );
    expect(roots).toContain(fixture.root);
  });

  it('releases everything when the panel is closed', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });
    await managerFor(context).show();
    await webviewReady();

    harness.panel.dispose();

    expect(harness.documentChanges.listenerCount).toBe(0);
    expect(harness.activeEditorChanges.listenerCount).toBe(0);
    expect(harness.documentSaves.listenerCount).toBe(0);
    expect(harness.liveWatchers).toHaveLength(0);
  });
});

describe('the no-project state', () => {
  it('renders "Not a Blade Project" instead of loading forever', async () => {
    // Nothing named index.blade anywhere above the file.
    fixture = createFixture({ 'orphan/card.blade': '<div>hi</div>' });
    harness.workspaceFolders = [
      { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
    ];
    harness.open(fixture.path('orphan', 'card.blade'), '<div>hi</div>');

    await managerFor(context).show();
    // The panel was created microseconds ago; the webview's script has not run,
    // so the message posted before this point was dropped by VS Code.
    await webviewReady();

    const empty = harness.lastPosted<{ reason: string }>('empty');
    expect(empty?.reason).toBe('no-project');
  });

  it('re-renders the current state on a later handshake', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });
    await managerFor(context).show();
    await webviewReady();
    const before = harness.posted('update').length;

    // VS Code discards a hidden panel's context and the webview reloads.
    await webviewReady();

    expect(harness.posted('update').length).toBeGreaterThan(before);
  });
});

describe('restoring after a window reload', () => {
  it('claims the panel VS Code hands back and renders into it', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
    });
    PreviewPanelManager.registerSerializer(
      context as unknown as Parameters<
        typeof PreviewPanelManager.registerSerializer
      >[0]
    );
    const serializer = harness.serializers.get('bladePreview');
    expect(serializer).toBeDefined();

    // VS Code re-creates the panel itself after a reload; without a serializer
    // it is an inert tab, which is what dropping `retainContextWhenHidden`
    // would otherwise have cost.
    const restored = window.createWebviewPanel(
      'bladePreview',
      'Blade Preview',
      2,
      {}
    );
    await serializer!.deserializeWebviewPanel(restored, undefined);
    await webviewReady();

    expect(restored.webview.html).toContain('preview-frame');
    expect(harness.lastPosted<{ html: string }>('update')?.html).toContain(
      'Alpha'
    );
  });
});

describe('the component-file state', () => {
  it('names the component the way the compiler does', async () => {
    fixture = createFixture({
      'index.blade': '<MyWidget/>',
      'my_widget.blade': '<div>widget</div>',
      'samples/a.json': '{}',
    });
    harness.workspaceFolders = [
      { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
    ];
    harness.open(fixture.path('my_widget.blade'), '<div>widget</div>');

    await managerFor(context).show();
    await webviewReady();

    const empty = harness.lastPosted<{
      reason: string;
      componentName?: string;
    }>('empty');
    expect(empty?.reason).toBe('component-file');
    // The old preview split on `-` alone and left the tail as written, so this
    // said `My_widget` while every build said `MyWidget`.
    expect(empty?.componentName).toBe('MyWidget');
  });

  it('writes a sample for the component the host is tracking', async () => {
    fixture = createFixture({
      'index.blade': '<MyWidget label="x"/>',
      'my_widget.blade': '@props(label, size = 3)\n<div>${label}</div>',
    });
    harness.workspaceFolders = [
      { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
    ];
    harness.open(
      fixture.path('my_widget.blade'),
      '@props(label, size = 3)\n<div>${label}</div>'
    );

    await managerFor(context).show();
    await webviewReady();
    // The message carries no name at all; the host uses the file it tracks.
    harness.panel.webview.send({ type: 'createSample' });
    await flush();

    const written = readFileSync(
      fixture.path('samples', 'mywidget-sample.json'),
      'utf-8'
    );
    expect(JSON.parse(written)).toEqual({ label: '<label>', size: 3 });
    expect(harness.info[0]).toContain('mywidget-sample.json');
  });
});

describe('sample selection', () => {
  it('renders the selected sample', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
      'samples/b.json': '{"title":"Beta"}',
    });

    await managerFor(context).show();
    await webviewReady();
    harness.panel.webview.send({ type: 'selectSample', file: 'b' });
    await flush();

    const update = harness.lastPosted<{ html: string }>('update');
    expect(update?.html).toContain('Beta');
  });

  it('offers samples by name and remembers the choice', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
      'samples/b.json': '{"title":"Beta"}',
    });

    await managerFor(context).show();
    await webviewReady();
    harness.panel.webview.send({ type: 'selectSample', file: 'b' });
    await flush();

    expect(harness.lastPosted<{ files: string[] }>('samples')?.files).toEqual([
      'a',
      'b',
    ]);
    expect([...context.workspaceState.store.values()]).toContain('b');
  });

  it('ignores a sample name that is not one of the project’s', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
    });

    await managerFor(context).show();
    await webviewReady();
    const before = harness.panel.webview.posted.length;

    for (const file of [
      '../../../../.ssh/config',
      '/etc/passwd',
      '..\\..\\secrets',
      'not-a-sample',
    ]) {
      harness.panel.webview.send({ type: 'selectSample', file });
    }
    await flush();

    expect(harness.panel.webview.posted.length).toBe(before);
    expect([...context.workspaceState.store.values()]).not.toContain(
      '../../../../.ssh/config'
    );
  });

  it('ignores a poisoned name restored from a previous session', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
    });
    // A value a webview could have put there in an earlier session.
    await context.workspaceState.update(
      [...context.workspaceState.store.keys()][0] ??
        'blade.preview.sample.unknown',
      '../../../../.ssh/config'
    );

    await managerFor(context).show();
    await webviewReady();

    const update = harness.lastPosted<{ html: string }>('update');
    expect(update?.html).toContain('Alpha');
  });
});

describe('rendering', () => {
  it('sends the markup inside a sandboxed document, not as page markup', async () => {
    openFixture({
      'index.blade': '<div>${title}</div>',
      'samples/a.json': '{"title":"Alpha"}',
    });

    await managerFor(context).show();
    await webviewReady();

    const update = harness.lastPosted<{ document: string; html: string }>(
      'update'
    );
    expect(update?.html).toContain('Alpha');
    expect(update?.document).toContain("script-src 'none'");
    expect(update?.document).toContain('<base href=');
    // The page the panel loads never interpolates rendered markup into itself.
    expect(harness.panel.webview.html).not.toContain('Alpha');
    expect(harness.panel.webview.html).toContain('sandbox=""');
  });

  it('reports a template error and keeps the panel usable', async () => {
    openFixture({
      'index.blade': '<Missing/>',
      'samples/a.json': '{}',
    });

    await managerFor(context).show();
    await webviewReady();

    const error = harness.lastPosted<{ message: string }>('error');
    expect(error?.message).toContain('Missing');
  });

  it('shows the no-samples state for a project with no sample data', async () => {
    openFixture({ 'index.blade': ENTRY });

    await managerFor(context).show();
    await webviewReady();

    expect(harness.lastPosted<{ reason: string }>('empty')?.reason).toBe(
      'no-samples'
    );
  });

  it('reports an unreadable sample rather than dropping it in silence', async () => {
    openFixture({
      'index.blade': ENTRY,
      'samples/a.json': '{"title":"Alpha"}',
      'samples/broken.json': '{ "title": ,}',
    });

    await managerFor(context).show();
    await webviewReady();

    const update = harness.lastPosted<{ notices: string[] }>('update');
    expect(update?.notices.some(notice => notice.includes('broken'))).toBe(
      true
    );
  });
});

describe('the webview page', () => {
  it('carries a fresh cryptographic nonce and a complete policy', async () => {
    openFixture({ 'index.blade': ENTRY, 'samples/a.json': '{"title":"A"}' });
    await managerFor(context).show();

    const html = harness.panel.webview.html;
    const nonce = /nonce-([^']+)'/.exec(html)?.[1];
    expect(nonce).toBeDefined();
    expect(Buffer.from(nonce!, 'base64').byteLength).toBeGreaterThanOrEqual(16);
    expect(html).toContain('base-uri ');
    expect(html).toContain("form-action 'none'");
    expect(html).toContain('img-src');
  });
});

describe('type shape', () => {
  it('the context double is the shape the panel needs', () => {
    const shape: ExtensionContextLike = createContext();
    expect(shape.subscriptions).toEqual([]);
  });
});
