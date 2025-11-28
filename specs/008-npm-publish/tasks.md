# Tasks: NPM Package Publishing

**Input**: Design documents from `/specs/008-npm-publish/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/package-json.schema.json, quickstart.md

**Tests**: No automated tests requested - verification via manual ESM/CJS import testing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build configuration changes for dual ESM/CJS output

- [X] T001 Update Vite config to output both ESM and CJS formats in packages/blade/vite.config.ts
- [X] T002 Run build to verify dual output generation with `npm run build` in packages/blade/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Package.json configuration required for ALL user stories

**⚠️ CRITICAL**: No user story verification can begin until this phase is complete

- [X] T003 Add CommonJS entry point (`main`) field in packages/blade/package.json
- [X] T004 Add ESM entry point (`module`) field in packages/blade/package.json
- [X] T005 Configure `exports` field with conditional exports for main entry in packages/blade/package.json
- [X] T006 Configure `exports` field with conditional exports for lsp/server entry in packages/blade/package.json
- [X] T007 Add `engines` field specifying Node.js >=18.0.0 in packages/blade/package.json
- [X] T008 Update `files` array to include README.md in packages/blade/package.json

**Checkpoint**: Foundation ready - user story verification can now begin

---

## Phase 3: User Story 1 - ESM Project Usage (Priority: P1) 🎯 MVP

**Goal**: Developers can install and use the package in modern ESM projects with full TypeScript support

**Independent Test**: Create a test ESM project, install package via `npm pack` + local install, verify `import { compile } from '@bladets/template'` works and TypeScript provides IntelliSense

### Implementation for User Story 1

- [X] T009 [US1] Verify ESM output exists at packages/blade/dist/index.js after build
- [X] T010 [US1] Verify TypeScript declarations exist at packages/blade/dist/index.d.ts after build
- [X] T011 [US1] Verify LSP server ESM output exists at packages/blade/dist/lsp/server.js after build
- [X] T012 [US1] Create test ESM project and verify import works (manual verification)
- [X] T013 [US1] Verify TypeScript IntelliSense works in test ESM project (manual verification)

**Checkpoint**: ESM usage fully functional - package can be used in modern projects

---

## Phase 4: User Story 2 - CommonJS Project Usage (Priority: P2)

**Goal**: Developers can install and use the package in legacy CommonJS projects

**Independent Test**: Create a test CJS project (no `"type": "module"`), install package via `npm pack` + local install, verify `const { compile } = require('@bladets/template')` works

### Implementation for User Story 2

- [X] T014 [US2] Verify CJS output exists at packages/blade/dist/index.cjs after build
- [X] T015 [US2] Verify LSP server CJS output exists at packages/blade/dist/lsp/server.cjs after build
- [X] T016 [US2] Create test CJS project and verify require works (manual verification)
- [X] T017 [US2] Verify all public APIs work identically to ESM version (manual verification)

**Checkpoint**: CommonJS usage fully functional - package supports legacy projects

---

## Phase 5: User Story 3 - Package Discoverability (Priority: P3)

**Goal**: Package is discoverable on NPM with proper metadata and links

**Independent Test**: Run `npm pack` and verify tarball contents; check all metadata fields are present

### Implementation for User Story 3

- [X] T018 [P] [US3] Add `homepage` field with GitHub README link in packages/blade/package.json
- [X] T019 [P] [US3] Add `bugs` field with GitHub issues link in packages/blade/package.json
- [X] T020 [US3] Add `prepublishOnly` script to run checks before publish in packages/blade/package.json
- [X] T021 [US3] Run `npm pack` and verify tarball size is under 500KB
- [X] T022 [US3] Verify tarball contains only expected files (dist/, README.md, LICENSE, package.json)

**Checkpoint**: Package metadata complete - ready for NPM publishing

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and documentation

- [X] T023 Run full verification checklist from quickstart.md
- [X] T024 Verify no development files (tests, source, config) are in tarball
- [X] T025 Document dual package hazard warning in README if not already present

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (ESM) can proceed first (MVP)
  - US2 (CJS) depends on same build output, can be verified after US1
  - US3 (Metadata) can be done in parallel with US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses same build output as US1
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2

### Within Each User Story

- Build output verification before manual testing
- Manual verification after build artifacts confirmed

### Parallel Opportunities

- T018 and T019 can run in parallel (different package.json fields, no conflicts)
- US1 verification and US3 implementation can run in parallel
- All foundational tasks (T003-T008) modify package.json - execute sequentially to avoid conflicts

---

## Parallel Example: User Story 3 Metadata

```bash
# Launch metadata tasks in parallel:
Task: "Add homepage field in packages/blade/package.json"
Task: "Add bugs field in packages/blade/package.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (Vite config changes)
2. Complete Phase 2: Foundational (package.json exports)
3. Complete Phase 3: User Story 1 (ESM verification)
4. **STOP and VALIDATE**: Test ESM import in isolated project
5. Package can be published as ESM-only if CJS not critical

### Incremental Delivery

1. Complete Setup + Foundational → Build produces dual output
2. Add User Story 1 → Test ESM independently → Core functionality ready
3. Add User Story 2 → Test CJS independently → Full format support
4. Add User Story 3 → Verify metadata → Publishing ready
5. Each story adds value without breaking previous stories

### Single Developer Strategy

Recommended execution order:

1. T001-T002: Update Vite config and verify build
2. T003-T008: Update all package.json fields
3. T009-T013: Verify ESM works (MVP complete!)
4. T014-T017: Verify CJS works
5. T018-T022: Complete metadata
6. T023-T025: Final polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Manual verification tasks require creating temporary test projects
- Use `npm pack` to create local tarball for testing before publishing
- Actual `npm publish` is NOT included in tasks - requires manual execution with credentials
- Commit after each phase completion
