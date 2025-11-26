# Quickstart: Expression Evaluator

**Feature**: 001-expression-evaluator
**Date**: 2025-11-25

## Overview

This guide demonstrates how to use the Expression Evaluator to execute Blade template expressions.

## Basic Usage

### Evaluating Simple Expressions

```typescript
import { evaluate } from '@fponticelli/blade';
import type { EvaluationContext, Scope } from '@fponticelli/blade';

// Create a scope with data
const scope: Scope = {
  locals: {},
  data: {
    user: { name: 'Alice', age: 30 },
    order: { total: 99.99, items: [{ price: 50 }, { price: 49.99 }] }
  },
  globals: { currency: 'USD' }
};

// Create evaluation context
const context: EvaluationContext = {
  scope,
  helpers: {},
  config: { maxFunctionDepth: 10, maxRecursionDepth: 50 }
};

// Evaluate a path expression (AST node)
const pathNode = {
  kind: 'path' as const,
  segments: [
    { kind: 'key' as const, key: 'user' },
    { kind: 'key' as const, key: 'name' }
  ],
  isGlobal: false,
  location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 9 } }
};

const result = evaluate(pathNode, context);
console.log(result); // "Alice"
```

### Using Helper Functions

```typescript
import { evaluate } from '@fponticelli/blade';
import type { HelperFunction, Scope } from '@fponticelli/blade';

// Define a helper function
const formatCurrency: HelperFunction = (scope, setWarning) => (value: unknown) => {
  const currency = scope.globals.currency ?? 'USD';
  const num = Number(value);
  if (isNaN(num)) {
    setWarning(`formatCurrency received non-numeric value: ${value}`);
    return String(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency as string
  }).format(num);
};

const sum: HelperFunction = (scope, setWarning) => (arr: unknown) => {
  if (!Array.isArray(arr)) {
    setWarning('sum expected array');
    return 0;
  }
  return arr.reduce((a: number, b: unknown) => a + Number(b), 0);
};

const context: EvaluationContext = {
  scope: {
    locals: {},
    data: { items: [{ price: 10 }, { price: 20 }, { price: 30 }] },
    globals: { currency: 'EUR' }
  },
  helpers: { formatCurrency, sum },
  config: { maxFunctionDepth: 10, maxRecursionDepth: 50 }
};

// Evaluate: sum(items[*].price)
const callNode = {
  kind: 'call' as const,
  callee: 'sum',
  args: [{
    kind: 'wildcard' as const,
    path: {
      kind: 'path' as const,
      segments: [
        { kind: 'key' as const, key: 'items' },
        { kind: 'star' as const },
        { kind: 'key' as const, key: 'price' }
      ],
      isGlobal: false,
      location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } }
    },
    location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } }
  }],
  location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 25, offset: 24 } }
};

const total = evaluate(callNode, context);
console.log(total); // 60
```

### Evaluating Arithmetic Expressions

```typescript
// Evaluate: price * quantity * (1 + taxRate)
const binaryNode = {
  kind: 'binary' as const,
  operator: '*' as const,
  left: {
    kind: 'binary' as const,
    operator: '*' as const,
    left: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'price' }], isGlobal: false, location: /* ... */ },
    right: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'quantity' }], isGlobal: false, location: /* ... */ },
    location: /* ... */
  },
  right: {
    kind: 'binary' as const,
    operator: '+' as const,
    left: { kind: 'literal' as const, type: 'number' as const, value: 1, location: /* ... */ },
    right: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'taxRate' }], isGlobal: false, location: /* ... */ },
    location: /* ... */
  },
  location: /* ... */
};

const context: EvaluationContext = {
  scope: {
    locals: { price: 100, quantity: 2, taxRate: 0.08 },
    data: {},
    globals: {}
  },
  helpers: {},
  config: { maxFunctionDepth: 10, maxRecursionDepth: 50 }
};

const total = evaluate(binaryNode, context);
console.log(total); // 216
```

## Common Patterns

### Null-Safe Access

Path access is implicitly null-safe:

```typescript
const scope: Scope = {
  locals: {},
  data: { user: null },
  globals: {}
};

// $user.profile.name returns undefined (no error)
const result = evaluate(userProfileNamePath, { scope, helpers: {}, config: defaultConfig });
console.log(result); // undefined
```

### Global Variable Access

Use the `$.` prefix for global access:

```typescript
const scope: Scope = {
  locals: { currency: 'EUR' },
  data: { currency: 'GBP' },
  globals: { currency: 'USD' }
};

// $currency → 'EUR' (locals)
// $.currency → 'USD' (globals)
```

### Conditional Expressions

```typescript
// ${hasDiscount ? discountedPrice : regularPrice}
const ternaryNode = {
  kind: 'ternary' as const,
  condition: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'hasDiscount' }], isGlobal: false, location: /* ... */ },
  truthy: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'discountedPrice' }], isGlobal: false, location: /* ... */ },
  falsy: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'regularPrice' }], isGlobal: false, location: /* ... */ },
  location: /* ... */
};
```

### Default Values with Nullish Coalescing

```typescript
// ${userName ?? "Guest"}
const nullishNode = {
  kind: 'binary' as const,
  operator: '??' as const,
  left: { kind: 'path' as const, segments: [{ kind: 'key' as const, key: 'userName' }], isGlobal: false, location: /* ... */ },
  right: { kind: 'literal' as const, type: 'string' as const, value: 'Guest', location: /* ... */ },
  location: /* ... */
};
```

## Error Handling

```typescript
import { evaluate, EvaluationError } from '@fponticelli/blade';

try {
  const result = evaluate(expression, context);
} catch (error) {
  if (error instanceof EvaluationError) {
    console.error(`Evaluation error at line ${error.location.start.line}: ${error.message}`);
    console.error(`Error code: ${error.code}`);
  } else {
    throw error;
  }
}
```

## Integration with Parser

In practice, expressions come from the parser:

```typescript
import { parse, evaluate } from '@fponticelli/blade';

// Parse a template
const compiled = parse('<div>${user.name}</div>');

// Extract expression from text segment
const textNode = compiled.root.children[0]; // ElementNode
const textContent = textNode.children[0]; // TextNode
const exprSegment = textContent.segments[0]; // { kind: 'expr', expr: PathNode }

// Evaluate the expression
const value = evaluate(exprSegment.expr, context);
```

## Type Coercion Examples

```typescript
// String concatenation
evaluate(parseExpr('"Total: " + 100'), ctx); // "Total: 100"

// Boolean to number
evaluate(parseExpr('5 + true'), ctx); // 6

// Null in arithmetic
evaluate(parseExpr('10 + null'), ctx); // 10

// Division by zero
evaluate(parseExpr('5 / 0'), ctx); // Infinity

// Nullish vs falsy
evaluate(parseExpr('0 ?? "default"'), ctx); // 0 (not null/undefined)
evaluate(parseExpr('null ?? "default"'), ctx); // "default"
```
