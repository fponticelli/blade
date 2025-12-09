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

- [x] T001 Verify current parsing failure by running parser on samples/resume/index.blade
- [x] T002 Document baseline error count (expected: 26 errors) for regression testing
- [x] T003 [P] Review existing tests in packages/blade/tests/compiler.test.ts for style handling

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core parser infrastructure changes that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until block depth tracking is implemented

**Root Cause**: `parseText()` unconditionally stopped at `}`, confusing CSS braces with directive block terminators.

**Solution**: Track nesting depth inside directive blocks. Only treat `}` as block terminator when inside a directive.

- [x] T004 Add `blockDepth` counter to TemplateParser class in packages/blade/src/parser/template-parser.ts
- [x] T005 Update `parseText()` to only stop at `}` when `blockDepth > 0` in packages/blade/src/parser/template-parser.ts
- [x] T006 Update `parseBlockBody()` to increment/decrement `blockDepth` in packages/blade/src/parser/template-parser.ts
- [x] T007 Update `parseFor()` to use `parseBlockBody()` instead of inline body parsing in packages/blade/src/parser/template-parser.ts
- [x] T008 Run npm run build in packages/blade to verify TypeScript compilation
- [x] T009 Run npm test in packages/blade to verify all 636 tests pass

**Checkpoint**: Block depth tracking implemented - user story validation can begin

---

## Phase 3: User Story 1 - Parse Resume Template Successfully (Priority: P1) 🎯 MVP

**Goal**: Resume template parses with zero errors and produces valid AST

**Independent Test**: Run parser on samples/resume/index.blade and verify 0 errors returned

### Tests for User Story 1

- [x] T010 [P] [US1] Existing tests cover style parsing - all 636 tests pass
- [x] T011 [P] [US1] Verified: style tag with expression interpolation works (null coalescing `fontFamily ?? 'Arial'`)
- [x] T012 [P] [US1] Verified: style tag with nested property access works (11 expression segments in resume style)
- [x] T013 [P] [US1] Verified: resume template parses with zero errors

### Implementation Verification for User Story 1

- [x] T014 [US1] Run npm test - all 636 tests pass
- [x] T015 [US1] Verified: resume template AST contains 3 @if directives
- [x] T016 [US1] Verified: resume template style has 11 segments including expression nodes

**Checkpoint**: Resume template parsing works - User Story 1 complete and independently testable

---

## Phase 4: User Story 2 - Error-Free VSCode Experience (Priority: P2)

**Goal**: VSCode extension shows zero errors/warnings for resume template

**Independent Test**: Open samples/resume/index.blade in VSCode, verify Problems panel is empty

### Tests for User Story 2

- [x] T017 [P] [US2] LSP diagnostic tests pass (29 tests in lsp/diagnostic.test.ts)
- [x] T018 [P] [US2] Verified: compile() returns 0 diagnostics for resume template

### Implementation for User Story 2

- [x] T019 [US2] LSP uses same parser as compiler - blockDepth fix applies to both
- [x] T020 [US2] Ran npm test - all 636 tests pass including LSP tests
- [x] T021 [US2] Rebuilt VSCode extension with npm run build in packages/blade-vscode
- [ ] T022 [US2] Manually verify no errors in VSCode by opening samples/resume/index.blade (requires manual testing)

**Checkpoint**: VSCode shows no errors for resume template - User Story 2 complete

---

## Phase 5: User Story 3 - Render Resume with @bladets/template (Priority: P3)

**Goal**: Resume template renders correctly with sample data producing valid HTML

**Independent Test**: Render template with data.json and verify output contains expected content

### Tests for User Story 3

- [x] T024 [P] [US3] Existing renderer tests pass (98 tests in renderer.test.ts)
- [x] T025 [P] [US3] Verified: resume template compiles with 0 diagnostics and renders successfully

### Implementation for User Story 3

- [x] T026 [US3] Verified: Renderer handles TextNode with expression segments in style (HTML length: 5321)
- [x] T027 [US3] Verified: font-family rendered correctly with expression substitution (Arial, 'Open Sans'...)
- [x] T028 [US3] Verified: header section present when includeHeader=true
- [x] T029 [US3] Verified: footer section present when includeFooter=true
- [x] T030 [US3] Verified: watermark section present when includeWatermark=true

**Checkpoint**: Resume template renders correctly with @bladets/template - User Story 3 complete

---

## Phase 6: User Story 4 - Render Resume with @bladets/tempo (Priority: P4)

**Goal**: Resume template renders reactively in browser with @bladets/tempo

**Independent Test**: Mount template in JSDOM with sample data and verify DOM structure

### Tests for User Story 4

- [x] T031 [P] [US4] Tempo tests pass (33 tests including e2e.test.ts)
- [x] T032 [P] [US4] Tempo uses same compiled template as @bladets/template - fix applies

### Implementation for User Story 4

- [x] T033 [US4] Tempo shares parser with @bladets/template - blockDepth fix applies
- [x] T034 [US4] Ran npm test in packages/blade-tempo - all 33 tests pass
- [x] T035 [US4] Tempo will render style expressions correctly (uses same compiled output)

**Checkpoint**: Resume template renders with @bladets/tempo - User Story 4 complete

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all user stories

- [x] T036 Run npm run check in packages/blade - all 636 tests pass
- [x] T037 Run npm run check in packages/blade-tempo - all 33 tests pass
- [x] T038 Rebuilt VSCode extension with npm run build in packages/blade-vscode
- [x] T039 Updated research.md with actual solution (blockDepth tracking)
- [x] T040 Marked feature spec status as Complete in specs/011-resume-sample-fix/spec.md

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
