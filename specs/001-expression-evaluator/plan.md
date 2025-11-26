# Implementation Plan: Expression Evaluator

**Branch**: `001-expression-evaluator` | **Date**: 2025-11-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-expression-evaluator/spec.md`

## Summary

Implement the expression evaluator for Blade templates - the core runtime component that executes parsed expression AST nodes. The evaluator handles path resolution through a three-layer scope hierarchy (locals → data → globals), evaluates all operator types (arithmetic, comparison, logical), supports helper function currying with scope injection, and handles array wildcard expressions for data extraction. This is Phase 5 of the Blade implementation plan, building directly on the completed parser (Phase 3).

## Technical Context

**Language/Version**: TypeScript 5.x (ESM modules)
**Primary Dependencies**: None (pure TypeScript, depends only on internal AST types)
**Storage**: N/A
**Testing**: Vitest
**Target Platform**: Node.js and browser (ESM)
**Project Type**: Monorepo package (`packages/blade`)
**Performance Goals**: Evaluations should be negligible overhead compared to DOM operations
**Constraints**: No external runtime dependencies; must handle null/undefined gracefully
**Scale/Scope**: Evaluates expressions within templates (typically hundreds per render)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Type Safety First** | ✅ PASS | TypeScript implementation; type coercion follows documented spec rules |
| **II. Source Auditability** | ✅ PASS | Evaluator supports path tracking via metadata; paths accessed available for rd-source |
| **III. Security by Default** | ✅ PASS | Only registered helpers callable; no eval/Function; depth limits in EvaluatorConfig |
| **IV. Component Isolation** | ✅ PASS | Scope hierarchy enforces isolation; globals explicit via `$.` prefix |
| **V. Developer Experience** | ✅ PASS | Clear error messages with source locations; consistent null handling |

**Quality Standards Compliance**:
- ✅ Unit tests required for all operator precedence and coercion cases
- ✅ Expression evaluation covers all AST node types
- ✅ No external dependencies to document

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/001-expression-evaluator/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/          # Quality checklists
    └── requirements.md
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── evaluator/
│   │   └── index.ts      # Main evaluate() function (target file)
│   ├── ast/
│   │   └── types.ts      # ExprAst type definitions (existing)
│   └── helpers/
│       └── index.ts      # Standard library helpers (future phase)
└── tests/
    └── evaluator.test.ts # Unit tests for evaluator
```

**Structure Decision**: Single package structure within existing monorepo. The evaluator module is self-contained within `packages/blade/src/evaluator/`. Tests will be added alongside existing test files.

## Complexity Tracking

> No violations detected - section not applicable.
