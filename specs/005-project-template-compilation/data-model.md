# Data Model: Project-based Template Compilation

**Branch**: `005-project-template-compilation` | **Date**: 2025-11-26

## Overview

This document defines the data structures for project-based template compilation, extending the existing Blade AST types.

---

## New AST Types

### PropDeclaration

Represents a single prop declared in `@props()` directive.

```typescript
interface PropDeclaration {
  /** Variable name without $ prefix */
  name: string

  /** Whether the prop is required (no default value) */
  required: boolean

  /** Default value expression (if not required) */
  defaultValue: ExpressionNode | undefined

  /** Source location of the declaration */
  location: SourceLocation
}
```

**Relationships**:
- Attached to `RootNode` for file-level props
- Used by `ComponentInfo` for discovered components

### PropsDirective

AST node for the `@props()` directive itself.

```typescript
interface PropsDirective {
  type: 'PropsDirective'

  /** Declared props */
  props: PropDeclaration[]

  /** Source location */
  location: SourceLocation
}
```

**Lifecycle**:
1. Parsed from template source by `PropsParser`
2. Attached to `RootNode.propsDirective`
3. Used during component validation and LSP completion

---

## Project Types

### ProjectConfig

Configuration for a Blade project.

```typescript
interface ProjectConfig {
  /** Absolute path to project root (folder containing index.blade) */
  rootPath: string

  /** Entry point filename (default: 'index.blade') */
  entry: string

  /** Parsed JSON Schema from schema.json (if present) */
  schema: JsonSchema | undefined

  /** Loaded sample data from samples/*.json */
  samples: Map<string, unknown>
}
```

### ComponentInfo

Information about a discovered component.

```typescript
interface ComponentInfo {
  /** Tag name for usage (e.g., 'Button', 'Components.Form.Input') */
  tagName: string

  /** Absolute path to .blade file */
  filePath: string

  /** Resolved namespace segments (e.g., ['Components', 'Form', 'Input']) */
  namespace: string[]

  /** Parsed props (lazy-loaded on first access) */
  props: PropDeclaration[] | undefined

  /** Whether props were inferred (no @props directive) */
  propsInferred: boolean
}
```

**State Transitions**:
1. `DISCOVERED`: File found, props not parsed
2. `PARSED`: Props extracted from file
3. `ERROR`: File couldn't be parsed (stored with error diagnostic)

### ProjectContext

Runtime context for project compilation.

```typescript
interface ProjectContext {
  /** Project configuration */
  config: ProjectConfig

  /** Discovered components keyed by tag name */
  components: Map<string, ComponentInfo>

  /** Components passed via template (shadow discovered) */
  templateComponents: Map<string, ComponentDefinition>

  /** Collected warnings during discovery */
  warnings: Diagnostic[]

  /** Collected errors during discovery */
  errors: Diagnostic[]
}
```

---

## Extended RootNode

The existing `RootNode` is extended with project-aware fields.

```typescript
interface RootNode {
  // ... existing fields ...

  /** @props directive at file start (if present) */
  propsDirective: PropsDirective | undefined

  /** Inferred props (if no @props directive) */
  inferredProps: PropDeclaration[] | undefined

  /** Project context (only set when compiled with project) */
  projectContext: ProjectContext | undefined
}
```

---

## JSON Schema Types (Subset)

Minimal types for extracting completion information from schema.json.

```typescript
interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
}

interface SchemaPropertyInfo {
  /** Path from root (e.g., ['user', 'name']) */
  path: string[]

  /** JSON Schema type(s) */
  type: string | string[]

  /** Whether required in parent object */
  required: boolean

  /** Description from schema */
  description: string | undefined

  /** Possible enum values */
  enumValues: unknown[] | undefined
}
```

---

## LSP Types

### ProjectLspContext

LSP-specific project context with caching.

```typescript
interface ProjectLspContext {
  /** Underlying project context */
  project: ProjectContext

  /** Flattened schema properties for completion */
  schemaProperties: SchemaPropertyInfo[]

  /** Sample values keyed by path (e.g., 'user.name' → ['John', 'Jane']) */
  sampleValues: Map<string, unknown[]>

  /** Last modification time for cache invalidation */
  lastUpdated: number
}
```

### ComponentCompletionItem

Completion item for component tags.

```typescript
interface ComponentCompletionItem {
  /** Tag name to insert */
  tagName: string

  /** Required props for snippet generation */
  requiredProps: string[]

  /** Optional props for documentation */
  optionalProps: Array<{ name: string; default: string }>

  /** File path for go-to-definition */
  filePath: string
}
```

---

## Validation Rules

### PropDeclaration Validation

| Field | Rule |
|-------|------|
| name | Must be valid identifier (alphanumeric + underscore, not starting with number) |
| required | Mutually exclusive with defaultValue being defined |
| defaultValue | Must be valid expression (parsed by ExpressionParser) |

### ComponentInfo Validation

| Field | Rule |
|-------|------|
| tagName | Must start with uppercase letter; dot-separated segments each start uppercase |
| filePath | Must exist and be readable .blade file |
| namespace | Must match folder structure |

### ProjectConfig Validation

| Field | Rule |
|-------|------|
| rootPath | Must be absolute path to existing directory |
| entry | Must exist as file in rootPath |
| schema | If present, must be valid JSON and valid JSON Schema |

---

## Relationships Diagram

```
ProjectContext
    │
    ├── config: ProjectConfig
    │       ├── rootPath
    │       ├── entry
    │       ├── schema ──────────────────┐
    │       └── samples                  │
    │                                    ▼
    └── components: Map<tagName, ComponentInfo>
            │                        JsonSchema
            ├── tagName                  │
            ├── filePath                 └── SchemaPropertyInfo[]
            ├── namespace
            └── props: PropDeclaration[]
                    ├── name
                    ├── required
                    └── defaultValue: ExpressionNode

RootNode (extended)
    ├── children: TemplateNode[]
    ├── components: Map (existing inline definitions)
    ├── propsDirective: PropsDirective ──► PropDeclaration[]
    ├── inferredProps: PropDeclaration[]
    └── projectContext: ProjectContext (when compiled with project)
```

---

## Sample Data Structure

Example of how data flows through the system:

```
Project folder:
  my-template/
  ├── index.blade         → RootNode with propsDirective
  ├── button.blade        → ComponentInfo { tagName: 'Button', ... }
  ├── schema.json         → ProjectConfig.schema
  └── components/
      └── form/
          └── input.blade → ComponentInfo { tagName: 'Components.Form.Input', ... }

Compilation:
  compileProject('/path/to/my-template')
    → ProjectContext {
        config: { rootPath, entry: 'index.blade', schema, samples },
        components: Map {
          'Button' → { filePath: '.../button.blade', props: [...] },
          'Components.Form.Input' → { filePath: '.../components/form/input.blade', ... }
        }
      }
    → RootNode with resolved ComponentNodes
```
