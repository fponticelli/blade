# Feature Specification: @bladets/tempo Package

**Feature Branch**: `010-blade-tempo-package`
**Created**: 2025-12-02
**Status**: Draft
**Input**: User description: "new package blade-tempo that from the template can render a @tempots/dom Renderable that takes a signal of data to update its own content"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render Template as Reactive UI Component (Priority: P1)

A developer wants to use their Blade template in a Tempo application where the data is reactive. When the data signal changes, the rendered output should automatically update without requiring manual re-renders or DOM manipulation.

**Why this priority**: This is the core value proposition of the package - enabling reactive rendering of Blade templates in Tempo applications. Without this, the package has no purpose.

**Independent Test**: Can be fully tested by creating a Blade template, compiling it, passing it to blade-tempo with a data signal, mounting the result, and verifying that updating the signal causes the DOM to update.

**Acceptance Scenarios**:

1. **Given** a compiled Blade template and a data signal with initial value `{name: "Alice"}`, **When** the developer creates a Tempo Renderable from the template with the signal, **Then** the rendered output shows "Alice" and updates automatically when the signal value changes to `{name: "Bob"}`.

2. **Given** a compiled Blade template with conditional logic (`@if`), **When** the data signal changes to satisfy/unsatisfy the condition, **Then** the rendered output reflects the conditional change without full re-render.

3. **Given** a compiled Blade template with a loop (`@for`), **When** the data signal array changes (items added, removed, or reordered), **Then** the rendered list updates to reflect the new array state.

---

### User Story 2 - Integrate with Existing Tempo Application (Priority: P2)

A developer building a Tempo application wants to incorporate Blade templates for certain UI sections. The Blade-generated Renderable should compose naturally with other Tempo Renderables and follow Tempo's lifecycle patterns.

**Why this priority**: Integration with the Tempo ecosystem is essential for practical use, but secondary to the core rendering functionality.

**Independent Test**: Can be fully tested by creating a Tempo application with regular Tempo components and embedding a blade-tempo Renderable within it, verifying proper mounting, updating, and unmounting behavior.

**Acceptance Scenarios**:

1. **Given** a Tempo application with a root Renderable, **When** the developer adds a blade-tempo Renderable as a child, **Then** it mounts, updates, and unmounts following standard Tempo lifecycle.

2. **Given** a blade-tempo Renderable, **When** it's used with Tempo's conditional rendering (`When`, `Unless`), **Then** it properly activates and deactivates based on conditions.

3. **Given** multiple blade-tempo Renderables in the same application, **When** each has its own data signal, **Then** each updates independently without interfering with others.

---

### User Story 3 - Use Helper Functions in Reactive Templates (Priority: P3)

A developer wants to use custom helper functions in their Blade templates rendered through blade-tempo. These helpers should work correctly in the reactive context.

**Why this priority**: Helper functions extend template functionality but are supplementary to core reactive rendering.

**Independent Test**: Can be fully tested by registering helper functions, using them in a Blade template, creating a blade-tempo Renderable, and verifying helpers are invoked correctly on initial render and updates.

**Acceptance Scenarios**:

1. **Given** a helper function `formatCurrency(value)` registered with the renderer, **When** the template uses `${formatCurrency(price)}` and the price in the signal changes, **Then** the output updates with the correctly formatted new value.

2. **Given** a helper function that accesses external state, **When** the data signal updates, **Then** the helper is re-evaluated with current state.

---

### Edge Cases

- What happens when the data signal contains `null` or `undefined`?
  - The template should render with empty/default values as per Blade's existing behavior

- How does the system handle when a signal update occurs during an ongoing render?
  - Updates should be queued and processed sequentially to prevent race conditions

- What happens when a template references data paths that don't exist in the signal value?
  - Missing paths should resolve to `undefined` and render as empty string

- How does performance scale with deeply nested reactive updates?
  - @tempots/dom's native reactivity efficiently updates only affected DOM sections; blade-tempo leverages this by translating templates to Tempo Renderables

- What happens when an expression throws a runtime error (e.g., calling method on undefined)?
  - The expression renders as empty string, a warning is logged to console, and surrounding template continues to render normally

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a compiled Blade template and return a factory function that creates Tempo Renderables
- **FR-002**: System MUST accept a data signal as input and produce Tempo Renderables that reactively update when the signal emits new values (leveraging @tempots/dom's native reactivity)
- **FR-003**: System MUST support all Blade template features (expressions, conditionals, loops, components, slots, match statements)
- **FR-004**: System MUST properly escape HTML in expression outputs to prevent XSS (following Blade's existing behavior)
- **FR-005**: System MUST integrate with Tempo's lifecycle (mounting, updating, unmounting)
- **FR-006**: System MUST support passing helper functions for use in template expressions
- **FR-007**: System MUST support passing global variables for use in templates
- **FR-008**: System MUST handle reactive updates to nested data structures
- **FR-009**: System MUST clean up subscriptions when the Renderable is unmounted
- **FR-010**: System MUST provide the package as an npm-installable module with TypeScript type definitions
- **FR-011**: System MUST handle runtime expression errors gracefully by rendering empty string and logging a warning to console (resilience over failure)

### Key Entities

- **BladeTemplate**: A compiled Blade template (from @bladets/template) representing the structure to render
- **DataSignal**: A Tempo signal containing the data used to populate template expressions
- **BladeRenderable**: A Tempo Renderable generated from a Blade template that responds to signal updates
- **RenderOptions**: Configuration for rendering behavior (helpers, globals, escaping settings)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can render a Blade template as a reactive Tempo component in under 5 lines of code
- **SC-002**: Data signal updates are reflected in the rendered output within 16ms (one animation frame) for typical templates
- **SC-003**: The package adds less than 10KB (gzipped) to bundle size when used alongside @bladets/template and @tempots/dom
- **SC-004**: All existing Blade template features work correctly in the reactive context (100% feature parity with static rendering)
- **SC-005**: Memory usage remains stable during repeated signal updates (no memory leaks from subscriptions)
- **SC-006**: Package can be installed and used in under 2 minutes following documentation

## Clarifications

### Session 2025-12-02

- Q: What DOM update strategy should be used? → A: Fine-grained updates via @tempots/dom's native reactivity (blade-tempo translates templates to Tempo Renderables; Tempo handles efficient updates)
- Q: What should the npm package be named? → A: `@bladets/tempo` (scoped under existing @bladets org, matches @bladets/template pattern)
- Q: How should runtime expression errors be handled? → A: Silent fallback - render empty string for failed expressions, log warning to console (resilience prioritized)
- Q: What browser/environment support is required? → A: ES2020+ browsers (~95% coverage, matches @tempots/dom requirements)

## Assumptions

- Developers already have @tempots/dom installed in their project (peer dependency)
- Developers have compiled Blade templates available (via @bladets/template)
- The target environment supports ES2020+ (matches @tempots/dom browser requirements)
- Tempo signals follow the standard Tempo signal API (`value`, `map()`, subscriptions)
- Templates are pre-compiled; runtime compilation is not in scope for this package
