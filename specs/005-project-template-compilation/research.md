# Research: Project-based Template Compilation

**Branch**: `005-project-template-compilation` | **Date**: 2025-11-26

## Research Summary

This document captures technical decisions and patterns for implementing project-based template compilation in Blade.

---

## 1. @props Directive Syntax Design

**Decision**: Use `@props($var1, $var2 = defaultExpr, ...)` syntax at file start

**Rationale**:
- Consistent with existing Blade directive syntax (`@if`, `@for`, `@match`)
- `$` prefix aligns with existing variable syntax
- Default values use existing expression syntax
- Placement at file start enables fast scanning without full parse

**Alternatives Considered**:
- `<props>` element: Rejected - conflicts with component syntax; not a directive
- JSDoc-style `/** @prop {type} name */`: Rejected - requires separate comment parser; type syntax not defined
- TypeScript-style interface: Rejected - introduces new syntax paradigm

**Implementation Pattern**:
```blade
@props($label, $disabled = false, $items = [])

<button disabled={$disabled}>{$label}</button>
```

Parsing approach:
1. Tokenize `@props(` as directive start
2. Parse comma-separated prop definitions
3. Each prop: `$name` or `$name = expression`
4. Store as `PropDeclaration[]` on AST root

---

## 2. Component Discovery Strategy

**Decision**: Lazy discovery with caching at compilation time

**Rationale**:
- Only scan filesystem when project compilation requested
- Cache discovered components for duration of compile call
- Avoid filesystem watchers in compiler (LSP handles live updates separately)
- Simple mental model: compile starts fresh, LSP maintains state

**Alternatives Considered**:
- Eager discovery on import: Rejected - unnecessary overhead for single-file compilation
- Global singleton cache: Rejected - complicates testing; thread-safety concerns
- Manifest file (components.json): Rejected - extra maintenance burden; conflicts with convention-over-configuration

**Discovery Algorithm**:
```
discoverComponents(projectRoot):
  components = {}

  for each .blade file in projectRoot (excluding index.blade):
    tagName = toPascalCase(filename without extension)
    components[tagName] = { path, props: null }  // props parsed on demand

  for each subfolder in projectRoot:
    if subfolder contains index.blade:
      skip (separate project boundary)
    else:
      prefix = toPascalCase(folderName)
      recurse with prefix prepended (Prefix.ComponentName)

  return components
```

---

## 3. Dot-notation Resolution

**Decision**: Map dots to directory separators with PascalCase normalization

**Rationale**:
- `<Components.Form.Input />` → `components/form/input.blade`
- Each segment normalized: `form-helpers` → `FormHelpers`
- Case-insensitive filesystem matching (important for macOS/Windows)
- Matches intuitive mental model of folder = namespace

**Alternatives Considered**:
- Explicit namespace declarations: Rejected - adds boilerplate; violates convention-over-configuration
- Flat namespace with prefixes (ComponentsFormInput): Rejected - loses hierarchy visibility

**Normalization Rules**:
- `kebab-case` → `PascalCase`: `form-input` → `FormInput`
- `snake_case` → `PascalCase`: `form_input` → `FormInput`
- `camelCase` → `PascalCase`: `formInput` → `FormInput`
- Already `PascalCase`: unchanged

**Resolution Priority** (for conflict handling):
1. Template-passed components (`<template:X>`) - closest scope
2. Auto-loaded project components - filesystem order (first match wins)

---

## 4. JSON Schema Integration for LSP

**Decision**: Use JSON Schema draft-07 for `schema.json`; extract types for LSP completions

**Rationale**:
- Industry standard, well-documented
- Existing TypeScript tooling for JSON Schema parsing
- Sufficient for property completions (object shapes, property names, types)
- No new dependencies needed (use built-in JSON parsing + simple schema walker)

**Alternatives Considered**:
- TypeScript type definitions: Rejected - requires TypeScript compiler dependency; overkill for completion hints
- Custom schema format: Rejected - unnecessary invention; learning curve
- Infer from samples only: Rejected - less precise; can't express optionality/constraints

**Schema Usage**:
```json
// schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" }
      },
      "required": ["name"]
    },
    "items": {
      "type": "array",
      "items": { "type": "object", "properties": { "id": { "type": "number" } } }
    }
  }
}
```

LSP extracts:
- Property paths: `$user.name`, `$user.email`, `$items[*].id`
- Types for hover/validation hints
- Required vs optional markers

---

## 5. Sample Data for Hover Hints

**Decision**: Load all `samples/*.json` files; show values on hover

**Rationale**:
- Multiple samples show range of possible values
- Non-normative (doesn't affect compilation)
- Simple implementation: read JSON, extract path values

**Alternatives Considered**:
- Single `sample.json`: Rejected - less flexible; can't show variations
- Inline examples in schema: Rejected - JSON Schema `examples` field is less discoverable

**Hover Format**:
```
$user.name
Type: string (from schema)
Examples: "John Doe" (default.json), "Admin User" (admin.json)
```

---

## 6. Project Boundary Detection

**Decision**: Folder with `index.blade` = project root; nested `index.blade` = separate project

**Rationale**:
- Clear, unambiguous signal
- Enables nested projects for monorepo-style organization
- No configuration files needed

**Edge Cases**:
- No `index.blade` in folder passed to `compileProject()` → error with clear message
- Symlinks → follow symlinks, treat target as source of truth
- Hidden folders (`.name`) → skip during discovery

---

## 7. Error Message Design

**Decision**: Include component name, expected path, and actionable suggestions

**Rationale**:
- Matches Constitution V (Developer Experience)
- Reduces debugging time

**Error Templates**:

```
Component 'Card' not found.
  Expected at: ./card.blade or ./Card.blade
  Searched in: /path/to/project/

  Tip: If this is a project component, ensure compileProject() is used
  or specify the projectRoot option in compile().
```

```
Missing required prop 'label' for component 'Button'.
  Used at: index.blade:15:3
  Defined at: button.blade:1 (@props($label, $disabled = false))
```

---

## 8. LSP Project Context Management

**Decision**: Maintain project context per workspace folder; refresh on file changes

**Rationale**:
- VS Code workspaces can have multiple project roots
- LSP already has document change notifications
- Cache invalidation: any .blade file change → re-scan project

**Implementation**:
- `WorkspaceAnalyzer` maintains `Map<projectRoot, ProjectContext>`
- `ProjectContext` holds discovered components, parsed schemas, loaded samples
- On document change → invalidate context for containing project
- Lazy re-initialization on next completion/hover request

---

## 9. Variable Inference (Fallback for missing @props)

**Decision**: Collect all `$variable` references in template; treat as required props

**Rationale**:
- Backwards compatible with templates without `@props`
- Simple heuristic that works for most cases
- Clear escalation path: add `@props()` for explicit control

**Algorithm**:
```
inferProps(ast):
  variables = collectPathNodes(ast)
    .filter(node => node.path[0].startsWith('$'))
    .map(node => node.path[0])
    .deduplicate()

  // Exclude built-in variables if any exist in future
  return variables.map(name => ({ name, required: true, default: undefined }))
```

---

## 10. Compilation API Design

**Decision**: Add `compileProject(path)` alongside existing `compile(source, options)`

**Rationale**:
- Clear separation of concerns
- `compile()` remains simple for single-file use
- `compileProject()` handles filesystem orchestration

**API Signatures**:

```typescript
// Existing
function compile(source: string, options?: CompileOptions): CompileResult

// New
function compileProject(projectPath: string, options?: ProjectOptions): ProjectResult

interface ProjectOptions {
  // Override entry point (default: 'index.blade')
  entry?: string
}

interface ProjectResult {
  // Compiled AST for entry point with all components resolved
  ast: RootNode
  // Discovered components
  components: Map<string, ComponentInfo>
  // Warnings (e.g., @props syntax errors that fell back to inference)
  warnings: Diagnostic[]
  // Errors (missing components, missing required props)
  errors: Diagnostic[]
}

// Extended compile options
interface CompileOptions {
  // ... existing options
  projectRoot?: string  // Enable component resolution from project
}
```

---

## Dependencies

No new runtime dependencies required:
- Filesystem access: Node.js `fs/promises` (already used in tests)
- JSON parsing: Built-in `JSON.parse`
- JSON Schema validation for samples: Simple recursive walker (no ajv needed for basic validation)

Dev dependencies (existing):
- vitest for testing
- TypeScript for types

---

## Open Questions (Resolved)

1. ~~Should `@props()` support type annotations?~~ → No, keep simple; types come from schema.json
2. ~~Case sensitivity for component names?~~ → Case-insensitive matching on filesystem
3. ~~What if schema.json has invalid JSON?~~ → Report diagnostic, disable schema features for that project
4. ~~Samples with non-JSON files?~~ → Ignore non-.json files in samples/
