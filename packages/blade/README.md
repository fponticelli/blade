# @bladets/template

**Sharp templates for modern apps**

A TypeScript-first HTML template engine with expression evaluation, control flow directives, reusable components, and built-in safety controls.

## Installation

```bash
npm install @bladets/template
```

## Quick Start

```typescript
import { compile, createStringRenderer } from '@bladets/template';

const template = `<div class="greeting">Hello, \${name}!</div>`;

const compiled = await compile(template);
const render = createStringRenderer(compiled);

const result = render({ name: 'World' });
console.log(result.html);
// Output: <div class="greeting">Hello, World!</div>
```

## Template Syntax

### Expressions

Embed dynamic values with `$identifier` or `${expression}`:

```html
<p>Welcome, $user.name!</p>
<p>Total: ${price * quantity}</p>
<p>Status: ${isActive ? 'Active' : 'Inactive'}</p>
```

### Control Flow

#### Conditionals (`@if`, `@else if`, `@else`)

```html
@if user.isAdmin {
  <span class="badge">Admin</span>
} @else if user.isModerator {
  <span class="badge">Mod</span>
} @else {
  <span class="badge">User</span>
}
```

#### Loops (`@for`)

```html
@for item of items {
  <li>$item.name - ${formatCurrency(item.price)}</li>
}

@for item, index of items {
  <li>${index + 1}. $item.name</li>
}
```

#### Pattern Matching (`@match`)

```html
@match status {
  @case 'pending' { <span class="yellow">Pending</span> }
  @case 'approved' { <span class="green">Approved</span> }
  @case 'rejected' { <span class="red">Rejected</span> }
  @default { <span>Unknown</span> }
}
```

### Variables (`@let`)

```html
@let total = price * quantity
@let discounted = total * 0.9
<p>Final price: ${formatCurrency(discounted)}</p>
```

### Components

Define reusable components with `@component`:

```html
@component Card(title: string, @required subtitle: string) {
  <div class="card">
    <h2>$title</h2>
    <p class="subtitle">$subtitle</p>
    <div class="content">
      <slot />
    </div>
  </div>
}

<Card title="Welcome" subtitle="Getting started">
  <p>Card content goes here</p>
</Card>
```

## Built-in Helpers

### Formatting

```html
${formatCurrency(99.99)}           <!-- $99.99 -->
${formatNumber(1234.5, 2)}         <!-- 1,234.50 -->
${formatPercent(0.156, 1)}         <!-- 15.6% -->
${formatDate(date, 'long')}        <!-- November 27, 2025 -->
```

### String Operations

```html
${upper(name)}                     <!-- JOHN -->
${lower(name)}                     <!-- john -->
${capitalize(word)}                <!-- Hello -->
${truncate(text, 50)}              <!-- Long text... -->
${trim(input)}                     <!-- trimmed -->
${replace(str, 'old', 'new')}      <!-- replaced -->
```

### Array Operations

```html
${len(items)}                      <!-- 5 -->
${join(tags, ', ')}                <!-- a, b, c -->
${first(items)}                    <!-- first item -->
${last(items)}                     <!-- last item -->
${sort(numbers)}                   <!-- sorted array -->
${unique(values)}                  <!-- deduplicated -->
${pluck(users, 'name')}            <!-- ['Alice', 'Bob'] -->
```

### Math

```html
${sum(1, 2, 3)}                    <!-- 6 -->
${avg(values)}                     <!-- average -->
${min(a, b, c)}                    <!-- minimum -->
${max(a, b, c)}                    <!-- maximum -->
${round(3.7)}                      <!-- 4 -->
${clamp(value, 0, 100)}            <!-- bounded -->
```

### Date/Time

```html
${now()}                           <!-- current date -->
${year(date)}                      <!-- 2025 -->
${addDays(date, 7)}                <!-- date + 7 days -->
${diffDays(start, end)}            <!-- days between -->
${isBefore(date1, date2)}          <!-- true/false -->
```

### Type Checking

```html
${isDefined(value)}                <!-- true if not null/undefined -->
${isEmpty(arr)}                    <!-- true if empty -->
${isArray(value)}                  <!-- true if array -->
${type(value)}                     <!-- 'string', 'number', etc -->
```

## API Reference

### `compile(source, options?)`

Compiles a template string into a `CompiledTemplate`.

```typescript
const compiled = await compile(templateString, {
  validate: true,           // Enable validation
  strict: true,             // Strict mode
  includeSourceMap: true,   // Generate source maps
  projectRoot: './src',     // Enable project component resolution
});
```

### `createStringRenderer(compiled)`

Creates a reusable render function for server-side HTML generation.

```typescript
const render = createStringRenderer(compiled);

const result = render(data, {
  globals: { locale: 'en-US', currency: 'USD' },
  helpers: customHelpers,
  config: {
    htmlEscape: true,       // Auto-escape expressions (default: true)
    includeComments: false, // Strip HTML comments (default: false)
  },
});

console.log(result.html);
console.log(result.metadata.renderTime);
```

### `createDomRenderer(compiled)`

Creates a renderer for client-side DOM node generation.

```typescript
const render = createDomRenderer(compiled);

const result = render(data);
document.body.append(...result.nodes);
```

### Resource Limits

Prevent runaway templates with configurable limits:

```typescript
const result = render(data, {
  limits: {
    maxLoopNesting: 5,          // Max nested @for depth
    maxIterationsPerLoop: 1000, // Max items per loop
    maxTotalIterations: 10000,  // Max total iterations
    maxComponentDepth: 10,      // Max component nesting
  },
});
```

## Module Exports

### Main Entry (`@bladets/template`)

- `compile` - Template compiler
- `createStringRenderer` - Server-side renderer factory
- `createDomRenderer` - Client-side renderer factory
- `parseTemplate` - Low-level parser
- `evaluate` - Expression evaluator
- `standardLibrary` - Built-in helper functions
- `lsp` - Language Server Protocol utilities
- `project` - Project compilation utilities

### LSP Server (`@bladets/template/lsp/server`)

Language Server Protocol implementation for IDE integration.

## Module Formats

This package supports both ES modules and CommonJS:

```javascript
// ESM
import { compile } from '@bladets/template';

// CommonJS
const { compile } = require('@bladets/template');
```

**Note**: Avoid mixing ESM and CommonJS imports of this package in the same application to prevent the dual package hazard.

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  CompiledTemplate,
  RenderResult,
  RenderOptions,
  ResourceLimits,
  HelperRegistry,
} from '@bladets/template';
```

## License

MIT
