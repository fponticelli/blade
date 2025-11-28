# Tasks: VSCode Preview Mode with Sample Data

**Input**: Design documents from `/specs/007-vscode-preview-mode/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Not explicitly requested in spec - tests omitted. Manual testing checklist provided in quickstart.md.

**Organization**: Tasks grouped by user story. US1+US2 are both P1 (core functionality), followed by US3+US4 (P2 polish).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

```
packages/blade-vscode/
├── src/
│   ├── extension.ts          # Modify
│   ├── preview/              # New module
│   │   ├── index.ts
│   │   ├── panel.ts
│   │   ├── renderer.ts
│   │   └── samples.ts
│   └── commands/
│       └── preview.ts
├── media/
│   └── preview.css
└── package.json              # Modify
```

---

## Phase 1: Setup

**Purpose**: Project structure and extension configuration

- [x] T001 Create preview module directory structure at packages/blade-vscode/src/preview/
- [x] T002 Create commands directory structure at packages/blade-vscode/src/commands/
- [x] T003 Create media directory for webview assets at packages/blade-vscode/media/
- [x] T004 [P] Add preview command contribution to packages/blade-vscode/package.json (blade.openPreview command)
- [x] T005 [P] Add keyboard shortcut contribution to packages/blade-vscode/package.json (Cmd+Shift+V / Ctrl+Shift+V)
- [x] T006 [P] Add editor title button contribution to packages/blade-vscode/package.json (preview icon when blade file active)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Create message type definitions at packages/blade-vscode/src/preview/types.ts (from contracts/messages.ts)
- [x] T008 Create preview module index at packages/blade-vscode/src/preview/index.ts (exports for panel, renderer, samples)
- [x] T009 Implement project root finder utility at packages/blade-vscode/src/preview/utils.ts (find samples/ folder from active file)
- [x] T010 Create debounce utility function at packages/blade-vscode/src/preview/utils.ts (300ms debounce for live refresh)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Preview Template with Sample Data (Priority: P1) 🎯 MVP

**Goal**: Developer can open preview panel with sample dropdown and see rendered template

**Independent Test**: Open samples/ecommerce/index.blade, open preview, select summer-sale.json, verify rendered HTML displays

### Implementation for User Story 1

- [x] T011 [P] [US1] Implement sample file discovery at packages/blade-vscode/src/preview/samples.ts (list JSON files from samples/ folder)
- [x] T012 [P] [US1] Implement sample file loading at packages/blade-vscode/src/preview/samples.ts (parse JSON, track validity, handle errors)
- [x] T013 [US1] Implement template renderer at packages/blade-vscode/src/preview/renderer.ts (compile template, render with sample data, return HTML or errors)
- [x] T014 [US1] Create webview panel manager at packages/blade-vscode/src/preview/panel.ts (create panel with ViewColumn.Beside, manage lifecycle)
- [x] T015 [US1] Implement webview HTML shell at packages/blade-vscode/src/preview/panel.ts (sample dropdown, preview area, message passing setup)
- [x] T016 [P] [US1] Create preview CSS styles at packages/blade-vscode/media/preview.css (dropdown styling, preview content styling, responsive layout)
- [x] T017 [US1] Implement sample dropdown population at packages/blade-vscode/src/preview/panel.ts (send samples list to webview, handle selection)
- [x] T018 [US1] Implement render-on-sample-change at packages/blade-vscode/src/preview/panel.ts (re-render when user selects different sample)
- [x] T019 [US1] Implement live preview refresh at packages/blade-vscode/src/preview/panel.ts (onDidChangeTextDocument with debounce)
- [x] T020 [US1] Implement error display in webview at packages/blade-vscode/src/preview/panel.ts (styled error box with line/column info)

**Checkpoint**: User Story 1 complete - preview works with sample selection and live refresh

---

## Phase 4: User Story 2 - Activate Preview from Editor (Priority: P1)

**Goal**: Developer can open preview via command palette, keyboard shortcut, or toolbar icon

**Independent Test**: Open any .blade file, use Cmd+Shift+V (or command palette), verify preview panel opens beside editor

### Implementation for User Story 2

- [x] T021 [US2] Create preview command handler at packages/blade-vscode/src/commands/preview.ts (openPreview function)
- [x] T022 [US2] Register command in extension activation at packages/blade-vscode/src/extension.ts (registerCommand for blade.openPreview)
- [x] T023 [US2] Wire command to panel manager at packages/blade-vscode/src/commands/preview.ts (get active editor, call panel.show())
- [x] T024 [US2] Add command to extension subscriptions at packages/blade-vscode/src/extension.ts (disposable cleanup)

**Checkpoint**: User Stories 1+2 complete - core preview functionality fully working

---

## Phase 5: User Story 3 - Component Template Preview (Priority: P2)

**Goal**: Developer sees helpful message when previewing component file, with option to create sample

**Independent Test**: Open samples/ecommerce/ProductCard.blade, open preview, verify "no sample data" message appears with Create Sample button

### Implementation for User Story 3

- [x] T025 [US3] Implement component file detection at packages/blade-vscode/src/preview/samples.ts (check if file is index.blade or component)
- [x] T026 [US3] Implement empty state display at packages/blade-vscode/src/preview/panel.ts (show message for component files, no-samples, no-project)
- [x] T027 [US3] Implement Create Sample button handler at packages/blade-vscode/src/preview/panel.ts (handle createSample message from webview)
- [x] T028 [US3] Implement sample file generation at packages/blade-vscode/src/preview/samples.ts (parse @props, generate JSON skeleton, write to samples/ folder)

**Checkpoint**: User Story 3 complete - component preview shows helpful fallback

---

## Phase 6: User Story 4 - Preview Synchronization (Priority: P2)

**Goal**: Preview updates when switching between .blade files in editor

**Independent Test**: Open preview for index.blade, switch to ProductCard.blade tab, verify preview updates

### Implementation for User Story 4

- [x] T029 [US4] Implement active editor change listener at packages/blade-vscode/src/preview/panel.ts (onDidChangeActiveTextEditor)
- [x] T030 [US4] Implement file switch handling at packages/blade-vscode/src/preview/panel.ts (detect .blade file, update preview or show message)
- [x] T031 [US4] Implement per-project sample selection persistence at packages/blade-vscode/src/preview/panel.ts (save/restore via workspaceState)
- [x] T032 [US4] Implement sample JSON file watching at packages/blade-vscode/src/preview/panel.ts (refresh preview when sample file changes externally)

**Checkpoint**: User Story 4 complete - preview syncs with active editor

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, documentation, and quality improvements

- [x] T033 [P] Update packages/blade-vscode/README.md with preview feature documentation
- [x] T034 [P] Add preview feature to extension keywords in packages/blade-vscode/package.json
- [x] T035 Run build and verify extension packages successfully (npm run build)
- [x] T036 Manual testing: walk through quickstart.md testing checklist
- [x] T037 Build and install VSIX for final validation (npm run vscode)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 - Core preview functionality
- **Phase 4 (US2)**: Depends on Phase 2 - Can run in parallel with US1
- **Phase 5 (US3)**: Depends on US1 (needs panel infrastructure)
- **Phase 6 (US4)**: Depends on US1 (needs panel infrastructure)
- **Phase 7 (Polish)**: Depends on all user stories

### User Story Dependencies

```
Phase 2 (Foundational)
        │
        ▼
   ┌────┴────┐
   │         │
   ▼         ▼
[US1]      [US2]     ← P1 stories (can run in parallel)
   │         │
   └────┬────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
[US3]      [US4]     ← P2 stories (can run in parallel after US1)
   │         │
   └────┬────┘
        │
        ▼
    [Polish]
```

### Within Each User Story

- File discovery/loading before rendering
- Renderer before panel (panel uses renderer)
- Panel core before additional features
- Core implementation before message handlers

### Parallel Opportunities

**Phase 1**: T004, T005, T006 can run in parallel (different package.json sections)
**Phase 3 (US1)**: T011, T012, T016 can run in parallel (different files)
**Phase 3+4**: US1 and US2 can run in parallel after Foundational
**Phase 5+6**: US3 and US4 can run in parallel after US1 panel is complete
**Phase 7**: T033, T034 can run in parallel (different files)

---

## Parallel Example: User Story 1 Kickoff

```bash
# After Phase 2 completes, launch these in parallel:
Task: "Implement sample file discovery at packages/blade-vscode/src/preview/samples.ts"
Task: "Implement sample file loading at packages/blade-vscode/src/preview/samples.ts"
Task: "Create preview CSS styles at packages/blade-vscode/media/preview.css"
```

---

## Implementation Strategy

### MVP First (User Stories 1+2 Only)

1. Complete Phase 1: Setup (6 tasks)
2. Complete Phase 2: Foundational (4 tasks)
3. Complete Phase 3: User Story 1 (10 tasks)
4. Complete Phase 4: User Story 2 (4 tasks)
5. **STOP and VALIDATE**: Test preview with all sample projects
6. Deploy/demo if ready - core functionality complete!

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 (Preview with Samples) → Test → **MVP delivered!**
3. Add US2 (Activation Methods) → Test → Full P1 complete
4. Add US3 (Component Preview) → Test → Better DX
5. Add US4 (Tab Sync) → Test → Polished experience
6. Polish phase → Documentation and final validation

### Task Count Summary

| Phase | Tasks | Cumulative |
|-------|-------|------------|
| Setup | 6 | 6 |
| Foundational | 4 | 10 |
| US1 (P1) | 10 | 20 |
| US2 (P1) | 4 | 24 |
| US3 (P2) | 4 | 28 |
| US4 (P2) | 4 | 32 |
| Polish | 5 | 37 |
| **Total** | **37** | |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story (US1-US4)
- US1+US2 are both P1 priority - implement together for MVP
- US3+US4 are P2 priority - can be deferred if needed
- Commit after each task or logical group
- Manual testing checklist in quickstart.md for validation
