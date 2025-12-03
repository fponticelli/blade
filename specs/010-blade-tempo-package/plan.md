# Implementation Plan: @bladets/tempo

**Branch**: `010-blade-tempo-package` | **Date**: 2025-12-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-blade-tempo-package/spec.md`

## Summary

Create `@bladets/tempo`, a new npm package that converts compiled Blade templates into @tempots/dom Renderables. The package translates Blade AST nodes into Tempo's functional component model, leveraging Tempo's native signal reactivity for efficient DOM updates. When a data signal changes, Tempo automatically updates only affected DOM nodes.

## Technical Context

**Language/Version**: TypeScript 5.7.2 (ESM modules)
**Primary Dependencies**: @tempots/dom (peer), @bladets/template (peer)
**Storage**: N/A (in-memory template processing)
**Testing**: Vitest (matches existing @bladets/template setup)
**Target Platform**: ES2020+ browsers (matches @tempots/dom requirements)
**Project Type**: Library package (npm publishable)
**Performance Goals**: Signal updates reflected within 16ms (one animation frame)
**Constraints**: <10KB gzipped bundle size, no runtime template compilation
**Scale/Scope**: Full Blade feature parity (expressions, conditionals, loops, components, slots, match)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | PASS | TypeScript throughout, leverages Blade's typed AST |
| II. Source Auditability | PASS | Source tracking attributes preserved in DOM output |
| III. Security by Default | PASS | HTML escaping inherited from Blade evaluator, no dynamic code execution |
| IV. Component Isolation | PASS | Blade component scope isolation maintained |
| V. Developer Experience | PASS | Simple API (5 lines to render), TypeScript types exported |

**Quality Standards**:
- Unit tests for each node type conversion
- Integration tests for reactive update scenarios
- Bundle size monitoring in CI

**All gates pass. Proceeding to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/010-blade-tempo-package/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/blade-tempo/
├── package.json         # @bladets/tempo npm package config
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Build configuration
├── README.md            # Package documentation
├── src/
│   ├── index.ts         # Main entry point, exports public API
│   ├── renderable.ts    # Core: CompiledTemplate → Renderable conversion
│   ├── nodes/           # Node type converters
│   │   ├── text.ts      # TextNode → Tempo text/interpolation
│   │   ├── element.ts   # ElementNode → Tempo html.* elements
│   │   ├── if.ts        # IfNode → Tempo When/Unless
│   │   ├── for.ts       # ForNode → Tempo ForEach
│   │   ├── match.ts     # MatchNode → Tempo conditional rendering
│   │   ├── let.ts       # LetNode → signal/computed creation
│   │   ├── component.ts # ComponentNode → nested Renderable
│   │   ├── slot.ts      # SlotNode → content projection
│   │   └── fragment.ts  # FragmentNode → Tempo Fragment
│   ├── evaluator.ts     # Expression evaluation with signal integration
│   └── types.ts         # Public TypeScript types
└── tests/
    ├── renderable.test.ts    # Integration tests
    ├── nodes/                # Unit tests per node type
    └── fixtures/             # Test templates and data
```

**Structure Decision**: New package under `packages/blade-tempo` following the existing monorepo pattern with `packages/blade` and `packages/blade-vscode`.

## Complexity Tracking

> No constitution violations. Table not required.
