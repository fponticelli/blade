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

### Decision: Track Directive Block Depth

**Key Insight**: The `}` character should only be treated as a block terminator when inside a directive block (`@if`, `@for`, `@match`). In regular content (like CSS inside `<style>`), `}` is just text.

Since expressions start with `${` or `$`, standalone `{` and `}` have no special meaning in Blade and should be treated as literal text.

**Rationale**: This is simpler than creating special "raw content" handling for style/script tags. All tags should behave the same - the only difference is whether we're inside a directive block.

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| RAW_CONTENT_TAGS set | Over-engineered; creates tag-specific behavior when the issue is block context |
| Escape all `}` in CSS | Breaks developer experience; CSS would be unreadable |
| Use different expression syntax in CSS | Inconsistent with rest of Blade |

### Implementation Approach

1. **Add `blockDepth` counter** to TemplateParser class:
   - Tracks nesting depth inside directive blocks
   - Initialized to 0

2. **Modify `parseText()`** in template-parser.ts:
   - Only stop at `}` when `blockDepth > 0`
   - When `blockDepth === 0`, treat `}` as literal text

3. **Modify `parseBlockBody()`** in template-parser.ts:
   - Increment `blockDepth` on entry
   - Decrement `blockDepth` on exit (in finally block for safety)

4. **Modify `parseFor()`** in template-parser.ts:
   - Use `parseBlockBody()` instead of inline body parsing
   - Ensures consistent blockDepth tracking

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/blade/src/parser/template-parser.ts` | Modify | Add blockDepth tracking for directive blocks |

**Changes Made**:
1. Added `private blockDepth = 0;` property
2. Modified `parseText()` to check `this.blockDepth > 0` before stopping at `}`
3. Modified `parseBlockBody()` to increment/decrement blockDepth
4. Modified `parseFor()` to use `parseBlockBody()` instead of inline parsing

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
