# Implementation Plan: Template Syntax Improvements & Helper Functions

**Branch**: `006-template-helpers-escaping` | **Date**: 2025-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-template-helpers-escaping/spec.md`

## Summary

Add escape sequence support (`\@`, `\$`, `\\`) to Blade templates and expand the standard helper library with comprehensive array, string, date, number, and utility functions. The tokenizer/parser will handle escape sequences, and helpers will follow the established pattern in `helpers/index.ts` using the `setWarning` callback for error handling.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: None (pure TypeScript, internal AST types)
**Storage**: N/A (in-memory template processing)
**Testing**: Vitest (`npm test`)
**Target Platform**: Node.js / Browser (universal)
**Project Type**: Single monorepo package (`packages/blade`)
**Performance Goals**: Helper functions must execute in O(n) or better; no blocking operations
**Constraints**: All helpers must use `setWarning` callback, not throw errors; backward compatible
**Scale/Scope**: ~70 new helper functions, 3 escape sequences, tokenizer modifications

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Type Safety First | ✅ PASS | Helpers use `expectX` functions with type coercion; TypeScript signatures |
| II. Source Auditability | ✅ PASS | Escape sequences don't affect source tracking; text nodes preserve locations |
| III. Security by Default | ✅ PASS | Helpers are pure functions; no dynamic code execution; no external access |
| IV. Component Isolation | ✅ PASS | Helpers operate on passed values only; scope access is read-only |
| V. Developer Experience | ✅ PASS | LSP will provide autocompletion (SC-007); 100% test coverage (SC-006) |

**Quality Standards Compliance**:
- ✅ Unit tests required for all new helpers (SC-006)
- ✅ Helper signatures documented with examples (SC-002)
- ✅ Warnings via `setWarning`, not thrown errors (NFR-001, SC-003)

## Project Structure

### Documentation (this feature)

```text
specs/006-template-helpers-escaping/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── helpers/
│   │   └── index.ts           # Extend with new helper functions
│   ├── parser/
│   │   ├── tokenizer.ts       # Add escape sequence handling
│   │   └── template-parser.ts # Process escaped text nodes
│   ├── evaluator/
│   │   └── index.ts           # No changes expected
│   └── lsp/
│       └── providers/
│           ├── completion.ts  # Add helper function completions
│           └── hover.ts       # Add helper documentation
└── tests/
    ├── helpers.test.ts        # New/extended tests for all helpers
    ├── escaping.test.ts       # New tests for escape sequences
    └── lsp/
        └── completion.test.ts # Extended with helper completions
```

**Structure Decision**: Single package extension - all changes within `packages/blade/`

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | - | - |
