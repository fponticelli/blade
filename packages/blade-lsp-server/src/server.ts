/**
 * Blade Language Server
 *
 * A protocol adapter over {@link BladeLanguageService} and nothing else. Every
 * decision - which project a file belongs to, what to complete, what to
 * publish - lives in the service, where it can be tested without opening a
 * connection on stdio.
 *
 * Three properties this file must keep:
 *
 * 1. **No handler may reject.** `TextDocuments` does not await the promises its
 *    listeners return, so a rejection becomes an unhandled rejection, and on
 *    Node >= 15 that ends the process. VS Code restarts a crashed server five
 *    times and then gives up for the session, so one bad URI could take
 *    language support away for the rest of the day. Every body is wrapped, and
 *    the process itself carries last-resort guards.
 * 2. **Diagnostics are published from the parse, not from the edit.** The old
 *    `onDidChangeContent` validated synchronously against a document whose
 *    parse was still 200 ms in the future, so every squiggle described the
 *    previous keystroke.
 * 3. **Every advertised capability has a handler.** `definitionProvider` and
 *    `referencesProvider` were advertised and answered `null`.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  CompletionItem as LspCompletionItem,
  CompletionItemTag,
  TextDocumentPositionParams,
  Definition,
  Hover,
  Location,
  ReferenceParams,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { DEFAULT_LSP_CONFIG } from './types.js';
import {
  clientCapabilityFlags,
  createInitializeResult,
  readConfig,
} from './protocol.js';
import { BladeLanguageService, toFilePath } from './service.js';
import type { CompletionItem } from './providers/completion.js';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const service = new BladeLanguageService(
  {
    publishDiagnostics: (uri, diagnostics) =>
      connection.sendDiagnostics({ uri, diagnostics }),
    sink: {
      error: message => connection.console.error(message),
      log: message => connection.console.log(message),
    },
  },
  DEFAULT_LSP_CONFIG
);

// Configuration
let hasConfigurationCapability = false;
let hasFileWatchingCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const flags = clientCapabilityFlags(params);
  hasConfigurationCapability = flags.configuration;
  hasFileWatchingCapability = flags.fileWatching;

  const folders = (params.workspaceFolders ?? [])
    .map(folder => toFilePath(folder.uri))
    .filter((path): path is string => path !== undefined);
  if (folders.length > 0) {
    service.setWorkspaceFolders(folders);
  } else if (params.rootUri) {
    const root = toFilePath(params.rootUri);
    if (root) service.setWorkspaceFolders([root]);
  }

  return createInitializeResult(params);
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    void connection.client
      .register(DidChangeConfigurationNotification.type, undefined)
      .catch(error =>
        service.logger.error('failed to register configuration listener', error)
      );
  }

  if (hasFileWatchingCapability) {
    // The metadata a project context is built from. Without this the context
    // was cached for the life of the process: editing schema.json changed
    // nothing until the window was reloaded.
    void connection.client
      .register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          { globPattern: '**/schema.json' },
          { globPattern: '**/samples/*.json' },
          { globPattern: '**/*.blade' },
        ],
      })
      .catch(error =>
        service.logger.error('failed to register file watchers', error)
      );
  }

  void updateConfiguration();
});

connection.onDidChangeConfiguration(() => {
  void updateConfiguration().then(() => {
    // Settings can change what counts as a diagnostic, so everything open is
    // re-validated - from its current parse, not from a stale one.
    for (const document of documents.all()) {
      void service
        .validate(document.uri)
        .catch(error =>
          service.logger.error(`revalidation failed for ${document.uri}`, error)
        );
    }
  });
});

connection.onDidChangeWatchedFiles(params => {
  for (const change of params.changes) {
    const path = toFilePath(change.uri);
    if (path !== undefined) service.invalidatePath(path);
  }
  for (const document of documents.all()) {
    void service
      .validate(document.uri)
      .catch(error =>
        service.logger.error(`revalidation failed for ${document.uri}`, error)
      );
  }
});

async function updateConfiguration(): Promise<void> {
  if (!hasConfigurationCapability) {
    return;
  }

  try {
    const blade = await connection.workspace.getConfiguration('blade');
    service.updateConfig(readConfig(blade));
  } catch (error) {
    service.logger.error('failed to read configuration', error);
  }
}

// =============================================================================
// Document lifecycle
// =============================================================================

documents.onDidOpen(event => {
  guard('onDidOpen', () => {
    service.openDocument(
      event.document.uri,
      event.document.getText(),
      event.document.version
    );
  });
});

documents.onDidChangeContent(event => {
  guard('onDidChangeContent', () => {
    // Diagnostics follow from the parse this schedules; validating here would
    // publish the previous version's errors.
    service.changeDocument(
      event.document.uri,
      event.document.getText(),
      event.document.version
    );
  });
});

documents.onDidClose(event => {
  guard('onDidClose', () => {
    service.closeDocument(event.document.uri);
  });
});

// =============================================================================
// Requests
// =============================================================================

connection.onCompletion(
  async (params: TextDocumentPositionParams): Promise<LspCompletionItem[]> => {
    try {
      const items = await service.complete(
        params.textDocument.uri,
        params.position
      );
      return items.map(toLspCompletionItem);
    } catch (error) {
      service.logger.error('completion failed', error);
      return [];
    }
  }
);

connection.onCompletionResolve(
  (item: LspCompletionItem): LspCompletionItem => item
);

connection.onHover(
  async (params: TextDocumentPositionParams): Promise<Hover | null> => {
    try {
      const info = await service.hover(
        params.textDocument.uri,
        params.position
      );
      if (!info) return null;
      return {
        contents: { kind: 'markdown', value: info.contents },
        range: info.range,
      };
    } catch (error) {
      service.logger.error('hover failed', error);
      return null;
    }
  }
);

connection.onDefinition(
  async (params: TextDocumentPositionParams): Promise<Definition | null> => {
    try {
      const location = await service.definition(
        params.textDocument.uri,
        params.position
      );
      return location ? { uri: location.uri, range: location.range } : null;
    } catch (error) {
      service.logger.error('definition failed', error);
      return null;
    }
  }
);

connection.onReferences(
  async (params: ReferenceParams): Promise<Location[]> => {
    try {
      const locations = await service.references(
        params.textDocument.uri,
        params.position,
        params.context?.includeDeclaration ?? true
      );
      return locations.map(location => ({
        uri: location.uri,
        range: location.range,
      }));
    } catch (error) {
      service.logger.error('references failed', error);
      return [];
    }
  }
);

/** Runs a notification handler so that nothing it throws escapes. */
function guard(what: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    service.logger.error(`${what} failed`, error);
  }
}

/**
 * Last-resort guards.
 *
 * A bug in one document must not end the session for every other one.
 */
process.on('unhandledRejection', reason => {
  service.logger.error('unhandled rejection', reason);
});
process.on('uncaughtException', error => {
  service.logger.error('uncaught exception', error);
});

function toLspCompletionItem(item: CompletionItem): LspCompletionItem {
  return {
    label: item.label,
    kind: item.kind,
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText,
    insertTextFormat: item.insertTextFormat,
    sortText: item.sortText,
    filterText: item.filterText,
    tags: item.deprecated ? [CompletionItemTag.Deprecated] : undefined,
  };
}

// Start listening
documents.listen(connection);
connection.listen();

// Export for testing
export { connection, documents, service };
