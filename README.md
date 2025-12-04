# Blade

**Sharp templates for modern apps**

Blade is a hybrid build-time/runtime HTML template system with strong typing, expression evaluation, component system, and full source tracking for auditability.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [@bladets/template](./packages/blade) | Core template engine | [![npm](https://img.shields.io/npm/v/@bladets/template)](https://www.npmjs.com/package/@bladets/template) |
| [@bladets/tempo](./packages/blade-tempo) | Reactive DOM rendering with [@tempots/dom](https://www.npmjs.com/package/@tempots/dom) | [![npm](https://img.shields.io/npm/v/@bladets/tempo)](https://www.npmjs.com/package/@bladets/tempo) |
| [blade-vscode](./packages/blade-vscode) | VS Code extension with syntax highlighting, LSP, and live preview | [Marketplace](https://marketplace.visualstudio.com/items?itemName=fponticelli.blade-templates) |

## Features

- 🔪 **Sharp & Fast** - Efficient template compilation and rendering
- 🎯 **Type Safe** - Full TypeScript support with JSON Schema integration
- 🧩 **Component System** - Reusable components with slots and isolated scope
- 📊 **Source Tracking** - Full auditability with `rd-source` attributes
- 🔒 **Secure** - Function allowlisting and resource limits
- 🛠️ **Developer Friendly** - LSP support, validation, and source maps
- ⚡ **Reactive Rendering** - Fine-grained DOM updates with @bladets/tempo

## Quick Start

### Server-Side Rendering

```typescript
import { compile, createStringRenderer } from '@bladets/template';

const template = await compile(`
  <div class="greeting">
    Hello, \${name}!
    @if(isAdmin) {
      <span class="badge">Admin</span>
    }
  </div>
`);

const render = createStringRenderer(template);
const result = render({ name: 'World', isAdmin: true });
console.log(result.html);
```

### Reactive DOM Rendering

```typescript
import { compile } from '@bladets/template';
import { createTempoRenderer } from '@bladets/tempo';
import { prop, render } from '@tempots/dom';

const template = await compile('<div>Count: \${count}</div>');
const renderer = createTempoRenderer(template);

const data = prop({ count: 0 });
render(renderer(data), document.body);

// DOM updates automatically when data changes
data.value = { count: 42 };
```

## Development

This is a monorepo managed with [Turborepo](https://turbo.build/).

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Lint all packages
npm run lint

# Format all files
npm run format

# Type check all packages
npm run typecheck

# Clean all build artifacts
npm run clean
```

## Documentation

See the [complete specification](./docs/SPECIFICATION.md) for detailed documentation.

## License

MIT © Franco Ponticelli
