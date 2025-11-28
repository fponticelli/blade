# Feature Specification: Configurable Source Attribute

**Feature Branch**: `009-configurable-source-attr`
**Created**: 2025-11-27
**Status**: Draft
**Input**: User description: "we should make the source attribute configurable"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Custom Attribute Prefix for Brand Consistency (Priority: P1)

A developer building templates for a company wants to use branded attribute names instead of the default `rd-source` prefix. They configure a custom prefix (e.g., `data-acme-`) so that rendered HTML uses attributes like `data-acme-source` that align with their naming conventions.

**Why this priority**: This is the core functionality - allowing customization of the attribute prefix is the primary use case for this feature.

**Independent Test**: Can be fully tested by setting a custom prefix in render options and verifying the output HTML uses the custom-prefixed attributes.

**Acceptance Scenarios**:

1. **Given** a render configuration with `sourceTrackingPrefix: "data-track-"`, **When** rendering a template with source tracking enabled, **Then** the output uses `data-track-source` instead of `rd-source`
2. **Given** a render configuration with `sourceTrackingPrefix: "audit-"`, **When** rendering with operation tracking enabled, **Then** the output uses `audit-source-op` instead of `rd-source-op`
3. **Given** a render configuration with `sourceTrackingPrefix: "my-"`, **When** rendering with note generation enabled, **Then** the output uses `my-source-note` instead of `rd-source-note`

---

### User Story 2 - Avoid Attribute Conflicts (Priority: P2)

A developer integrating Blade templates into an existing system that already uses `rd-*` attributes for another purpose needs to configure a different attribute name to avoid conflicts.

**Why this priority**: Conflict avoidance is a practical need but less common than brand consistency.

**Independent Test**: Can be fully tested by configuring a unique prefix and verifying no attribute name collisions occur with the host system.

**Acceptance Scenarios**:

1. **Given** an existing system using `rd-` attributes, **When** configuring Blade with `sourceTrackingPrefix: "blade-"`, **Then** the rendered output uses `blade-source`, `blade-source-op`, `blade-source-note` avoiding conflicts
2. **Given** a custom prefix configuration, **When** rendering multiple templates, **Then** all templates consistently use the configured prefix

---

### User Story 3 - Default Behavior Preservation (Priority: P3)

A developer upgrading from a previous version of Blade expects the default behavior to remain unchanged - source tracking should use `rd-source` attributes by default without any configuration.

**Why this priority**: Backward compatibility ensures existing users are not impacted by this feature.

**Independent Test**: Can be fully tested by rendering templates without specifying any prefix configuration and verifying the default `rd-` prefix is used.

**Acceptance Scenarios**:

1. **Given** no custom prefix configuration, **When** rendering with source tracking enabled, **Then** the output uses the default `rd-source` attribute
2. **Given** an empty string as prefix, **When** rendering with source tracking enabled, **Then** the output uses `source` (no prefix)

---

### Edge Cases

- What happens when the prefix contains invalid HTML attribute characters? → System rejects with error
- What happens when the prefix is an empty string? → System uses unprefixed attributes (`source`, `source-op`, `source-note`)
- What happens when the prefix is very long (e.g., 100+ characters)? → Accepted as valid if characters are valid

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow configuration of the source tracking attribute prefix via render options
- **FR-002**: System MUST use the default prefix `rd-` when no custom prefix is specified
- **FR-003**: System MUST apply the custom prefix to all three source tracking attributes: `source`, `source-op`, and `source-note`
- **FR-004**: System MUST accept an empty string as a valid prefix, resulting in unprefixed attributes (`source`, `source-op`, `source-note`)
- **FR-005**: System MUST validate that the prefix produces valid HTML attribute names (alphanumeric, hyphens, underscores, starting with a letter or underscore)
- **FR-006**: System MUST provide a clear error message when an invalid prefix is configured
- **FR-007**: System MUST consistently use the same prefix across all elements in a single render operation

### Key Entities

- **RenderConfig**: Configuration object containing `sourceTrackingPrefix` field that determines the attribute name prefix

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All rendered templates with custom prefix configuration correctly use the specified prefix for all source tracking attributes
- **SC-002**: Default behavior is unchanged when no prefix is configured - existing tests continue to pass without modification
- **SC-003**: Configuration of prefix requires only a single setting change (not multiple attribute name configurations)
- **SC-004**: Invalid prefix values are rejected with actionable error messages before rendering begins

## Assumptions

- The `sourceTrackingPrefix` configuration option already exists in the codebase (confirmed in RenderConfig)
- The feature will leverage the existing configuration infrastructure rather than creating new configuration mechanisms
- HTML attribute name validation follows standard HTML5 rules (letters, digits, hyphens, underscores; must start with letter or underscore)
- Users will primarily use prefixes that include a trailing hyphen (e.g., `data-acme-`) but this is not enforced
