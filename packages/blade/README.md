# @fponticelli/blade

**Sharp templates for modern apps**

Core template engine for Blade - a hybrid build-time/runtime HTML template system.

## Installation

```bash
npm install @fponticelli/blade
```

## Quick Start

### String Rendering (Server-side)

```typescript
import { compile, createStringRenderer } from '@fponticelli/blade';

const template = `
  <div class="greeting">
    Hello, \${user.name}!
  </div>
`;

// Compile once
const compiled = await compile(template);

// Create a renderer (can be reused for multiple renders)
const renderToString = createStringRenderer(compiled);

// Render with different data
const result1 = renderToString({ user: { name: 'Alice' } });
console.log(result1.html); // <div class="greeting">Hello, Alice!</div>

const result2 = renderToString({ user: { name: 'Bob' } });
console.log(result2.html); // <div class="greeting">Hello, Bob!</div>
```

### DOM Rendering (Client-side)

```typescript
import { compile, createDomRenderer } from '@fponticelli/blade';

const compiled = await compile('<div>Hello, ${name}!</div>');
const renderToDom = createDomRenderer(compiled);

const result = renderToDom({ name: 'World' });
document.body.append(...result.nodes);
```

## Features

- Expression syntax: `$expr` and `${expr}`
- Control flow: `@if`, `@for`, `@match`
- Components with slots
- Source tracking for auditability
- Resource limits and security controls

See the [main documentation](../../docs/SPECIFICATION.md) for complete details.

## License

MIT © Franco Ponticelli
