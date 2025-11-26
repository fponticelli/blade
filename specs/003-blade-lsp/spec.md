# Feature Specification: Blade Language Server (LSP)

**Feature Branch**: `003-blade-lsp`
**Created**: 2025-11-25
**Status**: Draft
**Input**: User description: "an LSP with syntax highlighting, autocompletion, warnings and linting for .blade files"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Syntax Highlighting for Blade Templates (Priority: P1)

As a template author, I want my `.blade` files to have proper syntax highlighting in my editor so that I can easily distinguish between HTML, directives, expressions, and other template syntax.

**Why this priority**: Syntax highlighting is the foundational IDE feature - without visual distinction, developers cannot quickly parse and understand template structure.

**Independent Test**: Can be fully tested by opening a .blade file in a supported editor and verifying different syntax elements have distinct colors.

**Acceptance Scenarios**:

1. **Given** a .blade file with HTML elements `<div class="container">`, **When** viewed in editor, **Then** HTML tags, attribute names, and string values have distinct highlighting
2. **Given** a .blade file with expressions `${user.name}`, **When** viewed in editor, **Then** expression delimiters, paths, and operators are highlighted distinctly from surrounding HTML
3. **Given** a .blade file with directives `@if`, `@for`, `@match`, `@let`, **When** viewed in editor, **Then** directive keywords are prominently highlighted
4. **Given** a .blade file with comments `<!-- HTML comment -->`, **When** viewed in editor, **Then** comments are styled distinctly (typically dimmed)
5. **Given** a .blade file with components `<UserCard prop={value}>`, **When** viewed in editor, **Then** component names (PascalCase) are highlighted differently from regular HTML elements

---

### User Story 2 - Real-Time Syntax Error Diagnostics (Priority: P2)

As a template author, I want to see syntax errors highlighted in real-time as I type so that I can fix mistakes immediately without running the compiler.

**Why this priority**: Immediate feedback on errors is essential for productive development and prevents broken templates from being saved.

**Independent Test**: Can be fully tested by introducing syntax errors in a .blade file and verifying error squiggles and diagnostic messages appear.

**Acceptance Scenarios**:

1. **Given** a .blade file with unclosed tag `<div>`, **When** viewing the file, **Then** an error diagnostic appears indicating unclosed tag
2. **Given** a .blade file with malformed expression `${user.}`, **When** viewing the file, **Then** an error diagnostic appears at the invalid expression location
3. **Given** a .blade file with invalid directive syntax `@if { }` (missing condition), **When** viewing the file, **Then** an error diagnostic explains the missing condition
4. **Given** a .blade file with nested @for missing parentheses `@for item of items`, **When** viewing the file, **Then** an error diagnostic indicates correct syntax
5. **Given** a .blade file becomes valid after fixing error, **When** error is corrected, **Then** the diagnostic disappears within 300ms

---

### User Story 3 - Autocompletion for Expressions (Priority: P3)

As a template author, I want autocompletion suggestions when typing expressions so that I can quickly access available data paths, helpers, and variables.

**Why this priority**: Autocompletion dramatically speeds up development and reduces typos in path expressions.

**Independent Test**: Can be fully tested by triggering completion inside an expression and verifying relevant suggestions appear.

**Acceptance Scenarios**:

1. **Given** a .blade file with data context `{ user: { name, email } }`, **When** typing `${user.` inside expression, **Then** completion suggests `name` and `email`
2. **Given** a .blade file with registered helper `formatCurrency`, **When** typing `${format`, **Then** completion suggests `formatCurrency` with signature
3. **Given** a .blade file inside `@for(item of items)` block, **When** typing `${`, **Then** completion suggests `item` and `index` variables
4. **Given** a .blade file with `@let` declaration `@@ { total = price * qty }`, **When** typing `${to`, **Then** completion suggests `total`
5. **Given** a .blade file and triggering completion after `$.`, **When** viewing suggestions, **Then** global variables from configuration are suggested

---

### User Story 4 - Directive Autocompletion and Snippets (Priority: P4)

As a template author, I want autocompletion for directives with proper snippets so that I can quickly insert correctly formatted directive syntax.

**Why this priority**: Directives have specific syntax that is easy to get wrong; snippets ensure correct structure.

**Independent Test**: Can be fully tested by typing `@` and verifying directive suggestions with tab-stop snippets.

**Acceptance Scenarios**:

1. **Given** a .blade file with cursor at start of line, **When** typing `@if`, **Then** completion offers `@if(condition) { }` snippet with cursor positioned at condition
2. **Given** a .blade file, **When** accepting `@for` completion, **Then** snippet inserts `@for(item of items) { }` with tab stops for item, items, and body
3. **Given** a .blade file, **When** accepting `@match` completion, **Then** snippet inserts match structure with example case and default
4. **Given** a .blade file, **When** accepting `@@` completion, **Then** snippet inserts `@@ { name = value }` with tab stops
5. **Given** a .blade file inside an @if block, **When** typing `@else`, **Then** completion offers both `@else` and `@else if` options

---

### User Story 5 - HTML Tag and Attribute Completion (Priority: P5)

As a template author, I want HTML tag and attribute autocompletion so that I can quickly insert standard HTML elements with their valid attributes.

**Why this priority**: HTML completion is standard IDE behavior and reduces the need to reference documentation.

**Independent Test**: Can be fully tested by typing `<` and verifying HTML tag suggestions, and by typing attribute names inside elements.

**Acceptance Scenarios**:

1. **Given** a .blade file, **When** typing `<div `, **Then** completion suggests valid div attributes like `class`, `id`, `style`
2. **Given** a .blade file typing `<inp`, **Then** completion suggests `<input>` with common input attributes
3. **Given** a .blade file inside `<a `, **When** typing `hr`, **Then** completion suggests `href` attribute
4. **Given** a .blade file inside `<img `, **When** viewing suggestions, **Then** required attributes `src` and `alt` are prioritized
5. **Given** a .blade file with dynamic attribute `class={`, **When** triggering completion, **Then** expression completions are offered inside braces

---

### User Story 6 - Component Reference Completion (Priority: P6)

As a template author, I want autocompletion for component names and their props when using custom components so that I can correctly instantiate components without checking documentation.

**Why this priority**: Components are a key reuse mechanism; knowing available props improves correct usage.

**Independent Test**: Can be fully tested by defining a component and triggering completion when instantiating it.

**Acceptance Scenarios**:

1. **Given** a .blade file with component `@component Card(title, subtitle)`, **When** typing `<Ca`, **Then** completion suggests `Card` component
2. **Given** a .blade file inside `<Card `, **When** triggering completion, **Then** suggestions include `title` and `subtitle` props
3. **Given** a .blade file with imported component, **When** typing component name, **Then** completion auto-adds import if needed
4. **Given** a .blade file with component that has required props, **When** instantiating component, **Then** missing required props are warned

---

### User Story 7 - Linting and Best Practice Warnings (Priority: P7)

As a template author, I want warnings for common mistakes and best practice violations so that I can write better templates.

**Why this priority**: Proactive warnings prevent bugs and improve code quality beyond just syntax correctness.

**Independent Test**: Can be fully tested by introducing anti-patterns and verifying warning diagnostics appear.

**Acceptance Scenarios**:

1. **Given** a .blade file using deprecated helper, **When** viewing file, **Then** a warning indicates the deprecation with suggested replacement
2. **Given** a .blade file with unused `@let` variable, **When** viewing file, **Then** a warning indicates the variable is never used
3. **Given** a .blade file with expression `${value}` where value might be undefined, **When** viewing file, **Then** a warning suggests null-coalescing `${value ?? 'default'}`
4. **Given** a .blade file with deeply nested @if blocks (>4 levels), **When** viewing file, **Then** a warning suggests refactoring
5. **Given** a .blade file with component self-reference (potential infinite recursion), **When** viewing file, **Then** a warning alerts about recursive component

---

### User Story 8 - Go to Definition and Find References (Priority: P8)

As a template author, I want to navigate to definitions of components, helpers, and variables so that I can quickly understand and trace code.

**Why this priority**: Code navigation is essential for maintaining and understanding larger template projects.

**Independent Test**: Can be fully tested by right-clicking on a component/variable name and selecting Go to Definition.

**Acceptance Scenarios**:

1. **Given** a .blade file using component `<Card>`, **When** triggering "Go to Definition" on Card, **Then** editor navigates to component definition
2. **Given** a .blade file with `@let` declaration, **When** triggering "Go to Definition" on variable use, **Then** cursor moves to declaration
3. **Given** a .blade file using helper `${formatDate(...)}`, **When** triggering "Go to Definition", **Then** editor navigates to helper registration or source
4. **Given** a .blade file with component definition, **When** triggering "Find References", **Then** all usages of component are listed
5. **Given** a .blade file, **When** hovering over a variable, **Then** a tooltip shows type/value information when available

---

### Edge Cases

- What happens when .blade file has TypeScript type annotations in data context? They are parsed for completion but not validated by LSP
- What happens with very large .blade files (1000+ lines)? Performance remains responsive (<100ms for completions)
- What happens when data schema is not provided? Completions fall back to available scope variables only
- What happens with malformed expressions? Parser recovers gracefully and provides partial completions
- What happens when workspace has circular component imports? LSP detects and warns about circular dependencies
- What happens when editor doesn't support LSP? Syntax highlighting via TextMate grammar still works independently

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide TextMate grammar for .blade file syntax highlighting
- **FR-002**: System MUST implement LSP server following Language Server Protocol 3.17 specification
- **FR-003**: System MUST provide real-time diagnostics for syntax errors with source location
- **FR-004**: System MUST provide autocompletion for expression paths based on inferred data context
- **FR-005**: System MUST provide autocompletion for directive keywords with snippet insertion
- **FR-006**: System MUST provide autocompletion for HTML tags and attributes
- **FR-007**: System MUST provide autocompletion for component names and their props
- **FR-008**: System MUST provide autocompletion for registered helper functions with signatures
- **FR-009**: System MUST provide Go to Definition for components, variables, and helpers
- **FR-010**: System MUST provide Find References for components and variables
- **FR-011**: System MUST provide hover information for variables, helpers, and components
- **FR-012**: System MUST provide warnings for common anti-patterns and best practices
- **FR-013**: System MUST provide warnings for unused variables and unreachable code
- **FR-014**: System MUST handle incremental document changes efficiently
- **FR-015**: System MUST support workspace-wide operations (find all component usages)
- **FR-016**: System MUST provide configuration for enabled/disabled linting rules
- **FR-017**: System MUST support external data schema definitions for better completions
- **FR-018**: System MUST recover gracefully from parse errors to provide partial functionality

### Key Entities

- **BladeLanguageServer**: Main LSP server coordinating all language features
- **BladeDocument**: Parsed representation of a single .blade file with AST and diagnostics
- **CompletionProvider**: Generates context-aware completion items
- **DiagnosticProvider**: Produces syntax errors and lint warnings
- **DefinitionProvider**: Resolves go-to-definition requests
- **HoverProvider**: Generates hover information for symbols
- **TextMateGrammar**: Syntax highlighting rules for .blade files
- **WorkspaceIndex**: Tracks all components, helpers, and their usages across workspace

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 8 user stories pass automated integration testing
- **SC-002**: Syntax highlighting correctly identifies all Blade syntax elements (directives, expressions, HTML, components)
- **SC-003**: Diagnostics appear within 300ms of document change
- **SC-004**: Autocompletion suggestions appear within 100ms of trigger
- **SC-005**: All valid Blade syntax parses without false-positive errors
- **SC-006**: Go to Definition works for 100% of in-scope symbols
- **SC-007**: LSP server handles files up to 10,000 lines without degradation
- **SC-008**: Extension installs and activates successfully in VS Code marketplace

## Assumptions

- The Blade parser (Phase 3) provides AST suitable for language analysis
- VS Code is the primary target editor; other LSP-compatible editors are secondary
- Data schema can optionally be provided via configuration for enhanced completions
- Helper function registrations can be discovered from project configuration
- Component definitions can be discovered by scanning .blade files in workspace
- The LSP will be distributed as a VS Code extension initially
