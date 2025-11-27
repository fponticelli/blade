# Research: Template Syntax Improvements & Helper Functions

**Date**: 2025-11-26 | **Feature**: 006-template-helpers-escaping

## Research Questions

### RQ1: How should escape sequences be implemented in the tokenizer?

**Decision**: Process escapes at tokenizer level during text content scanning

**Rationale**:
- Escape sequences (`\@`, `\$`, `\\`) should be processed during text tokenization
- The tokenizer already distinguishes between text content and special characters
- Processing at tokenizer level keeps the parser clean and maintains source location accuracy
- When scanning text, if `\` is followed by `@`, `$`, or `\`, emit the literal character
- If `\` is followed by any other character, emit both `\` and the character literally

**Alternatives considered**:
- Parser-level processing: Rejected - would complicate AST and lose source locations
- Renderer-level processing: Rejected - escapes are syntax, not runtime behavior
- Separate preprocessor pass: Rejected - adds complexity for simple feature

**Implementation approach**:
```typescript
// In tokenizer's text scanning:
if (char === '\\') {
  const next = this.peek(1);
  if (next === '@' || next === '$' || next === '\\') {
    text += next;  // Add escaped character literally
    this.advance(2);  // Skip both \ and the escaped char
    continue;
  }
  // Otherwise, \ is literal
  text += char;
}
```

### RQ2: How should `@` and `$` without valid follow-characters be handled?

**Decision**: Leave as literal text (no escape needed)

**Rationale**:
- `@` only triggers directive parsing when followed by a valid directive keyword (if, for, match, etc.)
- `$` only triggers variable parsing when followed by a letter (a-z, A-Z) or underscore
- `@example.com` → literal text (not a directive)
- `$100` → literal text (not a variable)
- This maximizes backward compatibility and reduces escape ceremony

**Alternatives considered**:
- Require escaping all `@` and `$`: Rejected - too verbose for common cases
- Complex lookahead at all `@`/`$`: Current behavior - already implemented

**Implementation approach**:
- Current tokenizer behavior already handles this correctly
- Verify with tests to ensure no regression

### RQ3: What is the best pattern for polymorphic helper functions?

**Decision**: Use runtime type checking with graceful fallbacks

**Rationale**:
- Functions like `len()`, `reverse()`, `indexOf()` work on both strings and arrays
- Check type at runtime and dispatch to appropriate implementation
- If type is unexpected, convert to most sensible type or return sensible default with warning

**Implementation pattern**:
```typescript
export const len: HelperFunction = (_scope, setWarning) => {
  return (value: unknown): number => {
    if (Array.isArray(value)) {
      return value.length;
    }
    if (typeof value === 'string') {
      return value.length;
    }
    if (value === null || value === undefined) {
      return 0;
    }
    setWarning(`len() expected array or string, got ${typeof value}`);
    return String(value).length;
  };
};
```

### RQ4: How should date manipulation functions handle invalid inputs?

**Decision**: Return epoch date (1970-01-01) with warning

**Rationale**:
- Existing `expectDate()` helper already implements this pattern
- Consistent with spec edge case definition
- Allows templates to continue rendering without hard failures
- Warnings accumulated via `setWarning` are returned with render result

**Implementation**: Use existing `expectDate()` helper function

### RQ5: What naming conventions should helper functions follow?

**Decision**: Follow established patterns in codebase + JavaScript conventions

**Rationale**:
- Existing helpers use camelCase (formatCurrency, formatDate, addDays)
- Verb-first for actions: `add*`, `is*`, `to*`, `parse*`, `format*`
- Noun for extractors: `first`, `last`, `year`, `month`
- Aliases provided where intuitive: `uppercase` (alias for `upper`), `lowercase` (alias for `lower`)

**Naming decisions**:
| Function | Pattern | Notes |
|----------|---------|-------|
| `len` | noun | Polymorphic for array/string |
| `uppercase/lowercase` | verb-ish | Alias existing `upper/lower` |
| `capitalize` | verb | Action on string |
| `startsWith/endsWith` | verb | Matches JS String methods |
| `addYears/addMonths` | verb-noun | Action + unit |
| `year/month/day` | noun | Extractors |
| `isNull/isArray` | is-noun | Type predicates |
| `toNumber/toString` | to-type | Converters |

### RQ6: How should the LSP provide helper function completions?

**Decision**: Static metadata map with function signatures and examples

**Rationale**:
- Helper functions are known at compile time
- Create a metadata registry with function name, parameters, return type, description, example
- LSP completion provider queries this registry
- Hover provider shows full documentation from registry

**Implementation approach**:
```typescript
// In helpers/metadata.ts (new file)
export const helperMetadata: Record<string, HelperMetadata> = {
  len: {
    signature: 'len(value: array | string): number',
    description: 'Returns the length of an array or string',
    examples: ['len([1,2,3]) → 3', 'len("hello") → 5'],
    category: 'utility'
  },
  // ...
};
```

## Resolved NEEDS CLARIFICATION

All technical context items are resolved - no external dependencies or unknowns.

## Best Practices Summary

1. **Escape processing**: Handle at tokenizer level for clean separation
2. **Type coercion**: Use `expectX` helper functions consistently
3. **Error handling**: Always use `setWarning`, never throw
4. **Polymorphism**: Runtime type checking with graceful fallbacks
5. **Naming**: Follow existing codebase patterns (camelCase, verb-first for actions)
6. **Testing**: Each helper needs tests for normal cases, edge cases, and warning scenarios
7. **LSP integration**: Static metadata registry for completions and hover
