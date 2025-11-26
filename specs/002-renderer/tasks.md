# Tasks: Template Renderer

**Input**: Design documents from `/specs/002-renderer/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Tests are included as this is a core library component requiring thorough coverage per constitution Quality Standards.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo package**: `packages/blade/src/`, `packages/blade/tests/`
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Error classes and core utilities

- [ ] T001 Add RenderError class with location, code, and cause properties in packages/blade/src/renderer/index.ts
- [ ] T002 Add ResourceLimitError extending RenderError in packages/blade/src/renderer/index.ts
- [ ] T003 [P] Add escapeHtml utility function in packages/blade/src/renderer/index.ts
- [ ] T004 [P] Add RenderContext interface extending EvaluationContext in packages/blade/src/renderer/index.ts
- [ ] T005 Export RenderError and ResourceLimitError from packages/blade/src/index.ts
- [ ] T006 Create test file packages/blade/tests/renderer.test.ts with Vitest setup

**Checkpoint**: ✅ Error handling and core types ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core rendering infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Implement createRenderContext() helper for initializing render state in packages/blade/src/renderer/index.ts
- [ ] T008 Implement cloneScope() for creating child scopes in packages/blade/src/renderer/index.ts
- [ ] T009 Implement renderNode() dispatcher with switch on node.kind in packages/blade/src/renderer/index.ts
- [ ] T010 Implement renderChildren() helper for arrays of nodes in packages/blade/src/renderer/index.ts
- [ ] T011 Wire renderNode into createStringRenderer() factory in packages/blade/src/renderer/index.ts

**Checkpoint**: ✅ Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Render Static and Dynamic Content (Priority: P1) 🎯 MVP

**Goal**: Render templates with text, elements, and expression interpolations

**Independent Test**: Provide template with text/element nodes and expressions, verify HTML output

### Tests for User Story 1

- [ ] T012 [P] [US1] Test literal text rendering in packages/blade/tests/renderer.test.ts
- [ ] T013 [P] [US1] Test expression interpolation (${user.name}) in packages/blade/tests/renderer.test.ts
- [ ] T014 [P] [US1] Test HTML escaping of special characters in packages/blade/tests/renderer.test.ts
- [ ] T015 [P] [US1] Test element with static attributes in packages/blade/tests/renderer.test.ts
- [ ] T016 [P] [US1] Test element with expression attributes in packages/blade/tests/renderer.test.ts
- [ ] T017 [P] [US1] Test boolean attribute handling (disabled={true/false}) in packages/blade/tests/renderer.test.ts
- [ ] T018 [P] [US1] Test null/undefined attribute omission in packages/blade/tests/renderer.test.ts

### Implementation for User Story 1

- [ ] T019 [US1] Implement renderTextNode() with literal and expression segments in packages/blade/src/renderer/index.ts
- [ ] T020 [US1] Implement renderElementNode() with tag, attributes, children in packages/blade/src/renderer/index.ts
- [ ] T021 [US1] Implement resolveAttribute() for static/expr/mixed attributes in packages/blade/src/renderer/index.ts
- [ ] T022 [US1] Add boolean attribute logic in resolveAttribute() in packages/blade/src/renderer/index.ts
- [ ] T023 [US1] Add null/undefined attribute omission in packages/blade/src/renderer/index.ts
- [ ] T024 [US1] Wire TextNode and ElementNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T025 [US1] Verify all US1 acceptance scenarios pass

**Checkpoint**: ✅ User Story 1 complete - basic rendering works independently

---

## Phase 4: User Story 2 - Render Conditional Content (Priority: P2)

**Goal**: Implement @if, @else if, @else directive rendering

**Independent Test**: Provide templates with @if directives and various truthy/falsy data

### Tests for User Story 2

- [ ] T026 [P] [US2] Test @if with truthy condition renders body in packages/blade/tests/renderer.test.ts
- [ ] T027 [P] [US2] Test @if with falsy condition renders empty in packages/blade/tests/renderer.test.ts
- [ ] T028 [P] [US2] Test @if/@else if/@else chain in packages/blade/tests/renderer.test.ts
- [ ] T029 [P] [US2] Test nested @if directives in packages/blade/tests/renderer.test.ts

### Implementation for User Story 2

- [ ] T030 [US2] Implement renderIfNode() with branch evaluation in packages/blade/src/renderer/index.ts
- [ ] T031 [US2] Add short-circuit evaluation (first truthy wins) in packages/blade/src/renderer/index.ts
- [ ] T032 [US2] Wire IfNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T033 [US2] Verify all US2 acceptance scenarios pass

**Checkpoint**: ✅ User Story 2 complete - conditionals work independently

---

## Phase 5: User Story 3 - Render Loops (Priority: P3)

**Goal**: Implement @for directive rendering with iteration variable scope

**Independent Test**: Provide templates with @for directives and array/object data

### Tests for User Story 3

- [ ] T034 [P] [US3] Test @for(item of array) iteration in packages/blade/tests/renderer.test.ts
- [ ] T035 [P] [US3] Test @for(item, index of array) with index in packages/blade/tests/renderer.test.ts
- [ ] T036 [P] [US3] Test @for(key in object) iteration in packages/blade/tests/renderer.test.ts
- [ ] T037 [P] [US3] Test empty array renders nothing in packages/blade/tests/renderer.test.ts
- [ ] T038 [P] [US3] Test nested @for loops with separate scopes in packages/blade/tests/renderer.test.ts
- [ ] T039 [P] [US3] Test iteration limit enforcement in packages/blade/tests/renderer.test.ts

### Implementation for User Story 3

- [ ] T040 [US3] Implement renderForNode() with array iteration in packages/blade/src/renderer/index.ts
- [ ] T041 [US3] Add object key iteration (for...in) support in packages/blade/src/renderer/index.ts
- [ ] T042 [US3] Implement createLoopScope() for iteration variables in packages/blade/src/renderer/index.ts
- [ ] T043 [US3] Add iteration counting and limit checking in packages/blade/src/renderer/index.ts
- [ ] T044 [US3] Add loop nesting depth tracking in packages/blade/src/renderer/index.ts
- [ ] T045 [US3] Wire ForNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T046 [US3] Verify all US3 acceptance scenarios pass

**Checkpoint**: ✅ User Story 3 complete - loops work independently

---

## Phase 6: User Story 4 - Render Pattern Matching (Priority: P4)

**Goal**: Implement @match directive rendering with literal and expression cases

**Independent Test**: Provide templates with @match directives and various values

### Tests for User Story 4

- [ ] T047 [P] [US4] Test @match with string literal case in packages/blade/tests/renderer.test.ts
- [ ] T048 [P] [US4] Test @match with multiple literals (when 200, 201) in packages/blade/tests/renderer.test.ts
- [ ] T049 [P] [US4] Test @match with expression case (_.x > 10) in packages/blade/tests/renderer.test.ts
- [ ] T050 [P] [US4] Test @match default case (*) in packages/blade/tests/renderer.test.ts
- [ ] T051 [P] [US4] Test @match with no match and no default (empty) in packages/blade/tests/renderer.test.ts

### Implementation for User Story 4

- [ ] T052 [US4] Implement renderMatchNode() with case evaluation in packages/blade/src/renderer/index.ts
- [ ] T053 [US4] Add literal case matching (strict equality) in packages/blade/src/renderer/index.ts
- [ ] T054 [US4] Add expression case matching with _ binding in packages/blade/src/renderer/index.ts
- [ ] T055 [US4] Add default case handling in packages/blade/src/renderer/index.ts
- [ ] T056 [US4] Wire MatchNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T057 [US4] Verify all US4 acceptance scenarios pass

**Checkpoint**: ✅ User Story 4 complete - pattern matching works independently

---

## Phase 7: User Story 5 - Render Components with Props and Slots (Priority: P5)

**Goal**: Implement component rendering with isolated scope, props, and slots

**Independent Test**: Define component and instantiate with props and slot content

### Tests for User Story 5

- [ ] T058 [P] [US5] Test component renders with props in packages/blade/tests/renderer.test.ts
- [ ] T059 [P] [US5] Test default slot content injection in packages/blade/tests/renderer.test.ts
- [ ] T060 [P] [US5] Test named slot content injection in packages/blade/tests/renderer.test.ts
- [ ] T061 [P] [US5] Test slot fallback when no content provided in packages/blade/tests/renderer.test.ts
- [ ] T062 [P] [US5] Test component scope isolation (no parent access) in packages/blade/tests/renderer.test.ts
- [ ] T063 [P] [US5] Test nested components with isolated scopes in packages/blade/tests/renderer.test.ts
- [ ] T064 [P] [US5] Test component depth limit enforcement in packages/blade/tests/renderer.test.ts

### Implementation for User Story 5

- [ ] T065 [US5] Implement createComponentScope() with props only in packages/blade/src/renderer/index.ts
- [ ] T066 [US5] Implement renderComponentNode() with component lookup in packages/blade/src/renderer/index.ts
- [ ] T067 [US5] Add prop evaluation in caller's scope in packages/blade/src/renderer/index.ts
- [ ] T068 [US5] Implement slot content storage in render context in packages/blade/src/renderer/index.ts
- [ ] T069 [US5] Implement renderSlotNode() with fallback support in packages/blade/src/renderer/index.ts
- [ ] T070 [US5] Add component depth tracking and limit checking in packages/blade/src/renderer/index.ts
- [ ] T071 [US5] Wire ComponentNode and SlotNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T072 [US5] Verify all US5 acceptance scenarios pass

**Checkpoint**: ✅ User Story 5 complete - components work independently

---

## Phase 8: User Story 6 - Variable Declarations in Templates (Priority: P6)

**Goal**: Implement @@ let declarations for local and global variables

**Independent Test**: Declare variables in @@ blocks and reference in expressions

### Tests for User Story 6

- [ ] T073 [P] [US6] Test local variable declaration in packages/blade/tests/renderer.test.ts
- [ ] T074 [P] [US6] Test global variable declaration ($.name) in packages/blade/tests/renderer.test.ts
- [ ] T075 [P] [US6] Test multiple declarations referencing each other in packages/blade/tests/renderer.test.ts
- [ ] T076 [P] [US6] Test function declaration in packages/blade/tests/renderer.test.ts

### Implementation for User Story 6

- [ ] T077 [US6] Implement renderLetNode() for variable declarations in packages/blade/src/renderer/index.ts
- [ ] T078 [US6] Add local scope update in packages/blade/src/renderer/index.ts
- [ ] T079 [US6] Add global scope update ($.prefix) in packages/blade/src/renderer/index.ts
- [ ] T080 [US6] Wire LetNode into renderNode() switch in packages/blade/src/renderer/index.ts
- [ ] T081 [US6] Verify all US6 acceptance scenarios pass

**Checkpoint**: ✅ User Story 6 complete - variable declarations work independently

---

## Phase 9: User Story 7 - Source Tracking for Audit Trails (Priority: P7)

**Goal**: Add rd-source attributes for data provenance tracking

**Independent Test**: Enable source tracking and verify rd-source attributes on elements

### Tests for User Story 7

- [ ] T082 [P] [US7] Test rd-source attribute with single path in packages/blade/tests/renderer.test.ts
- [ ] T083 [P] [US7] Test rd-source with multiple paths (comma-separated) in packages/blade/tests/renderer.test.ts
- [ ] T084 [P] [US7] Test rd-source-op for helper calls in packages/blade/tests/renderer.test.ts
- [ ] T085 [P] [US7] Test source tracking disabled by default in packages/blade/tests/renderer.test.ts

### Implementation for User Story 7

- [ ] T086 [US7] Implement PathTracker class for collecting paths in packages/blade/src/renderer/index.ts
- [ ] T087 [US7] Track paths during expression evaluation in packages/blade/src/renderer/index.ts
- [ ] T088 [US7] Add rd-source attribute to elements when tracking enabled in packages/blade/src/renderer/index.ts
- [ ] T089 [US7] Add rd-source-op attribute for operation tracking in packages/blade/src/renderer/index.ts
- [ ] T090 [US7] Verify all US7 acceptance scenarios pass

**Checkpoint**: ✅ User Story 7 complete - source tracking works independently

---

## Phase 10: User Story 8 - Resource Limit Enforcement (Priority: P8)

**Goal**: Enforce resource limits to prevent runaway templates

**Independent Test**: Provide templates that exceed limits and verify errors thrown

### Tests for User Story 8

- [ ] T091 [P] [US8] Test iteration limit exceeded throws ResourceLimitError in packages/blade/tests/renderer.test.ts
- [ ] T092 [P] [US8] Test loop nesting limit exceeded throws error in packages/blade/tests/renderer.test.ts
- [ ] T093 [P] [US8] Test component depth limit exceeded throws error in packages/blade/tests/renderer.test.ts
- [ ] T094 [P] [US8] Test typical templates don't hit limits in packages/blade/tests/renderer.test.ts

### Implementation for User Story 8

- [ ] T095 [US8] Add limit configuration to RenderContext in packages/blade/src/renderer/index.ts
- [ ] T096 [US8] Add checkIterationLimit() with early termination in packages/blade/src/renderer/index.ts
- [ ] T097 [US8] Add checkLoopNesting() before loop body in packages/blade/src/renderer/index.ts
- [ ] T098 [US8] Add checkComponentDepth() before component render in packages/blade/src/renderer/index.ts
- [ ] T099 [US8] Verify all US8 acceptance scenarios pass

**Checkpoint**: ✅ User Story 8 complete - resource limits enforced

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, remaining node types, and documentation

- [ ] T100 [P] Implement renderFragmentNode() preserving whitespace in packages/blade/src/renderer/index.ts
- [ ] T101 [P] Implement renderCommentNode() with includeComments config in packages/blade/src/renderer/index.ts
- [ ] T102 [P] Test undefined expression renders as empty string in packages/blade/tests/renderer.test.ts
- [ ] T103 [P] Test self-closing tags (br, img) in packages/blade/tests/renderer.test.ts
- [ ] T104 [P] Test error propagation with source location in packages/blade/tests/renderer.test.ts
- [ ] T105 Implement RuntimeMetadata collection (paths, helpers, time) in packages/blade/src/renderer/index.ts
- [ ] T106 Add JSDoc comments to all exported functions in packages/blade/src/renderer/index.ts
- [ ] T107 Run full test suite and verify 100% acceptance scenario coverage
- [ ] T108 Run quickstart.md examples to validate documentation accuracy

**Checkpoint**: ✅ Implementation complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Phase 2 completion
  - Stories CAN proceed in parallel (each is independent)
  - Or sequentially: US1 → US2 → US3 → US4 → US5 → US6 → US7 → US8
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 - No dependencies on other stories
- **US2 (P2)**: Can start after Phase 2 - Independent of US1
- **US3 (P3)**: Can start after Phase 2 - Independent of US1, US2
- **US4 (P4)**: Can start after Phase 2 - Independent of US1-US3
- **US5 (P5)**: Can start after Phase 2 - Independent of US1-US4
- **US6 (P6)**: Can start after Phase 2 - Independent of US1-US5
- **US7 (P7)**: Can start after Phase 2 - Depends on US1 (element rendering)
- **US8 (P8)**: Can start after Phase 2 - Depends on US3, US5 (loops, components)

### Within Each User Story

- Tests FIRST, verify they FAIL before implementation
- Implementation tasks in order shown
- Verify acceptance scenarios pass before marking complete

### Parallel Opportunities

Within Phase 1 (Setup):
- T003, T004 can run in parallel (different functions)

Within each User Story:
- All test tasks marked [P] can run in parallel
- Implementation tasks are sequential within a story

Across User Stories:
- US1, US2, US3, US4, US5, US6 can all run in parallel after Phase 2
- US7 should follow US1 (needs element rendering)
- US8 should follow US3, US5 (needs loops and components)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together:
Task: "Test literal text rendering in packages/blade/tests/renderer.test.ts"
Task: "Test expression interpolation in packages/blade/tests/renderer.test.ts"
Task: "Test HTML escaping in packages/blade/tests/renderer.test.ts"
Task: "Test element with static attributes in packages/blade/tests/renderer.test.ts"
Task: "Test element with expression attributes in packages/blade/tests/renderer.test.ts"
Task: "Test boolean attribute handling in packages/blade/tests/renderer.test.ts"
Task: "Test null/undefined attribute omission in packages/blade/tests/renderer.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T011)
3. Complete Phase 3: User Story 1 (T012-T025)
4. **STOP and VALIDATE**: Run tests, verify basic rendering works
5. Can ship MVP with just text/element rendering

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Basic rendering works (MVP!)
3. Add US2 → Conditionals work
4. Add US3 → Loops work
5. Add US4 → Pattern matching works
6. Add US5 → Components work
7. Add US6 → Variables work
8. Add US7 → Source tracking works
9. Add US8 → Resource limits enforced
10. Polish → Edge cases, docs, validation

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (text/elements) → US7 (source tracking)
- Developer B: US2 (conditionals) → US6 (variables)
- Developer C: US3 (loops) → US8 (limits)
- Developer D: US4 (match) → US5 (components)

---

## Summary

| Phase | Tasks | Parallel | Description | Status |
|-------|-------|----------|-------------|--------|
| Setup | 6 | 2 | Error classes, utilities | |
| Foundational | 5 | 0 | Core render infrastructure | |
| US1 (P1) | 14 | 7 | Text/Element rendering - MVP | |
| US2 (P2) | 8 | 4 | Conditional rendering | |
| US3 (P3) | 13 | 6 | Loop rendering | |
| US4 (P4) | 11 | 5 | Pattern matching | |
| US5 (P5) | 15 | 7 | Component rendering | |
| US6 (P6) | 9 | 4 | Variable declarations | |
| US7 (P7) | 9 | 4 | Source tracking | |
| US8 (P8) | 9 | 4 | Resource limits | |
| Polish | 9 | 5 | Edge cases, docs | |
| **Total** | **108** | **48** | | |

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
