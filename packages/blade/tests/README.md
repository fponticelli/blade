# Blade Test Suite

## Overview

This directory contains comprehensive test-driven tests for the Blade template engine.

## Test Files

### `compiler.test.ts`

Exhaustive test suite for the compiler module (94 tests total).

**Test Categories:**

1. **Basic Compilation (5 tests)**
   - Empty templates
   - Plain text and HTML
   - Source location tracking
   - Metadata population

2. **Expression Parsing (17 tests)**
   - Simple expressions: `$foo`, `$data.user.name`, `$.currency`
   - Array access: `$items[0]`, `$items[*].price`
   - Literal values: strings, numbers, booleans, null
   - Binary operators: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `??`
   - Unary operators: `!`, `-`
   - Ternary expressions: `condition ? truthy : falsy`
   - Function calls: `formatCurrency(total)`
   - Nested calls: `formatCurrency(sum(items[*].price))`
   - Operator precedence
   - Text interpolation: mixed text and expressions

3. **HTML Elements and Attributes (8 tests)**
   - Self-closing tags
   - Nested elements
   - Multiple siblings
   - Static attributes
   - Expression attributes
   - Mixed attributes (interpolation)
   - Multiple attributes
   - Boolean attributes

4. **Control Flow Directives (12 tests)**
   - `@if` simple conditional
   - `@if/@else` blocks
   - `@if/@else if` chains
   - `@for...of` for values
   - `@for...of` with index
   - `@for...in` for keys/indices
   - Complex expressions in loops
   - `@match` with literal cases
   - `@match` with expression cases
   - `@match` with default case
   - Mixed literal and expression cases

5. **Variable Declarations (5 tests)**
   - Simple declarations: `let x = 10`
   - Multiple declarations in `@@` blocks
   - Global assignments: `let $.currency = "EUR"`
   - Function declarations
   - Complex function expressions

6. **Components (10 tests)**
   - Component definitions
   - Props with defaults
   - Multiple components
   - Component instances
   - Component props
   - Components with children
   - Prop path mapping
   - Default slots
   - Named slots
   - Slots with fallback content

7. **Fragments (3 tests)**
   - Empty fragments
   - Fragments with children
   - Whitespace preservation

8. **Comments (4 tests)**
   - Line comments: `//`
   - Block comments: `/* */`
   - HTML comments: `<!-- -->`
   - Comment inclusion with options

9. **Metadata and Source Tracking (6 tests)**
   - Path tracking
   - Global variable tracking
   - Helper function tracking
   - Component tracking
   - Source map generation
   - Optional source map

10. **Error Handling and Validation (11 tests)**
    - Unclosed tags
    - Mismatched tags
    - Invalid expression syntax
    - Invalid directive syntax
    - Error locations
    - Undefined variables (strict mode)
    - Invalid component names
    - Missing required props
    - Duplicate component definitions
    - Unused variable warnings
    - Variable shadowing warnings

11. **Compilation Options (3 tests)**
    - Max expression depth
    - Max function depth
    - Custom component loaders

12. **Complex Integration Tests (3 tests)**
    - Nested templates with all features
    - Components with slots
    - Complete template with all features

13. **Edge Cases and Boundary Conditions (10 tests)**
    - Empty expressions
    - Whitespace-only templates
    - Special characters
    - Unicode support
    - Deep nesting (50 levels)
    - Long attribute values
    - Large templates (1000+ nodes)
    - Whitespace normalization
    - Fragment whitespace preservation
    - Leading/trailing whitespace

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm test compiler.test.ts
```

## Test Status

✅ **94 tests defined** for the compiler module
⏳ **0 tests passing** (compiler not yet implemented)
🎯 **Goal**: Implement compiler to pass all tests

## Test-Driven Development

These tests follow TDD principles:

1. **Tests written first**: All tests are written before implementation
2. **Comprehensive coverage**: Tests cover all specification features
3. **Clear expectations**: Each test clearly defines expected behavior
4. **Edge cases included**: Boundary conditions and error cases tested
5. **Integration tests**: Real-world complex scenarios included

## Next Steps

1. Implement lexer/tokenizer
2. Implement parser
3. Implement AST builder
4. Implement metadata collector
5. Implement validation
6. Run tests and iterate until all pass
