# Quickstart: Remove @load Directive

**Feature**: 004-remove-load-directive
**Date**: 2025-11-26

## Overview

This feature removes the `@load` directive concept from Blade. Since @load was never implemented (only specified), this is a pure cleanup task.

## What's Being Removed

### 1. Compiler Interface Changes

**Before**:
```typescript
export interface CompileOptions {
  loader?: TemplateLoader;
  maxLoadDepth?: number;
  validate?: boolean;
  strict?: boolean;
  // ...other options
}

export interface TemplateLoader {
  load(name: string): Promise<CompiledTemplate> | CompiledTemplate;
}
```

**After**:
```typescript
export interface CompileOptions {
  validate?: boolean;
  strict?: boolean;
  // ...other options (loader and maxLoadDepth removed)
}

// TemplateLoader interface deleted entirely
```

### 2. Documentation Changes

The following SPECIFICATION.md sections will be removed:
- Section 3.6: `@load` directive syntax
- Section 7.1: `@load` processing references
- Section 7.3: TemplateLoader behavior
- Grammar rule: `load_directive`
- Example templates using `@load`

### 3. LSP Changes

The hover provider will no longer show documentation for `@load`.

## How Components Work Now

Components are defined inline using `<template:Name>` syntax:

```blade
<!-- Define a component -->
<template:Card title!>
  <div class="card">
    <h2>${title}</h2>
    <slot />
  </div>
</template:Card>

<!-- Use the component -->
<Card title="Hello">
  <p>Card content here</p>
</Card>
```

No external loading mechanism exists. All components must be defined in the same template file.

## Testing the Change

After implementation:

```bash
# Run all tests (should pass)
npm test

# Verify @load is removed from source (should return no matches in src/)
grep -r "@load" packages/blade/src/

# Verify TemplateLoader is removed
grep -r "TemplateLoader" packages/blade/src/
```

## Migration Notes

If you were using `@load` in templates (which would have been ignored anyway), you have two options:

1. **Define components inline**: Move component definitions into the same template file
2. **Wait for future external component support**: A new mechanism may be designed later if needed

The removal of @load is intentional simplification. The feature was never functional.
