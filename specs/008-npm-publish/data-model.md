# Data Model: NPM Package Publishing

**Feature**: 008-npm-publish
**Date**: 2025-11-27

## Overview

This feature does not introduce new runtime data entities. It configures package distribution format and metadata.

## Configuration Entities

### Package Manifest (package.json)

The package.json file serves as the primary configuration artifact for NPM publishing.

**Key Fields**:

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Scoped package name (`@bladets/template`) |
| `version` | semver | Package version for registry |
| `type` | string | Module system default (`module` for ESM) |
| `exports` | object | Conditional exports for ESM/CJS resolution |
| `main` | string | Legacy CJS entry point (fallback) |
| `module` | string | Legacy ESM entry point (bundlers) |
| `types` | string | TypeScript declaration entry |
| `files` | array | Files included in published tarball |
| `engines` | object | Node.js version requirement |

### Distribution Files

Build artifacts produced by Vite and included in the npm package.

**File Structure**:

| File | Format | Purpose |
|------|--------|---------|
| `dist/index.js` | ESM | Main entry for `import` |
| `dist/index.cjs` | CJS | Main entry for `require` |
| `dist/index.d.ts` | TypeScript | Type declarations |
| `dist/lsp/server.js` | ESM | LSP server module (ESM) |
| `dist/lsp/server.cjs` | CJS | LSP server module (CJS) |
| `dist/server.d.ts` | TypeScript | LSP server type declarations |
| `dist/*.js.map` | JSON | Source maps for debugging |

## Relationships

```
package.json
    └── exports
        ├── "." → dist/index.{js,cjs,d.ts}
        └── "./lsp/server" → dist/lsp/server.{js,cjs}, dist/server.d.ts

vite.config.ts
    └── build.lib
        ├── entry.index → src/index.ts
        └── entry.lsp/server → src/lsp/server.ts
```

## Validation Rules

1. **Version**: Must be valid semver, incremented before each publish
2. **Exports**: Each export must have `types`, `import`, and `require` conditions
3. **Files**: `dist/` directory must exist and contain all referenced files
4. **Engines**: Node version must be >= 18.0.0
