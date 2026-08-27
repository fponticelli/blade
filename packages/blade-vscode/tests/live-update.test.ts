/**
 * What happens between keystrokes.
 *
 * Before: a 300 ms timer fired `refresh()`, which re-read and re-compiled every
 * component in the project synchronously; the sample watcher was wired straight
 * to `refresh()` rather than to the debouncer; and every `show()` added another
 * copy of both, so one saved sample produced one full re-compile per press of
 * the keybinding.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import { PreviewPanelManager } from '../src/preview/panel.js';
import { createContext } from './support/context.js';
import type { FakeExtensionContext } from './support/context.js';
import { harness, Uri } from './support/vscode.js';
import type { FakeTextDocument } from './support/vscode.js';
import { createFixture } from './support/fixture.js';
import type { Fixture } from './support/fixture.js';

let fixture: Fixture;
let context: FakeExtensionContext;
let entry: FakeTextDocument;

const ENTRY = '<h1>${title}</h1>';

function managerFor(): PreviewPanelManager {
  return PreviewPanelManager.getInstance(
    context as unknown as Parameters<typeof PreviewPanelManager.getInstance>[0]
  );
}

/** Longer than the panel's debounce window. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 450));
}

async function ready(): Promise<void> {
  harness.panel.webview.send({ type: 'ready' });
  await new Promise(resolve => setTimeout(resolve, 20));
}

beforeEach(async () => {
  harness.reset();
  context = createContext();
  fixture = createFixture({
    'index.blade': ENTRY,
    'card.blade': '@props(title)\n<div>${title}</div>',
    'samples/a.json': '{"title":"Alpha"}',
  });
  harness.workspaceFolders = [
    { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
  ];
  entry = harness.open(fixture.path('index.blade'), ENTRY);
  await managerFor().show();
  await ready();
});

afterEach(() => {
  PreviewPanelManager.disposeInstance();
  fixture.dispose();
});

describe('live update', () => {
  it('renders the unsaved buffer, not the file on disk', async () => {
    harness.edit(entry, '<h2>${title} edited</h2>');
    await settle();

    const update = harness.lastPosted<{ html: string }>('update');
    expect(update?.html).toContain('<h2>');
    expect(update?.html).toContain('Alpha edited');
  });

  it('coalesces a burst of keystrokes into one render', async () => {
    const before = harness.posted('update').length;

    for (let i = 0; i < 10; i++) harness.edit(entry, `<p>${i}</p>`);
    await settle();

    expect(harness.posted('update').length).toBe(before + 1);
  });

  it('routes watcher events through the same debouncer', async () => {
    // Five presses of the keybinding used to leave five listener sets behind,
    // and `onDidChange` was not debounced at all - so one saved sample produced
    // five simultaneous full re-compiles.
    for (let i = 0; i < 5; i++) await managerFor().show();
    const before = harness.posted('update').length;

    writeFileSync(
      fixture.path('samples', 'a.json'),
      '{"title":"Changed"}',
      'utf-8'
    );
    for (const watcher of harness.liveWatchers) {
      watcher.fireChange(fixture.path('samples', 'a.json'));
    }
    await settle();

    const updates = harness.posted<{ html: string }>('update');
    expect(updates.length).toBe(before + 1);
    expect(updates[updates.length - 1]?.html).toContain('Changed');
  });

  it('picks up a component edited in another tab, unsaved', async () => {
    harness.open(
      fixture.path('card.blade'),
      '@props(title)\n<section>${title}</section>'
    );
    harness.activate(entry);
    harness.edit(entry, '<Card title="X"/>');
    await settle();

    const update = harness.lastPosted<{ html: string }>('update');
    expect(update?.html).toContain('<section>');
  });

  it('follows the active editor to another project', async () => {
    const other = createFixture({
      'index.blade': '<p>${name}</p>',
      'samples/only.json': '{"name":"Other"}',
    });
    harness.workspaceFolders.push({
      uri: Uri.file(other.root),
      name: 'other',
      index: 1,
    });
    try {
      const document = harness.open(
        other.path('index.blade'),
        '<p>${name}</p>'
      );
      harness.activate(document);
      await settle();

      expect(harness.lastPosted<{ html: string }>('update')?.html).toContain(
        'Other'
      );
      // The watchers moved with it rather than accumulating.
      for (const watcher of harness.liveWatchers) {
        const pattern = watcher.pattern;
        if (typeof pattern === 'string') continue;
        expect(pattern.base).toBe(other.root);
      }
    } finally {
      other.dispose();
    }
  });

  it('keeps the preview when the user switches to a non-Blade file', async () => {
    const before = harness.lastPosted<{ html: string }>('update')?.html;

    const notes = harness.open(fixture.path('notes.txt'), 'hi', 'plaintext');
    harness.activate(notes);
    await settle();

    expect(harness.lastPosted<{ html: string }>('update')?.html).toBe(before);
    expect(harness.posted('empty')).toEqual([]);
  });
});
