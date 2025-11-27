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

## Phase 1: Setup ✅ COMPLETE

**Purpose**: Add new types and project module structure

- [x] T001 Add PropDeclaration and PropsDirective types to packages/blade/src/ast/types.ts
- [x] T002 Add ProjectConfig, ComponentInfo, ProjectContext types to packages/blade/src/ast/types.ts
- [x] T003 [P] Create project module directory structure at packages/blade/src/project/
- [x] T004 [P] Add JsonSchema and SchemaPropertyInfo types to packages/blade/src/ast/types.ts
- [x] T005 [P] Create test fixtures directory at packages/blade/tests/fixtures/project/

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETE

**Purpose**: Core infrastructure needed by ALL user stories

**⚠️ CRITICAL**: User stories US1-US3 depend on @props parsing; US1-US2 depend on discovery

- [x] T006 Implement @props directive tokenization in packages/blade/src/parser/tokenizer.ts
- [x] T007 Create PropsParser for @props($var, $var = expr) in packages/blade/src/parser/props-parser.ts
- [x] T008 Add unit tests for PropsParser in packages/blade/tests/props-parser.test.ts
- [x] T009 Integrate @props parsing into TemplateParser in packages/blade/src/parser/template-parser.ts
- [x] T010 [P] Implement toPascalCase utility for folder/file name conversion in packages/blade/src/project/utils.ts
- [x] T011 [P] Add unit tests for toPascalCase in packages/blade/tests/project/utils.test.ts

**Checkpoint**: @props parsing and naming utilities ready - component discovery can proceed ✅

---

## Phase 3: User Story 1 - Compile Multi-file Template Project (Priority: P1) 🎯 MVP ✅ COMPLETE

**Goal**: Developer can call `compileProject(path)` to compile a folder with index.blade and auto-discovered components

**Independent Test**: Create folder with index.blade + button.blade, call compileProject(), verify Button resolves

### Tests for User Story 1

- [x] T012 [P] [US1] Create test fixtures: simple project with index.blade and button.blade in packages/blade/tests/fixtures/project/simple/
- [x] T013 [P] [US1] Create test fixtures: project with missing component in packages/blade/tests/fixtures/project/missing-component/
- [x] T014 [P] [US1] Create test fixtures: folder without index.blade in packages/blade/tests/fixtures/project/no-entry/
- [x] T015 [US1] Write discovery tests in packages/blade/tests/project/discovery.test.ts

### Implementation for User Story 1

- [x] T016 [US1] Implement discoverComponents() for flat project in packages/blade/src/project/discovery.ts
- [x] T017 [US1] Implement project boundary detection (skip folders with index.blade) in packages/blade/src/project/discovery.ts
- [x] T018 [US1] Implement resolveComponent() for simple tag names in packages/blade/src/project/resolver.ts
- [x] T019 [US1] Add resolver unit tests in packages/blade/tests/project/resolver.test.ts
- [x] T020 [US1] Implement compileProject() entry point in packages/blade/src/project/compile.ts
- [x] T021 [US1] Wire project components into existing compile pipeline in packages/blade/src/compiler/index.ts
- [x] T022 [US1] Implement helpful error message for missing components with projectRoot suggestion
- [x] T023 [US1] Add integration test for compileProject() in packages/blade/tests/project/compile.test.ts
- [x] T024 [US1] Export compileProject, discoverComponents from packages/blade/src/index.ts

**Checkpoint**: compileProject() works for flat projects with auto-discovered components ✅

---

## Phase 4: User Story 2 - Dot-notation for Nested Components (Priority: P1) ✅ COMPLETE

**Goal**: Developer can use `<Components.Form.Input />` syntax for nested folder components

**Independent Test**: Create components/form/input.blade, use `<Components.Form.Input />` in index.blade, verify resolution

### Tests for User Story 2

- [x] T025 [P] [US2] Create test fixtures: nested folders in packages/blade/tests/fixtures/project/nested/
- [x] T026 [P] [US2] Create test fixtures: nested project boundary in packages/blade/tests/fixtures/project/nested-boundary/
- [x] T027 [US2] Write nested resolution tests in packages/blade/tests/project/resolver.test.ts

### Implementation for User Story 2

- [x] T028 [US2] Extend discoverComponents() to recurse into subfolders with namespace prefix in packages/blade/src/project/discovery.ts
- [x] T029 [US2] Implement dot-notation parsing in resolveComponent() in packages/blade/src/project/resolver.ts
- [x] T030 [US2] Handle folder name normalization (kebab-case, snake_case → PascalCase) in packages/blade/src/project/utils.ts
- [x] T031 [US2] Add tests for folder name edge cases in packages/blade/tests/project/utils.test.ts
- [x] T032 [US2] Add integration test for nested components in packages/blade/tests/project/dotnotation.test.ts

**Checkpoint**: Dot-notation namespacing works for arbitrarily nested folders ✅

---

## Phase 5: User Story 3 - @props Directive (Priority: P1) ✅ COMPLETE

**Goal**: Developer can declare component inputs with `@props($label, $disabled = false)`

**Independent Test**: Create component with @props, use with/without props, verify validation

### Tests for User Story 3

- [x] T033 [P] [US3] Create test fixtures: component with @props in packages/blade/tests/fixtures/project/with-props/
- [x] T034 [P] [US3] Create test fixtures: component with malformed @props in packages/blade/tests/fixtures/project/bad-props/
- [x] T035 [US3] Write @props validation tests in packages/blade/tests/project/props.test.ts

### Implementation for User Story 3

- [x] T036 [US3] Parse @props from component files during discovery in packages/blade/src/project/discovery.ts
- [x] T037 [US3] Implement prop inference for files without @props in packages/blade/src/project/discovery.ts
- [x] T038 [US3] Validate required props at component usage sites in packages/blade/src/project/compile.ts
- [x] T039 [US3] Emit warning (not error) for @props syntax errors, fall back to inference in packages/blade/src/parser/props-parser.ts
- [x] T040 [US3] Add error message for missing required props with source locations in packages/blade/src/project/props.ts
- [x] T041 [US3] Add integration test for prop validation in packages/blade/tests/project/compile.test.ts

**Checkpoint**: @props directive works with validation; inference fallback works ✅

---

## Phase 6: User Story 4 - Single File with Project Context (Priority: P2) ✅ COMPLETE

**Goal**: Developer can compile single file with `compile(source, { projectRoot })` option

**Independent Test**: Compile single file with projectRoot, verify component resolution works

### Implementation for User Story 4

- [x] T042 [US4] Add projectRoot option to CompileOptions in packages/blade/src/compiler/index.ts
- [x] T043 [US4] Load project context when projectRoot specified in packages/blade/src/compiler/index.ts
- [x] T044 [US4] Implement template-passed component shadowing (FR-007a) in packages/blade/src/project/resolver.ts
- [x] T045 [US4] Add tests for single-file compilation with projectRoot in packages/blade/tests/project/single-file.test.ts
- [x] T046 [US4] Add test for shadowing behavior in packages/blade/tests/project/single-file.test.ts

**Checkpoint**: Single-file compilation works with project component access ✅

---

## Phase 7: User Story 5 - Schema-driven LSP Completions (Priority: P2) ✅ COMPLETE

**Goal**: LSP provides completions based on schema.json

**Independent Test**: Create project with schema.json, type `$user.`, verify completions appear

### Tests for User Story 5

- [x] T047 [P] [US5] Create test fixtures: project with schema.json in packages/blade/tests/fixtures/project/with-schema/
- [x] T048 [US5] Write schema loading tests in packages/blade/tests/project/schema.test.ts

### Implementation for User Story 5

- [x] T049 [US5] Implement loadProjectSchema() in packages/blade/src/project/schema.ts
- [x] T050 [US5] Implement extractSchemaProperties() for flattening schema to paths in packages/blade/src/project/schema.ts
- [x] T051 [US5] Create ProjectLspContext type and initializeProjectContext() in packages/blade/src/lsp/project-context.ts
- [x] T052 [US5] Implement getSchemaCompletions() in packages/blade/src/lsp/providers/completion.ts
- [x] T053 [US5] Add schema completion tests in packages/blade/tests/lsp/completion.test.ts
- [x] T054 [US5] Wire project context into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Schema-driven variable completions work in LSP ✅

---

## Phase 8: User Story 7 - LSP Component Navigation (Priority: P2) ✅ COMPLETE

**Goal**: Go-to-definition navigates from component tag to .blade file

**Independent Test**: Ctrl+click on `<Button />`, verify navigation to button.blade

### Implementation for User Story 7

- [x] T055 [US7] Implement getComponentCompletions() for tag completions in packages/blade/src/lsp/providers/completion.ts
- [x] T056 [US7] Implement getPropCompletions() for component prop completions in packages/blade/src/lsp/providers/completion.ts
- [x] T057 [US7] Implement getComponentDefinition() in packages/blade/src/lsp/providers/definition.ts
- [x] T058 [US7] Add component completion tests in packages/blade/tests/lsp/completion.test.ts
- [x] T059 [US7] Add go-to-definition tests in packages/blade/tests/lsp/definition.test.ts
- [x] T060 [US7] Register definition provider in LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Component completions and go-to-definition work in LSP ✅

---

## Phase 9: User Story 6 - Sample-driven Hover Hints (Priority: P3) ✅ COMPLETE

**Goal**: Hover over variables shows example values from samples/

**Independent Test**: Create samples/default.json, hover over `$user.name`, verify example appears

### Tests for User Story 6

- [x] T061 [P] [US6] Create test fixtures: project with samples/ in packages/blade/tests/fixtures/project/with-samples/
- [x] T062 [US6] Write sample loading tests in packages/blade/tests/project/samples.test.ts

### Implementation for User Story 6

- [x] T063 [US6] Implement loadProjectSamples() in packages/blade/src/project/samples.ts
- [x] T064 [US6] Implement extractSampleValues() for path→value mapping in packages/blade/src/project/samples.ts
- [x] T065 [US6] Implement getHoverInfo() with sample values in packages/blade/src/lsp/providers/hover.ts
- [x] T066 [US6] Add hover tests with sample values in packages/blade/tests/lsp/integration.test.ts
- [x] T067 [US6] Wire hover provider into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Hover hints show example values from sample files ✅

---

## Phase 10: User Story 8 - Schema Validation for Samples (Priority: P3) ✅ COMPLETE

**Goal**: LSP validates samples/*.json against schema.json

**Independent Test**: Create mismatched sample, verify diagnostic appears

### Implementation for User Story 8

- [x] T068 [US8] Implement validateSamples() for schema validation in packages/blade/src/lsp/providers/diagnostic.ts
- [x] T069 [US8] Implement getProjectDiagnostics() for project-level validation in packages/blade/src/lsp/providers/diagnostic.ts
- [x] T070 [US8] Add sample validation tests in packages/blade/tests/lsp/sample-validation.test.ts
- [x] T071 [US8] Wire project diagnostics into LSP server in packages/blade/src/lsp/server.ts

**Checkpoint**: Sample files are validated against schema with diagnostics ✅

---

## Phase 11: Polish & Cross-Cutting Concerns ✅ COMPLETE

**Purpose**: Final cleanup and documentation

- [x] T072 [P] Update packages/blade/src/index.ts with all new exports
- [x] T073 [P] Add JSDoc comments to all public API functions
- [x] T074 Run full test suite and verify coverage in packages/blade/
- [x] T075 Update docs/SPECIFICATION.md with project compilation section
- [x] T076 [P] Implement cache invalidation for LSP project context in packages/blade/src/lsp/project-context.ts
- [x] T077 Performance validation: compile 50+ component project under 1 second
- [x] T078 Run quickstart.md validation scenarios

---

## Summary

| Phase | Story | Status |
|-------|-------|--------|
| Setup | - | ✅ Complete |
| Foundational | - | ✅ Complete |
| US1 | P1 - MVP | ✅ Complete |
| US2 | P1 | ✅ Complete |
| US3 | P1 | ✅ Complete |
| US4 | P2 | ✅ Complete |
| US5 | P2 | ✅ Complete |
| US7 | P2 | ✅ Complete |
| US6 | P3 | ✅ Complete |
| US8 | P3 | ✅ Complete |
| Polish | - | ✅ Complete |

**Total: 78/78 tasks complete (100%)** ✅

---

## Implementation Files Created

### Project Module (`packages/blade/src/project/`)
- `index.ts` - Module exports
- `compile.ts` - compileProject() entry point
- `discovery.ts` - discoverComponents() with recursive scanning
- `resolver.ts` - resolveComponent() with dot-notation support
- `schema.ts` - loadProjectSchema(), extractSchemaProperties(), getSchemaCompletions()
- `samples.ts` - loadProjectSamples(), extractSampleValues(), getSampleValues()
- `props.ts` - parseComponentProps(), createMissingPropDiagnostic()
- `utils.ts` - toPascalCase(), isHiddenFile()

### LSP Extensions (`packages/blade/src/lsp/`)
- `project-context.ts` - ProjectLspContext, initializeProjectContext()
- `providers/completion.ts` - Schema completions, component completions
- `providers/definition.ts` - Go-to-definition for components
- `providers/hover.ts` - Sample value hints, schema type hints
- `providers/diagnostic.ts` - validateSamples(), validatePropsAgainstSchema()

### Test Files (`packages/blade/tests/`)
- `project/compile.test.ts`
- `project/discovery.test.ts`
- `project/dotnotation.test.ts`
- `project/props.test.ts`
- `project/resolver.test.ts`
- `project/samples.test.ts`
- `project/schema.test.ts`
- `project/single-file.test.ts`
- `project/utils.test.ts`
- `lsp/completion.test.ts`
- `lsp/definition.test.ts`
- `lsp/integration.test.ts`
- `lsp/props-validation.test.ts`
- `lsp/sample-validation.test.ts`

### Test Fixtures (`packages/blade/tests/fixtures/project/`)
- `simple/` - Basic project with button.blade
- `missing-component/` - Project referencing non-existent component
- `missing-required-prop/` - Project with missing required props
- `nested/` - Nested folder structure with dot-notation components
- `no-entry/` - Directory without index.blade
- `with-props/` - Components with @props directive
- `with-samples/` - Project with samples/ directory
- `with-schema/` - Project with schema.json
- `with-invalid-samples/` - Project with samples that violate schema
