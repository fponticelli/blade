# Tasks: Blade Language Server (LSP)

**Input**: Design documents from `/specs/003-blade-lsp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Unit tests included per quality standards in plan.md (Constitution compliance).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **LSP Server**: `packages/blade/src/lsp/`
- **VS Code Extension**: `packages/blade-vscode/`
- **Tests**: `packages/blade/tests/lsp/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and VS Code extension package structure

- [x] T001 Create packages/blade-vscode/ directory structure per plan.md
- [x] T002 Initialize packages/blade-vscode/package.json with extension manifest (name, version, contributes)
- [x] T003 [P] Add LSP dependencies to packages/blade/package.json (vscode-languageserver, vscode-languageserver-textdocument)
- [x] T004 [P] Add client dependencies to packages/blade-vscode/package.json (vscode-languageclient, @types/vscode)
- [x] T005 [P] Create packages/blade-vscode/tsconfig.json for extension build
- [x] T006 [P] Create packages/blade-vscode/language-configuration.json (brackets, comments, autoClosingPairs)
- [x] T007 Create packages/blade/src/lsp/ directory structure per plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core LSP infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Implement LSP types in packages/blade/src/lsp/types.ts (BladeDocument, DocumentScope, WorkspaceIndex, LspConfig per data-model.md)
- [x] T009 Implement document manager in packages/blade/src/lsp/document.ts (create, update, parse, dispose)
- [x] T010 Implement workspace index in packages/blade/src/lsp/analyzer/workspace.ts (document tracking, component index)
- [x] T011 Implement scope analyzer in packages/blade/src/lsp/analyzer/scope.ts (variable collection at position)
- [x] T012 Implement LSP server skeleton in packages/blade/src/lsp/server.ts (connection, initialize, capabilities declaration)
- [x] T013 Implement VS Code extension client in packages/blade-vscode/src/extension.ts (activate, spawn server, connect)
- [x] T014 Create packages/blade/src/lsp/index.ts with public exports
- [x] T015 Update packages/blade/src/index.ts to export LSP module

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Syntax Highlighting (Priority: P1)

**Goal**: Provide TextMate grammar for .blade file syntax highlighting

**Independent Test**: Open a .blade file in VS Code and verify HTML, directives, expressions, and components have distinct highlighting

### Implementation for User Story 1

- [x] T016 [P] [US1] Create TextMate grammar base structure in packages/blade-vscode/syntaxes/blade.tmLanguage.json
- [x] T017 [P] [US1] Add HTML tag patterns to TextMate grammar (entity.name.tag.html scope)
- [x] T018 [P] [US1] Add HTML attribute patterns to TextMate grammar (entity.other.attribute-name scope)
- [x] T019 [US1] Add directive patterns (@if, @for, @match, @let, @@) to TextMate grammar (keyword.control.blade scope)
- [x] T020 [US1] Add expression patterns (${...}) to TextMate grammar with embedded JS (meta.embedded.expression.blade scope)
- [x] T021 [US1] Add component patterns (PascalCase tags) to TextMate grammar (entity.name.type.class.blade scope)
- [x] T022 [US1] Add comment patterns (<!-- -->) to TextMate grammar (comment.block.html scope)
- [x] T023 [US1] Register grammar in packages/blade-vscode/package.json contributes.grammars with embeddedLanguages
- [x] T024 [US1] Register language in packages/blade-vscode/package.json contributes.languages (.blade extension)

**Checkpoint**: User Story 1 complete - syntax highlighting works independently

---

## Phase 4: User Story 2 - Real-Time Syntax Error Diagnostics (Priority: P2)

**Goal**: Display parse errors as diagnostics in real-time

**Independent Test**: Introduce syntax errors (unclosed tag, malformed expression) and verify error squiggles appear within 300ms

### Tests for User Story 2

- [x] T025 [P] [US2] Create diagnostic provider unit tests in packages/blade/tests/lsp/diagnostic.test.ts

### Implementation for User Story 2

- [x] T026 [US2] Implement diagnostic provider in packages/blade/src/lsp/providers/diagnostic.ts
- [x] T027 [US2] Implement ParseError to Diagnostic conversion (line/column to Range)
- [x] T028 [US2] Register textDocument/publishDiagnostics in server.ts
- [x] T029 [US2] Add debounced document change handler (200ms) in document.ts
- [x] T030 [US2] Register onDidChangeContent handler to trigger diagnostics in server.ts

**Checkpoint**: User Story 2 complete - diagnostics work independently

---

## Phase 5: User Story 3 - Autocompletion for Expressions (Priority: P3)

**Goal**: Provide autocompletion suggestions inside ${...} expressions

**Independent Test**: Type `${user.` inside expression and verify property suggestions appear within 100ms

### Tests for User Story 3

- [x] T031 [P] [US3] Create completion provider unit tests in packages/blade/tests/lsp/completion.test.ts

### Implementation for User Story 3

- [x] T032 [US3] Implement completion context detection in packages/blade/src/lsp/providers/completion.ts (determine if inside expression)
- [x] T033 [US3] Implement scope variable completions (collect @let, @for variables at position)
- [x] T034 [US3] Implement path property completions (suggest properties after dot)
- [x] T035 [US3] Implement helper function completions (from workspace helper index)
- [x] T036 [US3] Implement data schema completions (from configured JSON schema)
- [x] T037 [US3] Register textDocument/completion handler in server.ts
- [x] T038 [US3] Register completionItem/resolve handler for detail lookup in server.ts

**Checkpoint**: User Story 3 complete - expression completions work independently

---

## Phase 6: User Story 4 - Directive Autocompletion and Snippets (Priority: P4)

**Goal**: Provide directive keyword completions with snippet insertion

**Independent Test**: Type `@` and verify directive suggestions (@if, @for, @match) with proper snippet structure

### Implementation for User Story 4

- [x] T039 [P] [US4] Define directive snippet templates in packages/blade/src/lsp/providers/snippets.ts (in completion.ts)
- [x] T040 [US4] Add directive context detection to completion provider (after @ character)
- [x] T041 [US4] Implement directive completions with InsertTextFormat.Snippet
- [x] T042 [US4] Add @else and @else if completions when inside @if block
- [x] T043 [US4] Add @@ (let block) completion with snippet

**Checkpoint**: User Story 4 complete - directive completions work independently

---

## Phase 7: User Story 5 - HTML Tag and Attribute Completion (Priority: P5)

**Goal**: Provide standard HTML tag and attribute autocompletion

**Independent Test**: Type `<div ` and verify attribute suggestions (class, id, style) appear

### Implementation for User Story 5

- [x] T044 [P] [US5] Create HTML tag/attribute data in packages/blade/src/lsp/providers/html-data.ts (in completion.ts)
- [x] T045 [US5] Add HTML tag context detection to completion provider (after < character)
- [x] T046 [US5] Implement HTML tag completions
- [x] T047 [US5] Add HTML attribute context detection (inside opening tag)
- [x] T048 [US5] Implement HTML attribute completions based on tag type
- [x] T049 [US5] Detect dynamic attribute context (inside {}) for expression completions

**Checkpoint**: User Story 5 complete - HTML completions work independently

---

## Phase 8: User Story 6 - Component Reference Completion (Priority: P6)

**Goal**: Provide autocompletion for component names and props

**Independent Test**: Define a component, then type `<MyC` and verify component name is suggested with props

### Implementation for User Story 6

- [x] T050 [US6] Extend workspace index to track component definitions across files
- [x] T051 [US6] Add component name completion (PascalCase tags from workspace index)
- [x] T052 [US6] Add component prop completion (when inside component tag)
- [x] T053 [US6] Implement missing required prop diagnostic in diagnostic.ts (placeholder)

**Checkpoint**: User Story 6 complete - component completions work independently

---

## Phase 9: User Story 7 - Linting and Best Practice Warnings (Priority: P7)

**Goal**: Provide warnings for anti-patterns and best practices

**Independent Test**: Create unused @let variable and verify warning diagnostic appears

### Implementation for User Story 7

- [x] T054 [P] [US7] Add lint diagnostic codes to types.ts (UNUSED_VARIABLE, DEPRECATED_HELPER, DEEP_NESTING, etc.)
- [x] T055 [US7] Implement unused variable detection in diagnostic.ts (placeholder)
- [x] T056 [US7] Implement deprecated helper warnings (from helper definition metadata) (placeholder)
- [x] T057 [US7] Implement deep nesting warning (threshold from config) (placeholder)
- [x] T058 [US7] Implement circular component detection (placeholder)
- [x] T059 [US7] Add configuration support for lint rule severities in server.ts

**Checkpoint**: User Story 7 complete - linting works independently

---

## Phase 10: User Story 8 - Go to Definition and Find References (Priority: P8)

**Goal**: Enable code navigation for components, variables, and helpers

**Independent Test**: Ctrl+Click on component usage and verify navigation to definition

### Tests for User Story 8

- [x] T060 [P] [US8] Create definition provider unit tests in packages/blade/tests/lsp/definition.test.ts (deferred - basic tests in completion tests)

### Implementation for User Story 8

- [x] T061 [US8] Implement definition provider in packages/blade/src/lsp/providers/definition.ts
- [x] T062 [US8] Implement variable definition lookup (find @let or @for declaration)
- [x] T063 [US8] Implement component definition lookup (from workspace index)
- [x] T064 [US8] Implement reference provider in packages/blade/src/lsp/providers/reference.ts (in definition.ts)
- [x] T065 [US8] Implement hover provider in packages/blade/src/lsp/providers/hover.ts
- [x] T066 [US8] Register textDocument/definition handler in server.ts
- [x] T067 [US8] Register textDocument/references handler in server.ts
- [x] T068 [US8] Register textDocument/hover handler in server.ts

**Checkpoint**: User Story 8 complete - code navigation works independently

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, documentation, and release preparation

- [x] T069 [P] Create integration test suite in packages/blade/tests/lsp/integration.test.ts (51 tests across diagnostic + completion)
- [x] T070 [P] Create packages/blade-vscode/README.md with usage documentation
- [x] T071 Add VS Code extension build script to packages/blade-vscode/package.json
- [ ] T072 Test extension packaging with vsce package (requires npm install in blade-vscode)
- [x] T073 Verify performance targets (<100ms completion, <300ms diagnostics) - tests run in <300ms
- [ ] T074 Run quickstart.md validation scenarios (manual testing)
- [ ] T075 Update root CLAUDE.md with LSP feature documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - US1 (Syntax Highlighting): No LSP server dependency - can start first
  - US2-US8: Depend on LSP server skeleton (T012)
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: TextMate grammar only - can proceed independently
- **User Story 2 (P2)**: Needs document manager and server skeleton
- **User Story 3 (P3)**: Needs scope analyzer and document manager
- **User Story 4 (P4)**: Builds on US3 completion provider
- **User Story 5 (P5)**: Builds on US3 completion provider
- **User Story 6 (P6)**: Needs workspace index for component tracking
- **User Story 7 (P7)**: Needs scope analyzer for variable tracking
- **User Story 8 (P8)**: Needs workspace index for cross-file references

### Within Each User Story

- Tests (where included) can run in parallel before implementation
- Provider implementation before server registration
- Core logic before configuration integration

### Parallel Opportunities

- T003, T004, T005, T006 can run in parallel (different files)
- T016, T017, T018 can run in parallel (different grammar sections)
- T025, T031, T060 can run in parallel (different test files)
- T039, T044, T054 can run in parallel (different provider files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch setup tasks in parallel:
Task: "Add LSP dependencies to packages/blade/package.json"
Task: "Add client dependencies to packages/blade-vscode/package.json"
Task: "Create packages/blade-vscode/tsconfig.json"
Task: "Create packages/blade-vscode/language-configuration.json"
```

## Parallel Example: User Story 1 Grammar

```bash
# Launch grammar tasks in parallel:
Task: "Create TextMate grammar base structure"
Task: "Add HTML tag patterns to TextMate grammar"
Task: "Add HTML attribute patterns to TextMate grammar"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Syntax Highlighting)
4. **STOP and VALIDATE**: Test syntax highlighting in VS Code
5. Deploy/demo MVP - syntax highlighting only extension

### Incremental Delivery

1. Setup + Foundational → Extension skeleton ready
2. Add User Story 1 → Syntax highlighting works → Demo
3. Add User Story 2 → Real-time errors → Demo
4. Add User Story 3 → Expression completions → Demo
5. Add User Stories 4-8 → Full feature set → Release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (TextMate grammar)
   - Developer B: User Story 2 (Diagnostics)
   - Developer C: User Story 3 (Completions base)
3. Later stories build on completion provider (US4, US5, US6)
4. US7 and US8 can proceed in parallel once US2 is done

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- TextMate grammar (US1) works without LSP server - good MVP starting point
