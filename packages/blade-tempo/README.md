# @bladets/tempo

[![npm](https://img.shields.io/npm/v/@bladets/tempo)](https://www.npmjs.com/package/@bladets/tempo)

Blade template integration for [@tempots/dom](https://www.npmjs.com/package/@tempots/dom) - reactive rendering.

## Installation

```bash
npm install @bladets/tempo @bladets/template @tempots/dom
```

## Quick Start

```typescript
import { compile } from '@bladets/template';
import { createTempoRenderer } from '@bladets/tempo';
import { prop, render } from '@tempots/dom';

// 1. Compile a Blade template
const template = await compile('<div>Hello, ${name}!</div>');

// 2. Create a Tempo renderer
const renderer = createTempoRenderer(template);

// 3. Create reactive data
const data = prop({ name: 'World' });

// 4. Mount to DOM
render(renderer(data), document.body);

// 5. Update data reactively
data.value = { name: 'Tempo' }; // DOM updates automatically!
```

## Features

- **Reactive Rendering**: DOM updates automatically when signal data changes
- **Full Blade Support**: All Blade template features work (`@if`, `@for`, `@match`, components, slots)
- **Type Safety**: Full TypeScript support with generics
- **Small Bundle**: < 3KB gzipped
- **XSS Protection**: HTML escaping by default

## API

### `createTempoRenderer<T>(template, options?)`

Creates a renderer function from a compiled Blade template.

```typescript
const renderer = createTempoRenderer<MyData>(template, {
  // Custom helper functions
  helpers: {
    formatCurrency: () => (n: number) => `$${n.toFixed(2)}`,
  },
  // Global variables (accessible via $.varName)
  globals: {
    siteName: 'My App',
  },
  // Error handling callback
  onError: (error, location) => console.error(error),
  // Enable source tracking attributes
  includeSourceTracking: false,
  // Prefix for source tracking attributes
  sourceTrackingPrefix: 'rd-',
});
```

Returns: `(data: Signal<T>) => Renderable`

### Supported Blade Features

| Feature                             | Status |
| ----------------------------------- | ------ |
| Text interpolation `${expr}`        | ✅     |
| HTML elements                       | ✅     |
| Attributes (static, dynamic, mixed) | ✅     |
| `@if`/`else if`/`else`              | ✅     |
| `@for` loops                        | ✅     |
| `@match` pattern matching           | ✅     |
| `@@` variable declarations          | ✅     |
| Components                          | ✅     |
| Slots                               | ✅     |
| Fragments                           | ✅     |
| Comments                            | ✅     |

## Peer Dependencies

- `@bladets/template` ^0.2.0
- `@tempots/dom` ^35.0.0

## Related Packages

- **[@bladets/template](https://www.npmjs.com/package/@bladets/template)** - Core template engine
- **[Blade Templates VS Code Extension](https://marketplace.visualstudio.com/items?itemName=fponticelli.blade-templates)** - Syntax highlighting, LSP, and live preview

## License

MIT
