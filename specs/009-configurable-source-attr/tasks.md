# Tasks: Configurable Source Attribute

**Input**: Design documents from `/specs/009-configurable-source-attr/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included as this is a core functionality change requiring validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add validation constant and helper functions to renderer

- [x] T001 Add VALID_PREFIX_REGEX constant to packages/blade/src/renderer/index.ts
- [x] T002 Add validateSourceTrackingPrefix function to packages/blade/src/renderer/index.ts
- [x] T003 Add getSourceAttributeName helper function to packages/blade/src/renderer/index.ts
- [x] T004 Export validateSourceTrackingPrefix and getSourceAttributeName from packages/blade/src/renderer/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Integrate validation into render context creation

**⚠️ CRITICAL**: No user story verification can begin until this phase is complete

- [x] T005 Call validateSourceTrackingPrefix in createRenderContext before context creation in packages/blade/src/renderer/index.ts
- [x] T006 Verify existing tests pass after adding validation in packages/blade/tests/

**Checkpoint**: Foundation ready - user story verification can now begin

---

## Phase 3: User Story 1 - Custom Attribute Prefix (Priority: P1) 🎯 MVP

**Goal**: Developers can configure custom attribute prefixes for brand consistency

**Independent Test**: Set a custom prefix in render options and verify output HTML uses custom-prefixed attributes

### Tests for User Story 1

- [x] T007 [P] [US1] Test validateSourceTrackingPrefix accepts valid prefixes ('rd-', 'data-track-', 'audit_') in packages/blade/tests/renderer.test.ts
- [x] T008 [P] [US1] Test validateSourceTrackingPrefix rejects invalid prefixes ('123-', 'my@prefix', 'has space') in packages/blade/tests/renderer.test.ts
- [x] T009 [P] [US1] Test getSourceAttributeName generates correct names for all three base attributes in packages/blade/tests/renderer.test.ts

### Implementation for User Story 1

- [x] T010 [US1] Verify custom prefix flows through to render context config in packages/blade/src/renderer/index.ts
- [x] T011 [US1] Verify all US1 acceptance scenarios pass

**Checkpoint**: Custom prefix configuration fully functional

---

## Phase 4: User Story 2 - Avoid Attribute Conflicts (Priority: P2)

**Goal**: Developers can avoid attribute name conflicts with existing systems

**Independent Test**: Configure a unique prefix and verify no collisions with reserved attributes

### Tests for User Story 2

- [x] T012 [P] [US2] Test multiple render calls consistently use same prefix in packages/blade/tests/renderer.test.ts

### Implementation for User Story 2

- [x] T013 [US2] Verify prefix consistency across all elements in a single render operation in packages/blade/src/renderer/index.ts
- [x] T014 [US2] Verify all US2 acceptance scenarios pass

**Checkpoint**: Conflict avoidance fully functional

---

## Phase 5: User Story 3 - Default Behavior Preservation (Priority: P3)

**Goal**: Existing behavior unchanged - default 'rd-' prefix works without configuration

**Independent Test**: Render templates without custom prefix and verify default 'rd-source' attributes

### Tests for User Story 3

- [x] T015 [P] [US3] Test default prefix 'rd-' is used when no config specified in packages/blade/tests/renderer.test.ts
- [x] T016 [P] [US3] Test empty string prefix produces unprefixed attributes in packages/blade/tests/renderer.test.ts

### Implementation for User Story 3

- [x] T017 [US3] Verify DEFAULT_RENDER_CONFIG.sourceTrackingPrefix remains 'rd-' in packages/blade/src/renderer/index.ts
- [x] T018 [US3] Verify all US3 acceptance scenarios pass

**Checkpoint**: Backward compatibility verified

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and documentation

- [x] T019 Run full test suite to verify no regressions in packages/blade/
- [x] T020 Verify exports are available from package main entry in packages/blade/src/index.ts
- [x] T021 Run quickstart.md validation steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2

### Within Each User Story

- Tests first (T007-T009, T012, T015-T016)
- Implementation second (T010-T011, T013-T014, T017-T018)
- Verification at checkpoint

### Parallel Opportunities

- Setup tasks T001-T004 are sequential (same file)
- Test tasks within each story marked [P] can run in parallel
- User stories can be verified in parallel after Foundational phase

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests together:
Task: "Test validateSourceTrackingPrefix accepts valid prefixes"
Task: "Test validateSourceTrackingPrefix rejects invalid prefixes"
Task: "Test getSourceAttributeName generates correct names"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T006)
3. Complete Phase 3: User Story 1 (T007-T011)
4. **STOP and VALIDATE**: Test custom prefix configuration independently
5. Deploy/release if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Release (MVP!)
3. Add User Story 2 → Verify conflict avoidance
4. Add User Story 3 → Verify backward compatibility
5. Each story adds confidence without breaking previous functionality

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All changes are in a single file (packages/blade/src/renderer/index.ts) so parallelization is limited
- Tests are in packages/blade/tests/renderer.test.ts
- Commit after each phase completion
