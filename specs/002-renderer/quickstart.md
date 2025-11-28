# Quickstart: Template Renderer

**Feature**: 002-renderer
**Date**: 2025-11-25

## Overview

This guide demonstrates how to use the Blade Template Renderer to convert compiled templates into HTML output.

## Basic Usage

### Simple Rendering

```typescript
import { compile } from '@bladets/template';
import { createStringRenderer, render } from '@bladets/template';

// Compile a template
const template = await compile('<h1>Hello, ${name}!</h1>');

// Option 1: Factory pattern (recommended for repeated renders)
const renderer = createStringRenderer(template);
const result1 = renderer({ name: 'Alice' });
console.log(result1.html); // "<h1>Hello, Alice!</h1>"

const result2 = renderer({ name: 'Bob' });
console.log(result2.html); // "<h1>Hello, Bob!</h1>"

// Option 2: Convenience function (one-off renders)
const result = render(template, { name: 'Alice' });
console.log(result.html); // "<h1>Hello, Alice!</h1>"
```

### With Helpers

```typescript
import { createStringRenderer, standardHelpers } from '@bladets/template';

const template = await compile('<p>Total: ${formatCurrency(amount)}</p>');

const renderer = createStringRenderer(template);
const result = renderer(
  { amount: 99.99 },
  {
    helpers: standardHelpers,
    globals: { currency: 'USD' }
  }
);
console.log(result.html); // "<p>Total: $99.99</p>"
```

## Rendering Directives

### Conditionals (@if)

```typescript
const template = await compile(`
  @if(isLoggedIn) {
    <span>Welcome, ${username}!</span>
  } @else {
    <a href="/login">Login</a>
  }
`);

const renderer = createStringRenderer(template);

// Logged in user
const result1 = renderer({ isLoggedIn: true, username: 'Alice' });
console.log(result1.html); // "<span>Welcome, Alice!</span>"

// Guest user
const result2 = renderer({ isLoggedIn: false });
console.log(result2.html); // '<a href="/login">Login</a>'
```

### Loops (@for)

```typescript
const template = await compile(`
  <ul>
    @for(item, index of items) {
      <li>${index + 1}. ${item.name}</li>
    }
  </ul>
`);

const renderer = createStringRenderer(template);
const result = renderer({
  items: [
    { name: 'Apple' },
    { name: 'Banana' },
    { name: 'Cherry' }
  ]
});
console.log(result.html);
// "<ul><li>1. Apple</li><li>2. Banana</li><li>3. Cherry</li></ul>"
```

### Pattern Matching (@match)

```typescript
const template = await compile(`
  @match(status) {
    when "pending" { <span class="yellow">Pending</span> }
    when "approved" { <span class="green">Approved</span> }
    when "rejected" { <span class="red">Rejected</span> }
    * { <span class="gray">Unknown</span> }
  }
`);

const renderer = createStringRenderer(template);
const result = renderer({ status: 'approved' });
console.log(result.html); // '<span class="green">Approved</span>'
```

## Components

### Using Components

```typescript
const template = await compile(`
  @component Card {
    <div class="card">
      <h2>${title}</h2>
      <div class="body"><slot/></div>
    </div>
  }

  <Card title={heading}>
    <p>${content}</p>
  </Card>
`);

const renderer = createStringRenderer(template);
const result = renderer({
  heading: 'Welcome',
  content: 'Hello, World!'
});
console.log(result.html);
// '<div class="card"><h2>Welcome</h2><div class="body"><p>Hello, World!</p></div></div>'
```

### Named Slots

```typescript
const template = await compile(`
  @component Dialog {
    <div class="dialog">
      <header><slot name="header">Default Title</slot></header>
      <main><slot/></main>
      <footer><slot name="footer"/></footer>
    </div>
  }

  <Dialog>
    <template slot="header">Custom Header</template>
    <p>Main content</p>
    <template slot="footer"><button>Close</button></template>
  </Dialog>
`);
```

## Configuration

### Render Options

```typescript
const renderer = createStringRenderer(template);
const result = renderer(data, {
  // Global variables
  globals: {
    currency: 'EUR',
    locale: 'de-DE'
  },

  // Helper functions
  helpers: {
    ...standardHelpers,
    myHelper: (scope, setWarning) => (arg) => { /* ... */ }
  },

  // Rendering configuration
  config: {
    htmlEscape: true,           // Escape expressions (default: true)
    includeComments: false,     // Include HTML comments (default: false)
    preserveWhitespace: false,  // Preserve all whitespace (default: false)
    includeSourceTracking: false // Add rd-source attributes (default: false)
  }
});
```

### Source Tracking for Auditing

```typescript
const result = renderer(data, {
  config: {
    includeSourceTracking: true,
    includeOperationTracking: true,
    sourceTrackingPrefix: 'rd-'
  }
});

// Result:
// <p rd-source="order.total" rd-source-op="format:currency">$99.99</p>
```

### Resource Limits

```typescript
import { DEFAULT_RESOURCE_LIMITS } from '@bladets/template';

const result = renderer(data, {
  limits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxIterationsPerLoop: 5000,  // Override specific limits
    maxTotalIterations: 50000
  }
});
```

## Error Handling

```typescript
import { RenderError, ResourceLimitError } from '@bladets/template';

try {
  const result = renderer(data);
} catch (error) {
  if (error instanceof ResourceLimitError) {
    console.error(`Limit exceeded at line ${error.location.start.line}`);
    console.error(`Limit: ${error.code}, Current: ${error.current}, Max: ${error.max}`);
  } else if (error instanceof RenderError) {
    console.error(`Render error at line ${error.location.start.line}: ${error.message}`);
  } else {
    throw error;
  }
}
```

## Runtime Metadata

```typescript
const result = renderer(data);

console.log(result.metadata);
// {
//   pathsAccessed: Set(['user.name', 'order.total', 'items[*].price']),
//   helpersUsed: Set(['formatCurrency', 'sum']),
//   renderTime: 12,          // milliseconds
//   iterationCount: 45,      // total loop iterations
//   recursionDepth: 2        // max component nesting
// }
```

## Common Patterns

### Empty State Handling

```typescript
const template = await compile(`
  @if(items.length > 0) {
    <ul>
      @for(item of items) {
        <li>${item.name}</li>
      }
    </ul>
  } @else {
    <p class="empty">No items found</p>
  }
`);
```

### Computed Values

```typescript
const template = await compile(`
  @@ { subtotal = sum(items[*].price) }
  @@ { tax = subtotal * 0.08 }
  @@ { total = subtotal + tax }

  <div class="summary">
    <p>Subtotal: ${formatCurrency(subtotal)}</p>
    <p>Tax: ${formatCurrency(tax)}</p>
    <p>Total: ${formatCurrency(total)}</p>
  </div>
`);
```

### Boolean Attributes

```typescript
const template = await compile(`
  <button disabled={!isValid}>Submit</button>
  <input type="checkbox" checked={isSelected} />
`);

// disabled={true} renders as: <button disabled>Submit</button>
// disabled={false} renders as: <button>Submit</button>
```

### Null-Safe Rendering

```typescript
// Undefined values render as empty string
const template = await compile('<p>${user.bio}</p>');
const result = renderer({ user: { name: 'Alice' } }); // bio is undefined
console.log(result.html); // "<p></p>"

// Use nullish coalescing for defaults
const template2 = await compile('<p>${user.bio ?? "No bio provided"}</p>');
```
