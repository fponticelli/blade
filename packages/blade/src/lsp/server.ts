/**
 * Blade Language Server
 * Main LSP server implementation
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentPositionParams,
  Definition,
  Hover,
  Location,
  ReferenceParams,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { WorkspaceManager } from './analyzer/workspace.js';
import type { LspConfig } from './types.js';
import { DEFAULT_LSP_CONFIG } from './types.js';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Workspace manager
let workspaceManager: WorkspaceManager;

// Configuration
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  // Initialize workspace manager with default config
  workspaceManager = new WorkspaceManager(DEFAULT_LSP_CONFIG);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['$', '{', '.', '@', '<', ' '],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
      },
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }

  // Load configuration
  updateConfiguration();
});

// Configuration change handler
connection.onDidChangeConfiguration(_change => {
  updateConfiguration();

  // Revalidate all documents
  documents.all().forEach(validateDocument);
});

async function updateConfiguration(): Promise<void> {
  if (!hasConfigurationCapability) {
    return;
  }

  const config = await connection.workspace.getConfiguration('blade.lsp');

  if (config) {
    const lspConfig: Partial<LspConfig> = {
      diagnostics: {
        enabled: config.diagnostics?.enabled ?? true,
        unusedVariables: config.diagnostics?.unusedVariables ?? 'warning',
        deprecatedHelpers: config.diagnostics?.deprecatedHelpers ?? 'warning',
        potentiallyUndefined:
          config.diagnostics?.potentiallyUndefined ?? 'hint',
        deepNesting: config.diagnostics?.deepNesting ?? 'warning',
        deepNestingThreshold: config.diagnostics?.deepNestingThreshold ?? 4,
      },
      completion: {
        dataSchemaPath: config.completion?.dataSchemaPath,
        helpersDefinitionPath: config.completion?.helpersDefinitionPath,
        snippets: config.completion?.snippets ?? true,
      },
    };

    workspaceManager.updateConfig(lspConfig);
  }
}

// Document lifecycle events
documents.onDidOpen(event => {
  const { document } = event;
  workspaceManager.openDocument(
    document.uri,
    document.getText(),
    document.version
  );
  validateDocument(document);
});

documents.onDidChangeContent(event => {
  const { document } = event;
  workspaceManager.changeDocument(
    document.uri,
    document.getText(),
    document.version
  );

  // Validation is triggered after debounce in document manager
  // but we also trigger here for immediate feedback
  validateDocument(document);
});

documents.onDidClose(event => {
  const { document } = event;
  workspaceManager.closeDocument(document.uri);

  // Clear diagnostics for closed document
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

// Validate a document and send diagnostics
function validateDocument(textDocument: TextDocument): void {
  const config = workspaceManager.getConfig();
  if (!config.diagnostics.enabled) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  const bladeDoc = workspaceManager.getDocument(textDocument.uri);
  if (!bladeDoc) {
    return;
  }

  const diagnostics: Diagnostic[] = [];

  // Convert parse errors to diagnostics
  for (const error of bladeDoc.errors) {
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: error.line - 1, character: error.column - 1 },
        end: { line: error.line - 1, character: error.column + 10 },
      },
      message: error.message,
      source: 'blade',
    };
    diagnostics.push(diagnostic);
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// Completion handler
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // This is a basic implementation - will be extended in User Story 3
    const items: CompletionItem[] = [];

    // Add directive completions
    const directives = [
      { label: '@if', detail: 'Conditional block' },
      { label: '@for', detail: 'Loop block' },
      { label: '@match', detail: 'Pattern matching block' },
      { label: '@@', detail: 'Variable declaration block' },
      { label: '@component', detail: 'Component definition' },
      { label: '@end', detail: 'End block' },
      { label: '@else', detail: 'Else branch' },
    ];

    for (const dir of directives) {
      items.push({
        label: dir.label,
        kind: CompletionItemKind.Keyword,
        detail: dir.detail,
      });
    }

    return items;
  }
);

// Completion resolve handler
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  // Add documentation or additional details
  return item;
});

// Hover handler
connection.onHover((_params: TextDocumentPositionParams): Hover | null => {
  // Will be implemented in User Story 8
  return null;
});

// Go to definition handler
connection.onDefinition(
  (_params: TextDocumentPositionParams): Definition | null => {
    // Will be implemented in User Story 8
    return null;
  }
);

// Find references handler
connection.onReferences((_params: ReferenceParams): Location[] | null => {
  // Will be implemented in User Story 8
  return null;
});

// Start listening
documents.listen(connection);
connection.listen();

// Export for testing
export { connection, documents, workspaceManager };
