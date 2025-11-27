/**
 * LSP Types for Blade Language Server
 * Based on data-model.md specification
 */

import type {
  TemplateNode,
  ComponentDefinition,
  SourceLocation,
} from '../ast/types.js';
import type { ParseError } from '../parser/index.js';

// ============================================================================
// Document Types
// ============================================================================

/**
 * Represents a parsed .blade file in the LSP workspace.
 */
export interface BladeDocument {
  /** Document URI (file://...) */
  uri: string;
  /** Incremental version for sync */
  version: number;
  /** Raw text content */
  content: string;
  /** Parsed AST (null if parse failed) */
  ast: TemplateNode[] | null;
  /** Parse errors */
  errors: ParseError[];
  /** Defined components */
  components: Map<string, ComponentDefinition>;
  /** Analyzed scope information */
  scope: DocumentScope;
  /** Timestamp of last parse */
  lastParsed: number;
}

/**
 * Scope analysis for a document.
 */
export interface DocumentScope {
  /** Variables available at each position (offset → variables) */
  variables: Map<number, ScopeVariable[]>;
  /** Components defined in this document */
  components: ComponentInfo[];
  /** Component usages (for references) */
  componentUsages: ComponentUsage[];
  /** Helper calls (for references) */
  helperCalls: HelperCall[];
}

export interface ScopeVariable {
  name: string;
  kind:
    | 'let'
    | 'for-item'
    | 'for-index'
    | 'for-key'
    | 'prop'
    | 'data'
    | 'global';
  location: SourceLocation;
  /** Inferred or declared type */
  valueType?: string;
  /** For for-item variables, the name of the source array being iterated */
  sourceVar?: string;
}

export interface ComponentInfo {
  name: string;
  props: PropInfo[];
  slots: SlotInfo[];
  location: SourceLocation;
}

export interface PropInfo {
  name: string;
  required: boolean;
  defaultValue?: string;
}

export interface SlotInfo {
  /** null = default slot */
  name: string | null;
  location: SourceLocation;
}

export interface ComponentUsage {
  componentName: string;
  location: SourceLocation;
  props: Record<string, SourceLocation>;
}

export interface HelperCall {
  helperName: string;
  location: SourceLocation;
}

// ============================================================================
// Workspace Types
// ============================================================================

/**
 * Global index across all .blade files in workspace.
 */
export interface WorkspaceIndex {
  /** All documents by URI */
  documents: Map<string, BladeDocument>;
  /** Component name → defining document URI */
  componentIndex: Map<string, string>;
  /** Helper name → definition location (from config) */
  helperIndex: Map<string, HelperDefinition>;
  /** Data schema (from configuration) */
  dataSchema: DataSchema | null;
  /** Configuration */
  config: LspConfig;
}

export interface HelperDefinition {
  name: string;
  signature: string;
  description?: string;
  deprecated?: boolean;
  deprecatedMessage?: string;
  sourceFile?: string;
}

export interface DataSchema {
  /** JSON Schema-like definition of available data */
  type: 'object';
  properties: Record<string, SchemaProperty>;
}

export interface SchemaProperty {
  type: string | string[];
  description?: string;
  /** For nested objects */
  properties?: Record<string, SchemaProperty>;
  /** For arrays */
  items?: SchemaProperty;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface LspConfig {
  diagnostics: DiagnosticConfig;
  completion: CompletionConfig;
  performance: PerformanceConfig;
}

export interface DiagnosticConfig {
  enabled: boolean;
  unusedVariables: DiagnosticSeverity;
  deprecatedHelpers: DiagnosticSeverity;
  potentiallyUndefined: DiagnosticSeverity;
  deepNesting: DiagnosticSeverity;
  /** Default: 4 */
  deepNestingThreshold: number;
}

export interface CompletionConfig {
  /** Path to JSON schema file */
  dataSchemaPath?: string;
  /** Path to helpers .d.ts or JSON */
  helpersDefinitionPath?: string;
  /** Enable snippet completions */
  snippets: boolean;
}

export interface PerformanceConfig {
  /** Parse debounce (default: 200) */
  debounceMs: number;
  /** Max file size to parse (default: 1MB) */
  maxFileSize: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'hint' | 'off';

// ============================================================================
// Completion Types
// ============================================================================

export interface CompletionContext {
  document: BladeDocument;
  position: Position;
  triggerCharacter?: string;
  /** Computed context */
  contextKind: CompletionContextKind;
  scopeVariables: ScopeVariable[];
  /** Text being typed */
  partialToken?: string;
}

export type CompletionContextKind =
  | 'expression' // Inside ${...}
  | 'expression-path' // After ${user.
  | 'directive' // After @
  | 'directive-argument' // Inside @if(...)
  | 'html-tag' // After <
  | 'html-attribute' // Inside <div ...>
  | 'html-attribute-value' // Inside attribute="..." or ={...}
  | 'component-prop' // Inside <MyComponent ...>
  | 'slot-name' // Inside <slot name="...">
  | 'text'; // Plain text content

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

// ============================================================================
// Diagnostic Types
// ============================================================================

export interface DiagnosticInfo {
  range: Range;
  severity: LspDiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  source: 'blade';
  relatedInformation?: RelatedInfo[];
  data?: {
    quickFix?: QuickFix[];
  };
}

export type LspDiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Information, Hint

export interface RelatedInfo {
  location: {
    uri: string;
    range: Range;
  };
  message: string;
}

export interface QuickFix {
  title: string;
  edits: TextEdit[];
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export type DiagnosticCode =
  | 'PARSE_ERROR'
  | 'UNCLOSED_TAG'
  | 'INVALID_EXPRESSION'
  | 'INVALID_DIRECTIVE'
  | 'UNKNOWN_COMPONENT'
  | 'MISSING_REQUIRED_PROP'
  | 'UNUSED_VARIABLE'
  | 'DEPRECATED_HELPER'
  | 'POTENTIALLY_UNDEFINED'
  | 'DEEP_NESTING'
  | 'CIRCULAR_COMPONENT'
  | 'UNKNOWN_PROP';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_LSP_CONFIG: LspConfig = {
  diagnostics: {
    enabled: true,
    unusedVariables: 'warning',
    deprecatedHelpers: 'warning',
    potentiallyUndefined: 'hint',
    deepNesting: 'warning',
    deepNestingThreshold: 4,
  },
  completion: {
    snippets: true,
  },
  performance: {
    debounceMs: 200,
    maxFileSize: 1024 * 1024, // 1MB
  },
};

/**
 * Create an empty document scope
 */
export function createEmptyScope(): DocumentScope {
  return {
    variables: new Map(),
    components: [],
    componentUsages: [],
    helperCalls: [],
  };
}

/**
 * Create an empty workspace index
 */
export function createWorkspaceIndex(
  config: LspConfig = DEFAULT_LSP_CONFIG
): WorkspaceIndex {
  return {
    documents: new Map(),
    componentIndex: new Map(),
    helperIndex: new Map(),
    dataSchema: null,
    config,
  };
}
