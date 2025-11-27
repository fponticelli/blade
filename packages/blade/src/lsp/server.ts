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
import { getCompletionContext, getCompletions } from './providers/completion.js';
import { getHoverInfo } from './providers/hover.js';
import { getOffset } from './document.js';
import type { ProjectLspContext } from './project-context.js';
import { initializeProjectContext } from './project-context.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Workspace manager
let workspaceManager: WorkspaceManager;

// Project contexts keyed by project root
const projectContexts: Map<string, ProjectLspContext> = new Map();

// Configuration
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  connection.console.log('[Server] Initializing Blade Language Server...');

  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  // Initialize workspace manager with default config
  workspaceManager = new WorkspaceManager(DEFAULT_LSP_CONFIG);

  connection.console.log('[Server] Workspace manager initialized');

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
      // Using push-based diagnostics via sendDiagnostics instead of pull-based
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

/**
 * Gets the project root from a document URI.
 * The project root is the directory containing the .blade file.
 */
function getProjectRoot(uri: string): string {
  const filePath = fileURLToPath(uri);
  return dirname(filePath);
}

/**
 * Gets or initializes the project context for a document.
 */
async function getProjectContext(uri: string): Promise<ProjectLspContext | undefined> {
  const projectRoot = getProjectRoot(uri);

  // Check if we already have context for this project
  const cachedContext = projectContexts.get(projectRoot);
  if (cachedContext) {
    return cachedContext;
  }

  // Initialize new project context
  connection.console.log(`[Server] Initializing project context for: ${projectRoot}`);
  const newContext = await initializeProjectContext(projectRoot);

  if (newContext) {
    projectContexts.set(projectRoot, newContext);
    connection.console.log(`[Server] Project context loaded. Schema: ${!!newContext.schema}, Components: ${newContext.components.size}`);
    if (newContext.schema) {
      connection.console.log(`[Server] Schema properties: ${newContext.schema.properties.map(p => p.path).join(', ')}`);
    }
    return newContext;
  } else {
    connection.console.log(`[Server] No project context found (no schema.json)`);
    return undefined;
  }
}

// Document lifecycle events
documents.onDidOpen(async event => {
  const { document } = event;
  connection.console.log(`[Server] Document opened: ${document.uri}`);
  connection.console.log(`[Server] Document content length: ${document.getText().length}`);
  workspaceManager.openDocument(
    document.uri,
    document.getText(),
    document.version
  );
  const bladeDoc = workspaceManager.getDocument(document.uri);
  connection.console.log(`[Server] BladeDoc created: ${!!bladeDoc}`);
  if (bladeDoc) {
    connection.console.log(`[Server] BladeDoc errors: ${bladeDoc.errors.length}`);
    connection.console.log(`[Server] BladeDoc scope variables count: ${bladeDoc.scope.variables.size}`);
  }

  // Load project context for this document
  await getProjectContext(document.uri);

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
  async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    connection.console.log(
      `[Completion] Request for ${params.textDocument.uri} at line ${params.position.line}, char ${params.position.character}`
    );

    const doc = workspaceManager.getDocument(params.textDocument.uri);
    if (!doc) {
      connection.console.log('[Completion] Document not found in workspace');
      return [];
    }

    // Get project context for schema-based completions
    const projectContext = await getProjectContext(params.textDocument.uri);

    // Get offset from position
    const offset = getOffset(
      doc.content,
      params.position.line,
      params.position.character
    );

    connection.console.log(
      `[Completion] Offset: ${offset}, char before: ${JSON.stringify(doc.content[offset - 1])}`
    );

    // Get completion context
    const context = getCompletionContext(doc, offset);

    connection.console.log(`[Completion] Context kind: ${context.contextKind}`);

    // Get completions from provider with project context
    const completions = getCompletions(context, doc.scope, projectContext);

    connection.console.log(
      `[Completion] Returning ${completions.length} completions: ${completions
        .slice(0, 5)
        .map(c => c.label)
        .join(', ')}...`
    );

    // Convert to LSP CompletionItems
    // For expression context (typing $), add $ prefix to filterText and insertText
    // For expression-path context (drilling into objects), just insert the property name
    const isTopLevelExpression = context.contextKind === 'expression';
    const isPathExpression = context.contextKind === 'expression-path';

    return completions.map(item => ({
      label: item.label,
      kind: item.kind,
      detail: item.detail,
      documentation: item.documentation,
      // For top-level expressions ($foo), insert with $ prefix
      // For path expressions (foo.bar), just insert the property name
      insertText: isTopLevelExpression ? `$${item.insertText || item.label}` : item.insertText,
      insertTextFormat: item.insertTextFormat,
      sortText: item.sortText,
      // Add $ prefix to filterText only for top-level expressions
      filterText: isTopLevelExpression ? `$${item.label}` : (isPathExpression ? item.label : item.filterText),
    }));
  }
);

// Completion resolve handler
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  // Add documentation or additional details
  return item;
});

// Hover handler
connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
  const doc = workspaceManager.getDocument(params.textDocument.uri);
  if (!doc) {
    return null;
  }

  // Get project context for schema-based type info
  const projectContext = await getProjectContext(params.textDocument.uri);

  // getHoverInfo expects a Position object
  const position = {
    line: params.position.line,
    character: params.position.character,
  };

  const hoverInfo = getHoverInfo(doc, position, projectContext);
  if (!hoverInfo) {
    return null;
  }

  return {
    contents: {
      kind: 'markdown',
      value: hoverInfo.contents,
    },
    range: hoverInfo.range
      ? {
          start: {
            line: hoverInfo.range.start.line,
            character: hoverInfo.range.start.character,
          },
          end: {
            line: hoverInfo.range.end.line,
            character: hoverInfo.range.end.character,
          },
        }
      : undefined,
  };
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
