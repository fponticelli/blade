# Tasks: Expression Evaluator

**Input**: Design documents from `/specs/001-expression-evaluator/`
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

**Purpose**: Prepare evaluator module structure and error handling infrastructure

- [x] T001 Add EvaluationError class with location and code properties in packages/blade/src/evaluator/index.ts
- [x] T002 Export EvaluationError from packages/blade/src/index.ts
- [x] T003 Create test file packages/blade/tests/evaluator.test.ts with Vitest setup

**Checkpoint**: ✅ Error handling infrastructure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utility functions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement accessProperty() helper for null-safe property access in packages/blade/src/evaluator/index.ts
- [x] T005 Implement resolveFirstSegment() for scope hierarchy lookup in packages/blade/src/evaluator/index.ts
- [x] T006 Implement evaluateLiteral() for LiteralNode handling in packages/blade/src/evaluator/index.ts
- [x] T007 Create evaluate() function skeleton with switch on node.kind in packages/blade/src/evaluator/index.ts

**Checkpoint**: ✅ Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Evaluate Simple Data Access (Priority: P1) 🎯 MVP

**Goal**: Access data values using path expressions like `$order.total` or `$user.name`

**Independent Test**: Provide a data object and evaluate path expressions, verify correct values returned

### Tests for User Story 1

- [x] T008 [P] [US1] Test literal evaluation (string, number, boolean, null) in packages/blade/tests/evaluator.test.ts
- [x] T009 [P] [US1] Test simple path access (data.user.name) in packages/blade/tests/evaluator.test.ts
- [x] T010 [P] [US1] Test array index access (items[0].name) in packages/blade/tests/evaluator.test.ts
- [x] T011 [P] [US1] Test implicit optional chaining (null paths return undefined) in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Implement evaluatePath() for PathNode with key segments in packages/blade/src/evaluator/index.ts
- [x] T013 [US1] Add index segment handling to evaluatePath() in packages/blade/src/evaluator/index.ts
- [x] T014 [US1] Wire evaluatePath() into main evaluate() switch in packages/blade/src/evaluator/index.ts
- [x] T015 [US1] Verify all US1 acceptance scenarios pass

**Checkpoint**: ✅ User Story 1 complete - basic data access works independently

---

## Phase 4: User Story 2 - Evaluate Arithmetic and Comparison Expressions (Priority: P2)

**Goal**: Perform calculations and comparisons like `${price * quantity}` or `${total > 100}`

**Independent Test**: Evaluate expressions with arithmetic/comparison operators, verify correct results

### Tests for User Story 2

- [x] T016 [P] [US2] Test arithmetic operators (+, -, *, /, %) in packages/blade/tests/evaluator.test.ts
- [x] T017 [P] [US2] Test comparison operators (==, !=, <, >, <=, >=) in packages/blade/tests/evaluator.test.ts
- [x] T018 [P] [US2] Test logical operators (&&, ||) in packages/blade/tests/evaluator.test.ts
- [x] T019 [P] [US2] Test unary operators (!, -) in packages/blade/tests/evaluator.test.ts
- [x] T020 [P] [US2] Test type coercion (string concat, boolean to number, null handling) in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 2

- [x] T021 [US2] Implement evaluateUnary() for ! and - operators in packages/blade/src/evaluator/index.ts
- [x] T022 [US2] Implement evaluateBinary() with arithmetic operators (+, -, *, /, %) in packages/blade/src/evaluator/index.ts
- [x] T023 [US2] Add comparison operators to evaluateBinary() (==, !=, <, >, <=, >=) in packages/blade/src/evaluator/index.ts
- [x] T024 [US2] Add logical operators with short-circuit evaluation (&&, ||) in packages/blade/src/evaluator/index.ts
- [x] T025 [US2] Wire evaluateUnary() and evaluateBinary() into main evaluate() switch in packages/blade/src/evaluator/index.ts
- [x] T026 [US2] Verify all US2 acceptance scenarios pass

**Checkpoint**: ✅ User Story 2 complete - arithmetic and comparisons work independently

---

## Phase 5: User Story 3 - Evaluate Helper Function Calls (Priority: P3)

**Goal**: Call helper functions like `$formatCurrency(order.total)` with scope currying

**Independent Test**: Register helper functions, evaluate call expressions, verify invocation with scope

### Tests for User Story 3

- [x] T027 [P] [US3] Test helper function currying with scope access in packages/blade/tests/evaluator.test.ts
- [x] T028 [P] [US3] Test helper with multiple arguments in packages/blade/tests/evaluator.test.ts
- [x] T029 [P] [US3] Test unknown helper throws EvaluationError in packages/blade/tests/evaluator.test.ts
- [x] T030 [P] [US3] Test helper error propagation in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 3

- [x] T031 [US3] Implement evaluateCall() with helper lookup and currying in packages/blade/src/evaluator/index.ts
- [x] T032 [US3] Add argument evaluation before helper invocation in packages/blade/src/evaluator/index.ts
- [x] T033 [US3] Add error handling for unknown helpers in packages/blade/src/evaluator/index.ts
- [x] T034 [US3] Wire evaluateCall() into main evaluate() switch in packages/blade/src/evaluator/index.ts
- [x] T035 [US3] Verify all US3 acceptance scenarios pass

**Checkpoint**: ✅ User Story 3 complete - helper functions work independently

---

## Phase 6: User Story 4 - Evaluate Array Wildcard Expressions (Priority: P4)

**Goal**: Use wildcard expressions like `$items[*].price` to extract arrays of values

**Independent Test**: Provide array data, evaluate wildcard path expressions, verify array extraction

### Tests for User Story 4

- [x] T036 [P] [US4] Test single wildcard extraction (items[*].price) in packages/blade/tests/evaluator.test.ts
- [x] T037 [P] [US4] Test nested wildcard flattening (depts[*].employees[*].salary) in packages/blade/tests/evaluator.test.ts
- [x] T038 [P] [US4] Test empty array wildcard returns empty array in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 4

- [x] T039 [US4] Implement evaluateWildcard() with star segment handling in packages/blade/src/evaluator/index.ts
- [x] T040 [US4] Add nested wildcard flattening logic in packages/blade/src/evaluator/index.ts
- [x] T041 [US4] Wire evaluateWildcard() into main evaluate() switch in packages/blade/src/evaluator/index.ts
- [x] T042 [US4] Verify all US4 acceptance scenarios pass

**Checkpoint**: ✅ User Story 4 complete - wildcards work independently

---

## Phase 7: User Story 5 - Evaluate Conditional and Nullish Expressions (Priority: P5)

**Goal**: Use ternary `${condition ? a : b}` and nullish coalescing `${value ?? default}`

**Independent Test**: Evaluate ternary and nullish expressions with various truthy/falsy values

### Tests for User Story 5

- [x] T043 [P] [US5] Test ternary with truthy condition in packages/blade/tests/evaluator.test.ts
- [x] T044 [P] [US5] Test ternary with falsy condition in packages/blade/tests/evaluator.test.ts
- [x] T045 [P] [US5] Test nullish coalescing with null/undefined in packages/blade/tests/evaluator.test.ts
- [x] T046 [P] [US5] Test nullish coalescing with falsy but non-null values (0, "") in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 5

- [x] T047 [US5] Implement evaluateTernary() with short-circuit branch evaluation in packages/blade/src/evaluator/index.ts
- [x] T048 [US5] Add nullish coalescing (??) to evaluateBinary() with short-circuit in packages/blade/src/evaluator/index.ts
- [x] T049 [US5] Wire evaluateTernary() into main evaluate() switch in packages/blade/src/evaluator/index.ts
- [x] T050 [US5] Verify all US5 acceptance scenarios pass

**Checkpoint**: ✅ User Story 5 complete - conditionals work independently

---

## Phase 8: User Story 6 - Resolve Variables from Scope Hierarchy (Priority: P6)

**Goal**: Variables resolve through scope hierarchy (locals → data → globals) with $.prefix for globals

**Independent Test**: Setup scope with locals, data, and globals; verify resolution order

### Tests for User Story 6

- [x] T051 [P] [US6] Test locals take precedence over data in packages/blade/tests/evaluator.test.ts
- [x] T052 [P] [US6] Test data accessed when not in locals in packages/blade/tests/evaluator.test.ts
- [x] T053 [P] [US6] Test $.prefix accesses globals directly in packages/blade/tests/evaluator.test.ts
- [x] T054 [P] [US6] Test missing variables return undefined in packages/blade/tests/evaluator.test.ts

### Implementation for User Story 6

- [x] T055 [US6] Update resolveFirstSegment() to check locals before data in packages/blade/src/evaluator/index.ts
- [x] T056 [US6] Update evaluatePath() to use isGlobal flag for $.prefix paths in packages/blade/src/evaluator/index.ts
- [x] T057 [US6] Verify all US6 acceptance scenarios pass

**Checkpoint**: ✅ User Story 6 complete - scope hierarchy works independently

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, documentation, and final validation

- [x] T058 [P] Test division by zero returns NaN in packages/blade/tests/evaluator.test.ts
- [x] T059 [P] Test array index out of bounds returns undefined in packages/blade/tests/evaluator.test.ts
- [x] T060 [P] Test type coercion edge cases (true+5, "5"+3, 5+null, 5+undefined) in packages/blade/tests/evaluator.test.ts
- [x] T061 Add JSDoc comments to all exported functions in packages/blade/src/evaluator/index.ts
- [x] T062 Run full test suite and verify 100% acceptance scenario coverage
- [x] T063 Run quickstart.md examples to validate documentation accuracy

**Checkpoint**: ✅ Implementation complete - 58/58 tests passing, quickstart validated

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Phase 2 completion
  - Stories CAN proceed in parallel (each is independent)
  - Or sequentially: US1 → US2 → US3 → US4 → US5 → US6
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 - No dependencies on other stories
- **US2 (P2)**: Can start after Phase 2 - Independent of US1
- **US3 (P3)**: Can start after Phase 2 - Independent of US1, US2
- **US4 (P4)**: Can start after Phase 2 - Independent of US1-US3
- **US5 (P5)**: Can start after Phase 2 - Depends on US2 (binary operators for ??)
- **US6 (P6)**: Can start after Phase 2 - Independent (enhances US1 scope resolution)

### Within Each User Story

- Tests FIRST, verify they FAIL before implementation
- Implementation tasks in order shown
- Verify acceptance scenarios pass before marking complete

### Parallel Opportunities

Within Phase 2 (Foundational):
- T004, T005, T006 can run in parallel (different functions)

Within each User Story:
- All test tasks marked [P] can run in parallel
- Implementation tasks are sequential within a story

Across User Stories:
- US1, US2, US3, US4, US6 can all run in parallel after Phase 2
- US5 should follow US2 (shares binary operator infrastructure)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together:
Task: "Test literal evaluation in packages/blade/tests/evaluator.test.ts"
Task: "Test simple path access in packages/blade/tests/evaluator.test.ts"
Task: "Test array index access in packages/blade/tests/evaluator.test.ts"
Task: "Test implicit optional chaining in packages/blade/tests/evaluator.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007)
3. Complete Phase 3: User Story 1 (T008-T015)
4. **STOP and VALIDATE**: Run tests, verify basic data access works
5. Can ship MVP with just path evaluation

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Basic data access works (MVP!)
3. Add US2 → Arithmetic and comparisons work
4. Add US3 → Helper functions work
5. Add US4 → Wildcards work
6. Add US5 → Conditionals work
7. Add US6 → Full scope hierarchy works
8. Polish → Edge cases, docs, validation

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (path evaluation)
- Developer B: US2 (operators)
- Developer C: US3 (helpers)
- Developer D: US4 (wildcards)
- US5 and US6 follow after US2 infrastructure is ready

---

## Summary

| Phase | Tasks | Parallel | Description | Status |
|-------|-------|----------|-------------|--------|
| Setup | 3 | 0 | Error class, exports, test file | ✅ |
| Foundational | 4 | 3 | Utility functions, evaluate skeleton | ✅ |
| US1 (P1) | 8 | 4 | Path evaluation - MVP | ✅ |
| US2 (P2) | 11 | 5 | Operators | ✅ |
| US3 (P3) | 9 | 4 | Helper functions | ✅ |
| US4 (P4) | 7 | 3 | Wildcards | ✅ |
| US5 (P5) | 8 | 4 | Conditionals | ✅ |
| US6 (P6) | 7 | 4 | Scope hierarchy | ✅ |
| Polish | 6 | 3 | Edge cases, docs | ✅ |
| **Total** | **63** | **30** | | **63/63** |

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
