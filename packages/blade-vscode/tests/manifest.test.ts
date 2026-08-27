/**
 * The settings the manifest advertises, against the settings that exist.
 *
 * A settings UI that offers a switch wired to nothing is a broken product: it
 * generates bug reports against behaviour that was never implemented. This
 * suite is the check that the two lists are the same list, run against the
 * language server's own configuration reader.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DEFAULT_LSP_CONFIG, readConfig } from '@bladets/lsp-server';

interface ConfigurationProperty {
  type: string;
  default: unknown;
  description: string;
  enum?: string[];
}

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
) as {
  contributes: {
    configuration: { properties: Record<string, ConfigurationProperty> };
    commands: { command: string }[];
    keybindings: { command: string }[];
    menus: Record<string, { command: string }[]>;
  };
};

const properties = manifest.contributes.configuration.properties;

/** Every leaf of an LspConfig, as a dotted `blade.` setting id. */
function settingIds(config: unknown, prefix: string): string[] {
  if (config === null || typeof config !== 'object') return [prefix];
  return Object.entries(config as Record<string, unknown>).flatMap(
    ([key, value]) => settingIds(value, `${prefix}.${key}`)
  );
}

/** The manifest's defaults, shaped as a `blade` configuration section. */
function manifestDefaults(): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [id, property] of Object.entries(properties)) {
    const segments = id.split('.').slice(1); // drop the `blade.` prefix
    let cursor = root;
    for (const segment of segments.slice(0, -1)) {
      cursor[segment] ??= {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1] as string] = property.default;
  }
  return root;
}

describe('contributed settings', () => {
  it('contributes every setting the language server reads', () => {
    // `blade.trace.server` sits outside `lsp`, so it is spelled out here.
    const expected = new Set([
      ...settingIds(DEFAULT_LSP_CONFIG.diagnostics, 'blade.lsp.diagnostics'),
      ...settingIds(DEFAULT_LSP_CONFIG.completion, 'blade.lsp.completion'),
      ...settingIds(DEFAULT_LSP_CONFIG.performance, 'blade.lsp.performance'),
      'blade.trace.server',
      // Optional paths have no default and so no key in DEFAULT_LSP_CONFIG.
      'blade.lsp.completion.dataSchemaPath',
      'blade.lsp.completion.helpersDefinitionPath',
    ]);

    // `potentiallyUndefined` was read by the server and contributed by nobody,
    // so it could never be set; `performance.maxFileSize` and
    // `performance.debounceMs` were the same.
    expect([...expected].sort()).toEqual(Object.keys(properties).sort());
  });

  it('reads back as exactly the server defaults', () => {
    // Every contributed default must be the value the server would have used
    // anyway; a manifest default that disagrees silently changes behaviour for
    // every user who never opened the settings UI.
    const read = readConfig(manifestDefaults());

    expect(read.diagnostics).toEqual(DEFAULT_LSP_CONFIG.diagnostics);
    expect(read.performance).toEqual(DEFAULT_LSP_CONFIG.performance);
    expect(read.trace).toEqual(DEFAULT_LSP_CONFIG.trace);
    expect(read.completion.snippets).toBe(
      DEFAULT_LSP_CONFIG.completion.snippets
    );
    // The two path settings default to '', which the reader treats as unset.
    expect(read.completion.dataSchemaPath).toBeUndefined();
    expect(read.completion.helpersDefinitionPath).toBeUndefined();
  });

  it('offers every severity setting the same vocabulary the server accepts', () => {
    for (const [id, property] of Object.entries(properties)) {
      if (!id.startsWith('blade.lsp.diagnostics.')) continue;
      if (property.type !== 'string') continue;
      expect(property.enum, id).toBeDefined();
      // `off` must always be offered: a rule with no way to turn it off is a
      // rule users disable by uninstalling the extension.
      expect(property.enum, id).toContain('off');
    }
  });

  it('describes every setting it contributes', () => {
    for (const [id, property] of Object.entries(properties)) {
      expect(property.description, id).toBeTruthy();
      expect(property.default, id).toBeDefined();
    }
  });
});

describe('contributed commands', () => {
  it('binds every keybinding and menu entry to a command it declares', () => {
    const declared = new Set(
      manifest.contributes.commands.map(command => command.command)
    );
    const referenced = [
      ...manifest.contributes.keybindings.map(binding => binding.command),
      ...Object.values(manifest.contributes.menus)
        .flat()
        .map(item => item.command),
    ];

    for (const command of referenced) {
      expect(declared, command).toContain(command);
    }
  });
});
