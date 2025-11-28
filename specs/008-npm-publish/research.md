# Research: NPM Package Publishing

**Feature**: 008-npm-publish
**Date**: 2025-11-27

## Research Topics

### 1. Dual ESM/CJS Package Configuration

**Decision**: Use conditional exports in package.json with separate `.js` (ESM) and `.cjs` (CommonJS) files

**Rationale**:
- Node.js 12.7+ supports conditional exports via the `exports` field
- The `.cjs` extension explicitly marks CommonJS files regardless of package `type`
- This approach avoids the "dual package hazard" by using separate file extensions
- Vite supports building both formats with `formats: ['es', 'cjs']`

**Alternatives Considered**:
1. **Single ESM-only**: Rejected - breaks compatibility with CommonJS projects
2. **Wrapper CJS file**: Rejected - adds complexity and potential bundling issues
3. **Separate packages**: Rejected - maintenance burden, version sync issues

**Best Practice Pattern**:
```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

### 2. Vite Configuration for Dual Output

**Decision**: Add `cjs` to formats array and configure output file extensions

**Rationale**:
- Vite uses Rollup under the hood, which supports multiple output formats
- Setting `formats: ['es', 'cjs']` generates both bundles
- File naming via `entryFileNames` controls the extensions

**Configuration Pattern**:
```typescript
build: {
  lib: {
    formats: ['es', 'cjs'],
  },
  rollupOptions: {
    output: [
      { format: 'es', entryFileNames: '[name].js' },
      { format: 'cjs', entryFileNames: '[name].cjs' }
    ]
  }
}
```

### 3. TypeScript Declaration Files

**Decision**: Use existing vite-plugin-dts configuration, no changes needed

**Rationale**:
- Current setup with `rollupTypes: true` bundles declarations correctly
- Single `.d.ts` file works for both ESM and CJS consumers
- The `types` field in exports points to the same declaration file

### 4. Package.json Exports Field Structure

**Decision**: Use conditional exports with full subpath exports for LSP server

**Rationale**:
- Main entry at `.` for primary package functionality
- Subpath export at `./lsp/server` for LSP module
- Each export has `types`, `import`, and `require` conditions

**Structure**:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./lsp/server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/lsp/server.js",
      "require": "./dist/lsp/server.cjs"
    }
  }
}
```

### 5. Files to Include in NPM Package

**Decision**: Use `files` array to explicitly include only distribution files

**Rationale**:
- Explicit inclusion is safer than relying on `.npmignore`
- Keeps package size minimal
- Includes: `dist/`, `README.md`, `LICENSE` (LICENSE auto-included by npm)

**Configuration**:
```json
{
  "files": [
    "dist",
    "README.md"
  ]
}
```

### 6. Package Metadata for NPM

**Decision**: Add `engines`, `homepage`, and `bugs` fields

**Rationale**:
- `engines` documents minimum Node.js version for consumers
- `homepage` and `bugs` improve NPM page with useful links
- Keywords already present; may expand for discoverability

**Fields to Add**:
```json
{
  "engines": {
    "node": ">=18.0.0"
  },
  "homepage": "https://github.com/fponticelli/blade#readme",
  "bugs": {
    "url": "https://github.com/fponticelli/blade/issues"
  }
}
```

### 7. Pre-publish Verification

**Decision**: Add `prepublishOnly` script to run checks before publish

**Rationale**:
- Ensures tests pass before any publish
- Builds fresh to avoid stale artifacts
- Catches issues before they reach NPM

**Script**:
```json
{
  "scripts": {
    "prepublishOnly": "npm run check"
  }
}
```

## Edge Case Analysis

### Dual Package Hazard

**Issue**: If ESM and CJS versions are both loaded, they create separate module instances

**Mitigation**:
- Using `.cjs` extension ensures Node.js treats them as distinct module types
- Package consumers typically use one format consistently
- Document in README that mixing formats is not recommended

### Browser Usage

**Issue**: Package uses Node.js fs/path modules

**Mitigation**:
- These are marked as external in Rollup config
- Bundlers handle this via their own polyfills or will tree-shake unused code
- Core template compilation works without fs - only project loading needs it

### Older Node.js Versions

**Issue**: Node.js < 18 may have incomplete ESM support

**Mitigation**:
- `engines` field declares Node 18+ requirement
- npm will warn users on older versions
- CJS format provides fallback for tools that still use require()

## Summary

All research topics resolved. No clarifications needed. Ready for Phase 1 design.
