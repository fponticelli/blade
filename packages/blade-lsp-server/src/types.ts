/**
 * LSP Types for Blade Language Server
 * Based on data-model.md specification
 */

import type {
  TemplateNode,
  ComponentDefinition,
  PropDeclaration,
  SourceLocation,
} from '@bladets/template';
import type { ParseError } from '@bladets/template';
import type { LineIndex } from './line-index.js';

// ============================================================================
// Document Types
// ============================================================================

/**
 * A parsed .blade file in the LSP workspace.
 *
 * Every field describes the SAME text. `content`, `lines`, `ast`, `errors` and
 * `scope` are produced by one parse and replaced together; there is no state in
 * which the scope offsets belong to one version and the text to another. The
 * document manager used to store new content immediately and re-parse 200 ms
 * later, so every provider read a scope describing the previous keystroke -
 * which is how inserting a line at the top of a file silently shifted every
 * loop variable out of scope.
 */
export interface BladeDocument {
  /** Document URI (file://...) */
  readonly uri: string;
  /** Incremental version for sync */
  readonly version: number;
  /** Raw text content */
  readonly content: string;
  /** Line starts for `content`, computed once per version. */
  readonly lines: LineIndex;
  /** Parsed AST (null if parse failed) */
  readonly ast: TemplateNode[] | null;
  /** Parse errors */
  readonly errors: readonly ParseError[];
  /** Defined components */
  readonly components: ReadonlyMap<string, ComponentDefinition>;
  /** Props declared with `@props()`, in source order */
  readonly props: readonly PropDeclaration[];
  /** Analyzed scope information */
  readonly scope: DocumentScope;
  /** Timestamp of last parse */
  readonly lastParsed: number;
  /**
   * True when the file exceeded `performance.maxFileSize` and was not parsed.
   *
   * The limit was declared and never enforced, so a multi-megabyte file was
   * fully re-tokenised on every keystroke.
   */
  readonly oversized: boolean;
}

/**
 * One half-open span of a document over which the visible variables do not
 * change.
 *
 * Scope used to be a `Map<offset, ScopeVariable[]>` written twice per AST node
 * - two copied arrays each - and read by iterating the entire map to find the
 * greatest key <= the offset. A 2000-node template scanned ~4000 entries per
 * lookup, twice per completion. Nested scopes are laminar, so they flatten into
 * a sorted, disjoint segment list resolved by binary search.
 */
export interface ScopeSegment {
  /** First offset the segment covers. */
  readonly start: number;
  /** Variables visible anywhere in the segment, outermost first. */
  readonly variables: readonly ScopeVariable[];
}

/** A control-flow node and how deeply it nests. */
export interface NestingSite {
  /** 1 for a top-level `@if`/`@for`/`@match`. */
  readonly depth: number;
  readonly location: SourceLocation;
}

/**
 * Scope analysis for a document.
 */
export interface DocumentScope {
  /** Visible variables by document position, sorted by `start`. */
  readonly segments: readonly ScopeSegment[];
  /** Every variable the document declares, in source order. */
  readonly declarations: readonly ScopeVariable[];
  /** Components defined in this document */
  readonly components: ComponentInfo[];
  /** Component usages (for references) */
  readonly componentUsages: ComponentUsage[];
  /** Helper calls (for references) */
  readonly helperCalls: HelperCall[];
  /** Names read by some expression in the document. */
  readonly usedVariables: ReadonlySet<string>;
  /** Helper names called by some expression in the document. */
  readonly helpersUsed: ReadonlySet<string>;
  /** Control-flow nesting, for the deep-nesting rule. */
  readonly nestingSites: readonly NestingSite[];
  /** The deepest control-flow nesting anywhere in the document. */
  readonly maxNestingDepth: number;
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
  /**
   * `blade.trace.server`.
   *
   * The manifest has contributed this since the first release and nothing read
   * it: sixteen unconditional `console.log` calls sat on the per-request path,
   * one of them formatting the first five completion labels purely to log them.
   */
  trace: TraceLevel;
}

/** Verbosity of server-side logging, from `blade.trace.server`. */
export type TraceLevel = 'off' | 'messages' | 'verbose';

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
  /**
   * The offset the position resolves to.
   *
   * Carried rather than recomputed: four helpers used to convert the position
   * back to an offset independently, each splitting the document to do it.
   */
  offset: number;
  triggerCharacter?: string;
  /** Computed context */
  contextKind: CompletionContextKind;
  scopeVariables: readonly ScopeVariable[];
  /** Text being typed */
  partialToken?: string;
  /** For `expression-path`, the path being drilled into, without a trailing dot. */
  basePath?: string;
  /** For `html-attribute` and `component-prop`, the tag being edited. */
  tagName?: string;
  /**
   * Whether a `$` sigil has already been typed before the partial token.
   *
   * Completions inside `${...}` must not insert another one; the old adapter
   * prefixed every item in an expression context, so completing a helper
   * inside a block expression produced `${$formatCurrency}`.
   */
  sigil?: boolean;
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
  | 'FILE_TOO_LARGE'
  | 'INVALID_SAMPLE'
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
  trace: 'off',
};

/**
 * Create an empty document scope
 */
export function createEmptyScope(): DocumentScope {
  return {
    segments: [],
    declarations: [],
    components: [],
    componentUsages: [],
    helperCalls: [],
    usedVariables: new Set(),
    helpersUsed: new Set(),
    nestingSites: [],
    maxNestingDepth: 0,
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
