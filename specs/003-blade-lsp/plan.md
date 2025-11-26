# Implementation Plan: Blade Language Server (LSP)

**Branch**: `003-blade-lsp` | **Date**: 2025-11-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-blade-lsp/spec.md`

## Summary

Implement a Language Server Protocol (LSP) server for Blade templates providing syntax highlighting, real-time diagnostics, autocompletion, and code navigation. The LSP leverages the existing Blade parser to provide AST-based analysis for .blade files. This is Phase 7 of the Blade implementation plan - the Developer Experience phase mandated by Constitution Principle V.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM modules)
**Primary Dependencies**: vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1, vscode-languageserver-textdocument ^1.0.11
**Storage**: N/A (in-memory document state)
**Testing**: Vitest for unit tests; VS Code Extension Testing for integration
**Target Platform**: VS Code extension (primary); any LSP-compatible editor (secondary)
**Project Type**: VS Code extension package within existing monorepo
**Performance Goals**: <100ms completion response; <300ms diagnostic update
**Constraints**: Must work with large files (10,000+ lines); incremental parsing required
**Scale/Scope**: Single .blade file editing; workspace-wide component/helper discovery

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Type Safety First** | ✅ PASS | LSP provides type-aware completions from inferred data context |
| **II. Source Auditability** | ✅ PASS | Go-to-definition and hover info trace data/template origins |
| **III. Security by Default** | ✅ PASS | LSP is read-only analysis; no code execution |
| **IV. Component Isolation** | ✅ PASS | Component scope analysis enforces isolation in completions |
| **V. Developer Experience** | ✅ PASS | This feature directly implements Principle V: "LSP for real-time validation, autocomplete, and diagnostics" |

**Quality Standards Compliance**:
- ✅ Unit tests for all provider modules (completion, diagnostic, definition)
- ✅ Integration tests for end-to-end LSP scenarios
- ✅ No external runtime dependencies beyond LSP libraries

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/003-blade-lsp/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/blade/
├── src/
│   ├── lsp/
│   │   ├── server.ts           # LSP server main entry
│   │   ├── document.ts         # Document state management
│   │   ├── providers/
│   │   │   ├── completion.ts   # Autocompletion provider
│   │   │   ├── diagnostic.ts   # Syntax/lint diagnostics
│   │   │   ├── definition.ts   # Go to definition
│   │   │   ├── hover.ts        # Hover information
│   │   │   └── reference.ts    # Find references
│   │   ├── analyzer/
│   │   │   ├── scope.ts        # Scope analysis for completions
│   │   │   └── workspace.ts    # Workspace-wide indexing
│   │   └── index.ts            # Public exports
│   ├── parser/                 # Existing parser (reused)
│   ├── ast/                    # Existing AST types (reused)
│   └── index.ts                # Main exports (updated)
└── tests/
    └── lsp/
        ├── completion.test.ts
        ├── diagnostic.test.ts
        ├── definition.test.ts
        └── integration.test.ts

packages/blade-vscode/              # New package for VS Code extension
├── package.json                    # Extension manifest
├── syntaxes/
│   └── blade.tmLanguage.json       # TextMate grammar
├── language-configuration.json     # Editor config (brackets, comments)
├── src/
│   └── extension.ts                # Extension activation
└── README.md                       # Extension documentation
```

**Structure Decision**: Two-package structure - the LSP server logic lives in `packages/blade/src/lsp/` to share parser/AST code, while the VS Code extension shell lives in `packages/blade-vscode/` for editor-specific integration and TextMate grammar.

## Complexity Tracking

> No violations detected - section not applicable.
