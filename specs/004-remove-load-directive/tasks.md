# Tasks: Remove @load Directive

**Input**: Design documents from `/specs/004-remove-load-directive/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested - no test tasks included (this is a deletion feature, existing tests verify correctness)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Single monorepo package
- **Source**: `packages/blade/src/`
- **Tests**: `packages/blade/tests/`
- **Docs**: `docs/`

---

## Phase 1: Setup

**Purpose**: Verify starting state before making changes

- [x] T001 Verify current test suite passes by running `npm test` in packages/blade/
- [x] T002 [P] Search and document all @load references by running `grep -r "@load\|TemplateLoader\|maxLoadDepth" packages/blade/src/ docs/`

---

## Phase 2: Foundational (No blocking prerequisites)

**Purpose**: This feature is pure deletion with no foundational work needed

**⚠️ NOTE**: No foundational tasks required - proceed directly to user stories

**Checkpoint**: Ready to begin user story implementation

---

## Phase 3: User Story 1 - Template Author Uses Components Without @load (Priority: P1) 🎯 MVP

**Goal**: Remove @load from compiler interface so templates work without it

**Independent Test**: Run `npm test` and verify all existing tests pass after compiler changes

### Implementation for User Story 1

- [x] T003 [US1] Remove `TemplateLoader` interface from packages/blade/src/compiler/index.ts
- [x] T004 [US1] Remove `loader?: TemplateLoader` from `CompileOptions` interface in packages/blade/src/compiler/index.ts
- [x] T005 [US1] Remove `maxLoadDepth?: number` from `CompileOptions` interface in packages/blade/src/compiler/index.ts
- [x] T006 [US1] Remove @load test case `should use custom loader for components` from packages/blade/tests/compiler.test.ts
- [x] T007 [US1] Run `npm test` to verify all remaining tests pass in packages/blade/

**Checkpoint**: Core @load removal complete - compiler no longer references TemplateLoader

---

## Phase 4: User Story 2 - Developer Updates Documentation and Specification (Priority: P2)

**Goal**: Remove all @load references from documentation

**Independent Test**: Run `grep -r "@load" docs/` and verify zero matches (except migration notes if added)

### Implementation for User Story 2

- [x] T008 [P] [US2] Remove Section 3.6 (@load directive syntax, lines ~238-245) from docs/SPECIFICATION.md
- [x] T009 [P] [US2] Remove @load references from Section 7.1 (compilation processing, lines ~876-880) in docs/SPECIFICATION.md
- [x] T010 [P] [US2] Remove Section 7.3 (TemplateLoader interface and loader behavior, lines ~924-953) from docs/SPECIFICATION.md
- [x] T011 [P] [US2] Remove `load_directive` grammar rule (line ~1863) from docs/SPECIFICATION.md
- [x] T012 [P] [US2] Remove @load example from Invoice template (line ~1919) in docs/SPECIFICATION.md
- [x] T013 [P] [US2] Remove @load example from Order List template (line ~2005) in docs/SPECIFICATION.md
- [x] T014 [P] [US2] Remove `loader?: TemplateLoader` and `maxLoadDepth?: number` from CompileOptions documentation in docs/SPECIFICATION.md
- [x] T015 [US2] Remove `load` entry from hover documentation object in packages/blade/src/lsp/providers/hover.ts

**Checkpoint**: All documentation updated - no active @load references remain

---

## Phase 5: User Story 3 - Developer Cleans Up Compiler Code (Priority: P3)

**Goal**: Remove all @load-related code artifacts from source files

**Independent Test**: Run `grep -r "@load\|TemplateLoader" packages/blade/src/` and verify zero matches

### Implementation for User Story 3

- [x] T016 [P] [US3] Remove @load reference from `ComponentDefinition` JSDoc comment in packages/blade/src/ast/types.ts
- [x] T017 [P] [US3] Remove "Custom component loaders" mention from packages/blade/tests/README.md
- [x] T018 [US3] Run full verification: `npm run check` (lint, build, test) in packages/blade/

**Checkpoint**: All @load code artifacts removed from codebase

---

## Phase 6: Polish & Verification

**Purpose**: Final verification that removal is complete

- [x] T019 Run final grep search to confirm no @load references remain: `grep -rn "@load\|TemplateLoader\|maxLoadDepth" packages/blade/ docs/ --include="*.ts" --include="*.md"`
- [x] T020 Run `npm run check` to verify lint, build, and all tests pass
- [x] T021 Verify quickstart.md scenarios work by manually testing inline component compilation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: N/A - no foundational work needed
- **User Story 1 (Phase 3)**: Depends on Setup - removes compiler interfaces
- **User Story 2 (Phase 4)**: Can start after Setup, independent of US1
- **User Story 3 (Phase 5)**: Can start after Setup, independent of US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Removes compiler interfaces and test - BLOCKING for final verification
- **User Story 2 (P2)**: Documentation only - independent of code changes
- **User Story 3 (P3)**: Code cleanup - independent of documentation

### Within Each User Story

- All tasks within a story should be completed before marking story done
- Tasks marked [P] can run in parallel (different files)
- Run verification after each story completion

### Parallel Opportunities

**User Story 2 (Documentation)** - All tasks T008-T014 can run in parallel:
```
T008: Section 3.6 removal
T009: Section 7.1 cleanup
T010: Section 7.3 removal
T011: Grammar rule removal
T012: Invoice example removal
T013: Order List example removal
T014: CompileOptions docs cleanup
```

**User Story 3 (Code Cleanup)** - Tasks T016-T017 can run in parallel:
```
T016: AST types JSDoc cleanup
T017: Test README cleanup
```

**Cross-Story Parallelism**: US2 and US3 can be worked on in parallel after US1 core changes are complete.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 3: User Story 1 (T003-T007)
3. **STOP and VALIDATE**: All tests pass, compiler no longer exposes @load
4. This is a deployable state - @load is functionally removed

### Incremental Delivery

1. US1: Remove compiler interfaces → Tests pass → Checkpoint
2. US2: Update documentation → No @load in docs → Checkpoint
3. US3: Clean up code artifacts → Zero grep matches → Checkpoint
4. Polish: Final verification → Release ready

### Single Developer Strategy

Recommended order for sequential execution:
1. T001-T002 (Setup)
2. T003-T007 (US1 - Core removal)
3. T008-T015 (US2 - Documentation)
4. T016-T018 (US3 - Code cleanup)
5. T019-T021 (Polish)

---

## Notes

- This is a **deletion-only** feature - no new code is written
- All 21 tasks involve removing or verifying removal of code/documentation
- The feature was never implemented in the parser, so removal is low-risk
- Existing tests will continue to pass (only loader-specific test is removed)
- Each user story can be independently verified with grep searches
