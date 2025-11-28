# Quickstart: NPM Package Publishing

**Feature**: 008-npm-publish
**Date**: 2025-11-27

## Prerequisites

- Node.js 18+ installed
- npm account with publish access to `@bladets` scope
- Git repository clean (all changes committed)

## Implementation Steps

### 1. Update Vite Configuration

Modify `packages/blade/vite.config.ts` to output both ESM and CJS formats:

```typescript
build: {
  lib: {
    entry: {
      index: resolve(__dirname, 'src/index.ts'),
      'lsp/server': resolve(__dirname, 'src/lsp/server.ts'),
    },
    name: 'Blade',
    formats: ['es', 'cjs'],
  },
  rollupOptions: {
    output: [
      {
        format: 'es',
        entryFileNames: '[name].js',
        exports: 'named',
      },
      {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        exports: 'named',
      },
    ],
  },
}
```

### 2. Update Package.json

Add/modify these fields in `packages/blade/package.json`:

```json
{
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
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
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "homepage": "https://github.com/fponticelli/blade#readme",
  "bugs": {
    "url": "https://github.com/fponticelli/blade/issues"
  },
  "scripts": {
    "prepublishOnly": "npm run check"
  }
}
```

### 3. Build and Verify

```bash
cd packages/blade
npm run build

# Verify outputs exist
ls dist/*.js dist/*.cjs dist/*.d.ts
ls dist/lsp/*.js dist/lsp/*.cjs
```

### 4. Test Package Locally

```bash
# Pack without publishing
npm pack

# Creates @bladets-blade-0.1.0.tgz
# Install in a test project to verify
```

### 5. Publish to NPM

```bash
# Login if needed
npm login

# Publish (runs prepublishOnly automatically)
npm publish --access public
```

## Verification Checklist

- [ ] `npm run build` succeeds
- [ ] `dist/index.js` exists (ESM)
- [ ] `dist/index.cjs` exists (CJS)
- [ ] `dist/index.d.ts` exists (types)
- [ ] `dist/lsp/server.js` exists (ESM)
- [ ] `dist/lsp/server.cjs` exists (CJS)
- [ ] `npm pack` creates tarball under 500KB
- [ ] ESM import works in test project
- [ ] CJS require works in test project
- [ ] TypeScript IntelliSense works

## Rollback

If issues discovered after publish:

```bash
# Deprecate problematic version
npm deprecate @bladets/template@0.1.0 "Known issues, please use X.Y.Z"

# Or unpublish within 72 hours (use with caution)
npm unpublish @bladets/template@0.1.0
```
