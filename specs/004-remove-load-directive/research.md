# Research: Remove @load Directive

**Feature**: 004-remove-load-directive
**Date**: 2025-11-26

## Research Questions

### Q1: What is the current state of @load implementation?

**Decision**: @load is specified but not implemented in the parser

**Rationale**: Investigation of the codebase reveals:
- The parser (`template-parser.ts`) does NOT recognize `@load` in its directive switch statement
- Only these directives are implemented: `@if`, `@for`, `@match`, `@let`, `@@`
- The `TemplateLoader` interface exists in `compiler/index.ts` but is never used
- The `maxLoadDepth` option exists but has no effect

**Alternatives considered**: None - this is a factual finding

### Q2: Where are all @load references located?

**Decision**: 6 files contain @load-related code/documentation

**Findings**:

| File | References | Content Type |
|------|------------|--------------|
| `packages/blade/src/compiler/index.ts` | 3 | Interface definitions (`TemplateLoader`, `loader?`, `maxLoadDepth?`) |
| `packages/blade/src/ast/types.ts` | 1 | JSDoc comment mentioning @load |
| `packages/blade/src/lsp/providers/hover.ts` | 1 | Hover documentation for @load |
| `packages/blade/tests/compiler.test.ts` | 3 | Test case using @load syntax |
| `packages/blade/tests/README.md` | 1 | Mention of custom component loaders |
| `docs/SPECIFICATION.md` | 16 | Full documentation of @load feature |

**Rationale**: Comprehensive grep search across the codebase

### Q3: What is the impact of removing TemplateLoader from the public API?

**Decision**: Low risk - the feature was never functional

**Rationale**:
- The `loader` option in `CompileOptions` is accepted but never acted upon
- No code path processes `@load` directives
- The test case `should use custom loader for components` passes only because:
  - It compiles `@load("External")\n<External />`
  - The parser ignores `@load` (treats it as unknown text)
  - The compilation "succeeds" without actually loading anything
- Removing this has no behavioral impact on any working functionality

**Alternatives considered**:
- Deprecation period: Rejected because feature never worked
- Keep interface for future use: Rejected because future design may differ

### Q4: What documentation sections need removal?

**Decision**: Multiple sections in SPECIFICATION.md need deletion

**Sections to remove**:
1. Section 3.6 - Load directive syntax (lines ~238-245)
2. Section 7.1 - @load processing in compilation (lines ~876-880)
3. Section 7.3 - Loader behavior and TemplateLoader interface (lines ~924-953)
4. Grammar rule - `load_directive` production (line ~1863)
5. Examples using @load (lines ~1919, ~2005)
6. Any CompileOptions sections showing `loader` and `maxLoadDepth`

**Rationale**: Complete removal requires all specification references to be deleted

## Summary

This is a clean removal task. The @load feature exists only in specification and interfaces but was never implemented. Removal involves:
1. Deleting 2 interface members from `CompileOptions`
2. Deleting the `TemplateLoader` interface
3. Editing 1 JSDoc comment
4. Deleting 1 LSP hover entry
5. Deleting 1 test case
6. Deleting ~6 sections from SPECIFICATION.md

No NEEDS CLARIFICATION items remain.
