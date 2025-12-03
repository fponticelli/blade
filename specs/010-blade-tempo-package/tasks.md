# Tasks: @bladets/tempo

**Input**: Design documents from `/specs/010-blade-tempo-package/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Package location**: `packages/blade-tempo/`
- Source files in `packages/blade-tempo/src/`
- Tests in `packages/blade-tempo/tests/`

---

## Phase 1: Setup (Package Infrastructure)

**Purpose**: Create the new package structure with build tooling

- [x] T001 Create package directory structure at packages/blade-tempo/
- [x] T002 Create package.json with @bladets/tempo name, peer deps (@bladets/template, @tempots/dom), and scripts in packages/blade-tempo/package.json
- [x] T003 [P] Create tsconfig.json extending root config in packages/blade-tempo/tsconfig.json
- [x] T004 [P] Create vite.config.ts for library build with ESM/CJS outputs in packages/blade-tempo/vite.config.ts
- [x] T005 [P] Create .gitignore for package in packages/blade-tempo/.gitignore

**Checkpoint**: Package skeleton ready, `npm install` works

---

## Phase 2: Foundational (Core Types & Infrastructure)

**Purpose**: Core types and infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Define public TypeScript types (TempoRenderOptions, TempoRenderer) in packages/blade-tempo/src/types.ts
- [ ] T007 Create RenderContext internal type for node converters in packages/blade-tempo/src/types.ts
- [ ] T008 Create NodeConverter type signature in packages/blade-tempo/src/types.ts
- [ ] T009 Create base node converter dispatcher (switch on node.kind) in packages/blade-tempo/src/renderable.ts
- [ ] T010 Create reactive evaluator wrapper (evaluateReactive) that wraps Blade's evaluate() with signal.map() in packages/blade-tempo/src/evaluator.ts
- [ ] T011 Add error handling wrapper for expression evaluation (try/catch → empty string + console.warn) in packages/blade-tempo/src/evaluator.ts
- [ ] T012 Create main index.ts with placeholder createTempoRenderer export in packages/blade-tempo/src/index.ts

**Checkpoint**: Foundation ready - types compile, evaluator handles signals

---

## Phase 3: User Story 1 - Render Template as Reactive UI Component (Priority: P1) 🎯 MVP

**Goal**: Developers can render Blade templates as reactive Tempo Renderables that update when data signals change

**Independent Test**: Compile a template with `${name}`, pass to createTempoRenderer, mount with signal, verify DOM shows initial value and updates when signal changes

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement TextNode converter (literal + expression segments) in packages/blade-tempo/src/nodes/text.ts
- [ ] T014 [P] [US1] Implement ElementNode converter (html.* with static/dynamic attributes) in packages/blade-tempo/src/nodes/element.ts
- [ ] T015 [P] [US1] Implement IfNode converter using Tempo's when() in packages/blade-tempo/src/nodes/if.ts
- [ ] T016 [P] [US1] Implement ForNode converter using Tempo's foreach() in packages/blade-tempo/src/nodes/for.ts
- [ ] T017 [P] [US1] Implement FragmentNode converter using Tempo's fragment() in packages/blade-tempo/src/nodes/fragment.ts
- [ ] T018 [US1] Wire up node converters in dispatcher (text, element, if, for, fragment) in packages/blade-tempo/src/renderable.ts
- [ ] T019 [US1] Implement createTempoRenderer factory function with template validation in packages/blade-tempo/src/renderable.ts
- [ ] T020 [US1] Export createTempoRenderer and types from main entry point in packages/blade-tempo/src/index.ts
- [ ] T021 [US1] Add HTML escaping for expression outputs using Blade's escapeHtml in packages/blade-tempo/src/nodes/text.ts

**Checkpoint**: MVP complete - basic templates render reactively with expressions, conditionals, and loops

---

## Phase 4: User Story 2 - Integrate with Existing Tempo Application (Priority: P2)

**Goal**: Blade Renderables compose naturally with Tempo apps, follow lifecycle patterns, support components and slots

**Independent Test**: Create Tempo app with native components, embed blade-tempo Renderable, verify mount/unmount lifecycle and conditional activation

### Implementation for User Story 2

- [ ] T022 [P] [US2] Implement MatchNode converter with nested when() calls in packages/blade-tempo/src/nodes/match.ts
- [ ] T023 [P] [US2] Implement LetNode converter for local signal/computed creation in packages/blade-tempo/src/nodes/let.ts
- [ ] T024 [P] [US2] Implement ComponentNode converter with isolated scope in packages/blade-tempo/src/nodes/component.ts
- [ ] T025 [P] [US2] Implement SlotNode converter for content projection in packages/blade-tempo/src/nodes/slot.ts
- [ ] T026 [P] [US2] Implement CommentNode handling (skip or render based on config) in packages/blade-tempo/src/nodes/comment.ts
- [ ] T027 [US2] Wire up remaining node converters (match, let, component, slot, comment) in packages/blade-tempo/src/renderable.ts
- [ ] T028 [US2] Verify Tempo lifecycle cleanup (signals auto-dispose on unmount) in packages/blade-tempo/src/renderable.ts
- [ ] T029 [US2] Add support for multiple independent blade-tempo Renderables in same app in packages/blade-tempo/src/renderable.ts

**Checkpoint**: Full Tempo integration - components, slots, lifecycle all work

---

## Phase 5: User Story 3 - Use Helper Functions in Reactive Templates (Priority: P3)

**Goal**: Custom helper functions work correctly in reactive context, re-evaluated on signal updates

**Independent Test**: Register formatCurrency helper, use in template, verify output updates when data signal changes

### Implementation for User Story 3

- [ ] T030 [US3] Add helpers parameter to createTempoRenderer options in packages/blade-tempo/src/renderable.ts
- [ ] T031 [US3] Pass helpers to RenderContext for node converters in packages/blade-tempo/src/renderable.ts
- [ ] T032 [US3] Integrate helpers into evaluateReactive function in packages/blade-tempo/src/evaluator.ts
- [ ] T033 [US3] Add globals parameter to createTempoRenderer options in packages/blade-tempo/src/renderable.ts
- [ ] T034 [US3] Pass globals to RenderContext for expression evaluation in packages/blade-tempo/src/renderable.ts
- [ ] T035 [US3] Add error handling for helper function exceptions in packages/blade-tempo/src/evaluator.ts
- [ ] T036 [US3] Verify helpers are re-evaluated on each signal update in packages/blade-tempo/src/evaluator.ts

**Checkpoint**: Helpers and globals work - formatCurrency, formatDate, custom helpers all function correctly

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Source tracking, documentation, build validation

- [ ] T037 [P] Add includeSourceTracking option to TempoRenderOptions in packages/blade-tempo/src/types.ts
- [ ] T038 [P] Add sourceTrackingPrefix option to TempoRenderOptions in packages/blade-tempo/src/types.ts
- [ ] T039 Implement rd-source attribute injection in ElementNode converter in packages/blade-tempo/src/nodes/element.ts
- [ ] T040 [P] Add onError callback option to TempoRenderOptions in packages/blade-tempo/src/types.ts
- [ ] T041 Wire onError callback through RenderContext to evaluator in packages/blade-tempo/src/evaluator.ts
- [ ] T042 [P] Create README.md with installation, usage, and API docs in packages/blade-tempo/README.md
- [ ] T043 Verify build produces ESM and CJS outputs with correct exports in packages/blade-tempo/
- [ ] T044 Verify bundle size is under 10KB gzipped in packages/blade-tempo/
- [ ] T045 Run quickstart.md validation - ensure example code works in packages/blade-tempo/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories should proceed sequentially in priority order (P1 → P2 → P3)
  - US2 builds on node converters from US1
  - US3 builds on context passing from US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after US1 - Adds remaining node converters
- **User Story 3 (P3)**: Can start after US2 - Adds helpers/globals to existing infrastructure

### Within Each User Story

- Node converters marked [P] can run in parallel (different files)
- Wiring/integration tasks must wait for converters
- Export tasks come last

### Parallel Opportunities

**Phase 1 - Setup**:
```
Task: "Create tsconfig.json" [P]
Task: "Create vite.config.ts" [P]
Task: "Create .gitignore" [P]
```

**Phase 3 - US1 Node Converters**:
```
Task: "Implement TextNode converter" [P]
Task: "Implement ElementNode converter" [P]
Task: "Implement IfNode converter" [P]
Task: "Implement ForNode converter" [P]
Task: "Implement FragmentNode converter" [P]
```

**Phase 4 - US2 Node Converters**:
```
Task: "Implement MatchNode converter" [P]
Task: "Implement LetNode converter" [P]
Task: "Implement ComponentNode converter" [P]
Task: "Implement SlotNode converter" [P]
Task: "Implement CommentNode handling" [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test basic template rendering with expressions, @if, @for
5. Package is usable for simple templates

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test text/element/if/for → MVP usable!
3. Add User Story 2 → Test components/slots/match → Full Tempo integration
4. Add User Story 3 → Test helpers/globals → Complete feature set
5. Add Polish → Production ready

### Suggested Commit Points

- After Phase 1: "feat(tempo): initialize package structure"
- After Phase 2: "feat(tempo): add core types and evaluator"
- After US1: "feat(tempo): implement core reactive rendering (MVP)"
- After US2: "feat(tempo): add component and slot support"
- After US3: "feat(tempo): add helper and global variable support"
- After Polish: "feat(tempo): add source tracking and documentation"

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each user story checkpoint enables independent validation
- Node converters follow pattern from research.md (Blade Node → Tempo Renderable mapping)
- Evaluator wraps existing Blade evaluate() with signal.map() per research.md
- Error handling: silent fallback + console.warn per spec clarification
