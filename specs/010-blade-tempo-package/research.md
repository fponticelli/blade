# Research: @bladets/tempo

**Date**: 2025-12-02
**Feature**: 010-blade-tempo-package

## 1. @tempots/dom Renderable API

### Decision
Use Tempo's functional Renderable pattern where each Blade AST node maps to a Tempo Renderable function.

### Rationale
Tempo Renderables are functions that:
1. Take a context (typically a DOM context)
2. Perform operations on that context (creating DOM elements)
3. Return a cleanup function

This functional model maps directly to Blade's AST node structure. Each node type converter returns a Renderable.

### Key API Elements

| Tempo API | Purpose | Blade Mapping |
|-----------|---------|---------------|
| `html.*` (html.div, html.span, etc.) | Create HTML elements | ElementNode |
| `when(signal, thenRenderable, elseRenderable)` | Conditional rendering | IfNode |
| `foreach(signal, keyFn, itemRenderable)` | List rendering | ForNode |
| `fragment(...children)` | Group without wrapper | FragmentNode |
| `text(string)` | Static text | TextNode (literal segments) |
| Signal `.map()` | Derived reactive values | Expression evaluation |
| `prop(value)` | Mutable reactive state | Data signal input |

### Alternatives Considered
1. **Stringify + innerHTML**: Rejected - loses reactivity, security concerns
2. **Custom DOM diffing**: Rejected - reinvents Tempo, increases bundle size
3. **Render to VDOM**: Rejected - Tempo doesn't use VDOM

## 2. Signal Integration Strategy

### Decision
Accept a single `Signal<T>` (or `Prop<T>`) as data input. Use `.map()` to derive reactive values for template expressions.

### Rationale
Tempo signals auto-dispose when the Renderable unmounts - no manual subscription cleanup needed. The `.map()` method creates derived signals that update automatically, which aligns with Blade's expression evaluation model.

### Implementation Pattern

```typescript
// User provides data signal
const data = prop({ name: 'Alice', items: [1, 2, 3] });

// For text interpolation: ${name}
// Convert to: data.map(d => d.name)

// For conditionals: @if(items.length > 0)
// Convert to: when(data.map(d => d.items.length > 0), ...)

// For loops: @for(item of items)
// Convert to: foreach(data.map(d => d.items), ...)
```

### Alternatives Considered
1. **Multiple signals per expression**: Rejected - increases complexity, Blade evaluator expects single data context
2. **Observable/RxJS**: Rejected - different API than Tempo signals, adds dependency
3. **Manual subscriptions**: Rejected - Tempo handles lifecycle automatically

## 3. Expression Evaluation with Signals

### Decision
Wrap Blade's existing `evaluate()` function to work with signal values. Create a reactive evaluator that returns `Signal<unknown>` instead of `unknown`.

### Rationale
The Blade evaluator already handles all expression types (paths, operators, calls). By wrapping it with signal mapping, we maintain consistency with existing behavior while adding reactivity.

### Implementation Pattern

```typescript
function evaluateReactive(
  expr: ExprAst,
  dataSignal: Signal<unknown>,
  helpers: HelperRegistry,
  globals: Record<string, unknown>
): Signal<unknown> {
  return dataSignal.map(data => {
    const scope = { locals: {}, data, globals };
    return evaluate(expr, { scope, helpers, config });
  });
}
```

### Error Handling (per spec clarification)
- Runtime errors → render empty string, log warning
- Missing paths → undefined → empty string

## 4. Blade Node → Tempo Renderable Mapping

### Decision
Create a converter function for each Blade AST node type.

| Blade Node | Tempo Equivalent | Notes |
|------------|------------------|-------|
| TextNode | `text()` + signal interpolation | Literal segments static, expr segments reactive |
| ElementNode | `html.*` with attributes | Dynamic attrs use `.map()` |
| IfNode | `when(condition, then, else)` | Chain else-if as nested when |
| ForNode | `foreach(signal, keyFn, itemFn)` | Key from index or item |
| MatchNode | Nested `when()` calls | First match wins |
| LetNode | Local signal creation | Scoped to context |
| ComponentNode | Recursive Renderable call | Isolated scope via new data signal |
| FragmentNode | `fragment()` | Preserves whitespace |
| SlotNode | Content projection | Pass children through context |
| CommentNode | Skip (or render if config) | HTML comments only |
| DoctypeNode | Not applicable | Templates don't include doctype |

### Alternatives Considered
1. **Single monolithic converter**: Rejected - hard to test, hard to maintain
2. **Visitor pattern**: Rejected - overkill for simple mapping

## 5. Package Architecture

### Decision
Separate npm package `@bladets/tempo` with peer dependencies on `@bladets/template` and `@tempots/dom`.

### Rationale
- Keeps core Blade package browser-agnostic
- Users only pay for Tempo integration if they need it
- Peer deps ensure version compatibility

### Package Structure
```
@bladets/tempo
├── Peer deps: @bladets/template, @tempots/dom
├── Exports: createTempoRenderer, TempoRenderOptions
└── Bundle: <10KB gzipped
```

### Alternatives Considered
1. **Part of @bladets/template**: Rejected - adds @tempots/dom dep to all users
2. **Monorepo with shared code**: Selected - follows existing pattern
3. **Separate repo**: Rejected - harder to maintain version sync

## 6. HTML Escaping

### Decision
Reuse Blade's existing `escapeHtml()` function from the renderer module.

### Rationale
Blade already implements secure HTML escaping. No need to duplicate or use Tempo's escaping (if any).

### Implementation
Import `escapeHtml` from `@bladets/template` and apply to expression outputs before inserting as text.

## 7. Source Tracking Attributes

### Decision
Preserve `rd-source`, `rd-source-op`, `rd-source-note` attributes in element creation.

### Rationale
Constitution Principle II requires source auditability. These attributes are added during element rendering based on RenderConfig.

### Implementation
When creating `html.*` elements, include source tracking attributes if `config.includeSourceTracking` is true.

## Summary of Key Decisions

| Area | Decision |
|------|----------|
| Reactive model | Tempo's native signals via `.map()` |
| Data input | Single `Signal<T>` or `Prop<T>` |
| Error handling | Silent fallback + console warning |
| Expression eval | Wrap existing Blade evaluator |
| Node conversion | Per-type converter functions |
| Package structure | Separate npm package with peer deps |
| HTML escaping | Reuse Blade's escapeHtml |
| Source tracking | Preserve rd-source attributes |
