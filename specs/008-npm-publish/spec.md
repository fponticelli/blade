# Feature Specification: NPM Package Publishing

**Feature Branch**: `008-npm-publish`
**Created**: 2025-11-27
**Status**: Draft
**Input**: User description: "publishing blade to NPM using the common formats currently used"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install and Use in ESM Project (Priority: P1)

A developer wants to install the blade package in a modern JavaScript/TypeScript project that uses ES modules. They run `npm install @bladets/template` and import the package using ESM syntax in their code.

**Why this priority**: ESM is the modern standard for JavaScript modules and the primary use case for new projects. Most new projects use ESM by default.

**Independent Test**: Can be fully tested by creating a new ESM project, installing the package from NPM, importing it with `import { compile } from '@bladets/template'`, and successfully compiling a template.

**Acceptance Scenarios**:

1. **Given** a new Node.js project with `"type": "module"` in package.json, **When** a developer installs `@bladets/template` and imports with `import { compile } from '@bladets/template'`, **Then** the import resolves correctly and the compile function is available
2. **Given** a TypeScript project with ESM configuration, **When** a developer imports from `@bladets/template`, **Then** TypeScript recognizes all exported types and provides full IntelliSense support
3. **Given** a bundler-based project (webpack, vite, rollup), **When** the package is imported, **Then** tree-shaking works correctly and unused exports are eliminated

---

### User Story 2 - Install and Use in CommonJS Project (Priority: P2)

A developer working on a legacy Node.js project that uses CommonJS modules wants to use blade. They install the package and require it using CommonJS syntax.

**Why this priority**: Many existing Node.js projects and tools still use CommonJS. Supporting CJS ensures backward compatibility with the Node.js ecosystem.

**Independent Test**: Can be fully tested by creating a CommonJS project without `"type": "module"`, installing the package, requiring it with `const blade = require('@bladets/template')`, and successfully using the exported functions.

**Acceptance Scenarios**:

1. **Given** a Node.js project without `"type": "module"`, **When** a developer requires `@bladets/template` with `const { compile } = require('@bladets/template')`, **Then** the require resolves correctly and the compile function is available
2. **Given** a CommonJS project, **When** a developer uses the package, **Then** all public APIs work identically to the ESM version

---

### User Story 3 - Discover and Evaluate Package (Priority: P3)

A developer searching for a template engine discovers blade on NPM. They want to quickly understand what the package does, how to install it, and see basic usage examples before deciding to use it.

**Why this priority**: Good package discoverability and documentation on NPM helps with adoption, but the package must work correctly first.

**Independent Test**: Can be verified by viewing the package on npmjs.com and confirming all expected metadata, description, and links are present.

**Acceptance Scenarios**:

1. **Given** a developer viewing the package on npmjs.com, **When** they view the package page, **Then** they see a clear description, keywords, repository link, and license information
2. **Given** a developer searching for "blade template" or "template engine" on NPM, **When** search results appear, **Then** the package is discoverable through relevant keywords

---

### Edge Cases

- What happens when a project uses both ESM and CJS imports in the same codebase (dual package hazard)?
- How does the package behave when imported in a browser environment without bundling?
- What happens when an older Node.js version that doesn't fully support ESM tries to use the package?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Package MUST be installable via `npm install @bladets/template`
- **FR-002**: Package MUST provide ES module format for modern JavaScript projects
- **FR-003**: Package MUST provide CommonJS format for legacy Node.js projects
- **FR-004**: Package MUST include TypeScript declaration files (.d.ts) for type checking and IDE support
- **FR-005**: Package MUST use the `exports` field in package.json to properly map ESM and CJS entry points
- **FR-006**: Package MUST include all necessary files in the published tarball (dist folder, type definitions, README, LICENSE)
- **FR-007**: Package MUST NOT include development files (tests, source maps, config files) in the published tarball
- **FR-008**: Package MUST specify minimum supported Node.js version in the `engines` field
- **FR-009**: Package MUST have properly configured `repository`, `homepage`, and `bugs` fields for NPM page links

### Key Entities

- **Package Manifest (package.json)**: Configuration defining package name, version, entry points, exports map, and metadata
- **Distribution Files**: Compiled JavaScript (ESM and CJS), TypeScript declarations, and bundled assets
- **NPM Registry Entry**: Published package metadata, tarball, and version history on npmjs.com

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Package can be successfully installed in both ESM and CommonJS projects without errors
- **SC-002**: TypeScript users get full IntelliSense and type checking with zero configuration
- **SC-003**: Package appears on npmjs.com with all metadata (description, repository, keywords, license) visible
- **SC-004**: Published package size is under 500KB (excluding source maps)
- **SC-005**: All public APIs documented in README are accessible from both ESM and CJS imports

## Assumptions

- The package will be published to the public NPM registry
- The existing scoped name `@bladets/template` will be retained
- Node.js 18+ will be the minimum supported version (current LTS)
- The LSP server module (`lsp/server`) will also be published as part of the package
- Source maps will be included for debugging but excluded from package size metrics
