/**
 * The protocol surface: what the server advertises, and how it reads settings.
 *
 * Separate from `server.ts` because importing that module opens a JSON-RPC
 * connection on stdio, which is why none of this could ever be tested. The
 * declared capabilities in particular need a test: `definitionProvider` and
 * `referencesProvider` were advertised for two releases while both handlers
 * returned `null`, and an advertised capability answered with `null` is worse
 * than an undeclared one - the client stops falling back to its own
 * word-based behaviour and reports "no definition found" instead.
 */

import type { InitializeParams, InitializeResult } from 'vscode-languageserver';
import { TextDocumentSyncKind } from 'vscode-languageserver';

import type { LspConfig, TraceLevel, DiagnosticSeverity } from './types.js';
import { DEFAULT_LSP_CONFIG } from './types.js';

/** What the client can do that changes how the server registers itself. */
export interface ClientCapabilityFlags {
  readonly configuration: boolean;
  readonly workspaceFolders: boolean;
  readonly fileWatching: boolean;
}

export function clientCapabilityFlags(
  params: InitializeParams
): ClientCapabilityFlags {
  const workspace = params.capabilities.workspace;
  return {
    configuration: !!workspace?.configuration,
    workspaceFolders: !!workspace?.workspaceFolders,
    fileWatching: !!workspace?.didChangeWatchedFiles?.dynamicRegistration,
  };
}

/**
 * The capabilities this server advertises.
 *
 * Every entry must have a handler that answers for a well-formed document; the
 * contract test in `tests/lsp/service.test.ts` enumerates this object and
 * fails if one does not.
 */
export function createInitializeResult(
  params: InitializeParams
): InitializeResult {
  const result: InitializeResult = {
    capabilities: {
      // Incremental: full sync ships the entire document over IPC on every
      // keystroke - 100 KB per character for a 100 KB template, where the
      // delta is tens of bytes.
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        // No space. Completion triggered on every space typed in prose, always
        // resolved to plain text, and always returned an empty list.
        triggerCharacters: ['$', '{', '.', '@', '<'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      // Push-based diagnostics, published from the debounced parse.
    },
  };

  if (clientCapabilityFlags(params).workspaceFolders) {
    result.capabilities.workspace = {
      workspaceFolders: { supported: true },
    };
  }

  return result;
}

/**
 * Settings, as the manifest contributes them, with every default applied.
 *
 * @param raw - The `blade` configuration section
 */
export function readConfig(raw: unknown): LspConfig {
  const blade = (raw ?? {}) as {
    lsp?: {
      diagnostics?: Record<string, unknown>;
      completion?: Record<string, unknown>;
      performance?: Record<string, unknown>;
    };
    trace?: { server?: string };
  };
  const lsp = blade.lsp ?? {};
  const diagnostics = lsp.diagnostics ?? {};
  const completion = lsp.completion ?? {};
  const performance = lsp.performance ?? {};

  return {
    diagnostics: {
      enabled: asBoolean(diagnostics.enabled, true),
      unusedVariables: asSeverity(diagnostics.unusedVariables, 'warning'),
      deprecatedHelpers: asSeverity(diagnostics.deprecatedHelpers, 'warning'),
      potentiallyUndefined: asSeverity(
        diagnostics.potentiallyUndefined,
        'hint'
      ),
      deepNesting: asSeverity(diagnostics.deepNesting, 'warning'),
      deepNestingThreshold: asNumber(diagnostics.deepNestingThreshold, 4),
    },
    completion: {
      dataSchemaPath: asPath(completion.dataSchemaPath),
      helpersDefinitionPath: asPath(completion.helpersDefinitionPath),
      snippets: asBoolean(completion.snippets, true),
    },
    performance: {
      debounceMs: asNumber(
        performance.debounceMs,
        DEFAULT_LSP_CONFIG.performance.debounceMs
      ),
      maxFileSize: asNumber(
        performance.maxFileSize,
        DEFAULT_LSP_CONFIG.performance.maxFileSize
      ),
    },
    trace: asTrace(blade.trace?.server),
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asSeverity(
  value: unknown,
  fallback: DiagnosticSeverity
): DiagnosticSeverity {
  return value === 'error' ||
    value === 'warning' ||
    value === 'hint' ||
    value === 'off'
    ? value
    : fallback;
}

function asTrace(value: unknown): TraceLevel {
  return value === 'messages' || value === 'verbose' ? value : 'off';
}

/** An empty string is how VS Code spells "not set" for a path setting. */
function asPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
