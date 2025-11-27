# Feature Specification: Project-based Template Compilation

**Feature Branch**: `005-project-template-compilation`
**Created**: 2025-11-26
**Status**: Draft
**Input**: User description: "Project-based Template Compilation with Auto-loaded Components, Dot-notation Namespacing, and Schema-driven LSP"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compile Multi-file Template Project (Priority: P1)

A developer wants to compile a template project containing multiple .blade files organized in a folder structure. They have an `index.blade` as the entry point and various component files that should be automatically discovered and available for use.

**Why this priority**: This is the core feature - without project compilation, none of the other features (namespacing, LSP integration) have a foundation to build upon.

**Independent Test**: Can be fully tested by creating a folder with `index.blade` and sibling `.blade` files, calling `compileProject(path)`, and verifying all components are resolved and available.

**Acceptance Scenarios**:

1. **Given** a folder containing `index.blade` and `button.blade`, **When** the developer calls `compileProject(folderPath)`, **Then** the system compiles `index.blade` with `<Button />` components resolved to `button.blade`.

2. **Given** a folder without `index.blade`, **When** the developer calls `compileProject(folderPath)`, **Then** the system returns an error indicating no entry point found.

3. **Given** a folder with `index.blade` using `<Card />` but no `card.blade` exists, **When** the developer calls `compileProject(folderPath)`, **Then** the system returns an error listing the missing component and suggesting the `projectRoot` option if compiling a single file.

---

### User Story 2 - Use Dot-notation for Nested Components (Priority: P1)

A developer organizes components into nested folders and wants to reference them using dot-notation syntax (e.g., `<Components.Form.Input />`).

**Why this priority**: Dot-notation namespacing is essential for organizing larger projects and is part of the core compilation model.

**Independent Test**: Can be tested by creating nested folders with components and verifying dot-notation references resolve correctly.

**Acceptance Scenarios**:

1. **Given** a folder structure with `components/form/input.blade`, **When** `index.blade` uses `<Components.Form.Input />`, **Then** the component resolves to `components/form/input.blade`.

2. **Given** a nested folder `utils/` containing `helper.blade`, **When** `index.blade` uses `<Utils.Helper />`, **Then** the component resolves correctly using PascalCase conversion.

3. **Given** a subfolder `widgets/` with its own `index.blade`, **When** the parent project compiles, **Then** the `widgets/` folder is treated as a separate project boundary and its components are not auto-loaded into the parent.

---

### User Story 3 - Declare Component Props with @props Directive (Priority: P1)

A developer wants to explicitly declare the inputs (props) that a component accepts using the `@props()` directive.

**Why this priority**: The `@props` directive is fundamental to component contracts and enables type safety, LSP completions, and validation.

**Independent Test**: Can be tested by creating a component with `@props()`, using it with various prop combinations, and verifying behavior.

**Acceptance Scenarios**:

1. **Given** a component with `@props($label, $disabled = false)`, **When** the component is used as `<Button label="Click" />`, **Then** `$label` is "Click" and `$disabled` is `false`.

2. **Given** a component with `@props($name)` (required prop), **When** the component is used without `name` prop, **Then** compilation fails with a clear error about missing required prop.

3. **Given** a component without `@props()` directive that uses `$title` and `$count` variables, **When** compiled, **Then** both `$title` and `$count` are inferred as required props.

---

### User Story 4 - Single File Compilation with Project Context (Priority: P2)

A developer wants to compile a single .blade file while still having access to project components via the `projectRoot` option.

**Why this priority**: Enables incremental compilation and IDE-driven single-file operations while maintaining project awareness.

**Independent Test**: Can be tested by compiling a single file with `projectRoot` option and verifying component resolution works.

**Acceptance Scenarios**:

1. **Given** a project with `button.blade` and a separate file `page.blade` using `<Button />`, **When** `compile('page.blade', { projectRoot: '/path/to/project' })` is called, **Then** the `<Button />` component resolves from the project root.

2. **Given** a file using `<Unknown />` compiled without `projectRoot`, **When** compilation fails, **Then** the error message suggests: "Component 'Unknown' not found. If this is a project component, specify the projectRoot option."

---

### User Story 5 - Schema-driven LSP Completions (Priority: P2)

A developer creates a `schema.json` file in their project to define the shape of props for `index.blade`, and the LSP provides intelligent completions based on this schema.

**Why this priority**: Enhances developer experience significantly but builds on top of the core compilation features.

**Independent Test**: Can be tested by creating a project with `schema.json`, opening in LSP-enabled editor, and verifying completions appear.

**Acceptance Scenarios**:

1. **Given** a project with `schema.json` defining `{ "user": { "name": "string", "email": "string" } }`, **When** the developer types `$user.` in the LSP, **Then** completions show `name` and `email` properties.

2. **Given** a project without `schema.json`, **When** the developer uses the LSP, **Then** completions are based solely on `@props()` declarations and inferred variables.

---

### User Story 6 - Sample-driven Hover Hints (Priority: P3)

A developer places example data files in `samples/` folder, and the LSP shows hover hints with example values from these files.

**Why this priority**: Nice-to-have enhancement that improves understanding but doesn't affect core functionality.

**Independent Test**: Can be tested by creating sample files, hovering over variables in LSP, and verifying hints appear.

**Acceptance Scenarios**:

1. **Given** `samples/default.json` containing `{ "user": { "name": "John Doe" } }`, **When** the developer hovers over `$user.name` in the LSP, **Then** a hint shows "Example: John Doe".

2. **Given** multiple sample files `samples/admin.json` and `samples/guest.json`, **When** hovering over a variable, **Then** hints show examples from all available samples.

---

### User Story 7 - LSP Component Navigation (Priority: P2)

A developer wants to quickly navigate to component definitions using go-to-definition in their editor.

**Why this priority**: Essential for productivity in multi-file projects.

**Independent Test**: Can be tested by using go-to-definition on a component tag and verifying it opens the correct file.

**Acceptance Scenarios**:

1. **Given** `index.blade` using `<Button />` with `button.blade` in the project, **When** the developer triggers go-to-definition on `<Button />`, **Then** the LSP navigates to `button.blade`.

2. **Given** `<Components.Form.Input />` in a template, **When** go-to-definition is triggered, **Then** the LSP navigates to `components/form/input.blade`.

---

### User Story 8 - LSP Schema Validation for Samples (Priority: P3)

The LSP validates that sample JSON files conform to the project's `schema.json`.

**Why this priority**: Quality-of-life feature that helps maintain consistency but is not required for compilation.

**Independent Test**: Can be tested by creating mismatched schema and samples, verifying LSP shows diagnostics.

**Acceptance Scenarios**:

1. **Given** `schema.json` requiring `user.email` as a string, **When** `samples/default.json` has `user.email` as a number, **Then** the LSP shows a diagnostic warning in the sample file.

2. **Given** valid samples matching the schema, **When** the LSP validates, **Then** no diagnostics are shown.

---

### Edge Cases

- What happens when a component references itself (circular self-reference)?
- How does the system handle name collisions between template-passed and auto-loaded components? → Template-passed components shadow auto-loaded (closer scope wins).
- What happens when `@props()` has syntax errors? → Warn and fall back to inference.
- How are deeply nested folders handled (e.g., 5+ levels)?
- What happens when a folder name contains special characters or doesn't convert cleanly to PascalCase?
- How does the system behave when `schema.json` contains invalid JSON?
- What happens when `samples/` contains non-JSON files?

## Requirements *(mandatory)*

### Functional Requirements

**Project Detection & Structure**

- **FR-001**: System MUST detect a folder as a "project" when it contains an `index.blade` file.
- **FR-002**: System MUST treat subfolders containing their own `index.blade` as separate project boundaries (isolated, not auto-loaded).
- **FR-003**: System MUST auto-discover all `.blade` files in the project root and non-project subfolders as available components.

**Component Resolution**

- **FR-004**: System MUST resolve component tags (e.g., `<Button />`) to corresponding `.blade` files using case-insensitive matching with PascalCase conversion (e.g., `<Button />` → `button.blade`).
- **FR-005**: System MUST support dot-notation for nested components where each dot segment represents a folder level (e.g., `<Components.Form.Input />` → `components/form/input.blade`).
- **FR-006**: System MUST convert folder names to PascalCase for dot-notation (e.g., `form-helpers/` → `FormHelpers`).
- **FR-007**: System MUST provide clear error messages when a component is not found, including a suggestion to use `projectRoot` option for single-file compilation.
- **FR-007a**: System MUST resolve component name collisions by prioritizing template-passed components (`<template:X>`) over auto-loaded project components (shadowing).

**@props Directive**

- **FR-008**: System MUST support `@props($var1, $var2, ...)` directive syntax for declaring component inputs.
- **FR-009**: System MUST support default values in props: `@props($label, $disabled = false)`.
- **FR-010**: System MUST infer all used `$variables` as required props when `@props()` directive is omitted.
- **FR-011**: System MUST validate that required props (those without defaults) are provided when a component is used.
- **FR-012**: System MUST allow `@props()` in any `.blade` file including `index.blade`.
- **FR-012a**: System MUST emit a warning (not error) when `@props()` contains syntax errors and fall back to inferring all used variables as required props.

**Compiler API**

- **FR-013**: System MUST provide `compileProject(path)` function that compiles a project folder with `index.blade` as entry point.
- **FR-014**: System MUST provide `compile(file, options?)` function supporting optional `projectRoot` parameter for single-file compilation with project context.
- **FR-015**: System MUST return compiled output that includes all resolved component templates.

**Schema Integration**

- **FR-016**: System MUST support optional `schema.json` file in project root defining the JSON Schema for `index.blade` props.
- **FR-017**: System MUST support optional `samples/` directory containing example data JSON files.

**LSP Features**

- **FR-018**: LSP MUST provide property completions based on `schema.json` when available.
- **FR-019**: LSP MUST provide component prop completions based on `@props()` declarations.
- **FR-020**: LSP MUST provide hover hints with example values from `samples/*.json` files.
- **FR-021**: LSP MUST support go-to-definition for component tags, navigating to the component's `.blade` file.
- **FR-022**: LSP MUST validate `samples/*.json` files against `schema.json` and report diagnostics.
- **FR-023**: LSP MUST provide component tag completions based on discovered project components.

### Key Entities

- **Project**: A folder containing `index.blade` that serves as the compilation entry point and component discovery root.
- **Component**: Any `.blade` file that can be used as a reusable template element via its tag name.
- **Props**: Input parameters declared via `@props()` or inferred from variable usage, with optional default values.
- **Schema**: A JSON Schema file (`schema.json`) defining the expected shape of props for `index.blade`.
- **Sample**: Example data files in `samples/` directory used for LSP hints and schema validation.
- **Namespace**: The dot-notation path derived from folder structure (e.g., `Components.Form` for `components/form/`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can compile a multi-file project with 10+ components in under 1 second.
- **SC-002**: All component references using dot-notation resolve correctly with 100% accuracy for valid folder structures.
- **SC-003**: LSP completions appear within 200ms of typing in projects with schema.json.
- **SC-004**: Go-to-definition successfully navigates to the correct component file 100% of the time for existing components.
- **SC-005**: Error messages for missing components clearly indicate the component name, expected location, and suggest remediation steps.
- **SC-006**: Projects with 50+ components maintain responsive LSP performance (completions < 500ms).
- **SC-007**: Schema validation catches 100% of type mismatches between samples and schema.

## Assumptions

- Folder and file names follow standard naming conventions (alphanumeric, hyphens, underscores).
- JSON Schema follows the JSON Schema draft-07 or later specification.
- The LSP integration extends the existing Blade LSP infrastructure.
- Component tag names are case-insensitive but follow PascalCase convention.
- Self-referencing components (recursive) are allowed but the system does not prevent infinite loops at compile time (runtime responsibility).

## Clarifications

### Session 2025-11-26

- Q: How are component name collisions resolved when a template-passed component (`<template:Button>`) conflicts with an auto-loaded project component (`button.blade`)? → A: Template-passed components shadow auto-loaded project components (closer scope wins).
- Q: What happens when `@props()` has syntax errors? → A: Warn but continue, treating component as having no declared props (infer all variables as required).

## Non-Goals

- Runtime validation of props against schema (explicitly excluded per user input).
- Hot module reloading or watch mode (can be added separately).
- Component versioning or dependency management.
- Remote component loading from URLs or package registries.
