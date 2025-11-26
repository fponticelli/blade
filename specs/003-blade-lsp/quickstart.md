# Quickstart: Blade Language Server (LSP)

**Feature**: 003-blade-lsp
**Date**: 2025-11-25

## Overview

This guide shows how to use the Blade LSP in VS Code after implementation.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Blade Templates"
4. Click Install

### From VSIX (Development)

```bash
cd packages/blade-vscode
npm run package
code --install-extension blade-vscode-0.1.0.vsix
```

## Basic Usage

### File Association

Files with `.blade` extension are automatically recognized. You can also manually associate files:

```json
// settings.json
{
  "files.associations": {
    "*.blade.html": "blade"
  }
}
```

### Syntax Highlighting

Open any `.blade` file to see:
- HTML elements highlighted as HTML
- Directives (`@if`, `@for`, `@match`) highlighted as keywords
- Expressions (`${...}`) highlighted with embedded JS coloring
- Components (`<MyComponent>`) highlighted as types

### Autocompletion

**Expression Completion** (inside `${...}`):
- Type `${` then start typing to see variables
- After a dot (e.g., `${user.`), see object properties
- Helpers are suggested with signatures

**Directive Completion** (after `@`):
- Type `@` to see all directives
- Snippets auto-insert proper structure:
  ```
  @if(|) {

  }
  ```

**HTML Completion**:
- Standard HTML tags and attributes
- Dynamic attributes supported: `class={expression}`

**Component Completion**:
- Type `<` and component names are suggested
- Inside component tags, props are suggested

### Diagnostics

Errors appear as you type:
- Syntax errors (red squiggles)
- Unknown components (red)
- Unused variables (gray/dim)
- Deprecated helpers (yellow strike-through)

### Navigation

**Go to Definition** (F12 or Ctrl+Click):
- On component usage → jumps to `@component` definition
- On variable → jumps to `@let` or `@for` declaration
- On helper → jumps to helper definition (if source available)

**Find References** (Shift+F12):
- On component definition → lists all usages
- On variable declaration → lists all usages

**Hover** (mouse hover):
- Variables show inferred type
- Helpers show signature and description
- Components show props documentation

## Configuration

### VS Code Settings

```json
{
  // Enable/disable diagnostics
  "blade.lsp.diagnostics.enabled": true,

  // Lint rule severities
  "blade.lsp.diagnostics.unusedVariables": "warning",
  "blade.lsp.diagnostics.deprecatedHelpers": "warning",
  "blade.lsp.diagnostics.potentiallyUndefined": "hint",
  "blade.lsp.diagnostics.deepNesting": "warning",
  "blade.lsp.diagnostics.deepNestingThreshold": 4,

  // Enhanced completions with schema
  "blade.lsp.completion.dataSchemaPath": "./blade-schema.json",
  "blade.lsp.completion.helpersDefinitionPath": "./blade-helpers.json",

  // Enable snippet completions
  "blade.lsp.completion.snippets": true
}
```

### Data Schema (Optional)

Provide a JSON schema for better data completions:

```json
// blade-schema.json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "description": "Current user",
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" },
        "roles": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "number" },
          "name": { "type": "string" }
        }
      }
    }
  }
}
```

Now `${user.` will suggest `name`, `email`, `roles`.

### Helpers Definition (Optional)

Define helpers for completion:

```json
// blade-helpers.json
{
  "helpers": [
    {
      "name": "formatCurrency",
      "signature": "(amount: number, currency?: string) => string",
      "description": "Format number as currency string"
    },
    {
      "name": "formatDate",
      "signature": "(date: Date | string, format?: string) => string",
      "description": "Format date according to locale"
    },
    {
      "name": "truncate",
      "signature": "(text: string, length: number) => string",
      "description": "Truncate text with ellipsis",
      "deprecated": true,
      "deprecatedMessage": "Use 'ellipsize' helper instead"
    }
  ]
}
```

## Example Template

```blade
@component Card(title, subtitle, actions)
  <div class="card">
    <div class="card-header">
      <h2>${title}</h2>
      @if(subtitle) {
        <p class="subtitle">${subtitle}</p>
      }
    </div>
    <div class="card-body">
      <slot />
    </div>
    @if(actions) {
      <div class="card-actions">
        <slot name="actions" />
      </div>
    }
  </div>
@end

@@ { greeting = "Hello" }
@@ { total = items.reduce((sum, item) => sum + item.price, 0) }

<main>
  <h1>${greeting}, ${user.name}!</h1>

  @for(item, index of items) {
    <Card title={item.name} subtitle={formatCurrency(item.price)}>
      <p>${item.description}</p>

      @if(item.inStock) {
        <button>Add to Cart</button>
      } @else {
        <span class="out-of-stock">Out of Stock</span>
      }
    </Card>
  }

  @match(user.role) {
    when "admin" {
      <AdminPanel />
    }
    when "editor" {
      <EditorTools />
    }
    * {
      <ViewerUI />
    }
  }

  <footer>
    <p>Total: ${formatCurrency(total)}</p>
  </footer>
</main>
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Trigger Completion | Ctrl+Space |
| Quick Fix | Ctrl+. |
| Go to Definition | F12 or Ctrl+Click |
| Find References | Shift+F12 |
| Hover Info | Ctrl+K Ctrl+I |
| Format Document | Shift+Alt+F |

## Troubleshooting

### LSP Not Starting

1. Check Output panel (View → Output → Blade Language Server)
2. Ensure file has `.blade` extension
3. Restart VS Code

### Completions Not Working

1. Verify file is recognized (status bar shows "Blade")
2. Check if data schema path is correct
3. Ensure no syntax errors before cursor

### Diagnostics Not Showing

1. Check `blade.lsp.diagnostics.enabled` is true
2. Verify severity settings aren't all "off"
3. Check for parse errors that prevent analysis

## Development

### Running from Source

```bash
# Build extension
cd packages/blade-vscode
npm install
npm run build

# Launch Extension Development Host
# Press F5 in VS Code with this folder open
```

### Debugging LSP

1. Open VS Code settings
2. Set `"blade.trace.server": "verbose"`
3. Check Output panel → Blade Language Server
