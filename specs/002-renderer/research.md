# Research: Template Renderer

**Feature**: 002-renderer
**Date**: 2025-11-25

## Overview

This document captures research findings for implementing the Blade template renderer. The renderer transforms compiled template AST into HTML output.

## Design Decision 1: Rendering Architecture

**Decision**: Recursive AST traversal with visitor pattern

**Rationale**:
- AST is hierarchical (nodes contain child nodes)
- Each node type has distinct rendering logic
- Visitor pattern allows clean separation of node-specific code
- TypeScript exhaustive switch provides type safety

**Alternatives Considered**:
- Iterative with explicit stack: More complex, no benefit for our depth limits
- Code generation: Premature optimization, harder to debug

## Design Decision 2: HTML Escaping Strategy

**Decision**: Escape by default with opt-out via configuration

**Rationale**:
- Security by default (Constitution Principle III)
- Only escape text content expressions, not element tags/attributes
- Standard HTML entities: `&`, `<`, `>`, `"`, `'`
- Configurable via `htmlEscape` option for trusted content

**Implementation**:
```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

## Design Decision 3: Scope Management

**Decision**: Immutable scope with copy-on-write for nested contexts

**Rationale**:
- Constitution Principle IV: Component Isolation
- Each @for loop creates new scope with iteration variables
- Each component creates isolated scope with only props
- Parent scope not accessible from components (isolation)
- `@@` declarations add to current scope locals or globals

**Scope Stack**:
```
Root scope (data, globals)
  └── @for loop scope (+ itemVar, indexVar)
      └── Component scope (only props, no parent access)
          └── @for loop scope (+ itemVar, indexVar)
```

## Design Decision 4: Resource Limit Enforcement

**Decision**: Counter-based tracking with early termination

**Rationale**:
- Constitution Principle III: Security by Default
- Track: total iterations, loop nesting depth, component depth
- Throw RenderError when any limit exceeded
- Check BEFORE each iteration/component instantiation

**Limits** (from existing constants):
- `maxLoopNesting`: 5
- `maxIterationsPerLoop`: 1000
- `maxTotalIterations`: 10000
- `maxComponentDepth`: 10

## Design Decision 5: Source Tracking Implementation

**Decision**: Collect paths during evaluation, attach at element level

**Rationale**:
- Constitution Principle II: Source Auditability
- Only add attributes when `includeSourceTracking: true`
- Collect paths from all expressions within an element
- Format: `rd-source="path1,path2,path3"`

**Flow**:
1. Begin element rendering
2. Evaluate all expressions, track accessed paths
3. Before closing tag, add rd-source attribute if tracking enabled
4. Optionally add rd-source-op for helper operations

## Design Decision 6: Boolean and Null Attribute Handling

**Decision**: Follow HTML5 semantics

**Rationale**:
- `disabled={true}` → `disabled` (attribute present)
- `disabled={false}` → (attribute omitted)
- `value={null}` → (attribute omitted)
- `value={undefined}` → (attribute omitted)
- `value={0}` → `value="0"` (falsy but not null/undefined)

## Design Decision 7: Undefined/Null Expression Rendering

**Decision**: Render as empty string

**Rationale**:
- `${undefined}` → `` (empty)
- `${null}` → `` (empty)
- More intuitive than "undefined" or "null" strings
- Consistent with template engine conventions

## Design Decision 8: Error Handling

**Decision**: Wrap and propagate with source location

**Rationale**:
- Constitution Principle V: Developer Experience
- Catch evaluation errors, wrap with render context
- Include: source location, expression text, data path
- Use RenderError class extending Error

**Error Types**:
- `RenderError`: General rendering failure
- `ResourceLimitError extends RenderError`: Limit exceeded
- Propagate `EvaluationError` from evaluator with additional context

## AST Node Types to Render

From `ast/types.ts`, the renderer must handle:

### Expression Nodes (via evaluator)
- `LiteralNode`: Passed to evaluator
- `PathNode`: Passed to evaluator
- `UnaryNode`: Passed to evaluator
- `BinaryNode`: Passed to evaluator
- `TernaryNode`: Passed to evaluator
- `CallNode`: Passed to evaluator
- `ArrayWildcardNode`: Passed to evaluator

### Template Nodes (renderer responsibility)
1. `TextNode`: Evaluate expression segments, concatenate with literals
2. `ElementNode`: Render tag, attributes, children
3. `IfNode`: Evaluate conditions, render first truthy branch
4. `ForNode`: Iterate collection, render body with scoped variables
5. `MatchNode`: Pattern match, render matching case
6. `LetNode`: Add variable to scope
7. `ComponentNode`: Create isolated scope, render component definition
8. `FragmentNode`: Render children, preserve whitespace
9. `SlotNode`: Insert caller's slot content or fallback
10. `CommentNode`: Optionally include based on config
11. `RootNode`: Entry point, contains children and component definitions

## Existing Code Analysis

### renderer/index.ts (existing stubs)
- `RenderOptions`, `RenderConfig` interfaces defined
- `RenderResult`, `RuntimeMetadata` interfaces defined
- `ResourceLimits` interface and defaults defined
- `createStringRenderer()` stub returns "Not implemented"
- `createDomRenderer()` stub returns "Not implemented"
- `render()` convenience wrapper exists
- `createScope()` helper exists

### evaluator/index.ts (Phase 5, complete)
- `evaluate(expr, context)` function ready
- `Scope`, `EvaluationContext` types defined
- `EvaluationError` with location
- All expression types supported

### helpers/index.ts (existing)
- Standard library helpers defined
- Curried signature: `(scope, setWarning) => (...args) => result`

## Implementation Strategy

1. **Phase 1: Core Infrastructure**
   - RenderError class
   - RenderContext type (extends EvaluationContext with limits tracking)
   - escapeHtml utility
   - Scope creation/cloning utilities

2. **Phase 2: Basic Node Rendering**
   - renderTextNode
   - renderElementNode (without source tracking)
   - Wire into createStringRenderer

3. **Phase 3: Directives**
   - renderIfNode
   - renderForNode (with limit enforcement)
   - renderMatchNode
   - renderLetNode

4. **Phase 4: Components**
   - renderComponentNode (scope isolation)
   - renderSlotNode
   - renderFragmentNode

5. **Phase 5: Polish**
   - Source tracking (rd-source attributes)
   - Comment rendering
   - RuntimeMetadata collection
