# Implementation Plan: NPM Package Publishing

**Branch**: `008-npm-publish` | **Date**: 2025-11-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-npm-publish/spec.md`

## Summary

Configure the blade package for NPM publishing with dual ESM/CommonJS format support. The package currently only outputs ESM format via Vite. This plan adds CommonJS output, configures proper package.json exports field for dual module resolution, and ensures all necessary metadata and files are included for publishing.

## Technical Context

**Language/Version**: TypeScript 5.x, targeting Node.js 18+
**Primary Dependencies**: Vite 6.x (build), vite-plugin-dts (TypeScript declarations)
**Storage**: N/A (library package)
**Testing**: Vitest for unit tests, manual verification with test projects for ESM/CJS
**Target Platform**: Node.js 18+, bundlers (webpack, vite, rollup)
**Project Type**: Single library package (monorepo structure, package at `packages/blade`)
**Performance Goals**: N/A for publishing (build time is acceptable)
**Constraints**: Package size under 500KB, no breaking API changes
**Scale/Scope**: Single npm package with two entry points (main, lsp/server)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | ✅ PASS | TypeScript declarations included via vite-plugin-dts |
| II. Source Auditability | ✅ PASS | Source maps included in build |
| III. Security by Default | ✅ PASS | No changes to runtime security model |
| IV. Component Isolation | ✅ PASS | No changes to component model |
| V. Developer Experience | ✅ PASS | Dual format improves DX for CJS users |

**Quality Standards**:
- Testing: ✅ Existing tests remain; add verification scripts for ESM/CJS
- Documentation: ✅ README exists; will verify it's included in package

**Development Workflow**:
- Code Review: ✅ Standard PR process
- All checks must pass before publishing

**Gate Result**: PASS - No violations

## Project Structure

### Documentation (this feature)

```text
specs/008-npm-publish/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal - no data entities)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (package.json schema)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/blade/
├── src/                 # TypeScript source (unchanged)
├── dist/                # Build output
│   ├── index.js         # ESM bundle
│   ├── index.cjs        # CommonJS bundle (NEW)
│   ├── index.d.ts       # TypeScript declarations
│   ├── lsp/
│   │   ├── server.js    # ESM LSP server
│   │   └── server.cjs   # CommonJS LSP server (NEW)
│   └── *.js.map         # Source maps
├── package.json         # NPM manifest (modified)
├── vite.config.ts       # Build config (modified)
├── README.md            # Package documentation
└── LICENSE              # MIT license
```

**Structure Decision**: Single package structure maintained. Build output extended with CommonJS format alongside existing ESM.

## Complexity Tracking

> No constitution violations - table not needed.
