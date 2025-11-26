# Data Model: Blade Language Server (LSP)

**Feature**: 003-blade-lsp
**Date**: 2025-11-25

## Overview

This document defines the data structures and type definitions for the Blade LSP server.

## Core Types

### BladeDocument

Represents a parsed .blade file in the LSP workspace.

```typescript
interface BladeDocument {
  uri: string;                          // Document URI (file://...)
  version: number;                      // Incremental version for sync
  content: string;                      // Raw text content
  ast: TemplateNode[] | null;           // Parsed AST (null if parse failed)
  errors: ParseError[];                 // Parse errors
  components: Map<string, ComponentDefinition>;  // Defined components
  scope: DocumentScope;                 // Analyzed scope information
  lastParsed: number;                   // Timestamp of last parse
}
```

### DocumentScope

Scope analysis for a document.

```typescript
interface DocumentScope {
  // Variables available at each position
  variables: Map<number, ScopeVariable[]>;  // offset → variables

  // Components defined in this document
  components: ComponentInfo[];

  // Component usages (for references)
  componentUsages: ComponentUsage[];

  // Helper calls (for references)
  helperCalls: HelperCall[];
}

interface ScopeVariable {
  name: string;
  kind: 'let' | 'for-item' | 'for-index' | 'for-key' | 'prop' | 'data' | 'global';
  location: SourceLocation;
  valueType?: string;  // Inferred or declared type
}

interface ComponentInfo {
  name: string;
  props: PropInfo[];
  slots: SlotInfo[];
  location: SourceLocation;
}

interface PropInfo {
  name: string;
  required: boolean;
  defaultValue?: string;
}

interface SlotInfo {
  name: string | null;  // null = default slot
  location: SourceLocation;
}

interface ComponentUsage {
  componentName: string;
  location: SourceLocation;
  props: Record<string, SourceLocation>;
}

interface HelperCall {
  helperName: string;
  location: SourceLocation;
}
```

### WorkspaceIndex

Global index across all .blade files in workspace.

```typescript
interface WorkspaceIndex {
  // All documents by URI
  documents: Map<string, BladeDocument>;

  // Component name → defining document URI
  componentIndex: Map<string, string>;

  // Helper name → definition location (from config)
  helperIndex: Map<string, HelperDefinition>;

  // Data schema (from configuration)
  dataSchema: DataSchema | null;

  // Configuration
  config: LspConfig;
}

interface HelperDefinition {
  name: string;
  signature: string;
  description?: string;
  deprecated?: boolean;
  deprecatedMessage?: string;
  sourceFile?: string;
}

interface DataSchema {
  // JSON Schema-like definition of available data
  type: 'object';
  properties: Record<string, SchemaProperty>;
}

interface SchemaProperty {
  type: string | string[];
  description?: string;
  properties?: Record<string, SchemaProperty>;  // For nested objects
  items?: SchemaProperty;                        // For arrays
}
```

### LSP Configuration

```typescript
interface LspConfig {
  // Diagnostic settings
  diagnostics: {
    enabled: boolean;
    unusedVariables: 'error' | 'warning' | 'hint' | 'off';
    deprecatedHelpers: 'error' | 'warning' | 'hint' | 'off';
    potentiallyUndefined: 'warning' | 'hint' | 'off';
    deepNesting: 'warning' | 'hint' | 'off';
    deepNestingThreshold: number;  // Default: 4
  };

  // Completion settings
  completion: {
    dataSchemaPath?: string;      // Path to JSON schema file
    helpersDefinitionPath?: string; // Path to helpers .d.ts or JSON
    snippets: boolean;            // Enable snippet completions
  };

  // Performance settings
  performance: {
    debounceMs: number;           // Parse debounce (default: 200)
    maxFileSize: number;          // Max file size to parse (default: 1MB)
  };
}
```

## Completion Types

### CompletionContext

Context for generating completions.

```typescript
interface CompletionContext {
  document: BladeDocument;
  position: Position;
  triggerCharacter?: string;

  // Computed context
  contextKind: CompletionContextKind;
  scopeVariables: ScopeVariable[];
  partialToken?: string;  // Text being typed
}

type CompletionContextKind =
  | 'expression'           // Inside ${...}
  | 'expression-path'      // After ${user.
  | 'directive'            // After @
  | 'directive-argument'   // Inside @if(...)
  | 'html-tag'             // After <
  | 'html-attribute'       // Inside <div ...>
  | 'html-attribute-value' // Inside attribute="..." or ={...}
  | 'component-prop'       // Inside <MyComponent ...>
  | 'slot-name'            // Inside <slot name="...">
  | 'text';                // Plain text content

interface CompletionResult {
  items: CompletionItem[];
  isIncomplete: boolean;
}
```

## Diagnostic Types

### DiagnosticInfo

Extended diagnostic information.

```typescript
interface DiagnosticInfo {
  range: Range;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  source: 'blade';

  // Additional data
  relatedInformation?: RelatedInfo[];
  data?: {
    quickFix?: QuickFix[];
  };
}

interface RelatedInfo {
  location: Location;
  message: string;
}

interface QuickFix {
  title: string;
  edits: TextEdit[];
}

// Diagnostic codes
type DiagnosticCode =
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
  | 'CIRCULAR_COMPONENT';
```

## TextMate Grammar Scopes

Standard scopes for syntax highlighting.

```typescript
// Blade-specific scopes (mapping to standard TextMate scopes)
const BLADE_SCOPES = {
  // Directives
  'directive.keyword': 'keyword.control.blade',           // @if, @for, @match
  'directive.block': 'meta.block.directive.blade',

  // Expressions
  'expression.delimiter': 'punctuation.section.embedded.blade',  // ${ }
  'expression.content': 'meta.embedded.expression.blade',
  'expression.path': 'variable.other.blade',              // user.name
  'expression.operator': 'keyword.operator.blade',        // +, -, *, etc.

  // Components
  'component.name': 'entity.name.type.class.blade',       // <MyComponent>
  'component.prop': 'entity.other.attribute-name.blade',

  // HTML (inherit)
  'html.tag': 'entity.name.tag.html',
  'html.attribute': 'entity.other.attribute-name.html',
  'html.string': 'string.quoted.double.html',

  // Comments
  'comment': 'comment.block.html',

  // Strings
  'string.single': 'string.quoted.single.blade',
  'string.double': 'string.quoted.double.blade',
  'string.template': 'string.template.blade',
};
```

## State Transitions

### Document Lifecycle

```
File Opened
    │
    ▼
┌─────────────────────┐
│  Create Document    │ ← URI, content, version=1
│  (empty AST)        │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Parse Document     │ ← parseTemplate(content)
│  (generate AST)     │
└─────────────────────┘
    │
    ├──► Success ─────────────────┐
    │                             │
    ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Analyze Scope      │    │  Store AST          │
│  (variables, refs)  │    │  (components, etc)  │
└─────────────────────┘    └─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Generate           │ ← Sync to client
│  Diagnostics        │
└─────────────────────┘
    │
    ├──► On Edit ─────────────────┐
    │                             │
    ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Debounce (200ms)   │    │  Update Content     │
│                     │    │  Increment Version  │
└─────────────────────┘    └─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Re-parse           │ ← Full or incremental
└─────────────────────┘
    │
    ├──► On Close ────────────────┐
    │                             │
    ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Remove from Index  │    │  Dispose Resources  │
└─────────────────────┘    └─────────────────────┘
```

### Completion Request Flow

```
Completion Request
    │
    ▼
┌─────────────────────┐
│  Get Document       │ ← From workspace index
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Determine Context  │ ← Analyze cursor position
│  (expression, dir)  │
└─────────────────────┘
    │
    ├──► Expression Context ──┬──► Directive Context
    │                         │
    ▼                         ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Collect Scope      │    │  Suggest Directives │
│  Variables          │    │  (@if, @for, etc)   │
└─────────────────────┘    └─────────────────────┘
    │
    ├──► After '.' ───────────────┐
    │                             │
    ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Resolve Object     │    │  Suggest Properties │
│  Type/Schema        │    │  from Schema        │
└─────────────────────┘    └─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Add Helper         │ ← From helperIndex
│  Suggestions        │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Return Items       │ ← CompletionResult
└─────────────────────┘
```

## Validation Rules

| Context | Rule | Diagnostic |
|---------|------|------------|
| Document | Parse succeeds | PARSE_ERROR |
| HTML | Tags are closed | UNCLOSED_TAG |
| Expression | Valid syntax | INVALID_EXPRESSION |
| Directive | Valid syntax and arguments | INVALID_DIRECTIVE |
| Component | Exists in index | UNKNOWN_COMPONENT |
| Component | Required props provided | MISSING_REQUIRED_PROP |
| Variable | Used at least once | UNUSED_VARIABLE |
| Helper | Not deprecated | DEPRECATED_HELPER |
| @if nesting | Depth <= threshold | DEEP_NESTING |
| Component | No circular dependencies | CIRCULAR_COMPONENT |
