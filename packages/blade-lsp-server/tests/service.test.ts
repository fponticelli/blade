/**
 * The language service: everything the server does, minus the protocol.
 *
 * These are the behaviours that were unreachable while all of this lived in a
 * module that opened a connection on stdio at import time.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { BladeLanguageService } from '../src/service.js';
import { createMemoryFileSystem } from '@bladets/template/node';
import type { FileSystem } from '@bladets/template/node';
import type { LanguageServiceHost } from '../src/service.js';
import { createInitializeResult } from '../src/protocol.js';
import { DEFAULT_LSP_CONFIG } from '../src/types.js';
import type { LspConfig } from '../src/types.js';
import type { LspDiagnostic } from '../src/providers/diagnostic.js';
import type { InitializeParams } from 'vscode-languageserver';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixtures = PROJECT_FIXTURES_ROOT;

interface Harness {
  readonly service: BladeLanguageService;
  readonly published: Map<string, LspDiagnostic[]>;
  readonly publishes: string[];
  readonly errors: string[];
}

const created: BladeLanguageService[] = [];

/**
 * A service with a host that records what it publishes.
 *
 * `realFs` is opt-in: the tests that do not read a fixture run against an empty
 * in-memory filesystem, so nothing they assert depends on the machine.
 */
function harness(
  config: Partial<LspConfig> = {},
  realFs = false,
  io?: FileSystem
): Harness {
  const published = new Map<string, LspDiagnostic[]>();
  const publishes: string[] = [];
  const errors: string[] = [];

  const host: LanguageServiceHost = {
    publishDiagnostics: (uri, diagnostics) => {
      published.set(uri, diagnostics);
      publishes.push(uri);
    },
    sink: { error: message => errors.push(message), log: () => {} },
    io: io ?? (realFs ? undefined : createMemoryFileSystem({}, '/nowhere')),
  };

  const service = new BladeLanguageService(host, {
    ...DEFAULT_LSP_CONFIG,
    ...config,
    performance: {
      ...DEFAULT_LSP_CONFIG.performance,
      debounceMs: 0,
      ...config.performance,
    },
  });
  created.push(service);

  return { service, published, publishes, errors };
}

/** URI of a file inside a fixture project. */
function fixtureUri(project: string, file: string): string {
  return pathToFileURL(resolve(fixtures, project, file)).href;
}

afterEach(() => {
  while (created.length > 0) created.pop()?.dispose();
  vi.useRealTimers();
});

describe('diagnostics are published from the parse', () => {
  it('publishes the errors of the last edit without another keystroke', async () => {
    vi.useFakeTimers();
    const { service, published } = harness({
      performance: { ...DEFAULT_LSP_CONFIG.performance, debounceMs: 200 },
    });

    service.openDocument('file:///a.blade', '<div>ok</div>', 1);
    await vi.runAllTimersAsync();
    expect(published.get('file:///a.blade')).toEqual([]);

    // Type something broken and stop typing.
    service.changeDocument('file:///a.blade', '@if(', 2);
    await vi.runAllTimersAsync();

    const diagnostics = published.get('file:///a.blade') ?? [];
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe(1);
  });

  it('never publishes a previous version of the text', async () => {
    vi.useFakeTimers();
    const { service, published } = harness({
      performance: { ...DEFAULT_LSP_CONFIG.performance, debounceMs: 200 },
    });

    service.openDocument('file:///a.blade', '@if(', 1);
    await vi.runAllTimersAsync();
    expect((published.get('file:///a.blade') ?? []).length).toBeGreaterThan(0);

    service.changeDocument('file:///a.blade', '<div>fixed</div>', 2);
    await vi.runAllTimersAsync();
    expect(published.get('file:///a.blade')).toEqual([]);
  });

  it('uses one error range, not the eleven-character one the server invented', async () => {
    const { service, published } = harness();
    service.openDocument('file:///a.blade', '<div>${user.}</div>', 1);
    await service.validate('file:///a.blade');

    const diagnostic = (published.get('file:///a.blade') ?? [])[0];
    expect(diagnostic).toBeDefined();
    const width =
      diagnostic!.range.end.character - diagnostic!.range.start.character;
    expect(width).toBeLessThanOrEqual(10);
    expect(diagnostic!.code).toBe('PARSE_ERROR');
  });

  it('clears diagnostics when a document closes', async () => {
    const { service, published } = harness();
    service.openDocument('file:///a.blade', '@if(', 1);
    await service.validate('file:///a.blade');
    expect((published.get('file:///a.blade') ?? []).length).toBeGreaterThan(0);

    service.closeDocument('file:///a.blade');
    expect(published.get('file:///a.blade')).toEqual([]);
  });
});

describe('project root', () => {
  it('finds the project from a component in a subdirectory', async () => {
    const { service } = harness({}, true);
    const uri = fixtureUri('nested', 'components/form/input.blade');
    service.openDocument(uri, '<div>x</div>', 1);

    expect(await service.projectRootFor(uri)).toBe(resolve(fixtures, 'nested'));

    const context = await service.projectContextFor(uri);
    expect(context).not.toBeNull();
    expect(context!.components.size).toBeGreaterThan(0);
  });

  it('gives a component file the same schema the entry file gets', async () => {
    const { service } = harness({}, true);
    const entry = fixtureUri('with-props', 'index.blade');
    const component = fixtureUri('with-props', 'button.blade');
    service.openDocument(entry, '<div>x</div>', 1);
    service.openDocument(component, '<div>x</div>', 1);

    expect(await service.projectRootFor(component)).toBe(
      await service.projectRootFor(entry)
    );
  });

  it('returns null outside any project', async () => {
    const { service } = harness({}, true);
    const uri = fixtureUri('no-entry', 'component.blade');
    expect(await service.projectRootFor(uri)).toBeNull();
    expect(await service.projectContextFor(uri)).toBeNull();
  });

  it('does not walk above the workspace folder', async () => {
    const { service } = harness({}, true);
    service.setWorkspaceFolders([resolve(fixtures, 'nested/components')]);
    const uri = fixtureUri('nested', 'components/form/input.blade');
    expect(await service.projectRootFor(uri)).toBeNull();
  });
});

describe('caching', () => {
  it('loads a project context once for many requests', async () => {
    const { service } = harness({}, true);
    const uri = fixtureUri('with-schema', 'index.blade');
    service.openDocument(uri, '@props(user)\n<div>${user.}</div>', 1);

    const first = await service.projectContextFor(uri);
    const second = await service.projectContextFor(uri);
    expect(first).toBe(second);
  });

  it('remembers that a directory is not a project', async () => {
    // The miss used to be discarded, so the full recursive walk re-ran on
    // every keystroke in any file outside a project.
    const { service } = harness({}, true);
    const uri = fixtureUri('no-entry', 'component.blade');
    const first = service.projectRootFor(uri);
    const second = service.projectRootFor(uri);
    expect(first).toBe(second);
    expect(await first).toBeNull();
  });

  it('reloads a project after one of its files changes', async () => {
    const { service } = harness({}, true);
    const uri = fixtureUri('with-schema', 'index.blade');
    service.openDocument(uri, '<div>x</div>', 1);

    const before = await service.projectContextFor(uri);
    service.invalidatePath(resolve(fixtures, 'with-schema', 'schema.json'));
    const after = await service.projectContextFor(uri);

    expect(after).not.toBe(before);
    expect(after?.schema).not.toBeNull();
  });

  it('leaves other projects alone when one changes', async () => {
    const { service } = harness({}, true);
    const schemaUri = fixtureUri('with-schema', 'index.blade');
    const simpleUri = fixtureUri('simple', 'index.blade');
    service.openDocument(schemaUri, '<div>x</div>', 1);
    service.openDocument(simpleUri, '<div>x</div>', 1);

    const simpleBefore = await service.projectContextFor(simpleUri);
    await service.projectContextFor(schemaUri);
    service.invalidatePath(resolve(fixtures, 'with-schema', 'schema.json'));

    expect(await service.projectContextFor(simpleUri)).toBe(simpleBefore);
  });
});

describe('robustness', () => {
  it('answers every request for an unknown document', async () => {
    const { service } = harness();
    const at = { line: 0, character: 0 };
    expect(await service.complete('file:///missing.blade', at)).toEqual([]);
    expect(await service.hover('file:///missing.blade', at)).toBeNull();
    expect(await service.definition('file:///missing.blade', at)).toBeNull();
    expect(await service.references('file:///missing.blade', at)).toEqual([]);
    expect(await service.validate('file:///missing.blade')).toEqual([]);
  });

  it('does not throw on a URI that is not a file', async () => {
    // `fileURLToPath` throws synchronously for these, inside a handler whose
    // promise nothing awaits - which on Node >= 15 ends the process.
    const { service, errors } = harness();
    service.openDocument('untitled:Untitled-1', '<div>$a</div>', 1);

    expect(await service.projectRootFor('untitled:Untitled-1')).toBeNull();
    expect(
      await service.complete('untitled:Untitled-1', { line: 0, character: 7 })
    ).not.toEqual([]);
    await service.validate('untitled:Untitled-1');
    expect(errors).toEqual([]);
  });
});

describe('capability contract', () => {
  const params = {
    processId: null,
    rootUri: null,
    capabilities: {},
    workspaceFolders: null,
  } as unknown as InitializeParams;

  /**
   * One probe per advertised capability. A capability with no probe fails the
   * test, which is what makes shipping an advertised-but-unhandled feature
   * impossible.
   */
  const probes: Record<
    string,
    (service: BladeLanguageService, uri: string) => Promise<boolean>
  > = {
    textDocumentSync: async () => true,
    completionProvider: async (service, uri) =>
      (await service.complete(uri, { line: 3, character: 12 })).length > 0,
    hoverProvider: async (service, uri) =>
      (await service.hover(uri, { line: 3, character: 12 })) !== null,
    definitionProvider: async (service, uri) =>
      (await service.definition(uri, { line: 3, character: 12 })) !== null,
    referencesProvider: async (service, uri) =>
      (await service.references(uri, { line: 3, character: 12 })).length > 0,
  };

  const SOURCE = [
    '@props(title)',
    '<template:Card subtitle="d">',
    '  <p>$subtitle</p>',
    '</template:Card>',
    '<Card />',
    '<h1>$title</h1>',
  ].join('\n');

  it('has a handler for every capability it advertises', async () => {
    const { service } = harness();
    const uri = 'file:///contract.blade';
    service.openDocument(uri, SOURCE, 1);

    const capabilities = createInitializeResult(params).capabilities;
    const declared = Object.keys(capabilities);
    expect(declared.length).toBeGreaterThan(0);

    for (const capability of declared) {
      const probe = probes[capability];
      expect(
        probe,
        `no probe for advertised capability ${capability}`
      ).toBeDefined();
      expect(
        await probe!(service, uri),
        `${capability} is advertised but answered nothing`
      ).toBe(true);
    }
  });

  it('does not trigger completion on a space', () => {
    const triggers =
      createInitializeResult(params).capabilities.completionProvider
        ?.triggerCharacters ?? [];
    expect(triggers).not.toContain(' ');
    expect(triggers).toContain('$');
  });

  it('asks for incremental synchronisation', () => {
    expect(createInitializeResult(params).capabilities.textDocumentSync).toBe(
      2
    );
  });
});

describe('go to definition and references', () => {
  const SOURCE = [
    '@props(items)',
    '@for(item of items) {',
    '  <li>$item</li>',
    '  <li>${item}</li>',
    '}',
  ].join('\n');

  it('jumps from a variable use to its declaration', async () => {
    const { service } = harness();
    service.openDocument('file:///d.blade', SOURCE, 1);

    // `$item` on line 2 (zero-based).
    const location = await service.definition('file:///d.blade', {
      line: 2,
      character: 9,
    });
    expect(location).not.toBeNull();
    expect(location!.range.start.line).toBe(1);
  });

  it('finds every reference to a variable, sigil or not', async () => {
    const { service } = harness();
    service.openDocument('file:///d.blade', SOURCE, 1);

    const references = await service.references('file:///d.blade', {
      line: 2,
      character: 9,
    });
    // The old regular expression was built as `\$$item\b` and matched nothing.
    expect(references.length).toBeGreaterThanOrEqual(2);
    expect(references.map(r => r.range.start.line).sort()).toEqual([1, 2, 3]);
  });

  it('finds a component definition in the same document', async () => {
    const { service } = harness();
    service.openDocument(
      'file:///c.blade',
      '<template:Card>\n<div>x</div>\n</template:Card>\n<Card />\n',
      1
    );

    const location = await service.definition('file:///c.blade', {
      line: 3,
      character: 2,
    });
    expect(location?.range.start.line).toBe(0);
  });

  it('finds a component definition in another file of the project', async () => {
    const { service } = harness({}, true);
    const uri = fixtureUri('simple', 'index.blade');
    service.openDocument(uri, '<Button />\n', 1);

    const location = await service.definition(uri, {
      line: 0,
      character: 3,
    });
    expect(location?.uri).toContain('button.blade');
  });
});

describe('settings', () => {
  it('offers plain directives when snippets are off', async () => {
    const { service } = harness({
      completion: { ...DEFAULT_LSP_CONFIG.completion, snippets: false },
    });
    service.openDocument('file:///s.blade', '<div>\n@\n</div>', 1);

    const items = await service.complete('file:///s.blade', {
      line: 1,
      character: 1,
    });
    const forItem = items.find(item => item.label === 'for');
    expect(forItem?.insertText).toBe('for');
    expect(forItem?.insertTextFormat).toBe(1);
  });

  it('publishes nothing when diagnostics are disabled', async () => {
    const { service, published } = harness({
      diagnostics: { ...DEFAULT_LSP_CONFIG.diagnostics, enabled: false },
    });
    service.openDocument('file:///s.blade', '@if(', 1);
    await service.validate('file:///s.blade');
    expect(published.get('file:///s.blade')).toEqual([]);
  });
});

describe('sample diagnostics', () => {
  it('reports a sample that contradicts the schema, at the offending value', async () => {
    const { service, published } = harness({}, true);
    const uri = fixtureUri('with-strict-schema', 'index.blade');
    service.openDocument(uri, '@props(order, customer)\n<div>x</div>', 1);
    await service.validate(uri);

    const brokenUri = fixtureUri('with-strict-schema', 'samples/broken.json');
    const diagnostics = published.get(brokenUri) ?? [];
    expect(diagnostics.length).toBe(4);

    const quantity = diagnostics.find(d =>
      d.message.startsWith('order.quantity')
    );
    expect(quantity).toBeDefined();
    // Not line 0: every sample diagnostic used to land on the first character.
    expect(quantity!.range.start.line).toBe(3);
    expect(quantity!.range.start.character).toBeGreaterThan(0);
  });

  it('publishes an empty list for a sample that is clean', async () => {
    const { service, published } = harness({}, true);
    const uri = fixtureUri('with-strict-schema', 'index.blade');
    service.openDocument(uri, '@props(order, customer)\n<div>x</div>', 1);
    await service.validate(uri);

    const validUri = fixtureUri('with-strict-schema', 'samples/valid.json');
    expect(published.get(validUri)).toBeUndefined();
  });
});

describe('settings that name a file', () => {
  const PROJECT = {
    '/proj/index.blade': '<div>x</div>',
    '/proj/custom-schema.json': JSON.stringify({
      type: 'object',
      properties: { ticket: { type: 'string', description: 'Ticket id' } },
    }),
    '/proj/helpers.json': JSON.stringify([
      {
        name: 'legacyThing',
        signature: 'legacyThing(): string',
        deprecated: true,
        deprecatedMessage: 'Use formatNumber instead.',
      },
    ]),
  };

  function projectHarness(completion: Partial<LspConfig['completion']>) {
    return harness(
      {
        completion: { ...DEFAULT_LSP_CONFIG.completion, ...completion },
      },
      false,
      createMemoryFileSystem(PROJECT, '/proj')
    );
  }

  it('completes from the schema named by dataSchemaPath', async () => {
    // The setting was contributed by the manifest, read into configuration and
    // never read from disk by anything.
    const { service } = projectHarness({
      dataSchemaPath: 'custom-schema.json',
    });
    const uri = 'file:///proj/index.blade';
    service.openDocument(uri, '<div>${}</div>', 1);

    const items = await service.complete(uri, { line: 0, character: 7 });
    expect(items.map(item => item.label)).toContain('ticket');
  });

  it('reports a dataSchemaPath that cannot be read', async () => {
    const { service } = projectHarness({ dataSchemaPath: 'absent.json' });
    const uri = 'file:///proj/index.blade';
    service.openDocument(uri, '<div>x</div>', 1);

    const context = await service.projectContextFor(uri);
    expect(context?.schema).toBeNull();
    expect(context?.diagnostics.map(d => d.code)).toEqual(['INVALID_SCHEMA']);
  });

  it('completes and deprecates from helpersDefinitionPath', async () => {
    const { service, published } = projectHarness({
      helpersDefinitionPath: 'helpers.json',
    });
    const uri = 'file:///proj/index.blade';
    service.openDocument(uri, '<div>${legacyThing()}</div>', 1);

    const items = await service.complete(uri, { line: 0, character: 7 });
    const item = items.find(entry => entry.label === 'legacyThing');
    expect(item).toBeDefined();
    expect(item!.deprecated).toBe(true);

    await service.validate(uri);
    const codes = (published.get(uri) ?? []).map(d => d.code);
    expect(codes).toContain('DEPRECATED_HELPER');
  });

  it('drops cached contexts when the schema setting changes', async () => {
    const { service } = projectHarness({});
    const uri = 'file:///proj/index.blade';
    service.openDocument(uri, '<div>x</div>', 1);

    const before = await service.projectContextFor(uri);
    expect(before?.schema).toBeNull();

    service.updateConfig({
      ...service.getConfig(),
      completion: {
        ...service.getConfig().completion,
        dataSchemaPath: 'custom-schema.json',
      },
    });

    const after = await service.projectContextFor(uri);
    expect(after).not.toBe(before);
    expect(after?.schema).not.toBeNull();
  });
});
