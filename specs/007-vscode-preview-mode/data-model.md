# Data Model: VSCode Preview Mode

**Feature**: 007-vscode-preview-mode
**Date**: 2025-11-27

## Entities

### PreviewState

Represents the current state of a preview panel instance.

| Field | Type | Description |
|-------|------|-------------|
| panel | WebviewPanel | The VSCode webview panel instance |
| projectRoot | string | Absolute path to the Blade project root |
| activeFile | string | Path to the currently previewed .blade file |
| selectedSample | string \| null | Name of the selected sample JSON file |
| lastSuccessfulHtml | string \| null | Last successful render output |
| isLoading | boolean | Whether a render is in progress |

### SampleFile

Represents a sample JSON file from the project's samples/ folder.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Filename without path (e.g., "summer-sale.json") |
| path | string | Absolute path to the file |
| data | object | Parsed JSON content |
| isValid | boolean | Whether JSON parsing succeeded |
| error | string \| null | Parsing error if invalid |

### RenderResult

Result of template compilation and rendering.

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether rendering succeeded |
| html | string \| null | Rendered HTML output if successful |
| errors | RenderError[] | List of errors if failed |
| warnings | RenderWarning[] | Non-fatal warnings |
| renderTime | number | Time taken in milliseconds |

### RenderError

Represents a compilation or runtime error.

| Field | Type | Description |
|-------|------|-------------|
| message | string | Human-readable error message |
| line | number \| null | Source line number if available |
| column | number \| null | Source column if available |
| file | string \| null | Source file path if not main template |
| type | ErrorType | 'syntax' \| 'validation' \| 'runtime' |

## State Transitions

### Preview Panel Lifecycle

```
[Closed] ──activate──▶ [Loading] ──success──▶ [Rendered]
                           │                      │
                           │ error                │ file change
                           ▼                      ▼
                       [Error] ◀──error──── [Rendering]
                           │                      │
                           │ retry/fix            │ success
                           ▼                      ▼
                       [Loading] ────────▶ [Rendered]
```

### Sample Selection Flow

```
[No Sample] ──load samples──▶ [Samples Available]
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
            [First Selected]              [Restored from State]
                    │                                   │
                    └─────────▶ [Sample Active] ◀───────┘
                                      │
                              user selects different
                                      ▼
                               [Sample Changed]
                                      │
                                 re-render
                                      ▼
                               [Sample Active]
```

## Relationships

```
PreviewState
    │
    ├── 1:1 ── WebviewPanel
    │
    ├── 1:N ── SampleFile (available samples)
    │
    └── 1:1 ── RenderResult (current render)
              │
              └── 1:N ── RenderError

BladeProject (existing)
    │
    ├── 1:1 ── schema.json
    │
    ├── 1:N ── *.blade files
    │
    └── 1:N ── samples/*.json ──▶ SampleFile
```

## Validation Rules

### Sample Data Validation

1. **JSON Validity**: Sample file must parse as valid JSON
2. **Schema Compliance**: If schema.json exists, sample data should match schema (warning, not error)
3. **Required Props**: Sample data must provide all required props for the template

### Template Validation

1. **Syntax**: Template must parse without syntax errors
2. **Component Resolution**: All referenced components must exist in project
3. **Expression Safety**: Expressions must not cause runtime errors with sample data

## Persistence

### Workspace State Keys

| Key Pattern | Value Type | Description |
|-------------|------------|-------------|
| `blade.preview.sample.{projectHash}` | string | Selected sample filename |
| `blade.preview.lastFile.{projectHash}` | string | Last previewed file path |

Where `{projectHash}` is a hash of the project root path for uniqueness.
