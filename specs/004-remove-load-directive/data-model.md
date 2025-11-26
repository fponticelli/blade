# Data Model: Remove @load Directive

**Feature**: 004-remove-load-directive
**Date**: 2025-11-26

## Overview

This feature is a **deletion-only** change. No new data models are introduced.

## Entities Being Removed

### TemplateLoader Interface

**Location**: `packages/blade/src/compiler/index.ts`

```typescript
// BEING REMOVED
export interface TemplateLoader {
  load(name: string): Promise<CompiledTemplate> | CompiledTemplate;
}
```

### CompileOptions Properties

**Location**: `packages/blade/src/compiler/index.ts`

```typescript
export interface CompileOptions {
  loader?: TemplateLoader;    // BEING REMOVED
  maxLoadDepth?: number;       // BEING REMOVED
  // ...remaining options stay
}
```

## Entities Unchanged

The following entities remain as-is:

- **CompiledTemplate**: The output of compilation
- **ComponentDefinition**: How components are defined (inline via `<template:Name>`)
- **TemplateNode**: AST node types for template content
- **CompileOptions**: Retains all other options (validate, strict, includeSourceMap, etc.)

## Relationships

No relationship changes. Components continue to be:
1. Defined inline in templates using `<template:Name>` syntax
2. Stored in the `components` Map of the compiled template root
3. Referenced by `ComponentNode` instances in the AST

## Validation Rules

No new validation rules. Existing component validation remains:
- Component names must start with capital letter
- Required props must be provided
- Circular dependencies prevented (not applicable without external loading)
