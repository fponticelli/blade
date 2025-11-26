# Implementation Plan: Template Renderer

**Branch**: `002-renderer` | **Date**: 2025-11-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-renderer/spec.md`

## Summary

Implement the template renderer for Blade - the runtime component that transforms compiled template AST into HTML output. The renderer traverses the AST, evaluates expressions using the Phase 5 evaluator, processes directives (@if, @for, @match), handles component instantiation with isolated scope, and enforces resource limits. This is Phase 6 of the Blade implementation plan.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM modules)
**Primary Dependencies**: Internal only (ast/types.ts, evaluator/index.ts, helpers/index.ts)
**Storage**: N/A
**Testing**: Vitest
**Target Platform**: Node.js and browser (ESM)
**Project Type**: Monorepo package (`packages/blade`)
**Performance Goals**: Support rendering 1000+ node templates without degradation
**Constraints**: No external runtime dependencies; configurable resource limits
**Scale/Scope**: Renders templates with hundreds of nodes per invocation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Type Safety First** | ✅ PASS | TypeScript implementation; type coercion uses Phase 5 evaluator |
| **II. Source Auditability** | ✅ PASS | rd-source, rd-source-op, rd-source-note attributes implemented per spec |
| **III. Security by Default** | ✅ PASS | HTML escaping by default; resource limits enforced; only registered helpers |
| **IV. Component Isolation** | ✅ PASS | Components get isolated scope with only props; no parent access |
| **V. Developer Experience** | ✅ PASS | Errors include source locations; simple render() API; factory pattern for reuse |

**Quality Standards Compliance**:
- ✅ Unit tests for all AST node rendering
- ✅ Integration tests for end-to-end template scenarios
- ✅ No external dependencies

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/002-renderer/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── renderer/
│   │   └── index.ts      # Main render functions (target file)
│   ├── ast/
│   │   └── types.ts      # Template AST types (existing)
│   ├── evaluator/
│   │   └── index.ts      # Expression evaluator (existing, Phase 5)
│   └── helpers/
│       └── index.ts      # Standard library helpers (existing)
└── tests/
    └── renderer.test.ts  # Unit tests for renderer
```

**Structure Decision**: Single package structure within existing monorepo. The renderer module extends the existing `packages/blade/src/renderer/index.ts` file which already has type definitions and stubs.

## Complexity Tracking

> No violations detected - section not applicable.
