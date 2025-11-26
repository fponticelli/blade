# Blade Templates VS Code Extension

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
  "blade.lsp.diagnostics.deepNesting": "warning",
  "blade.lsp.diagnostics.deepNestingThreshold": 4
}
```

### Completion

```json
{
  "blade.lsp.completion.dataSchemaPath": "./schema.json",
  "blade.lsp.completion.helpersDefinitionPath": "./helpers.d.ts",
  "blade.lsp.completion.snippets": true
}
```

### Debugging

```json
{
  "blade.trace.server": "verbose"
}
```

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
} @else {
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
