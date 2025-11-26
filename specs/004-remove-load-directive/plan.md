# Implementation Plan: Remove @load Directive

**Branch**: `004-remove-load-directive` | **Date**: 2025-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-remove-load-directive/spec.md`

## Summary

Remove the `@load` directive concept from the Blade template system. This is a simplification change that removes an unimplemented feature (the parser doesn't actually handle `@load`) while cleaning up interfaces, documentation, and test code that reference it. The approach is straightforward deletion across compiler interfaces, AST type comments, LSP hover documentation, specification document, and test files.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM modules)
**Primary Dependencies**: None for this change (pure deletion task)
**Storage**: N/A
**Testing**: Vitest (`npm test`)
**Target Platform**: Node.js (library)
**Project Type**: Single monorepo package
**Performance Goals**: N/A (removal task, no performance impact)
**Constraints**: Must not break existing functionality; all tests must pass after removal
**Scale/Scope**: ~15 files affected across src/, docs/, and tests/

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | PASS | Removal simplifies type surface; no type safety impact |
| II. Source Auditability | PASS | Not affected by this change |
| III. Security by Default | PASS | Removing dynamic loading is security-positive |
| IV. Component Isolation | PASS | Inline components remain fully supported |
| V. Developer Experience | PASS | Cleaner docs/LSP without non-functional @load references |

**Quality Standards Check**:
- Testing: Removing @load test case; existing tests will pass
- Documentation: Will update SPECIFICATION.md (breaking change documented)
- Code Review: All changes pass typecheck, lint, and tests

**GATE STATUS**: PASSED - No violations

## Project Structure

### Documentation (this feature)

```text
specs/004-remove-load-directive/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Validation checklist
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── ast/
│   │   └── types.ts           # Remove @load comment in ComponentDefinition
│   ├── compiler/
│   │   └── index.ts           # Remove TemplateLoader, maxLoadDepth from CompileOptions
│   └── lsp/
│       └── providers/
│           └── hover.ts       # Remove @load from hover documentation
├── tests/
│   ├── compiler.test.ts       # Remove loader test case
│   └── README.md              # Update if @load mentioned
└── docs/
    └── SPECIFICATION.md       # Remove all @load sections
```

**Structure Decision**: Existing monorepo structure. This is a deletion-only change affecting the `packages/blade` package.

## Complexity Tracking

> No violations - table not required.

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/blade/src/compiler/index.ts` | DELETE | Remove `TemplateLoader` interface, `loader` and `maxLoadDepth` from `CompileOptions` |
| `packages/blade/src/ast/types.ts` | EDIT | Remove `@load` reference from `ComponentDefinition` JSDoc |
| `packages/blade/src/lsp/providers/hover.ts` | DELETE | Remove `load` entry from hover documentation |
| `packages/blade/tests/compiler.test.ts` | DELETE | Remove `should use custom loader for components` test |
| `packages/blade/tests/README.md` | EDIT | Remove mention of custom component loaders |
| `docs/SPECIFICATION.md` | DELETE | Remove sections 3.6 (@load syntax), 7.1 (@load processing), 7.3 (loader behavior), grammar rule, and examples |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking external consumers using TemplateLoader | Low | Medium | Feature was never implemented in parser; unlikely anyone uses it |
| Missing a reference to @load | Low | Low | Grep-based search ensures complete removal |
| Tests fail after removal | Low | High | Run full test suite; loader test is the only one using @load |
