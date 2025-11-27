# Implementation Plan: VSCode Preview Mode with Sample Data

**Branch**: `007-vscode-preview-mode` | **Date**: 2025-11-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-vscode-preview-mode/spec.md`

## Summary

Add a live preview panel to the Blade VSCode extension that renders templates using sample JSON data from the project's `samples/` folder. The preview displays in a side-by-side split view, refreshes on every keystroke (with debounce), and allows switching between different sample files via a dropdown.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: vscode ^1.85.0, vscode-languageclient ^9.0.1, existing @fponticelli/blade package
**Storage**: VSCode workspace state (for persisting selected sample per project)
**Testing**: Vitest (existing test framework in blade package)
**Target Platform**: VSCode Extension (cross-platform)
**Project Type**: Single package extension (packages/blade-vscode)
**Performance Goals**: <500ms preview refresh, <2s initial load
**Constraints**: Must work with existing LSP architecture, debounce typing to avoid excessive re-renders
**Scale/Scope**: Single developer workflow tool

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | ✅ PASS | Uses existing typed compile/render APIs from blade package |
| II. Source Auditability | ✅ PASS | Preview renders source-attributed HTML (rd-source attributes) |
| III. Security by Default | ✅ PASS | Uses sandboxed template execution, no dynamic code execution |
| IV. Component Isolation | ✅ PASS | Components resolved via existing project context |
| V. Developer Experience | ✅ PASS | Core feature: live preview with error feedback |

**Quality Standards**:
- ✅ Testing: Will add integration tests for preview functionality
- ✅ Performance: Debounced refresh prevents performance issues
- ✅ Documentation: Will update README with preview feature

## Project Structure

### Documentation (this feature)

```text
specs/007-vscode-preview-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/blade-vscode/
├── src/
│   ├── extension.ts          # Extension entry point (modify)
│   ├── preview/              # NEW: Preview feature module
│   │   ├── panel.ts          # Webview panel management
│   │   ├── renderer.ts       # Template compilation/rendering
│   │   └── samples.ts        # Sample file discovery/loading
│   └── commands/             # NEW: Command handlers
│       └── preview.ts        # Preview command registration
├── media/                    # NEW: Webview assets
│   └── preview.css           # Preview styling
├── syntaxes/
├── out/
└── package.json              # Add commands, keybindings, icons

packages/blade/
├── src/
│   └── project/
│       ├── compile.ts        # Existing - may expose for preview
│       └── samples.ts        # Existing - reuse for sample loading
└── tests/
    └── lsp/
        └── preview.test.ts   # NEW: Preview integration tests
```

**Structure Decision**: Extend existing VSCode extension package with new preview module. Preview rendering will use the existing blade package's compile/render APIs.

## Complexity Tracking

> No Constitution Check violations - no entries needed.

## Architecture Overview

### Component Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │  Commands   │───▶│  Preview    │───▶│    Webview      │ │
│  │  Handler    │    │  Provider   │    │    Panel        │ │
│  └─────────────┘    └──────┬──────┘    └────────┬────────┘ │
│                            │                     │          │
│                     ┌──────▼──────┐              │          │
│                     │   Sample    │              │          │
│                     │   Manager   │              │          │
│                     └──────┬──────┘              │          │
└────────────────────────────┼─────────────────────┼──────────┘
                             │                     │
                    ┌────────▼─────────┐   ┌──────▼──────┐
                    │  blade package   │   │   Webview   │
                    │  compile/render  │   │   HTML/CSS  │
                    └──────────────────┘   └─────────────┘
```

### Data Flow

1. User activates preview → Command handler creates/shows preview panel
2. Panel requests render → Sample manager loads selected JSON
3. Renderer compiles template with sample data → Returns HTML
4. HTML sent to webview → Webview displays rendered output
5. File change detected → Debounced re-render triggered

## Key Design Decisions

### D1: Webview vs. Custom Editor
**Decision**: Use VSCode Webview Panel (not Custom Editor)
**Rationale**: Webview panels support side-by-side display, can be triggered programmatically, and are the standard approach for preview panels (Markdown preview uses this).

### D2: Compilation Location
**Decision**: Compile in extension host, not in webview
**Rationale**: Reuse existing blade package APIs, maintain type safety, avoid loading compilation code in webview.

### D3: Live Refresh Strategy
**Decision**: Text document change listener with 300ms debounce
**Rationale**: Provides instant feedback while avoiding excessive re-renders during typing.

### D4: Sample Selection Persistence
**Decision**: Use VSCode workspace state
**Rationale**: Persists across sessions, scoped to workspace (project), no file pollution.
