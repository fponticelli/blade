# Feature Specification: Remove @load Directive

**Feature Branch**: `004-remove-load-directive`
**Created**: 2025-11-26
**Status**: Draft
**Input**: User description: "let's remove the concept of @load entirely from this project"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Template Author Uses Components Without @load (Priority: P1)

A template author defines and uses components within their Blade templates without needing to declare external component imports via @load. Components are either defined inline within the same template or the system resolves component references through other means (such as a component registry or automatic discovery).

**Why this priority**: This is the core change - without @load, template authors need a clear path to continue using components. This is the foundation that all other changes depend on.

**Independent Test**: Can be fully tested by writing a template that references components and verifying it compiles and renders correctly without any @load directive.

**Acceptance Scenarios**:

1. **Given** a template with inline component definitions (using `<template:ComponentName>` syntax), **When** the template is compiled, **Then** the compilation succeeds without requiring an @load directive
2. **Given** a template that uses a component defined in another file, **When** the system has a component registry configured, **Then** the component is resolved through the registry instead of @load
3. **Given** an existing template containing @load directives, **When** the template is compiled, **Then** the compiler reports a clear error indicating @load is no longer supported

---

### User Story 2 - Developer Updates Documentation and Specification (Priority: P2)

A developer maintaining the Blade system needs to update all documentation to remove references to @load, ensuring new users don't encounter outdated information about a removed feature.

**Why this priority**: Documentation consistency is essential for usability, but comes after the core functionality change is complete.

**Independent Test**: Can be tested by searching all documentation files for @load references and verifying none remain, except for migration guides explaining the removal.

**Acceptance Scenarios**:

1. **Given** the main Blade specification document, **When** a user searches for @load, **Then** no references exist except in a "Removed Features" or migration section
2. **Given** the LSP hover provider documentation, **When** a user hovers over @load in their editor, **Then** the hover shows that @load is deprecated/removed with guidance on alternatives
3. **Given** sample templates in the repository, **When** reviewed, **Then** none contain @load directives

---

### User Story 3 - Developer Cleans Up Compiler Code (Priority: P3)

A developer removes all @load-related code from the compiler, parser, AST types, and related modules to simplify the codebase and remove dead code.

**Why this priority**: Code cleanup improves maintainability but is lower priority than ensuring the system works correctly without @load.

**Independent Test**: Can be tested by verifying the TemplateLoader interface, @load parsing code, and related test cases are removed without breaking the build or existing tests.

**Acceptance Scenarios**:

1. **Given** the compiler module, **When** the TemplateLoader interface and maxLoadDepth option are searched for, **Then** they are not found (removed)
2. **Given** the test suite, **When** tests are run, **Then** all tests pass with no @load-related test cases remaining
3. **Given** the AST types file, **When** searched for @load or TemplateLoader references, **Then** none are found

---

### Edge Cases

- What happens when a user has existing templates with @load directives?
  - The compiler should produce a clear, actionable error message explaining that @load has been removed and pointing to documentation on alternatives.

- How does the system handle templates that previously relied on @load for component resolution?
  - Components must either be defined inline in the same template or resolved through a component registry (if one exists). The removal of @load assumes inline component definitions are sufficient for the current use case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compile templates that use inline component definitions without requiring @load
- **FR-002**: System MUST produce a clear error message if a template contains @load, indicating the directive is no longer supported
- **FR-003**: Compiler MUST NOT expose the TemplateLoader interface or maxLoadDepth option
- **FR-004**: Documentation MUST be updated to remove all @load references from the specification
- **FR-005**: LSP hover provider MUST NOT show documentation for @load (or show deprecation notice)
- **FR-006**: Test suite MUST be updated to remove @load-related test cases
- **FR-007**: AST types MUST be cleaned to remove any @load-related comments or documentation

### Key Entities

- **Template**: A Blade template file that may contain HTML, directives, and component definitions
- **Component**: A reusable template fragment defined with `<template:Name>` syntax within a template
- **Compiler**: The module that transforms Blade template source into a compiled template structure

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing tests pass after @load removal (100% test pass rate)
- **SC-002**: No references to @load exist in production code (0 occurrences in src/ directory, excluding error messages)
- **SC-003**: Documentation search for @load returns zero results in active documentation sections
- **SC-004**: Codebase size is reduced by removing unused TemplateLoader-related code
- **SC-005**: Templates using inline components compile successfully without any @load-related code paths

## Assumptions

- Inline component definitions (`<template:ComponentName>`) provide sufficient functionality for all current use cases
- No external component loading mechanism is needed at this time
- If external component loading is needed in the future, a different approach will be designed (this removal is intentional simplification)
- The current codebase has @load defined in specification and interfaces but not fully implemented in the parser, making this removal straightforward
