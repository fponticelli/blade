# Quickstart: Project-based Template Compilation

**Branch**: `005-project-template-compilation` | **Date**: 2025-11-26

## Overview

This guide explains how to use project-based template compilation in Blade, including multi-file projects, the `@props` directive, dot-notation namespacing, and LSP features.

---

## Project Structure

A Blade project is any folder containing an `index.blade` file:

```
my-template/
├── index.blade              # Entry point (required)
├── button.blade             # <Button /> component
├── card.blade               # <Card /> component
├── schema.json              # Optional: JSON Schema for props
├── samples/                 # Optional: Example data
│   ├── default.json
│   └── admin.json
└── components/              # Nested components
    ├── badge.blade          # <Components.Badge />
    └── form/
        ├── input.blade      # <Components.Form.Input />
        └── select.blade     # <Components.Form.Select />
```

---

## Basic Usage

### Compiling a Project

```typescript
import { compileProject, render } from 'blade'

// Compile the project
const result = await compileProject('/path/to/my-template')

if (!result.success) {
  console.error('Compilation errors:', result.errors)
  process.exit(1)
}

// Render with data
const html = render(result.ast, {
  user: { name: 'John', email: 'john@example.com' },
  items: [{ id: 1, name: 'Item 1' }]
})
```

### Single File with Project Context

```typescript
import { compile } from 'blade'

// Compile a single file with access to project components
const result = compile(templateSource, {
  projectRoot: '/path/to/my-template'
})
```

---

## The @props Directive

Declare component inputs at the start of any `.blade` file:

### Basic Props

```blade
@props($label, $href)

<a href={$href}>{$label}</a>
```

### Props with Defaults

```blade
@props($label, $disabled = false, $size = "medium")

<button disabled={$disabled} class={"btn-" + $size}>
  {$label}
</button>
```

### Using the Component

```blade
{{-- index.blade --}}
<Button label="Click me" />
<Button label="Submit" disabled={true} size="large" />
```

### Prop Inference

If `@props` is omitted, all `$variables` are inferred as required:

```blade
{{-- button.blade (no @props) --}}
<button>{$label}</button>  {{-- $label inferred as required --}}
```

---

## Dot-notation Namespacing

Nested folders create namespaced components:

```
components/
├── form/
│   ├── input.blade    → <Components.Form.Input />
│   └── select.blade   → <Components.Form.Select />
└── badge.blade        → <Components.Badge />
```

### Folder Name Conversion

| Folder Name | Component Prefix |
|-------------|------------------|
| `form` | `Form` |
| `form-helpers` | `FormHelpers` |
| `form_utils` | `FormUtils` |

### Usage

```blade
{{-- index.blade --}}
<Components.Form.Input name="email" placeholder="Enter email" />
<Components.Badge variant="success">Active</Components.Badge>
```

---

## Project Boundaries

Subfolders with their own `index.blade` are **separate projects**:

```
my-template/
├── index.blade           # Project 1 entry
├── button.blade          # Available as <Button />
└── admin/
    ├── index.blade       # Project 2 entry (separate!)
    └── sidebar.blade     # NOT available in parent project
```

To compile the nested project:

```typescript
await compileProject('/path/to/my-template/admin')
```

---

## Schema Integration

Create `schema.json` to define prop types for LSP intelligence:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "User's full name" },
        "email": { "type": "string", "format": "email" }
      },
      "required": ["name"]
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "number" },
          "title": { "type": "string" }
        }
      }
    }
  }
}
```

### LSP Benefits

With `schema.json`, the LSP provides:
- Property completions after `$user.`
- Type information on hover
- Validation of sample files

---

## Sample Data

Add example data files to `samples/` for hover hints:

```json
// samples/default.json
{
  "user": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "items": [
    { "id": 1, "title": "First Item" }
  ]
}

// samples/admin.json
{
  "user": {
    "name": "Admin User",
    "email": "admin@example.com"
  }
}
```

Hovering over `$user.name` in VS Code shows:
```
$user.name
Type: string
Examples: "John Doe" (default), "Admin User" (admin)
```

---

## Error Handling

### Missing Component

```
Error: Component 'Card' not found.
  Expected at: ./card.blade
  Searched in: /path/to/my-template/

  Tip: If this is a project component, ensure compileProject() is used.
```

### Missing Required Prop

```
Error: Missing required prop 'label' for component 'Button'.
  Used at: index.blade:15:3
  Defined at: button.blade:1 (@props($label, $disabled = false))
```

### @props Syntax Error

```
Warning: Invalid @props syntax at button.blade:1.
  Falling back to prop inference.
  Found: $label, $href (treated as required)
```

---

## LSP Features

### Component Completions

Type `<` to see available components:
```
<Bu|
  → Button
  → Components.Badge
  → Components.Form.Input
```

### Prop Completions

Inside a component tag, get prop suggestions:
```blade
<Button |
  → label (required)
  → disabled (default: false)
  → size (default: "medium")
```

### Go-to-Definition

Ctrl+Click on a component tag to jump to its `.blade` file.

### Hover Information

Hover over variables for type and example information from schema and samples.

---

## API Reference

### compileProject(path, options?)

```typescript
interface ProjectOptions {
  entry?: string  // Default: 'index.blade'
}

interface ProjectResult {
  ast: RootNode
  context: ProjectContext
  warnings: Diagnostic[]
  errors: Diagnostic[]
  success: boolean
}
```

### compile(source, options?)

```typescript
interface CompileOptions {
  projectRoot?: string  // Enable component resolution
}
```

### discoverComponents(path)

```typescript
const components = await discoverComponents('/path/to/project')
// Map<string, ComponentInfo>
```

---

## Best Practices

1. **Always use @props**: Explicit declarations prevent inference surprises
2. **Organize by feature**: Use folders for related components
3. **Add schema.json**: Enables rich LSP support
4. **Include samples**: Helps with debugging and documentation
5. **Keep components small**: One responsibility per component
