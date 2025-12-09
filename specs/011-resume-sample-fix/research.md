# Research: Resume Sample Parsing Issues

**Date**: 2025-12-08
**Feature**: 011-resume-sample-fix

## Executive Summary

The resume template fails to parse because the parser treats `<style>` tag content as regular template content, causing CSS braces `}` to be misinterpreted as directive block endings.

## Problem Analysis

### Root Cause

When parsing the resume template, **26 parsing errors** occur:

```
Line 1 Col 1 : Unclosed tag: <style>
Line 6 Col 1 : Unexpected character '}'
Line 11 Col 1 : Unexpected character '}'
... (24 more '}' errors)
```

The issue is in [template-parser.ts](../../packages/blade/src/parser/template-parser.ts):

1. **`parseElement()` (line 243-258)**: Parses children of all elements uniformly, including `<style>` tags
2. **`parseText()` (line 1117-1119)**: Breaks when encountering `}`:
   ```typescript
   // Check for end of block/case body
   if (this.peek() === '}') {
     break;
   }
   ```

When the parser enters `<style>`, it calls `parseNode()` for children. The CSS content like:

```css
body {
  font-family: ${fontFamily ?? 'Arial'};
}  /* <-- This } breaks parsing */
```

The `}` after CSS rule content triggers the text parser to stop, thinking it's the end of a `@if` or `@for` block. This causes:
1. Incomplete text nodes
2. "Unexpected character '}'" errors for each CSS rule closing brace
3. Eventually, the `<style>` tag appears unclosed

### Resume Template Features Used

The resume template uses these Blade features that must work:

| Feature | Example | Location |
|---------|---------|----------|
| Expression interpolation in CSS | `font-family: ${fontFamily ?? 'Arial'}` | Line 4 |
| Null coalescing operator | `${fontFamily ?? 'Arial'}` | Line 4 |
| Nested property access | `${header.agencyDetails.phoneNumber}` | Multiple |
| `@if` directive | `@if (includeHeader) { ... }` | Lines 152, 160-192, 197, 207 |
| Nested conditionals | `@if` inside `@if` blocks | Throughout |
| CSS expressions | `color: ${textColor}` | Line 27 |
| CSS calc with expressions | `opacity: calc(var(--opacity, 92) / 100)` | Line 148 |

## Solution Design

### Decision: Treat `<style>` and `<script>` as Raw Content Tags

**Rationale**: HTML5 spec treats `<style>` and `<script>` as raw text elements. Blade should:
1. Parse the content as raw text (not looking for `<`, `>`, `}` as structural)
2. Still allow `${...}` expression interpolation within the raw content
3. Only stop at the matching closing tag `</style>` or `</script>`

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| Escape all `}` in CSS | Breaks developer experience; CSS would be unreadable |
| Use different expression syntax in CSS | Inconsistent with rest of Blade |
| Disable expressions in `<style>` | Loses valuable templating capability |

### Implementation Approach

1. **Modify `parseElement()`** in template-parser.ts:
   - After parsing `<style>` or `<script>` opening tag, switch to raw content mode
   - Parse content until closing tag, only extracting `${...}` expressions
   - Handle nested strings properly (don't match `}` inside strings)

2. **Create `parseRawContent()` method**:
   - Scan for `</tagname>` closing pattern
   - Within content, only parse `${...}` expressions
   - Return as text node with expression segments

3. **Update renderer and tempo** if needed:
   - Ensure style content with expressions renders correctly
   - Maintain source attribution

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/blade/src/parser/template-parser.ts` | Modify | Add raw content handling for style/script |
| `packages/blade/tests/compiler.test.ts` | Add | Test cases for style expressions |
| `packages/blade/tests/renderer.test.ts` | Add | Test rendering style with expressions |

## Test Cases Required

1. **Parser Tests**:
   - Parse `<style>` with plain CSS
   - Parse `<style>` with `${expression}` interpolation
   - Parse `<style>` with null coalescing `${a ?? b}`
   - Parse `<style>` with nested property access `${obj.prop.sub}`
   - Parse `<style>` with multiple expressions
   - Parse resume template successfully (0 errors)

2. **Renderer Tests**:
   - Render style with expression substitution
   - Render style with undefined value and fallback
   - Render complete resume template

3. **Integration Tests**:
   - VSCode extension parses resume without diagnostics
   - Tempo renders resume correctly

## Dependencies

- No new dependencies required
- Uses existing expression parser infrastructure

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing templates with style tags | Add comprehensive tests before/after |
| Expression parsing edge cases in CSS | Test CSS-specific syntax like `calc()`, `url()` |
| Performance impact of raw content scanning | Minimal - only affects style/script tags |

## Verification

After implementation:

```bash
# Parse test
node -e "const {parseTemplate}=require('./dist');console.log(parseTemplate(require('fs').readFileSync('../../samples/resume/index.blade','utf-8')).errors.length)"
# Expected: 0

# Run all tests
npm test
```
