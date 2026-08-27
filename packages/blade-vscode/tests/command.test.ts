/**
 * The command that opens the preview.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerPreviewCommand } from '../src/commands/preview.js';
import { PreviewPanelManager } from '../src/preview/panel.js';
import { createContext } from './support/context.js';
import { harness, Uri } from './support/vscode.js';
import { createFixture } from './support/fixture.js';
import type { Fixture } from './support/fixture.js';

let fixture: Fixture | null = null;

beforeEach(() => {
  harness.reset();
});

afterEach(() => {
  PreviewPanelManager.disposeInstance();
  fixture?.dispose();
  fixture = null;
});

describe('registerPreviewCommand', () => {
  it('registers blade.openPreview and disposes it', () => {
    const context = createContext();
    const disposable = registerPreviewCommand(
      context as unknown as Parameters<typeof registerPreviewCommand>[0]
    );

    expect(harness.commands.has('blade.openPreview')).toBe(true);
    disposable.dispose();
    expect(harness.commands.has('blade.openPreview')).toBe(false);
  });

  it('opens the panel when invoked', async () => {
    fixture = createFixture({
      'index.blade': '<p>${title}</p>',
      'samples/a.json': '{"title":"Alpha"}',
    });
    harness.workspaceFolders = [
      { uri: Uri.file(fixture.root), name: 'fixture', index: 0 },
    ];
    harness.open(fixture.path('index.blade'), '<p>${title}</p>');

    const context = createContext();
    registerPreviewCommand(
      context as unknown as Parameters<typeof registerPreviewCommand>[0]
    );
    harness.commands.get('blade.openPreview')?.();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(harness.panels).toHaveLength(1);
  });
});
