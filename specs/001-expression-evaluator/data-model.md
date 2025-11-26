# Data Model: Expression Evaluator

**Feature**: 001-expression-evaluator
**Date**: 2025-11-25

## Overview

This document defines the data structures and types for the Expression Evaluator. Most types already exist in the codebase; this documents their usage and any additions.

## Existing Types (No Changes Needed)

### Scope

**Location**: `packages/blade/src/evaluator/index.ts`

```typescript
interface Scope {
  locals: Record<string, unknown>;  // Variables from @@ blocks
  data: unknown;                     // Data passed to render()
  globals: Record<string, unknown>;  // Configuration (locale, currency, etc.)
}
```

**Resolution order**: `locals` → `data` (for regular paths); `globals` only (for `$.` prefixed paths)

### EvaluationContext

**Location**: `packages/blade/src/evaluator/index.ts`

```typescript
interface EvaluationContext {
  scope: Scope;
  helpers: HelperRegistry;
  config: EvaluatorConfig;
}
```

### HelperFunction

**Location**: `packages/blade/src/evaluator/index.ts`

```typescript
type HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => (...args: unknown[]) => unknown;
```

**Currying pattern**: Helpers are curried with scope at call time, allowing access to globals like `$.currency`.

### EvaluatorConfig

**Location**: `packages/blade/src/evaluator/index.ts`

```typescript
interface EvaluatorConfig {
  maxFunctionDepth: number;   // Default: 10
  maxRecursionDepth: number;  // Default: 50
}
```

## New Types to Add

### EvaluationError

**Purpose**: Custom error class with source location for debugging

```typescript
class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'EvaluationError';
  }
}
```

**Error codes**:
| Code | Description |
|------|-------------|
| `UNKNOWN_HELPER` | Helper function not found in registry |
| `MAX_DEPTH_EXCEEDED` | Recursion or function call depth exceeded |
| `INVALID_OPERATION` | Operation not valid for operand types |

### EvaluationResult (Optional)

**Purpose**: Extended result with metadata for path tracking

```typescript
interface EvaluationResult {
  value: unknown;
  pathsAccessed: string[];  // For rd-source generation
}
```

**Note**: This is optional for initial implementation. Simple `evaluate()` returns `unknown` directly. Path tracking can be added as enhancement.

## Expression AST Types (Reference)

These types are defined in `packages/blade/src/ast/types.ts` and consumed by the evaluator:

### ExprAst Union

```typescript
type ExprAst =
  | LiteralNode
  | PathNode
  | UnaryNode
  | BinaryNode
  | TernaryNode
  | CallNode
  | ArrayWildcardNode;
```

### Node Kind Mapping

| Node Kind | Evaluation Action |
|-----------|------------------|
| `literal` | Return `value` directly |
| `path` | Resolve through scope hierarchy |
| `unary` | Apply `!` or `-` to operand |
| `binary` | Apply operator with type coercion |
| `ternary` | Evaluate condition, return truthy or falsy result |
| `call` | Curry helper with scope, invoke with evaluated args |
| `wildcard` | Expand path across array elements, flatten |

### PathItem Types

```typescript
type PathItem = KeyPathItem | IndexPathItem | StarPathItem;

interface KeyPathItem {
  kind: 'key';
  key: string;
}

interface IndexPathItem {
  kind: 'index';
  index: number;
}

interface StarPathItem {
  kind: 'star';
}
```

## Type Coercion Matrix

For binary operations, coercion follows JavaScript semantics:

### Addition (`+`)

| Left Type | Right Type | Result Type | Example |
|-----------|------------|-------------|---------|
| string | any | string | `"a" + 1` → `"a1"` |
| any | string | string | `1 + "a"` → `"1a"` |
| number | number | number | `1 + 2` → `3` |
| number | boolean | number | `1 + true` → `2` |
| number | null | number | `1 + null` → `1` |
| number | undefined | NaN | `1 + undefined` → `NaN` |

### Comparison Operators (`<`, `>`, `<=`, `>=`)

| Operand Types | Behavior |
|--------------|----------|
| number, number | Numeric comparison |
| string, string | Lexicographic comparison |
| mixed | Convert to number, compare |

### Equality (`==`, `!=`)

| Comparison | Behavior |
|------------|----------|
| Same type | Value equality |
| null == undefined | true |
| Different types | Type coercion, then compare |

### Logical (`&&`, `||`)

| Operator | Returns |
|----------|---------|
| `&&` | Left if falsy, else right |
| `||` | Left if truthy, else right |

### Nullish Coalescing (`??`)

| Left Value | Returns |
|------------|---------|
| null | Right |
| undefined | Right |
| Any other | Left |

## Scope Hierarchy Example

```typescript
const scope: Scope = {
  locals: { x: 1, total: 100 },
  data: { x: 2, order: { total: 50 } },
  globals: { x: 3, currency: 'USD' }
};

// Resolution examples:
// $x → 1 (locals.x)
// $order.total → 50 (data.order.total)
// $.x → 3 (globals.x)
// $.currency → "USD" (globals.currency)
// $missing → undefined (not found anywhere)
```
