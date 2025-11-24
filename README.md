# Blade

**Sharp templates for modern apps**

Blade is a hybrid build-time/runtime HTML template system with strong typing, expression evaluation, component system, and full source tracking for auditability.

## Packages

| Package | Description |
|---------|-------------|
| [@fponticelli/blade](./packages/blade) | Core template engine |
| [@fponticelli/blade-lsp](./packages/blade-lsp) | Language Server Protocol implementation |

## Features

- 🔪 **Sharp & Fast** - Efficient template compilation and rendering
- 🎯 **Type Safe** - Full TypeScript support with JSON Schema integration
- 🧩 **Component System** - Reusable components with slots and isolated scope
- 📊 **Source Tracking** - Full auditability with `rd-source` attributes
- 🔒 **Secure** - Function allowlisting and resource limits
- 🛠️ **Developer Friendly** - LSP support, validation, and source maps

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
