/**
 * LSP API Contracts for Project-based Template Compilation
 *
 * Branch: 005-project-template-compilation
 * Date: 2025-11-26
 *
 * These interfaces define the LSP provider contracts for project features.
 */

import type {
  CompletionItem,
  CompletionItemKind,
  Location,
  Hover,
  Diagnostic,
  Position,
  TextDocumentIdentifier
} from 'vscode-languageserver'

import type { ComponentInfo, JsonSchema, PropDeclaration } from './compiler-api'

// =============================================================================
// Project LSP Context
// =============================================================================

/**
 * LSP-specific project context with caching.
 */
export interface ProjectLspContext {
  /** Project root path */
  rootPath: string

  /** Discovered components for completion */
  components: Map<string, ComponentInfo>

  /** Flattened schema properties for variable completion */
  schemaProperties: SchemaPropertyInfo[]

  /** Sample values keyed by dot-path (e.g., 'user.name' → ['John', 'Jane']) */
  sampleValues: Map<string, unknown[]>

  /** Last updated timestamp for cache invalidation */
  lastUpdated: number

  /** Whether context is valid (no errors during load) */
  valid: boolean
}

/**
 * Extracted property info from JSON Schema.
 */
export interface SchemaPropertyInfo {
  /** Dot-separated path from root (e.g., 'user.name') */
  path: string

  /** JSON Schema type(s) */
  type: string | string[]

  /** Whether required in parent object */
  required: boolean

  /** Description from schema */
  description?: string

  /** Enum values if constrained */
  enumValues?: unknown[]
}

// =============================================================================
// Completion Provider
// =============================================================================

/**
 * Component completion item with metadata.
 */
export interface ComponentCompletionItem {
  /** Tag name to insert */
  tagName: string

  /** Required props for snippet generation */
  requiredProps: string[]

  /** Optional props with defaults */
  optionalProps: Array<{
    name: string
    defaultValue: string
  }>

  /** File path for documentation */
  filePath: string

  /** Namespace segments */
  namespace: string[]
}

/**
 * Generate component tag completions for current position.
 *
 * Triggers when:
 * - After '<' character (component tag start)
 * - After '.' in partial tag like '<Components.'
 *
 * @param context - Project LSP context
 * @param prefix - Partial tag name typed (e.g., 'Comp', 'Components.F')
 * @returns Completion items for matching components
 */
export declare function getComponentCompletions(
  context: ProjectLspContext,
  prefix: string
): CompletionItem[]

/**
 * Generate prop completions for component tag.
 *
 * Triggers when:
 * - Inside component tag after space
 * - Typing prop name
 *
 * @param context - Project LSP context
 * @param componentTag - Component being edited
 * @param existingProps - Props already specified
 * @returns Completion items for remaining props
 */
export declare function getPropCompletions(
  context: ProjectLspContext,
  componentTag: string,
  existingProps: string[]
): CompletionItem[]

/**
 * Generate variable/property completions from schema.
 *
 * Triggers when:
 * - After '$' character
 * - After '.' following a variable
 *
 * @param context - Project LSP context
 * @param prefix - Partial path typed (e.g., '$user.', '$items[0].')
 * @returns Completion items for matching properties
 */
export declare function getSchemaCompletions(
  context: ProjectLspContext,
  prefix: string
): CompletionItem[]

// =============================================================================
// Definition Provider
// =============================================================================

/**
 * Go-to-definition result for component tags.
 */
export interface ComponentDefinitionResult {
  /** Component tag name */
  tagName: string

  /** Location of component file */
  location: Location

  /** Component file path */
  filePath: string
}

/**
 * Resolve go-to-definition for component tag.
 *
 * @param context - Project LSP context
 * @param document - Current document
 * @param position - Cursor position
 * @returns Definition location or undefined if not on component
 */
export declare function getComponentDefinition(
  context: ProjectLspContext,
  document: TextDocumentIdentifier,
  position: Position
): ComponentDefinitionResult | undefined

// =============================================================================
// Hover Provider
// =============================================================================

/**
 * Hover info for variables with sample values.
 */
export interface VariableHoverInfo {
  /** Variable path (e.g., '$user.name') */
  path: string

  /** Type from schema */
  type?: string

  /** Description from schema */
  description?: string

  /** Example values from samples */
  examples: Array<{
    source: string
    value: unknown
  }>
}

/**
 * Hover info for component tags.
 */
export interface ComponentHoverInfo {
  /** Component tag name */
  tagName: string

  /** File path */
  filePath: string

  /** Props documentation */
  props: Array<{
    name: string
    required: boolean
    defaultValue?: string
  }>
}

/**
 * Get hover information at position.
 *
 * @param context - Project LSP context
 * @param document - Current document
 * @param position - Cursor position
 * @returns Hover content or undefined
 */
export declare function getHoverInfo(
  context: ProjectLspContext,
  document: TextDocumentIdentifier,
  position: Position
): Hover | undefined

// =============================================================================
// Diagnostics Provider
// =============================================================================

/**
 * Generate project-aware diagnostics.
 *
 * Checks:
 * - Missing components
 * - Missing required props
 * - Sample/schema mismatches
 * - @props syntax errors
 *
 * @param context - Project LSP context
 * @param document - Document to validate
 * @returns Array of diagnostics
 */
export declare function getProjectDiagnostics(
  context: ProjectLspContext,
  document: TextDocumentIdentifier
): Diagnostic[]

/**
 * Validate sample files against schema.
 *
 * @param context - Project LSP context
 * @returns Diagnostics for sample files
 */
export declare function validateSamples(
  context: ProjectLspContext
): Map<string, Diagnostic[]>

// =============================================================================
// Workspace Management
// =============================================================================

/**
 * Initialize project context for workspace folder.
 *
 * @param workspacePath - Workspace folder path
 * @returns Project context or undefined if not a Blade project
 */
export declare function initializeProjectContext(
  workspacePath: string
): Promise<ProjectLspContext | undefined>

/**
 * Invalidate project context cache.
 * Called when .blade, schema.json, or samples/*.json files change.
 *
 * @param context - Context to invalidate
 * @param changedFile - Path of changed file
 */
export declare function invalidateProjectContext(
  context: ProjectLspContext,
  changedFile: string
): void

/**
 * Refresh project context.
 * Re-scans filesystem and updates all cached data.
 *
 * @param context - Context to refresh
 */
export declare function refreshProjectContext(
  context: ProjectLspContext
): Promise<void>
