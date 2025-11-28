# Implementation Plan: Configurable Source Attribute

**Branch**: `009-configurable-source-attr` | **Date**: 2025-11-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-configurable-source-attr/spec.md`

## Summary

Enable developers to customize the source tracking attribute prefix (default `rd-`) used for audit trail attributes (`{prefix}source`, `{prefix}source-op`, `{prefix}source-note`). The `sourceTrackingPrefix` configuration already exists in `RenderConfig` - this feature ensures it's properly validated and used throughout the codebase when source tracking is enabled.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: None (pure TypeScript, internal renderer module)
**Storage**: N/A (in-memory configuration)
**Testing**: Vitest (existing test framework)
**Target Platform**: Node.js 18+, Browser (via bundlers)
**Project Type**: Monorepo - packages/blade is the core template engine
**Performance Goals**: No measurable performance impact (validation runs once at render start)
**Constraints**: Must maintain backward compatibility with existing `rd-` default
**Scale/Scope**: Configuration-level change affecting renderer output attributes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Type Safety First** | ✅ PASS | TypeScript implementation; prefix is typed as string in RenderConfig |
| **II. Source Auditability** | ✅ PASS | This feature enhances auditability by making the tracking attributes configurable |
| **III. Security by Default** | ✅ PASS | Prefix validation ensures only valid HTML attribute names are accepted |
| **IV. Component Isolation** | ✅ PASS | No impact on component scope isolation |
| **V. Developer Experience** | ✅ PASS | Clear error messages for invalid prefixes; simple single-setting configuration |

## Project Structure

### Documentation (this feature)

```text
specs/009-configurable-source-attr/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (minimal - internal API only)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   └── renderer/
│       └── index.ts      # RenderConfig, validation, attribute generation
└── tests/
    └── renderer.test.ts  # Source tracking prefix tests
```

**Structure Decision**: Existing monorepo structure - changes isolated to `packages/blade/src/renderer/index.ts` for validation and attribute name generation.

## Complexity Tracking

> No violations to justify - feature is straightforward configuration enhancement.
