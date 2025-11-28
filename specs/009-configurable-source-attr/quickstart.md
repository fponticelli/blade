# Quickstart: Configurable Source Attribute

**Feature**: 009-configurable-source-attr
**Date**: 2025-11-27

## Prerequisites

- Node.js 18+
- Existing Blade project with `@bladets/template` installed

## Implementation Steps

### 1. Add Prefix Validation Function

Add a validation function to `packages/blade/src/renderer/index.ts`:

```typescript
/**
 * Validates that a source tracking prefix produces valid HTML attribute names.
 * Empty string is valid (results in unprefixed attributes).
 * Non-empty prefix must start with letter/underscore and contain only alphanumeric, hyphens, underscores.
 */
const VALID_PREFIX_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function validateSourceTrackingPrefix(prefix: string): void {
  if (prefix === '') {
    return; // Empty string is valid
  }
  if (!VALID_PREFIX_REGEX.test(prefix)) {
    throw new Error(
      `Invalid sourceTrackingPrefix "${prefix}". ` +
      `Prefix must be empty or start with a letter/underscore and contain only alphanumeric characters, hyphens, and underscores.`
    );
  }
}
```

### 2. Add Attribute Name Helper

Add a helper function to generate attribute names:

```typescript
/**
 * Generates a source tracking attribute name using the configured prefix.
 */
export function getSourceAttributeName(
  prefix: string,
  base: 'source' | 'source-op' | 'source-note'
): string {
  return prefix + base;
}
```

### 3. Validate in createRenderContext

Update `createRenderContext` to validate the prefix:

```typescript
export function createRenderContext(
  template: CompiledTemplate,
  data: unknown,
  options?: RenderOptions & { limits?: ResourceLimits }
): RenderContext {
  const config = { ...DEFAULT_RENDER_CONFIG, ...options?.config };

  // Validate prefix before creating context
  validateSourceTrackingPrefix(config.sourceTrackingPrefix);

  // ... rest of function
}
```

### 4. Add Tests

Add tests to `packages/blade/tests/renderer.test.ts`:

```typescript
describe('sourceTrackingPrefix validation', () => {
  it('accepts default prefix', () => {
    expect(() => validateSourceTrackingPrefix('rd-')).not.toThrow();
  });

  it('accepts empty string', () => {
    expect(() => validateSourceTrackingPrefix('')).not.toThrow();
  });

  it('accepts data-* prefix', () => {
    expect(() => validateSourceTrackingPrefix('data-track-')).not.toThrow();
  });

  it('accepts underscore prefix', () => {
    expect(() => validateSourceTrackingPrefix('my_prefix_')).not.toThrow();
  });

  it('rejects prefix starting with number', () => {
    expect(() => validateSourceTrackingPrefix('123-')).toThrow(/Invalid sourceTrackingPrefix/);
  });

  it('rejects prefix with invalid characters', () => {
    expect(() => validateSourceTrackingPrefix('my@prefix')).toThrow(/Invalid sourceTrackingPrefix/);
  });
});

describe('getSourceAttributeName', () => {
  it('generates attribute with default prefix', () => {
    expect(getSourceAttributeName('rd-', 'source')).toBe('rd-source');
    expect(getSourceAttributeName('rd-', 'source-op')).toBe('rd-source-op');
    expect(getSourceAttributeName('rd-', 'source-note')).toBe('rd-source-note');
  });

  it('generates attribute with custom prefix', () => {
    expect(getSourceAttributeName('data-track-', 'source')).toBe('data-track-source');
  });

  it('generates attribute with empty prefix', () => {
    expect(getSourceAttributeName('', 'source')).toBe('source');
  });
});
```

## Verification Checklist

- [ ] `validateSourceTrackingPrefix` function added and exported
- [ ] `getSourceAttributeName` helper function added and exported
- [ ] `createRenderContext` validates prefix before creating context
- [ ] Tests pass for valid prefixes: `'rd-'`, `''`, `'data-track-'`, `'audit_'`
- [ ] Tests fail for invalid prefixes: `'123-'`, `'my@prefix'`, `'has space'`
- [ ] Existing tests continue to pass (backward compatibility)
- [ ] Error messages are clear and actionable

## Usage Examples

### Custom Branded Prefix

```typescript
import { compile, createStringRenderer } from '@bladets/template';

const compiled = await compile('<div>Hello</div>');
const render = createStringRenderer(compiled);

const result = render(data, {
  config: {
    includeSourceTracking: true,
    sourceTrackingPrefix: 'data-acme-'  // Custom prefix
  }
});
// Output includes: data-acme-source="..."
```

### Unprefixed Attributes

```typescript
const result = render(data, {
  config: {
    includeSourceTracking: true,
    sourceTrackingPrefix: ''  // No prefix
  }
});
// Output includes: source="..."
```

### Invalid Prefix (Error)

```typescript
const result = render(data, {
  config: {
    sourceTrackingPrefix: '123-invalid'  // Starts with number
  }
});
// Throws: Error: Invalid sourceTrackingPrefix "123-invalid". ...
```
