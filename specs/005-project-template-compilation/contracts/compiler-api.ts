/**
 * Compiler API Contracts for Project-based Template Compilation
 *
 * Branch: 005-project-template-compilation
 * Date: 2025-11-26
 *
 * These interfaces define the public API surface for project compilation features.
 */

import type { RootNode, ExpressionNode, Diagnostic, SourceLocation } from '../../../packages/blade/src/ast/types'

// =============================================================================
// @props Directive Types
// =============================================================================

/**
 * A single prop declaration from @props() directive.
 *
 * Examples:
 * - @props($name) → { name: 'name', required: true, defaultValue: undefined }
 * - @props($disabled = false) → { name: 'disabled', required: false, defaultValue: LiteralNode(false) }
 */
export interface PropDeclaration {
  /** Variable name without $ prefix */
  name: string

  /** True if no default value provided */
  required: boolean

  /** Default value expression (undefined if required) */
  defaultValue: ExpressionNode | undefined

  /** Source location for error reporting */
  location: SourceLocation
}

/**
 * The @props() directive AST node.
 */
export interface PropsDirective {
  type: 'PropsDirective'
  props: PropDeclaration[]
  location: SourceLocation
}

// =============================================================================
// Project Configuration
// =============================================================================

/**
 * Options for compileProject().
 */
export interface ProjectOptions {
  /**
   * Entry point filename.
   * @default 'index.blade'
   */
  entry?: string

  /**
   * Enable source tracking attributes on rendered output.
   * @default true
   */
  sourceTracking?: boolean
}

/**
 * Options for compile() with project context.
 */
export interface CompileOptionsWithProject {
  /**
   * Project root for component resolution.
   * When specified, components are discovered from this folder.
   */
  projectRoot?: string

  // ... other existing compile options
}

// =============================================================================
// Component Discovery
// =============================================================================

/**
 * Information about a discovered component.
 */
export interface ComponentInfo {
  /** Tag name for usage (e.g., 'Button', 'Components.Form.Input') */
  tagName: string

  /** Absolute path to .blade file */
  filePath: string

  /** Namespace segments (e.g., ['Components', 'Form'] for Components.Form.Input) */
  namespace: string[]

  /** Parsed prop declarations (lazy-loaded) */
  props: PropDeclaration[] | undefined

  /** True if props were inferred from variable usage (no @props directive) */
  propsInferred: boolean
}

/**
 * Project context containing all discovered components.
 */
export interface ProjectContext {
  /** Absolute path to project root */
  rootPath: string

  /** Entry point file path */
  entryPath: string

  /** Discovered components keyed by tag name */
  components: Map<string, ComponentInfo>

  /** Parsed JSON Schema (if schema.json exists) */
  schema: JsonSchema | undefined

  /** Sample data from samples/*.json */
  samples: Map<string, unknown>
}

// =============================================================================
// JSON Schema Types (for LSP)
// =============================================================================

/**
 * Subset of JSON Schema needed for completion extraction.
 */
export interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
}

// =============================================================================
// Compilation Results
// =============================================================================

/**
 * Result from compileProject().
 */
export interface ProjectResult {
  /** Compiled AST with all components resolved */
  ast: RootNode

  /** Project context used during compilation */
  context: ProjectContext

  /** Non-fatal warnings (e.g., @props syntax errors with fallback) */
  warnings: Diagnostic[]

  /** Fatal errors preventing successful compilation */
  errors: Diagnostic[]

  /** True if compilation succeeded (errors is empty) */
  success: boolean
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Compile a Blade project from a folder.
 *
 * @param projectPath - Absolute path to folder containing index.blade
 * @param options - Compilation options
 * @returns Compilation result with AST and diagnostics
 *
 * @example
 * ```typescript
 * const result = await compileProject('/path/to/my-template')
 * if (result.success) {
 *   const html = render(result.ast, data)
 * } else {
 *   console.error(result.errors)
 * }
 * ```
 */
export declare function compileProject(
  projectPath: string,
  options?: ProjectOptions
): Promise<ProjectResult>

/**
 * Discover components in a project folder.
 *
 * @param projectPath - Absolute path to project root
 * @returns Map of tag names to component info
 *
 * @example
 * ```typescript
 * const components = await discoverComponents('/path/to/project')
 * for (const [tagName, info] of components) {
 *   console.log(`${tagName} → ${info.filePath}`)
 * }
 * ```
 */
export declare function discoverComponents(
  projectPath: string
): Promise<Map<string, ComponentInfo>>

/**
 * Resolve a component tag name to file path.
 *
 * @param tagName - Component tag (e.g., 'Button', 'Components.Form.Input')
 * @param projectPath - Project root for resolution
 * @returns Absolute file path or undefined if not found
 *
 * @example
 * ```typescript
 * const path = await resolveComponent('Components.Form.Input', '/path/to/project')
 * // → '/path/to/project/components/form/input.blade'
 * ```
 */
export declare function resolveComponent(
  tagName: string,
  projectPath: string
): Promise<string | undefined>

/**
 * Parse @props() directive from template source.
 *
 * @param source - Template source code
 * @returns Parsed props or undefined if no directive
 *
 * @example
 * ```typescript
 * const props = parseProps('@props($label, $disabled = false)\n<button>...')
 * // → [{ name: 'label', required: true }, { name: 'disabled', required: false, ... }]
 * ```
 */
export declare function parseProps(
  source: string
): PropsDirective | undefined

/**
 * Load and parse schema.json from project.
 *
 * @param projectPath - Project root
 * @returns Parsed schema or undefined if not present
 */
export declare function loadProjectSchema(
  projectPath: string
): Promise<JsonSchema | undefined>

/**
 * Load sample data from project's samples/ directory.
 *
 * @param projectPath - Project root
 * @returns Map of filename (without extension) to parsed JSON
 */
export declare function loadProjectSamples(
  projectPath: string
): Promise<Map<string, unknown>>
