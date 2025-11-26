<!--
SYNC IMPACT REPORT
==================
Version change: 0.0.0 → 1.0.0 (MAJOR: Initial constitution ratification)

Modified principles: N/A (initial creation)

Added sections:
- Core Principles (5 principles)
- Quality Standards
- Development Workflow
- Governance

Removed sections: N/A (initial creation)

Templates requiring updates:
- .specify/templates/plan-template.md: ✅ Constitution Check section already references constitution
- .specify/templates/spec-template.md: ✅ No constitution-specific references needed
- .specify/templates/tasks-template.md: ✅ No constitution-specific references needed

Follow-up TODOs: None
-->

# Blade Constitution

## Core Principles

### I. Type Safety First

All template features MUST maintain type safety from authoring through rendering.
TypeScript integration is non-negotiable for build-time templates. Runtime templates
MUST support JSON Schema validation for data contracts. Expression evaluation MUST
follow predictable type coercion rules documented in the specification.

**Rationale**: Template engines that sacrifice type safety create debugging nightmares
and runtime errors in production. Blade's value proposition depends on catching errors
at compile time.

### II. Source Auditability

Every rendered element MUST be traceable to its template source and data origins.
The `rd-source`, `rd-source-op`, and `rd-source-note` attributes provide complete
provenance for any rendered content. This capability MUST NOT be disabled in
production without explicit configuration.

**Rationale**: Enterprise users require auditability for compliance. Debugging
complex templates requires understanding which data paths produced which output.

### III. Security by Default

Template execution MUST be sandboxed. Only explicitly registered helper functions
can be called from templates. No dynamic code execution (eval, Function constructor).
Resource limits (loop iterations, recursion depth, expression complexity) MUST be
enforced with sensible defaults. All limits MUST be configurable for specific use
cases.

**Rationale**: Templates authored by entry-level developers or end users execute
in trusted contexts. Defense in depth prevents template injection attacks and
accidental infinite loops.

### IV. Component Isolation

Components MUST have isolated scope - they cannot access parent context except
through explicit props. Slots provide controlled content injection points.
Component definitions MUST be statically analyzable at compile time. Circular
dependencies MUST cause compilation failure, not runtime errors.

**Rationale**: Predictable component behavior enables safe reuse. Scope isolation
prevents subtle bugs from accidental variable shadowing or unintended data access.

### V. Developer Experience

The engine MUST support LSP for real-time validation, autocomplete, and diagnostics.
Error messages MUST include source locations and actionable context. Compilation and
rendering APIs MUST be simple for common cases and configurable for advanced needs.
Documentation MUST include examples for all features.

**Rationale**: Adoption depends on developer productivity. Poor error messages and
lack of tooling support make debugging impossible for complex templates.

## Quality Standards

**Testing Requirements**:
- All parsing and rendering code MUST have unit tests
- Expression evaluation MUST cover all operator precedence and coercion cases
- Integration tests MUST verify end-to-end template scenarios
- Parser fuzzing SHOULD be used to discover edge cases

**Performance Expectations**:
- Compilation is a one-time cost; optimize for render-time performance
- Memory usage during rendering MUST be bounded by resource limits
- Large dataset handling MUST not cause exponential memory growth

**Documentation Standards**:
- Public API changes MUST update the specification document
- Breaking changes MUST be documented with migration guidance
- Helper functions MUST include signature and example usage

## Development Workflow

**Code Review Requirements**:
- All changes MUST pass type checking (`npm run typecheck`)
- All changes MUST pass linting (`npm run lint`)
- All changes MUST pass existing tests (`npm test`)
- New features MUST include tests

**Branching Strategy**:
- Feature branches for new work
- Main branch MUST always be deployable
- Breaking changes require version bump planning

**Commit Standards**:
- Use conventional commits format
- Reference issues where applicable
- Keep commits focused and atomic

## Governance

This constitution supersedes informal practices and establishes binding development
standards for the Blade project. All pull requests and code reviews MUST verify
compliance with these principles.

**Amendment Procedure**:
1. Propose changes via pull request to constitution.md
2. Document rationale for changes
3. Require explicit approval before merge
4. Update version following semantic versioning:
   - MAJOR: Principle removal or redefinition
   - MINOR: New principle or expanded guidance
   - PATCH: Clarifications and wording fixes

**Compliance Review**:
- Constitution Check in plan-template.md gates implementation work
- Violations MUST be justified in Complexity Tracking table
- Unjustified violations block feature completion

**Version**: 1.0.0 | **Ratified**: 2025-11-25 | **Last Amended**: 2025-11-25
