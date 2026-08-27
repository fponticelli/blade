# Blade Templates VS Code Extension

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/fponticelli.blade-templates)](https://marketplace.visualstudio.com/items?itemName=fponticelli.blade-templates)

Language support for Blade template files (`.blade`) in Visual Studio Code.

## Features

### Syntax Highlighting

Full syntax highlighting for Blade templates including:

- HTML tags and attributes
- Directives (`@if`, `@for`, `@match`, `@@`)
- Expressions (`${...}`, `$variable`)
- Components (PascalCase tags)
- Comments (`<!-- -->`)

### Autocompletion

Context-aware autocompletion for:

- **Expressions**: Variables, helpers, and path completions inside `${...}`
- **Directives**: `@if`, `@for`, `@match`, `@@` with snippet templates
- **HTML**: Tags and attributes with context-aware suggestions
- **Components**: Component names and props

### Diagnostics

Real-time error detection:

- Parse errors with precise location information
- Unclosed tags and expressions
- Invalid directive syntax

### Code Navigation

- **Go to Definition**: Navigate to variable and component definitions
- **Find References**: Find all usages of a symbol
- **Hover Information**: View type and documentation on hover

### Live Preview

Preview your Blade templates with real sample data:

- **Open Preview**: Use `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows/Linux), or click the preview icon in the editor toolbar
- **Sample Selection**: Choose from available sample JSON files in your project's `samples/` folder
- **Live Refresh**: Preview updates automatically as you type, including edits to component files in other tabs, saved or not
- **Error Display**: Compilation errors are shown with the file and line they belong to
- **Component Support**: Component files show a helpful message with option to create sample data

A Blade project is a directory containing `index.blade` - the same definition the
compiler and the language server use, so the preview never resolves a component
that a build would not. Components in subdirectories are namespaced by folder
(`components/form/input.blade` is `<Components.Form.Input/>`) and are resolved by
the engine's own project loader.

Rendered output is displayed inside a sandboxed frame with its own restrictive
Content-Security-Policy: no scripting, no forms, no plugins, and no access to the
panel's API. Images, fonts and inline styles from your workspace do load, and
relative URLs resolve against the project root.

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Blade Templates"
4. Click Install

Or install from the command line:

```bash
code --install-extension fponticelli.blade-templates
```

## Configuration

### Diagnostics

```json
{
  "blade.lsp.diagnostics.enabled": true,
  "blade.lsp.diagnostics.unusedVariables": "warning",
  "blade.lsp.diagnostics.deprecatedHelpers": "warning",
  "blade.lsp.diagnostics.potentiallyUndefined": "hint",
  "blade.lsp.diagnostics.deepNesting": "warning",
  "blade.lsp.diagnostics.deepNestingThreshold": 4
}
```

Every severity accepts `"error"`, `"warning"`, `"hint"` or `"off"`.

### Completion

```json
{
  "blade.lsp.completion.dataSchemaPath": "./schema.json",
  "blade.lsp.completion.helpersDefinitionPath": "./helpers.d.ts",
  "blade.lsp.completion.snippets": true
}
```

### Performance

```json
{
  "blade.lsp.performance.debounceMs": 200,
  "blade.lsp.performance.maxFileSize": 1048576
}
```

`maxFileSize` is the largest file the language server will parse; a file above
the limit reports one diagnostic saying so instead of being re-tokenised on every
keystroke.

### Debugging

```json
{
  "blade.trace.server": "verbose"
}
```

Every setting listed here is read by the language server, and every setting the
language server reads is listed here - a test in this package asserts that the
two lists are the same list.

## Blade Syntax Overview

### Expressions

```blade
<!-- Simple variable -->
$user.name

<!-- Block expression -->
${user.firstName + " " + user.lastName}

<!-- Global variable -->
$.currency

<!-- Helper function -->
${formatCurrency(order.total)}
```

### Directives

```blade
<!-- Conditional -->
@if(isLoggedIn) {
  <p>Welcome back!</p>
} else {
  <p>Please log in</p>
}

<!-- Loop -->
@for(item of items) {
  <li>$item.name</li>
}

<!-- Pattern matching -->
@match(status) {
  when "active" { <span class="green">Active</span> }
  when "pending" { <span class="yellow">Pending</span> }
  * { <span>Unknown</span> }
}

<!-- Variable declaration -->
@@ {
  let total = subtotal + tax;
  let formatted = formatCurrency(total);
}
```

### Components

```blade
<!-- Component usage -->
<UserCard name=$user.name email=$user.email />

<!-- Component definition -->
<template:UserCard name! email>
  <div class="card">
    <h2>$name</h2>
    <p>$email</p>
  </div>
</template:UserCard>
```

## Requirements

- VS Code 1.85.0 or higher

## Development

### Building the Extension

```bash
cd packages/blade-vscode
npm install
npm run build
```

### Packaging

```bash
npm run package
```

This creates a `.vsix` file that can be installed locally or published to the marketplace.

## License

MIT
