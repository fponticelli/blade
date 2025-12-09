# Tasks: Resume Sample Parsing and Rendering Fix

**Input**: Design documents from `/specs/011-resume-sample-fix/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included as specified in plan.md quality standards ("Will add/update tests for resume sample validation")

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Paths use monorepo structure per plan.md

---

## Phase 1: Setup

**Purpose**: Verify current state and prepare for implementation

- [ ] T001 Verify current parsing failure by running parser on samples/resume/index.blade
- [ ] T002 Document baseline error count (expected: 26 errors) for regression testing
- [ ] T003 [P] Review existing tests in packages/blade/tests/compiler.test.ts for style handling

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core parser infrastructure changes that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until raw content parsing is implemented

- [ ] T004 Add raw content tag detection constant (RAW_CONTENT_TAGS = ['style', 'script']) in packages/blade/src/parser/template-parser.ts
- [ ] T005 Create parseRawContent() method in packages/blade/src/parser/template-parser.ts
- [ ] T006 Modify parseElement() to detect and delegate to parseRawContent() for style/script tags in packages/blade/src/parser/template-parser.ts
- [ ] T007 Handle ${...} expression extraction within parseRawContent() in packages/blade/src/parser/template-parser.ts
- [ ] T008 Ensure parseRawContent() stops only at matching </tagname> closing tag in packages/blade/src/parser/template-parser.ts
- [ ] T009 Run npm run build in packages/blade to verify TypeScript compilation

**Checkpoint**: Raw content parsing infrastructure ready - user story validation can begin

---

## Phase 3: User Story 1 - Parse Resume Template Successfully (Priority: P1) 🎯 MVP

**Goal**: Resume template parses with zero errors and produces valid AST

**Independent Test**: Run parser on samples/resume/index.blade and verify 0 errors returned

### Tests for User Story 1

- [ ] T010 [P] [US1] Add test "parses style tag with plain CSS" in packages/blade/tests/compiler.test.ts
- [ ] T011 [P] [US1] Add test "parses style tag with expression interpolation" in packages/blade/tests/compiler.test.ts
- [ ] T012 [P] [US1] Add test "parses style tag with null coalescing operator" in packages/blade/tests/compiler.test.ts
- [ ] T013 [P] [US1] Add test "parses style tag with nested property access" in packages/blade/tests/compiler.test.ts
- [ ] T014 [P] [US1] Add test "parses resume template with zero errors" in packages/blade/tests/compiler.test.ts

### Implementation Verification for User Story 1

- [ ] T015 [US1] Run npm test in packages/blade to verify all parser tests pass
- [ ] T016 [US1] Verify resume template AST contains correct structure for @if directives
- [ ] T017 [US1] Verify resume template AST contains correct expression nodes for all ${...} interpolations

**Checkpoint**: Resume template parsing works - User Story 1 complete and independently testable

---

## Phase 4: User Story 2 - Error-Free VSCode Experience (Priority: P2)

**Goal**: VSCode extension shows zero errors/warnings for resume template

**Independent Test**: Open samples/resume/index.blade in VSCode, verify Problems panel is empty

### Tests for User Story 2

- [ ] T018 [P] [US2] Add test "LSP reports no diagnostics for style with expressions" in packages/blade/tests/lsp/diagnostic.test.ts
- [ ] T019 [P] [US2] Add test "LSP reports no diagnostics for resume template" in packages/blade/tests/lsp/diagnostic.test.ts

### Implementation for User Story 2

- [ ] T020 [US2] Verify LSP diagnostic provider uses same parser as compiler in packages/blade/src/lsp/providers/diagnostic.ts
- [ ] T021 [US2] Run npm test in packages/blade to verify LSP diagnostic tests pass
- [ ] T022 [US2] Rebuild VSCode extension with npm run build in packages/blade-vscode
- [ ] T023 [US2] Manually verify no errors in VSCode by opening samples/resume/index.blade

**Checkpoint**: VSCode shows no errors for resume template - User Story 2 complete

---

## Phase 5: User Story 3 - Render Resume with @bladets/template (Priority: P3)

**Goal**: Resume template renders correctly with sample data producing valid HTML

**Independent Test**: Render template with data.json and verify output contains expected content

### Tests for User Story 3

- [ ] T024 [P] [US3] Add test "renders style with expression substitution" in packages/blade/tests/renderer.test.ts
- [ ] T025 [P] [US3] Add test "renders style with null coalescing fallback" in packages/blade/tests/renderer.test.ts
- [ ] T026 [P] [US3] Add test "renders resume template with sample data" in packages/blade/tests/renderer.test.ts

### Implementation for User Story 3

- [ ] T027 [US3] Verify renderer correctly handles TextNode with expression segments from style content in packages/blade/src/renderer/index.ts
- [ ] T028 [US3] Run npm test in packages/blade to verify renderer tests pass
- [ ] T029 [US3] Verify rendered output includes font-family with fallback value when fontFamily undefined
- [ ] T030 [US3] Verify rendered output includes header section when includeHeader is true
- [ ] T031 [US3] Verify rendered output excludes header section when includeHeader is false

**Checkpoint**: Resume template renders correctly with @bladets/template - User Story 3 complete

---

## Phase 6: User Story 4 - Render Resume with @bladets/tempo (Priority: P4)

**Goal**: Resume template renders reactively in browser with @bladets/tempo

**Independent Test**: Mount template in JSDOM with sample data and verify DOM structure

### Tests for User Story 4

- [ ] T032 [P] [US4] Add test "tempo renders style with expressions" in packages/blade-tempo/tests/ (create if needed)
- [ ] T033 [P] [US4] Add test "tempo renders resume template" in packages/blade-tempo/tests/

### Implementation for User Story 4

- [ ] T034 [US4] Verify tempo renderer handles style content with expressions in packages/blade-tempo/src/index.ts
- [ ] T035 [US4] Run npm test in packages/blade-tempo to verify tempo tests pass
- [ ] T036 [US4] Verify DOM output contains style element with evaluated expressions

**Checkpoint**: Resume template renders with @bladets/tempo - User Story 4 complete

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all user stories

- [ ] T037 Run npm run check in packages/blade to verify lint, build, and all tests pass
- [ ] T038 Run npm run check in packages/blade-tempo to verify lint, build, and all tests pass
- [ ] T039 Rebuild and test VSCode extension with npm run vscode in packages/blade-vscode
- [ ] T040 [P] Update quickstart.md validation steps in specs/011-resume-sample-fix/quickstart.md
- [ ] T041 Run full validation per quickstart.md steps
- [ ] T042 Mark feature spec status as Complete in specs/011-resume-sample-fix/spec.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Parse) must complete before US2-4 can verify their functionality
  - US2 (VSCode), US3 (Template), US4 (Tempo) can then proceed in parallel
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
    │
    ▼
Phase 3: US1 (Parse) ──── Must complete first (core fix)
    │
    ├──────────────────────────────┬──────────────────────────────┐
    ▼                              ▼                              ▼
Phase 4: US2 (VSCode)     Phase 5: US3 (Template)     Phase 6: US4 (Tempo)
    │                              │                              │
    └──────────────────────────────┴──────────────────────────────┘
                                   │
                                   ▼
                        Phase 7: Polish
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation verification
- Verification tasks confirm the fix works for that story's use case

### Parallel Opportunities

**Phase 2 (Foundational)**: Sequential - modifying same file
**Phase 3 (US1)**: T010-T014 tests can run in parallel
**Phase 4 (US2)**: T018-T019 tests can run in parallel
**Phase 5 (US3)**: T024-T026 tests can run in parallel
**Phase 6 (US4)**: T032-T033 tests can run in parallel
**Cross-Story**: US2, US3, US4 can run in parallel after US1 completes

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all parser tests for US1 together:
Task: "Add test 'parses style tag with plain CSS' in packages/blade/tests/compiler.test.ts"
Task: "Add test 'parses style tag with expression interpolation' in packages/blade/tests/compiler.test.ts"
Task: "Add test 'parses style tag with null coalescing operator' in packages/blade/tests/compiler.test.ts"
Task: "Add test 'parses style tag with nested property access' in packages/blade/tests/compiler.test.ts"
Task: "Add test 'parses resume template with zero errors' in packages/blade/tests/compiler.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify current failure)
2. Complete Phase 2: Foundational (implement parseRawContent)
3. Complete Phase 3: User Story 1 (parsing works)
4. **STOP and VALIDATE**: Resume template parses with 0 errors
5. Can ship as working MVP - parsing is the foundation

### Incremental Delivery

1. Setup + Foundational → Core parser fix implemented
2. Add US1 (Parse) → Test independently → MVP ready
3. Add US2 (VSCode) → Test independently → IDE experience fixed
4. Add US3 (Template) → Test independently → Server rendering validated
5. Add US4 (Tempo) → Test independently → Client rendering validated
6. Polish → All validation complete

### Quick Win Strategy

Focus on Foundational (Phase 2) - the 6 tasks in T004-T009 are the actual fix.
Once those are done, all user stories are just validation/testing.

---

## Notes

- Core fix is concentrated in Phase 2 (T004-T009) in template-parser.ts
- User story phases are primarily validation that the fix works
- All tests target existing test files - no new test file creation needed
- VSCode extension rebuild required after parser changes
- Tempo tests may require JSDOM setup if not already configured
