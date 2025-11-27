# Implementation Plan: Project-based Template Compilation

**Branch**: `005-project-template-compilation` | **Date**: 2025-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-project-template-compilation/spec.md`

## Summary

Add project compilation mode to Blade enabling multi-file template projects with:
- Convention-based component discovery from folder structure
- `@props()` directive for declaring component inputs
- Dot-notation namespacing for nested folders (`<Components.Form.Input />`)
- Schema-driven LSP intelligence from `schema.json` and `samples/` files

This extends the existing compiler and LSP infrastructure with filesystem-aware component resolution.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1 (existing)
**Storage**: Filesystem-based (project folders, .blade files, schema.json, samples/*.json)
**Testing**: Vitest with coverage
**Target Platform**: Node.js (compiler), VS Code (LSP extension)
**Project Type**: Monorepo (packages/blade, packages/blade-vscode)
**Performance Goals**: <1s compile for 10+ components, <200ms LSP completions
**Constraints**: Must integrate with existing compiler pipeline (parser → metadata → validation → evaluation → render)
**Scale/Scope**: Projects with 50+ components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | ✅ PASS | `@props()` declarations enable compile-time validation; JSON Schema support for data contracts |
| II. Source Auditability | ✅ PASS | Component resolution paths tracked via existing `propPathMapping`; file origins preserved |
| III. Security by Default | ✅ PASS | No new code execution paths; component scope isolation maintained |
| IV. Component Isolation | ✅ PASS | Components only access props; template-passed components shadow auto-loaded (clarified) |
| V. Developer Experience | ✅ PASS | LSP completions, go-to-definition, schema-driven hints enhance productivity |

**Quality Standards Compliance**:
- All new code will have unit tests (project discovery, @props parsing, component resolution)
- Integration tests for multi-file project scenarios
- Error messages will include source locations and actionable context

## Project Structure

### Documentation (this feature)

```text
specs/005-project-template-compilation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API definitions)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── ast/
│   │   └── types.ts           # Add PropDeclaration, ProjectConfig types
│   ├── compiler/
│   │   └── index.ts           # Add compileProject() entry point
│   ├── parser/
│   │   ├── template-parser.ts # Add @props() directive parsing
│   │   └── props-parser.ts    # NEW: Parse @props declarations
│   ├── project/               # NEW: Project-level features
│   │   ├── discovery.ts       # Component discovery from filesystem
│   │   ├── resolver.ts        # Dot-notation to file path resolution
│   │   ├── schema.ts          # JSON Schema loading and type extraction
│   │   └── samples.ts         # Sample data loading
│   ├── lsp/
│   │   ├── providers/
│   │   │   ├── completion.ts  # Extend with schema/component completions
│   │   │   ├── definition.ts  # Add component go-to-definition
│   │   │   └── hover.ts       # Add sample-driven hover hints
│   │   ├── analyzer/
│   │   │   └── workspace.ts   # Add project-aware workspace state
│   │   └── project-context.ts # NEW: Project context for LSP
│   └── index.ts               # Export new APIs
└── tests/
    ├── project/               # NEW: Project compilation tests
    │   ├── discovery.test.ts
    │   ├── resolver.test.ts
    │   └── props.test.ts
    └── lsp/
        ├── completion.test.ts # Extend with schema/component cases
        └── definition.test.ts # Add component navigation tests
```

**Structure Decision**: Extends existing monorepo structure. New `project/` module isolates filesystem-aware features from core template engine. LSP extensions go into existing `lsp/` module.

## Complexity Tracking

> No Constitution Check violations. Table not required.

---

## Phase Completion Status

### Phase 0: Research ✅

- [research.md](./research.md) - Technical decisions documented
- All NEEDS CLARIFICATION items resolved
- 10 research topics covered

### Phase 1: Design & Contracts ✅

- [data-model.md](./data-model.md) - Entity definitions and relationships
- [contracts/compiler-api.ts](./contracts/compiler-api.ts) - Public compiler API
- [contracts/lsp-api.ts](./contracts/lsp-api.ts) - LSP provider contracts
- [quickstart.md](./quickstart.md) - Developer usage guide
- CLAUDE.md updated with new technologies

### Constitution Re-check (Post-Phase 1) ✅

All principles continue to pass. Design decisions reinforce:
- Type safety via PropDeclaration types and JSON Schema integration
- Source auditability via ComponentInfo.filePath tracking
- Security via unchanged sandboxing (no new code execution)
- Component isolation via template-passed shadowing (FR-007a)
- Developer experience via comprehensive LSP contracts

---

## Next Steps

Run `/speckit.tasks` to generate implementation tasks from this plan.
