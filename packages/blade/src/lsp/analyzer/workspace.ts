/**
 * Workspace Index for Blade Language Server
 * Tracks documents, components, and helpers across the workspace
 */

import type {
  WorkspaceIndex,
  BladeDocument,
  LspConfig,
  HelperDefinition,
  DataSchema,
  ComponentInfo,
} from '../types.js';
import { createWorkspaceIndex, DEFAULT_LSP_CONFIG } from '../types.js';
import { DocumentManager } from '../document.js';

/**
 * Workspace manager that coordinates document tracking and indexing
 */
export class WorkspaceManager {
  private index: WorkspaceIndex;
  private documentManager: DocumentManager;

  constructor(config: LspConfig = DEFAULT_LSP_CONFIG) {
    this.index = createWorkspaceIndex(config);
    this.documentManager = new DocumentManager(config, doc =>
      this.onDocumentParsed(doc)
    );
  }

  /**
   * Called when a document is parsed/updated
   */
  private onDocumentParsed(doc: BladeDocument): void {
    // Update the index with this document
    this.index.documents.set(doc.uri, doc);

    // Re-index components from this document
    this.reindexComponents(doc);
  }

  /**
   * Re-index components from a document
   */
  private reindexComponents(doc: BladeDocument): void {
    // Remove old component entries from this document
    for (const [name, uri] of this.index.componentIndex) {
      if (uri === doc.uri) {
        this.index.componentIndex.delete(name);
      }
    }

    // Add new component entries
    for (const [name] of doc.components) {
      this.index.componentIndex.set(name, doc.uri);
    }
  }

  /**
   * Open a document in the workspace
   */
  openDocument(uri: string, content: string, version: number): BladeDocument {
    return this.documentManager.open(uri, content, version);
  }

  /**
   * Update a document's content
   */
  changeDocument(uri: string, content: string, version: number): void {
    this.documentManager.change(uri, content, version);
  }

  /**
   * Close a document
   */
  closeDocument(uri: string): void {
    this.documentManager.close(uri);
    this.index.documents.delete(uri);

    // Remove component entries from this document
    for (const [name, docUri] of this.index.componentIndex) {
      if (docUri === uri) {
        this.index.componentIndex.delete(name);
      }
    }
  }

  /**
   * Get a document by URI
   */
  getDocument(uri: string): BladeDocument | undefined {
    return this.documentManager.get(uri);
  }

  /**
   * Get all documents
   */
  getAllDocuments(): BladeDocument[] {
    return this.documentManager.getAll();
  }

  /**
   * Check if a document is open
   */
  hasDocument(uri: string): boolean {
    return this.documentManager.has(uri);
  }

  /**
   * Find the document that defines a component
   */
  findComponentDefinition(
    componentName: string
  ): { uri: string; component: ComponentInfo } | null {
    const uri = this.index.componentIndex.get(componentName);
    if (!uri) {
      return null;
    }

    const doc = this.index.documents.get(uri);
    if (!doc) {
      return null;
    }

    const component = doc.scope.components.find(c => c.name === componentName);
    if (!component) {
      return null;
    }

    return { uri, component };
  }

  /**
   * Get all component names in the workspace
   */
  getAllComponentNames(): string[] {
    return Array.from(this.index.componentIndex.keys());
  }

  /**
   * Get all component usages of a component
   */
  findComponentUsages(
    componentName: string
  ): Array<{ uri: string; location: { line: number; character: number } }> {
    const usages: Array<{
      uri: string;
      location: { line: number; character: number };
    }> = [];

    for (const doc of this.index.documents.values()) {
      for (const usage of doc.scope.componentUsages) {
        if (usage.componentName === componentName) {
          usages.push({
            uri: doc.uri,
            location: {
              line: usage.location.start.line - 1, // Convert to 0-based
              character: usage.location.start.column - 1,
            },
          });
        }
      }
    }

    return usages;
  }

  /**
   * Register a helper definition
   */
  registerHelper(helper: HelperDefinition): void {
    this.index.helperIndex.set(helper.name, helper);
  }

  /**
   * Register multiple helper definitions
   */
  registerHelpers(helpers: HelperDefinition[]): void {
    for (const helper of helpers) {
      this.registerHelper(helper);
    }
  }

  /**
   * Get a helper definition by name
   */
  getHelper(name: string): HelperDefinition | undefined {
    return this.index.helperIndex.get(name);
  }

  /**
   * Get all helper definitions
   */
  getAllHelpers(): HelperDefinition[] {
    return Array.from(this.index.helperIndex.values());
  }

  /**
   * Set the data schema for completions
   */
  setDataSchema(schema: DataSchema | null): void {
    this.index.dataSchema = schema;
  }

  /**
   * Get the data schema
   */
  getDataSchema(): DataSchema | null {
    return this.index.dataSchema;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LspConfig>): void {
    this.index.config = {
      ...this.index.config,
      ...config,
      diagnostics: {
        ...this.index.config.diagnostics,
        ...config.diagnostics,
      },
      completion: {
        ...this.index.config.completion,
        ...config.completion,
      },
      performance: {
        ...this.index.config.performance,
        ...config.performance,
      },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): LspConfig {
    return this.index.config;
  }

  /**
   * Get the full workspace index
   */
  getIndex(): WorkspaceIndex {
    return this.index;
  }
}
