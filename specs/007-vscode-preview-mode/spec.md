# Feature Specification: VSCode Preview Mode with Sample Data

**Feature Branch**: `007-vscode-preview-mode`
**Created**: 2025-11-27
**Status**: Draft
**Input**: User description: "vscode plugin should allow a preview mode that uses the samples (dropdown) to populate the template"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview Template with Sample Data (Priority: P1)

A template developer opens a `.blade` file in VSCode and wants to see what the rendered output looks like with real data. They open a preview panel which shows the rendered HTML. A dropdown selector at the top of the preview panel lists all available sample JSON files from the project's `samples/` folder. The developer selects a sample file, and the preview instantly updates to show the template rendered with that data.

**Why this priority**: This is the core value proposition - developers need to see their templates rendered with real data to verify correctness, catch issues, and iterate quickly without leaving the editor.

**Independent Test**: Can be fully tested by opening any Blade project with a `samples/` folder, activating preview, selecting a sample file, and verifying the rendered output matches expectations.

**Acceptance Scenarios**:

1. **Given** a Blade project with an `index.blade` template and a `samples/` folder containing JSON files, **When** the developer opens the preview panel, **Then** a dropdown shows all JSON files from the `samples/` folder.

2. **Given** the preview panel is open with a sample selected, **When** the developer selects a different sample from the dropdown, **Then** the preview updates to show the template rendered with the newly selected data.

3. **Given** the preview panel is open, **When** the developer edits the `.blade` template file, **Then** the preview automatically refreshes to reflect the changes.

---

### User Story 2 - Activate Preview from Editor (Priority: P1)

A developer working on a `.blade` file needs a quick way to open the preview. They can use a keyboard shortcut, command palette command, or click an icon in the editor toolbar to open the preview panel beside their editor.

**Why this priority**: Essential for the feature to be usable - developers need an intuitive way to access the preview functionality.

**Independent Test**: Can be tested by opening a `.blade` file and using any of the activation methods to verify the preview panel opens correctly.

**Acceptance Scenarios**:

1. **Given** a `.blade` file is open in the editor, **When** the developer uses the command palette and runs "Blade: Open Preview", **Then** a preview panel opens beside the editor.

2. **Given** a `.blade` file is open in the editor, **When** the developer clicks the preview icon in the editor toolbar, **Then** a preview panel opens beside the editor.

3. **Given** a `.blade` file is open in the editor, **When** the developer uses the keyboard shortcut, **Then** a preview panel opens beside the editor.

---

### User Story 3 - Component Template Preview (Priority: P2)

A developer working on a component template (e.g., `ProductCard.blade`) wants to preview it in isolation. Since components don't have their own `samples/` folder, the preview shows a message explaining that component preview requires mock data, with an option to create a sample file for the component.

**Why this priority**: Component development is common, but previewing components in isolation is secondary to previewing full templates. A helpful fallback experience is important.

**Independent Test**: Can be tested by opening a component `.blade` file (not `index.blade`) and verifying the appropriate message appears.

**Acceptance Scenarios**:

1. **Given** a component template file is open (e.g., `ProductCard.blade`), **When** the developer opens preview, **Then** the preview panel shows a message indicating no sample data is available for this component.

2. **Given** the "no sample data" message is shown, **When** the developer clicks "Create Sample", **Then** a new JSON file is created in a `samples/` subfolder with the component's required props as a template.

---

### User Story 4 - Preview Synchronization (Priority: P2)

When a developer has multiple `.blade` files open and switches between tabs, the preview panel should update to show the preview for the currently active `.blade` file, maintaining the selected sample if the project has one.

**Why this priority**: Improves workflow efficiency when working across multiple templates, but the core preview functionality works without this.

**Independent Test**: Can be tested by opening two `.blade` files, opening preview, switching between tabs, and verifying the preview updates.

**Acceptance Scenarios**:

1. **Given** preview is open for `index.blade` with sample "summer-sale.json" selected, **When** the developer switches to another `.blade` file in the same project, **Then** the preview shows the new file's rendered output with an appropriate sample selected.

2. **Given** preview is open, **When** the developer switches to a non-Blade file, **Then** the preview panel shows a message indicating no Blade file is active.

---

### Edge Cases

- What happens when the `samples/` folder is empty? → Show a message prompting the user to create sample JSON files.
- What happens when a sample JSON file is invalid (malformed JSON)? → Show an error message in the preview panel with the JSON parsing error details.
- What happens when sample data doesn't match the schema? → Show validation errors in the preview panel highlighting which fields are missing or invalid.
- What happens when the template has compilation errors? → Show the error messages in the preview panel instead of rendered output.
- What happens when sample data causes runtime evaluation errors? → Show the error with context (e.g., "Error evaluating expression at line 15: undefined variable 'foo'").
- What happens when user edits a sample JSON file while preview is open? → Preview should refresh to reflect the changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Blade: Open Preview" command accessible via command palette.
- **FR-002**: System MUST display a preview icon in the editor toolbar when a `.blade` file is active.
- **FR-003**: System MUST provide a keyboard shortcut to toggle the preview panel.
- **FR-004**: Preview panel MUST display a dropdown selector showing all `.json` files from the project's `samples/` folder.
- **FR-005**: System MUST render the active `.blade` template using the selected sample data and display the HTML output.
- **FR-006**: Preview MUST automatically refresh when the template file is modified.
- **FR-007**: Preview MUST automatically refresh when the selected sample JSON file is modified.
- **FR-008**: System MUST display clear error messages when template compilation fails.
- **FR-009**: System MUST display clear error messages when sample JSON is malformed.
- **FR-010**: System MUST display validation errors when sample data doesn't match the project's schema.
- **FR-011**: Preview panel MUST persist the selected sample file across editor sessions (per project).
- **FR-012**: System MUST show a helpful message when no sample files are available.
- **FR-013**: Preview MUST render HTML with basic styling for readability (not raw HTML source).
- **FR-014**: System MUST support previewing templates that use components defined in the same project.

### Key Entities

- **Preview Panel**: A VSCode webview panel that displays rendered template output alongside the editor.
- **Sample Selector**: A dropdown UI element showing available sample JSON files from the project's `samples/` folder.
- **Project Context**: The Blade project root containing `index.blade`, `schema.json`, and `samples/` folder.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can open preview and see rendered output within 2 seconds of activation.
- **SC-002**: Preview updates reflect template changes within 500ms of saving the file.
- **SC-003**: Sample file switching updates the preview within 500ms.
- **SC-004**: 100% of compilation errors are displayed with line number and meaningful message.
- **SC-005**: Developers can preview any template in the existing sample projects (`ecommerce`, `blog`, `dashboard`, `email`, `profile`) without errors.

## Assumptions

- The project structure follows the established convention: `index.blade` as entry point, `schema.json` for data schema, and `samples/*.json` for sample data files.
- The existing Blade compiler and renderer APIs are available and can be reused for preview rendering.
- The VSCode extension architecture supports adding webview panels (already established pattern in VSCode extensions).
- Sample JSON files are assumed to be UTF-8 encoded.
- The preview shows rendered HTML (not the raw HTML source) in a styled webview for readability.
