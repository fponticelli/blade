# Tasks: Template Syntax Improvements & Helper Functions

**Input**: Design documents from `/specs/006-template-helpers-escaping/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**Tests**: Included per SC-006 requirement (100% test coverage for all new helper functions)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Package**: `packages/blade/src/` for source, `packages/blade/tests/` for tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Helper metadata infrastructure for LSP and documentation

- [x] T001 Create helper metadata types in packages/blade/src/helpers/metadata.ts
- [x] T002 [P] Add HelperCategory and HelperMetadata type definitions in packages/blade/src/helpers/metadata.ts
- [x] T003 [P] Create empty helpers test file in packages/blade/tests/helpers.test.ts
- [x] T004 [P] Create empty escaping test file in packages/blade/tests/escaping.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Polymorphic helper infrastructure and tokenizer escape handling

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create polymorphic `len` helper (array + string) in packages/blade/src/helpers/index.ts
- [x] T006 Create polymorphic `reverse` helper (array + string) in packages/blade/src/helpers/index.ts
- [x] T007 Create polymorphic `indexOf` helper (array + string) in packages/blade/src/helpers/index.ts
- [x] T008 Add tests for polymorphic helpers in packages/blade/tests/helpers.test.ts
- [x] T009 Export all new helpers from standardLibrary in packages/blade/src/helpers/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Literal @ and $ Characters (Priority: P1) 🎯 MVP

**Goal**: Template authors can render literal `@`, `$`, and `\` characters using escape sequences

**Independent Test**: Create template with `\@`, `\$`, `\\` and verify literal output

### Tests for User Story 1

- [x] T010 [P] [US1] Add escape sequence tokenizer tests in packages/blade/tests/escaping.test.ts
- [x] T011 [P] [US1] Add end-to-end escape rendering tests in packages/blade/tests/escaping.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Add escape sequence handling to tokenizer text scanning in packages/blade/src/parser/tokenizer.ts
- [x] T013 [US1] Handle `\@` escape (literal @) in packages/blade/src/parser/tokenizer.ts
- [x] T014 [US1] Handle `\$` escape (literal $) in packages/blade/src/parser/tokenizer.ts
- [x] T015 [US1] Handle `\\` escape (literal \) in packages/blade/src/parser/tokenizer.ts
- [x] T016 [US1] Handle backslash at end of template (literal \) in packages/blade/src/parser/tokenizer.ts
- [x] T017 [US1] Handle backslash followed by non-special char (both literal) in packages/blade/src/parser/tokenizer.ts
- [x] T018 [US1] Verify `@example` (invalid directive) renders as literal text in packages/blade/tests/escaping.test.ts
- [x] T019 [US1] Verify `$123` (invalid variable) renders as literal text in packages/blade/tests/escaping.test.ts
- [x] T020 [US1] Process escapes in attribute values in packages/blade/src/parser/tokenizer.ts

**Checkpoint**: User Story 1 complete - escape sequences work in all contexts

---

## Phase 4: User Story 2 - Array Utility Functions (Priority: P1)

**Goal**: Developers can use comprehensive array manipulation functions in templates

**Independent Test**: Use each array function in template expressions and verify results

### Tests for User Story 2

- [x] T021 [P] [US2] Add array helper unit tests in packages/blade/tests/helpers.test.ts
- [x] T022 [P] [US2] Add array helper edge case tests (null, non-array inputs) in packages/blade/tests/helpers.test.ts

### Implementation for User Story 2

- [x] T023 [P] [US2] Implement `slice(array, start, end?)` helper in packages/blade/src/helpers/index.ts
- [x] T024 [P] [US2] Implement `sort(array)` helper in packages/blade/src/helpers/index.ts
- [x] T025 [P] [US2] Implement `unique(array)` helper in packages/blade/src/helpers/index.ts
- [x] T026 [P] [US2] Implement `flatten(array)` helper in packages/blade/src/helpers/index.ts
- [x] T027 [P] [US2] Implement `compact(array)` helper in packages/blade/src/helpers/index.ts
- [x] T028 [P] [US2] Implement `pluck(array, key)` helper in packages/blade/src/helpers/index.ts
- [x] T029 [P] [US2] Implement `includes(array, value)` helper in packages/blade/src/helpers/index.ts
- [x] T030 [P] [US2] Implement `concat(...arrays)` helper in packages/blade/src/helpers/index.ts
- [x] T031 [US2] Add all array helpers to standardLibrary export in packages/blade/src/helpers/index.ts
- [x] T032 [US2] Add array helper metadata for LSP in packages/blade/src/helpers/metadata.ts

**Checkpoint**: User Story 2 complete - all array helpers available

---

## Phase 5: User Story 3 - String Utility Functions (Priority: P1)

**Goal**: Developers can use comprehensive string manipulation functions in templates

**Independent Test**: Use each string function in template expressions and verify results

### Tests for User Story 3

- [x] T033 [P] [US3] Add string helper unit tests in packages/blade/tests/helpers.test.ts
- [x] T034 [P] [US3] Add string helper edge case tests (null, non-string inputs) in packages/blade/tests/helpers.test.ts

### Implementation for User Story 3

- [x] T035 [P] [US3] Implement `uppercase(string)` alias for `upper` in packages/blade/src/helpers/index.ts
- [x] T036 [P] [US3] Implement `lowercase(string)` alias for `lower` in packages/blade/src/helpers/index.ts
- [x] T037 [P] [US3] Implement `capitalize(string)` helper in packages/blade/src/helpers/index.ts
- [x] T038 [P] [US3] Implement `uncapitalize(string)` helper in packages/blade/src/helpers/index.ts
- [x] T039 [P] [US3] Implement `titlecase(string)` helper in packages/blade/src/helpers/index.ts
- [x] T040 [P] [US3] Implement `startsWith(string, prefix)` helper in packages/blade/src/helpers/index.ts
- [x] T041 [P] [US3] Implement `endsWith(string, suffix)` helper in packages/blade/src/helpers/index.ts
- [x] T042 [P] [US3] Implement `contains(string, substring)` helper in packages/blade/src/helpers/index.ts
- [x] T043 [P] [US3] Implement `padStart(string, length, char?)` helper in packages/blade/src/helpers/index.ts
- [x] T044 [P] [US3] Implement `padEnd(string, length, char?)` helper in packages/blade/src/helpers/index.ts
- [x] T045 [P] [US3] Implement `split(string, delimiter)` helper in packages/blade/src/helpers/index.ts
- [x] T046 [P] [US3] Implement `charAt(string, index)` helper in packages/blade/src/helpers/index.ts
- [x] T047 [P] [US3] Implement `repeat(string, count)` helper in packages/blade/src/helpers/index.ts
- [x] T048 [P] [US3] Implement `truncate(string, length, suffix?)` helper in packages/blade/src/helpers/index.ts
- [x] T049 [US3] Add all string helpers to standardLibrary export in packages/blade/src/helpers/index.ts
- [x] T050 [US3] Add string helper metadata for LSP in packages/blade/src/helpers/metadata.ts

**Checkpoint**: User Story 3 complete - all string helpers available

---

## Phase 6: User Story 4 - Date Utility Functions (Priority: P2)

**Goal**: Developers can perform date calculations and extract date components in templates

**Independent Test**: Use each date function in template expressions and verify results

### Tests for User Story 4

- [x] T051 [P] [US4] Add date helper unit tests in packages/blade/tests/helpers.test.ts
- [x] T052 [P] [US4] Add date helper edge case tests (invalid dates) in packages/blade/tests/helpers.test.ts

### Implementation for User Story 4

- [x] T053 [P] [US4] Implement `addYears(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T054 [P] [US4] Implement `addMonths(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T055 [P] [US4] Implement `addWeeks(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T056 [P] [US4] Implement `addHours(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T057 [P] [US4] Implement `addMinutes(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T058 [P] [US4] Implement `addSeconds(date, n)` helper in packages/blade/src/helpers/index.ts
- [x] T059 [P] [US4] Implement `year(date)` helper in packages/blade/src/helpers/index.ts
- [x] T060 [P] [US4] Implement `month(date)` helper (1-indexed) in packages/blade/src/helpers/index.ts
- [x] T061 [P] [US4] Implement `day(date)` helper in packages/blade/src/helpers/index.ts
- [x] T062 [P] [US4] Implement `weekday(date)` helper (0-6, Sunday=0) in packages/blade/src/helpers/index.ts
- [x] T063 [P] [US4] Implement `hour(date)` helper in packages/blade/src/helpers/index.ts
- [x] T064 [P] [US4] Implement `minute(date)` helper in packages/blade/src/helpers/index.ts
- [x] T065 [P] [US4] Implement `second(date)` helper in packages/blade/src/helpers/index.ts
- [x] T066 [P] [US4] Implement `diffDays(date1, date2)` helper in packages/blade/src/helpers/index.ts
- [x] T067 [P] [US4] Implement `isBefore(date1, date2)` helper in packages/blade/src/helpers/index.ts
- [x] T068 [P] [US4] Implement `isAfter(date1, date2)` helper in packages/blade/src/helpers/index.ts
- [x] T069 [P] [US4] Implement `parseDate(string, format?)` helper in packages/blade/src/helpers/index.ts
- [x] T070 [US4] Add all date helpers to standardLibrary export in packages/blade/src/helpers/index.ts
- [x] T071 [US4] Add date helper metadata for LSP in packages/blade/src/helpers/metadata.ts

**Checkpoint**: User Story 4 complete - all date helpers available

---

## Phase 7: User Story 5 - Number Utility Functions (Priority: P2)

**Goal**: Developers can use extended math operations and number conversions in templates

**Independent Test**: Use each number function in template expressions and verify results

### Tests for User Story 5

- [x] T072 [P] [US5] Add number helper unit tests in packages/blade/tests/helpers.test.ts
- [x] T073 [P] [US5] Add number helper edge case tests (NaN, Infinity, strings) in packages/blade/tests/helpers.test.ts

### Implementation for User Story 5

- [x] T074 [P] [US5] Implement `sign(number)` helper in packages/blade/src/helpers/index.ts
- [x] T075 [P] [US5] Implement `sqrt(number)` helper in packages/blade/src/helpers/index.ts
- [x] T076 [P] [US5] Implement `pow(base, exponent)` helper in packages/blade/src/helpers/index.ts
- [x] T077 [P] [US5] Implement `clamp(number, min, max)` helper in packages/blade/src/helpers/index.ts
- [x] T078 [P] [US5] Implement `trunc(number)` helper in packages/blade/src/helpers/index.ts
- [x] T079 [P] [US5] Implement `random()` helper in packages/blade/src/helpers/index.ts
- [x] T080 [P] [US5] Implement `randomInt(min, max)` helper in packages/blade/src/helpers/index.ts
- [x] T081 [P] [US5] Implement `isNaN(value)` helper in packages/blade/src/helpers/index.ts
- [x] T082 [P] [US5] Implement `isFinite(value)` helper in packages/blade/src/helpers/index.ts
- [x] T083 [P] [US5] Implement `toNumber(value)` helper in packages/blade/src/helpers/index.ts
- [x] T084 [P] [US5] Implement `toInt(string, radix?)` helper in packages/blade/src/helpers/index.ts
- [x] T085 [US5] Add all number helpers to standardLibrary export in packages/blade/src/helpers/index.ts
- [x] T086 [US5] Add number helper metadata for LSP in packages/blade/src/helpers/metadata.ts

**Checkpoint**: User Story 5 complete - all number helpers available

---

## Phase 8: User Story 6 - Logic/Utility Functions (Priority: P2)

**Goal**: Developers can use type checking, null handling, and JSON functions in templates

**Independent Test**: Use each utility function in template expressions and verify results

### Tests for User Story 6

- [x] T087 [P] [US6] Add utility helper unit tests in packages/blade/tests/helpers.test.ts
- [x] T088 [P] [US6] Add utility helper edge case tests in packages/blade/tests/helpers.test.ts

### Implementation for User Story 6

- [x] T089 [P] [US6] Implement `default(value, defaultValue)` helper in packages/blade/src/helpers/index.ts
- [x] T090 [P] [US6] Implement `type(value)` helper in packages/blade/src/helpers/index.ts
- [x] T091 [P] [US6] Implement `isEmpty(value)` helper in packages/blade/src/helpers/index.ts
- [x] T092 [P] [US6] Implement `isNull(value)` helper in packages/blade/src/helpers/index.ts
- [x] T093 [P] [US6] Implement `isDefined(value)` helper in packages/blade/src/helpers/index.ts
- [x] T094 [P] [US6] Implement `isArray(value)` helper in packages/blade/src/helpers/index.ts
- [x] T095 [P] [US6] Implement `isString(value)` helper in packages/blade/src/helpers/index.ts
- [x] T096 [P] [US6] Implement `isNumber(value)` helper in packages/blade/src/helpers/index.ts
- [x] T097 [P] [US6] Implement `isBoolean(value)` helper in packages/blade/src/helpers/index.ts
- [x] T098 [P] [US6] Implement `toString(value)` helper in packages/blade/src/helpers/index.ts
- [x] T099 [P] [US6] Implement `fromJson(string)` helper in packages/blade/src/helpers/index.ts
- [x] T100 [P] [US6] Implement `toJson(value)` helper in packages/blade/src/helpers/index.ts
- [x] T101 [US6] Add all utility helpers to standardLibrary export in packages/blade/src/helpers/index.ts
- [x] T102 [US6] Add utility helper metadata for LSP in packages/blade/src/helpers/metadata.ts

**Checkpoint**: User Story 6 complete - all utility helpers available

---

## Phase 9: LSP Integration

**Purpose**: Add autocompletion and hover documentation for all helpers

- [x] T103 [P] Add helper function completions to LSP in packages/blade/src/lsp/providers/completion.ts
- [x] T104 [P] Add helper function hover documentation in packages/blade/src/lsp/providers/hover.ts
- [x] T105 Add helper metadata integration to completion provider in packages/blade/src/lsp/providers/completion.ts
- [x] T106 Add helper metadata integration to hover provider in packages/blade/src/lsp/providers/hover.ts
- [x] T107 [P] Add LSP completion tests for helpers in packages/blade/tests/lsp/completion.test.ts

**Checkpoint**: LSP integration complete - SC-002 and SC-007 satisfied

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T108 Verify backward compatibility with existing templates (SC-004) in packages/blade/tests/
- [x] T109 [P] Update docs/SPECIFICATION.md with escape sequences and new helpers
- [x] T110 [P] Verify all helpers use setWarning (NFR-001) - code review in packages/blade/src/helpers/index.ts
- [x] T111 Run full test suite and verify 100% helper coverage (SC-006)
- [x] T112 Run quickstart.md validation scenarios
- [x] T113 Type check and lint pass (npm run typecheck && npm run lint)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (Escaping): Independent - can start immediately after Phase 2
  - US2 (Arrays): Independent - can start immediately after Phase 2
  - US3 (Strings): Independent - can start immediately after Phase 2
  - US4 (Dates): Independent - can start immediately after Phase 2
  - US5 (Numbers): Independent - can start immediately after Phase 2
  - US6 (Utilities): Independent - can start immediately after Phase 2
- **LSP Integration (Phase 9)**: Depends on all user stories (needs metadata)
- **Polish (Phase 10)**: Depends on LSP integration

### User Story Dependencies

- **US1 (Escaping)**: NONE - tokenizer-only changes
- **US2 (Arrays)**: Depends on `len`, `reverse`, `indexOf` from Phase 2
- **US3 (Strings)**: Depends on `len`, `reverse`, `indexOf` from Phase 2
- **US4 (Dates)**: NONE - extends existing `addDays`
- **US5 (Numbers)**: NONE - extends existing math helpers
- **US6 (Utilities)**: NONE - new utilities

### Within Each User Story

- Tests written FIRST (TDD approach)
- Helpers implemented in parallel (different functions)
- Export + metadata at end of story

### Parallel Opportunities

**Phase 2 (Foundational)**:
- T005, T006, T007 are sequential (same file, related functions)

**Phase 3 (US1 - Escaping)**:
- T010, T011 tests in parallel
- T012-T020 sequential (same tokenizer file)

**Phase 4-8 (US2-US6 - Helpers)**:
- All helper implementations within a story can run in parallel
- Different user stories can run in parallel

**Phase 9 (LSP)**:
- T103, T104, T107 in parallel

---

## Parallel Example: User Story 2 (Arrays)

```bash
# Launch all array helper implementations in parallel:
Task: "Implement slice(array, start, end?) in packages/blade/src/helpers/index.ts"
Task: "Implement sort(array) in packages/blade/src/helpers/index.ts"
Task: "Implement unique(array) in packages/blade/src/helpers/index.ts"
Task: "Implement flatten(array) in packages/blade/src/helpers/index.ts"
Task: "Implement compact(array) in packages/blade/src/helpers/index.ts"
Task: "Implement pluck(array, key) in packages/blade/src/helpers/index.ts"
Task: "Implement includes(array, value) in packages/blade/src/helpers/index.ts"
Task: "Implement concat(...arrays) in packages/blade/src/helpers/index.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (Escaping) - **Core syntax improvement**
4. Complete Phase 4: US2 (Arrays) - **Most commonly needed**
5. Complete Phase 5: US3 (Strings) - **Second most common**
6. **STOP and VALIDATE**: Test all three stories
7. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Escaping) → Test → **Immediate value for email/price display**
3. Add US2 (Arrays) → Test → **Data manipulation capability**
4. Add US3 (Strings) → Test → **Text formatting capability**
5. Add US4-6 (P2 priorities) → Test → **Extended library**
6. Add LSP + Polish → **Full feature complete**

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (Escaping) + US4 (Dates)
- Developer B: US2 (Arrays) + US5 (Numbers)
- Developer C: US3 (Strings) + US6 (Utilities)

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 113 |
| **Setup Phase** | 4 |
| **Foundational Phase** | 5 |
| **US1 (Escaping)** | 11 |
| **US2 (Arrays)** | 12 |
| **US3 (Strings)** | 18 |
| **US4 (Dates)** | 21 |
| **US5 (Numbers)** | 15 |
| **US6 (Utilities)** | 16 |
| **LSP Integration** | 5 |
| **Polish** | 6 |
| **Parallel Tasks** | 78 (69%) |

**MVP Scope**: US1-US3 (P1 priorities) = 46 tasks
**Full Scope**: All user stories + LSP + Polish = 113 tasks

---

## Notes

- [P] tasks = different files or independent functions
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after implementation
- Verify tests fail before implementing (TDD)
- Commit after each helper or logical group
- All helpers MUST use `setWarning` callback, never throw
