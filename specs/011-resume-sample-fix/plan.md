# Implementation Plan: Resume Sample Parsing and Rendering Fix

**Branch**: `011-resume-sample-fix` | **Date**: 2025-12-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-resume-sample-fix/spec.md`

## Summary

Fix the resume sample (`samples/resume/index.blade`) to parse correctly in @bladets/template and render correctly in both template (server-side) and tempo (client-side reactive) renderers. This involves validating that all Blade syntax features used in the resume template (expression interpolation, null coalescing, nested property access, `@if` directives, CSS expressions) work correctly across the parsing, rendering, and VSCode extension systems.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: @bladets/template ^0.2.0, @bladets/tempo ^0.1.1, vscode-languageserver ^9.0.1
**Storage**: N/A (file-based template processing)
**Testing**: Vitest 2.1.8
**Target Platform**: Node.js 18+, VSCode 1.85+, Browser (for tempo)
**Project Type**: Monorepo with packages (blade, blade-tempo, blade-vscode)
**Performance Goals**: N/A (single file parsing/rendering validation)
**Constraints**: Must work with existing parser, renderer, and LSP infrastructure
**Scale/Scope**: Single template file + single sample data file validation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Rationale |
|-----------|--------|-----------|
| **I. Type Safety First** | COMPLIANT | This fix ensures templates parse correctly, maintaining type safety from authoring through rendering |
| **II. Source Auditability** | COMPLIANT | No changes to auditability features; resume template uses standard rd-source attributes |
| **III. Security by Default** | COMPLIANT | No new code execution paths; only validating existing sandboxed template features |
| **IV. Component Isolation** | COMPLIANT | Resume template doesn't use components; future component support is unaffected |
| **V. Developer Experience** | COMPLIANT | This fix directly improves DX by ensuring sample works error-free in VSCode |

**Quality Standards Compliance**:
- Testing: Will add/update tests for resume sample validation
- Documentation: Sample serves as reference documentation

**Development Workflow Compliance**:
- All changes will pass typecheck, lint, and test
- Feature branch already created

## Project Structure

### Documentation (this feature)

```text
specs/011-resume-sample-fix/
├── plan.md              # This file
├── research.md          # Phase 0 output - identify current parsing issues
├── tasks.md             # Phase 2 output (created by /speckit.tasks)
└── checklists/
    └── requirements.md  # Already created
```

### Source Code (repository root)

```text
packages/
├── blade/                      # @bladets/template - Parser, Renderer, LSP
│   ├── src/
│   │   ├── parser/             # Template and expression parsing
│   │   ├── evaluator/          # Expression evaluation
│   │   ├── renderer/           # HTML output generation
│   │   └── lsp/                # Language server for VSCode
│   └── tests/                  # Vitest test files
├── blade-tempo/                # @bladets/tempo - Reactive DOM rendering
│   └── src/
└── blade-vscode/               # VSCode extension
    └── src/

samples/
└── resume/                     # Target sample to fix
    ├── index.blade             # Resume template file
    └── samples/
        └── data.json           # Sample data for rendering
```

**Structure Decision**: Existing monorepo structure. Changes will be to parser/evaluator/renderer in `packages/blade/src/` with corresponding tests in `packages/blade/tests/`.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0: Research Summary

**Root Cause Identified**: The template parser treats `<style>` tag content as regular template content. CSS closing braces `}` are misinterpreted as directive block endings, causing 26 parsing errors.

**Solution**: Modify `parseElement()` in template-parser.ts to handle `<style>` and `<script>` as raw content tags, only extracting `${...}` expressions within the raw content.

See [research.md](./research.md) for full analysis.

## Phase 1: Design Summary

**No new data models required** - this is a parser behavior fix.

**Key Changes**:
1. Add raw content tag detection in `parseElement()` for `<style>` and `<script>`
2. Create `parseRawContent()` method to scan until closing tag while extracting expressions
3. Add comprehensive tests for style/script expression parsing

See:
- [data-model.md](./data-model.md) - Reference documentation
- [quickstart.md](./quickstart.md) - Development and testing guide

## Next Step

Run `/speckit.tasks` to generate implementation tasks.
