# Tasks: Project-based Template Compilation

**Input**: Design documents from `/specs/005-project-template-compilation/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Unit tests included per Constitution Quality Standards (all new code must have unit tests).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md: Monorepo structure with `packages/blade/src/` and `packages/blade/tests/`

---

## Phase 1: Setup

**Purpose**: Add new types and project module structure

- [x] T001 Add PropDeclaration and PropsDirective types to packages/blade/src/ast/types.ts
- [x] T002 Add ProjectConfig, ComponentInfo, ProjectContext types to packages/blade/src/ast/types.ts
- [x] T003 [P] Create project module directory structure at packages/blade/src/project/
- [x] T004 [P] Add JsonSchema and SchemaPropertyInfo types to packages/blade/src/ast/types.ts
- [x] T005 [P] Create test fixtures directory at packages/blade/tests/fixtures/project/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure needed by ALL user stories

**⚠️ CRITICAL**: User stories US1-US3 depend on @props parsing; US1-US2 depend on discovery

- [x] T006 Implement @props directive tokenization in packages/blade/src/parser/tokenizer.ts
- [x] T007 Create PropsParser for @props($var, $var = expr) in packages/blade/src/parser/props-parser.ts
- [x] T008 Add unit tests for PropsParser in packages/blade/tests/props-parser.test.ts
- [ ] T009 Integrate @props parsing into TemplateParser in packages/blade/src/parser/template-parser.ts
- [x] T010 [P] Implement toPascalCase utility for folder/file name conversion in packages/blade/src/project/utils.ts
- [x] T011 [P] Add unit tests for toPascalCase in packages/blade/tests/project/utils.test.ts

**Checkpoint**: @props parsing and naming utilities ready - component discovery can proceed

---

## Phase 3: User Story 1 - Compile Multi-file Template Project (Priority: P1) 🎯 MVP

**Goal**: Developer can call `compileProject(path)` to compile a folder with index.blade and auto-discovered components

**Independent Test**: Create folder with index.blade + button.blade, call compileProject(), verify Button resolves

### Tests for User Story 1

- [ ] T012 [P] [US1] Create test fixtures: simple project with index.blade and button.blade in packages/blade/tests/fixtures/project/simple/
- [ ] T013 [P] [US1] Create test fixtures: project with missing component in packages/blade/tests/fixtures/project/missing-component/
- [ ] T014 [P] [US1] Create test fixtures: folder without index.blade in packages/blade/tests/fixtures/project/no-entry/
- [ ] T015 [US1] Write discovery tests in packages/blade/tests/project/discovery.test.ts

### Implementation for User Story 1

- [ ] T016 [US1] Implement discoverComponents() for flat project in packages/blade/src/project/discovery.ts
- [ ] T017 [US1] Implement project boundary detection (skip folders with index.blade) in packages/blade/src/project/discovery.ts
- [ ] T018 [US1] Implement resolveComponent() for simple tag names in packages/blade/src/project/resolver.ts
- [ ] T019 [US1] Add resolver unit tests in packages/blade/tests/project/resolver.test.ts
- [ ] T020 [US1] Implement compileProject() entry point in packages/blade/src/compiler/project.ts
- [ ] T021 [US1] Wire project components into existing compile pipeline in packages/blade/src/compiler/index.ts
- [ ] T022 [US1] Implement helpful error message for missing components with projectRoot suggestion
- [ ] T023 [US1] Add integration test for compileProject() in packages/blade/tests/project/compile-project.test.ts
- [ ] T024 [US1] Export compileProject, discoverComponents from packages/blade/src/index.ts

**Checkpoint**: compileProject() works for flat projects with auto-discovered components

---

## Phase 4: User Story 2 - Dot-notation for Nested Components (Priority: P1)

**Goal**: Developer can use `<Components.Form.Input />` syntax for nested folder components

**Independent Test**: Create components/form/input.blade, use `<Components.Form.Input />` in index.blade, verify resolution

### Tests for User Story 2

- [ ] T025 [P] [US2] Create test fixtures: nested folders in packages/blade/tests/fixtures/project/nested/
- [ ] T026 [P] [US2] Create test fixtures: nested project boundary in packages/blade/tests/fixtures/project/nested-boundary/
- [ ] T027 [US2] Write nested resolution tests in packages/blade/tests/project/resolver.test.ts

### Implementation for User Story 2

- [ ] T028 [US2] Extend discoverComponents() to recurse into subfolders with namespace prefix in packages/blade/src/project/discovery.ts
- [ ] T029 [US2] Implement dot-notation parsing in resolveComponent() in packages/blade/src/project/resolver.ts
- [ ] T030 [US2] Handle folder name normalization (kebab-case, snake_case → PascalCase) in packages/blade/src/project/utils.ts
- [ ] T031 [US2] Add tests for folder name edge cases in packages/blade/tests/project/utils.test.ts
- [ ] T032 [US2] Add integration test for nested components in packages/blade/tests/project/compile-project.test.ts

**Checkpoint**: Dot-notation namespacing works for arbitrarily nested folders

---

## Phase 5: User Story 3 - @props Directive (Priority: P1)

**Goal**: Developer can declare component inputs with `@props($label, $disabled = false)`

**Independent Test**: Create component with @props, use with/without props, verify validation

### Tests for User Story 3

- [ ] T033 [P] [US3] Create test fixtures: component with @props in packages/blade/tests/fixtures/project/with-props/
- [ ] T034 [P] [US3] Create test fixtures: component with malformed @props in packages/blade/tests/fixtures/project/bad-props/
- [ ] T035 [US3] Write @props validation tests in packages/blade/tests/project/props.test.ts

### Implementation for User Story 3

- [ ] T036 [US3] Parse @props from component files during discovery in packages/blade/src/project/discovery.ts
- [ ] T037 [US3] Implement prop inference for files without @props in packages/blade/src/project/discovery.ts
- [ ] T038 [US3] Validate required props at component usage sites in packages/blade/src/compiler/project.ts
- [ ] T039 [US3] Emit warning (not error) for @props syntax errors, fall back to inference in packages/blade/src/parser/props-parser.ts
- [ ] T040 [US3] Add error message for missing required props with source locations in packages/blade/src/compiler/project.ts
- [ ] T041 [US3] Add integration test for prop validation in packages/blade/tests/project/compile-project.test.ts

**Checkpoint**: @props directive works with validation; inference fallback works

---

## Phase 6: User Story 4 - Single File with Project Context (Priority: P2)

**Goal**: Developer can compile single file with `compile(source, { projectRoot })` option

**Independent Test**: Compile single file with projectRoot, verify component resolution works

### Implementation for User Story 4

- [ ] T042 [US4] Add projectRoot option to CompileOptions in packages/blade/src/compiler/index.ts
- [ ] T043 [US4] Load project context when projectRoot specified in packages/blade/src/compiler/index.ts
- [ ] T044 [US4] Implement template-passed component shadowing (FR-007a) in packages/blade/src/compiler/project.ts
- [ ] T045 [US4] Add tests for single-file compilation with projectRoot in packages/blade/tests/project/compile-project.test.ts
- [ ] T046 [US4] Add test for shadowing behavior in packages/blade/tests/project/compile-project.test.ts

**Checkpoint**: Single-file compilation works with project component access

---

## Phase 7: User Story 5 - Schema-driven LSP Completions (Priority: P2)

**Goal**: LSP provides completions based on schema.json

**Independent Test**: Create project with schema.json, type `$user.`, verify completions appear

### Tests for User Story 5

- [ ] T047 [P] [US5] Create test fixtures: project with schema.json in packages/blade/tests/fixtures/project/with-schema/
- [ ] T048 [US5] Write schema loading tests in packages/blade/tests/project/schema.test.ts

### Implementation for User Story 5

- [ ] T049 [US5] Implement loadProjectSchema() in packages/blade/src/project/schema.ts
- [ ] T050 [US5] Implement extractSchemaProperties() for flattening schema to paths in packages/blade/src/project/schema.ts
- [ ] T051 [US5] Create ProjectLspContext type and initializeProjectContext() in packages/blade/src/lsp/project-context.ts
- [ ] T052 [US5] Implement getSchemaCompletions() in packages/blade/src/lsp/providers/completion.ts
- [ ] T053 [US5] Add schema completion tests in packages/blade/tests/lsp/completion.test.ts
- [ ] T054 [US5] Wire project context into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Schema-driven variable completions work in LSP

---

## Phase 8: User Story 7 - LSP Component Navigation (Priority: P2)

**Goal**: Go-to-definition navigates from component tag to .blade file

**Independent Test**: Ctrl+click on `<Button />`, verify navigation to button.blade

### Implementation for User Story 7

- [ ] T055 [US7] Implement getComponentCompletions() for tag completions in packages/blade/src/lsp/providers/completion.ts
- [ ] T056 [US7] Implement getPropCompletions() for component prop completions in packages/blade/src/lsp/providers/completion.ts
- [ ] T057 [US7] Implement getComponentDefinition() in packages/blade/src/lsp/providers/definition.ts
- [ ] T058 [US7] Add component completion tests in packages/blade/tests/lsp/completion.test.ts
- [ ] T059 [US7] Add go-to-definition tests in packages/blade/tests/lsp/definition.test.ts
- [ ] T060 [US7] Register definition provider in LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Component completions and go-to-definition work in LSP

---

## Phase 9: User Story 6 - Sample-driven Hover Hints (Priority: P3)

**Goal**: Hover over variables shows example values from samples/

**Independent Test**: Create samples/default.json, hover over `$user.name`, verify example appears

### Tests for User Story 6

- [ ] T061 [P] [US6] Create test fixtures: project with samples/ in packages/blade/tests/fixtures/project/with-samples/
- [ ] T062 [US6] Write sample loading tests in packages/blade/tests/project/samples.test.ts

### Implementation for User Story 6

- [ ] T063 [US6] Implement loadProjectSamples() in packages/blade/src/project/samples.ts
- [ ] T064 [US6] Implement extractSampleValues() for path→value mapping in packages/blade/src/project/samples.ts
- [ ] T065 [US6] Implement getHoverInfo() with sample values in packages/blade/src/lsp/providers/hover.ts
- [ ] T066 [US6] Add hover tests with sample values in packages/blade/tests/lsp/hover.test.ts
- [ ] T067 [US6] Wire hover provider into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Hover hints show example values from sample files

---

## Phase 10: User Story 8 - Schema Validation for Samples (Priority: P3)

**Goal**: LSP validates samples/*.json against schema.json

**Independent Test**: Create mismatched sample, verify diagnostic appears

### Implementation for User Story 8

- [ ] T068 [US8] Implement validateSamples() for schema validation in packages/blade/src/lsp/providers/diagnostic.ts
- [ ] T069 [US8] Implement getProjectDiagnostics() for project-level validation in packages/blade/src/lsp/providers/diagnostic.ts
- [ ] T070 [US8] Add sample validation tests in packages/blade/tests/lsp/diagnostic.test.ts
- [ ] T071 [US8] Wire project diagnostics into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Sample files are validated against schema with diagnostics

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation

- [ ] T072 [P] Update packages/blade/src/index.ts with all new exports
- [ ] T073 [P] Add JSDoc comments to all public API functions
- [ ] T074 Run full test suite and verify coverage in packages/blade/
- [ ] T075 Update docs/SPECIFICATION.md with project compilation section
- [ ] T076 [P] Implement cache invalidation for LSP project context in packages/blade/src/lsp/project-context.ts
- [ ] T077 Performance validation: compile 50+ component project under 1 second
- [ ] T078 Run quickstart.md validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS US1, US2, US3
- **US1 (Phase 3)**: Depends on Foundational - core MVP
- **US2 (Phase 4)**: Depends on US1 (extends discovery)
- **US3 (Phase 5)**: Depends on Foundational (uses @props parsing)
- **US4 (Phase 6)**: Depends on US1 (extends compile)
- **US5 (Phase 7)**: Depends on US1 (needs project context)
- **US7 (Phase 8)**: Depends on US5 (needs LSP project context)
- **US6 (Phase 9)**: Depends on US5 (needs LSP project context)
- **US8 (Phase 10)**: Depends on US5, US6 (needs schema + samples)
- **Polish (Phase 11)**: Depends on all user stories

### User Story Dependencies

```
Foundational (@props parsing, utils)
     │
     ├─► US1 (Project Compilation) ──► US2 (Dot-notation) ──► US4 (projectRoot option)
     │         │
     │         └─► US5 (Schema LSP) ──► US7 (Component Navigation)
     │                    │
     │                    └─► US6 (Sample Hover) ──► US8 (Sample Validation)
     │
     └─► US3 (@props Directive) ─────────────────────────────────────────────►
```

### Parallel Opportunities

**Setup Phase**: T003, T004, T005 can run in parallel
**Foundational Phase**: T010, T011 can run in parallel with T006-T009
**US1-US3**: US1 and US3 can proceed in parallel after Foundational
**Tests**: All [P] test fixture creation tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# Create all test fixtures in parallel:
Task: T012 "Create test fixtures: simple project..."
Task: T013 "Create test fixtures: project with missing component..."
Task: T014 "Create test fixtures: folder without index.blade..."

# Then run sequential implementation:
Task: T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: US1 - compileProject() works
4. Complete Phase 4: US2 - dot-notation works
5. Complete Phase 5: US3 - @props validation works
6. **STOP and VALIDATE**: Test core compilation independently
7. Deploy/demo if ready (compilation works, no LSP features)

### Incremental Delivery

1. MVP (US1-US3) → Core compilation functional
2. Add US4 → Single-file with project context
3. Add US5+US7 → LSP completions and navigation
4. Add US6+US8 → Sample hints and validation
5. Polish → Documentation and performance

### Task Count Summary

| Phase | Story | Tasks |
|-------|-------|-------|
| Setup | - | 5 |
| Foundational | - | 6 |
| US1 | P1 | 13 |
| US2 | P1 | 8 |
| US3 | P1 | 9 |
| US4 | P2 | 5 |
| US5 | P2 | 8 |
| US7 | P2 | 6 |
| US6 | P3 | 7 |
| US8 | P3 | 4 |
| Polish | - | 7 |
| **Total** | | **78** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after completion
- Verify tests fail before implementing (TDD approach)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
