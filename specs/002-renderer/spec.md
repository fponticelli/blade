# Feature Specification: Template Renderer

**Feature Branch**: `002-renderer`
**Created**: 2025-11-25
**Status**: Draft
**Input**: User description: "Renderer - Phase 6 implementation enabling rendering of compiled template AST to HTML output with expression evaluation, directive processing, and component instantiation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render Static and Dynamic Content (Priority: P1)

As a template author, I want to render templates with static HTML and dynamic expression interpolations like `${user.name}` so that I can generate personalized HTML content from my data.

**Why this priority**: This is the foundational rendering capability - without it, no template produces output. Every other rendering feature depends on basic text/element rendering with expression evaluation.

**Independent Test**: Can be fully tested by providing a simple template with text nodes, element nodes, and expressions, verifying correct HTML string output.

**Acceptance Scenarios**:

1. **Given** a template `<h1>Hello, ${user.name}!</h1>` and data `{ user: { name: "Alice" } }`, **When** rendering, **Then** the output is `<h1>Hello, Alice!</h1>`
2. **Given** a template `<p>${price * quantity}</p>` and data `{ price: 10, quantity: 3 }`, **When** rendering, **Then** the output is `<p>30</p>`
3. **Given** a template with special characters `<p>${message}</p>` and data `{ message: "<script>alert('xss')</script>" }`, **When** rendering with default settings, **Then** the output has HTML-escaped content: `<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>`
4. **Given** a template `<div class="${cls}">text</div>` and data `{ cls: "highlight" }`, **When** rendering, **Then** the output is `<div class="highlight">text</div>`
5. **Given** a template with static attributes `<a href="/home" class="nav">Home</a>`, **When** rendering, **Then** the output preserves all attributes exactly

---

### User Story 2 - Render Conditional Content (Priority: P2)

As a template author, I want to use `@if`, `@else if`, and `@else` directives to conditionally show or hide content based on data conditions.

**Why this priority**: Conditional rendering is essential for any non-trivial template - showing different content based on user state, permissions, or data values.

**Independent Test**: Can be fully tested by providing templates with @if directives and various truthy/falsy data values.

**Acceptance Scenarios**:

1. **Given** template `@if(isLoggedIn) { <span>Welcome</span> }` and data `{ isLoggedIn: true }`, **When** rendering, **Then** the output contains `<span>Welcome</span>`
2. **Given** template `@if(isLoggedIn) { <span>Welcome</span> }` and data `{ isLoggedIn: false }`, **When** rendering, **Then** the output is empty
3. **Given** template `@if(count > 10) { Many } @else if(count > 0) { Some } @else { None }` and data `{ count: 5 }`, **When** rendering, **Then** the output is `Some`
4. **Given** template with nested @if directives, **When** rendering, **Then** each level evaluates independently with correct scope

---

### User Story 3 - Render Loops (Priority: P3)

As a template author, I want to use `@for` directives to iterate over arrays and objects so that I can render lists and repeated content.

**Why this priority**: Looping is critical for rendering lists, tables, and any repeated content from collections.

**Independent Test**: Can be fully tested by providing templates with @for directives and array/object data.

**Acceptance Scenarios**:

1. **Given** template `@for(item of items) { <li>${item.name}</li> }` and data `{ items: [{ name: "A" }, { name: "B" }] }`, **When** rendering, **Then** the output is `<li>A</li><li>B</li>`
2. **Given** template `@for(item, index of items) { <li>${index}: ${item}</li> }` and data `{ items: ["X", "Y"] }`, **When** rendering, **Then** the output is `<li>0: X</li><li>1: Y</li>`
3. **Given** template `@for(key in obj) { <dt>${key}</dt> }` and data `{ obj: { a: 1, b: 2 } }`, **When** rendering, **Then** the output contains `<dt>a</dt><dt>b</dt>`
4. **Given** an empty array, **When** rendering `@for(item of items) { <li>${item}</li> }`, **Then** the output is empty (no error)
5. **Given** nested @for loops, **When** rendering, **Then** each loop has its own iteration variable scope

---

### User Story 4 - Render Pattern Matching (Priority: P4)

As a template author, I want to use `@match` directives to render content based on pattern matching so that I can handle multiple discrete cases elegantly.

**Why this priority**: Pattern matching enables clean handling of status codes, types, and enumerated values without deeply nested conditionals.

**Independent Test**: Can be fully tested by providing templates with @match directives and various values to match.

**Acceptance Scenarios**:

1. **Given** template `@match(status) { when "active" { Active } when "inactive" { Inactive } * { Unknown } }` and data `{ status: "active" }`, **When** rendering, **Then** the output is `Active`
2. **Given** template with numeric literals `@match(code) { when 200, 201 { OK } when 404 { Not Found } }` and data `{ code: 201 }`, **When** rendering, **Then** the output is `OK`
3. **Given** template with expression case `@match(value) { _.x > 10 { Big } * { Small } }` and data `{ value: { x: 15 } }`, **When** rendering, **Then** the output is `Big`
4. **Given** no matching case and no default, **When** rendering, **Then** the output is empty (no error)

---

### User Story 5 - Render Components with Props and Slots (Priority: P5)

As a template author, I want to define and use components with props and slots so that I can create reusable template fragments with isolated scope.

**Why this priority**: Components enable template reuse, composition, and maintainability for larger templates.

**Independent Test**: Can be fully tested by defining a component in a template and instantiating it with various props and slot content.

**Acceptance Scenarios**:

1. **Given** a component `<Card title={heading}><p>${content}</p></Card>` where Card renders `<div class="card"><h2>${title}</h2><slot/></div>`, **When** rendering with data `{ heading: "Hello", content: "World" }`, **Then** the output is `<div class="card"><h2>Hello</h2><p>World</p></div>`
2. **Given** a component with named slots, **When** rendering with slot content, **Then** the correct slot is filled
3. **Given** a slot with fallback content and no provided content, **When** rendering, **Then** the fallback is used
4. **Given** a component, **When** the component body tries to access parent scope variables, **Then** they are not accessible (isolation)
5. **Given** nested components, **When** rendering, **Then** each component has isolated scope

---

### User Story 6 - Variable Declarations in Templates (Priority: P6)

As a template author, I want to use `@@ { }` blocks to declare local variables and computed values so that I can simplify complex expressions and avoid repetition.

**Why this priority**: Variable declarations improve template readability and enable computed values.

**Independent Test**: Can be fully tested by declaring variables in @@ blocks and referencing them in expressions.

**Acceptance Scenarios**:

1. **Given** template `@@ { total = price * qty } <p>${total}</p>` and data `{ price: 10, qty: 3 }`, **When** rendering, **Then** the output is `<p>30</p>`
2. **Given** template with global declaration `@@ { $.currency = "EUR" }`, **When** rendering, **Then** the global is accessible via `$.currency`
3. **Given** multiple @@ declarations, **When** rendering, **Then** later declarations can reference earlier ones
4. **Given** template with function declaration `@@ { double = (x) => x * 2 }`, **When** rendering `${double(5)}`, **Then** the output is `10`

---

### User Story 7 - Source Tracking for Audit Trails (Priority: P7)

As a compliance officer, I want rendered HTML to include source tracking attributes showing which data paths influenced each element so that I can audit data provenance.

**Why this priority**: Enterprise compliance requires traceability of data to rendered output.

**Independent Test**: Can be fully tested by enabling source tracking and verifying rd-source attributes appear on elements.

**Acceptance Scenarios**:

1. **Given** source tracking enabled and template `<p>${order.total}</p>`, **When** rendering, **Then** the output includes `rd-source="order.total"` attribute
2. **Given** source tracking enabled and a helper call `${formatCurrency(amount)}`, **When** rendering, **Then** the output includes `rd-source-op="format:currency"` attribute (if operation tracking enabled)
3. **Given** source tracking disabled (default), **When** rendering, **Then** no rd-source attributes appear
4. **Given** multiple expressions in one element, **When** rendering with source tracking, **Then** all paths are listed comma-separated

---

### User Story 8 - Resource Limit Enforcement (Priority: P8)

As a platform operator, I want the renderer to enforce resource limits to prevent runaway templates from consuming excessive resources.

**Why this priority**: Security and stability require bounds on execution to prevent DoS via malicious or buggy templates.

**Independent Test**: Can be fully tested by providing templates that exceed limits and verifying errors are thrown.

**Acceptance Scenarios**:

1. **Given** a loop that would iterate 100,000 times and limit of 10,000, **When** rendering, **Then** an error is thrown before completion
2. **Given** deeply nested loops exceeding max nesting depth, **When** rendering, **Then** an error is thrown
3. **Given** recursive components exceeding max component depth, **When** rendering, **Then** an error is thrown
4. **Given** all limits set to reasonable defaults, **When** rendering typical templates, **Then** no limit errors occur

---

### Edge Cases

- What happens when an expression evaluates to undefined? It renders as empty string (not "undefined")
- What happens when an expression throws an error? The error propagates with source location information
- What happens with self-closing HTML tags? They render correctly (e.g., `<br/>`, `<img/>`)
- What happens with boolean attributes? `<input disabled={true}>` renders as `<input disabled>`; `disabled={false}` omits the attribute
- What happens with null/undefined attribute values? The attribute is omitted from output
- What happens when slot content is not provided? The slot's fallback content (if any) is rendered
- What happens with whitespace in FragmentNodes? Whitespace is preserved exactly
- What happens with HTML comments? Configurable - included or excluded based on options

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render TextNodes by evaluating expression segments and concatenating with literal segments
- **FR-002**: System MUST render ElementNodes with their tag, attributes, and children
- **FR-003**: System MUST evaluate static, expression, and mixed attributes on elements
- **FR-004**: System MUST HTML-escape expression values in text content by default (configurable)
- **FR-005**: System MUST render IfNodes by evaluating conditions in order and rendering the first truthy branch
- **FR-006**: System MUST render ForNodes by iterating over arrays/objects and creating iteration variable scope
- **FR-007**: System MUST render MatchNodes by evaluating cases in order and rendering the first match
- **FR-008**: System MUST process LetNodes by adding variables to local or global scope
- **FR-009**: System MUST render ComponentNodes with isolated scope containing only passed props
- **FR-010**: System MUST render SlotNodes by inserting caller's slot content or fallback
- **FR-011**: System MUST render FragmentNodes preserving whitespace
- **FR-012**: System MUST optionally include or exclude CommentNodes based on configuration
- **FR-013**: System MUST add rd-source attributes when source tracking is enabled
- **FR-014**: System MUST add rd-source-op attributes when operation tracking is enabled
- **FR-015**: System MUST enforce resource limits (loop iterations, nesting depth, component depth)
- **FR-016**: System MUST throw descriptive errors with source location for evaluation failures
- **FR-017**: System MUST collect runtime metadata (paths accessed, helpers used, render time)
- **FR-018**: System MUST handle boolean attributes (true renders attribute, false omits it)
- **FR-019**: System MUST omit attributes with null/undefined values
- **FR-020**: System MUST render undefined/null expression values as empty string

### Key Entities

- **RenderOptions**: Configuration for rendering including globals, helpers, and config flags
- **RenderConfig**: Detailed settings for HTML escaping, comments, source tracking, whitespace
- **RenderResult**: Output containing HTML string and runtime metadata
- **RuntimeMetadata**: Statistics including paths accessed, helpers used, render time, iteration counts
- **ResourceLimits**: Bounds for loop iterations, nesting depth, component depth, etc.
- **Scope**: The evaluation context with locals, data, and globals

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 9 template AST node types (Text, Element, If, For, Match, Let, Component, Fragment, Slot) can be rendered correctly
- **SC-002**: 100% of acceptance scenarios pass automated testing
- **SC-003**: Expression evaluation correctly integrates with the evaluator from Phase 5
- **SC-004**: Resource limits prevent templates from exceeding configured bounds in all tested scenarios
- **SC-005**: Source tracking produces correct rd-source attributes mapping rendered elements to data paths
- **SC-006**: Component isolation prevents access to parent scope in all tested component scenarios
- **SC-007**: HTML escaping prevents XSS in all tested injection scenarios
- **SC-008**: Render performance supports templates with 1000+ nodes without degradation

## Assumptions

- The compiled template AST is valid and correctly parsed (Phase 3 complete)
- The expression evaluator is fully functional (Phase 5 complete)
- Helper functions follow the curried signature: `(scope, setWarning) => (...args) => result`
- Default resource limits are sufficient for typical templates
- The renderer produces string output initially; DOM rendering is a separate concern
- Boolean attribute handling follows HTML5 semantics
