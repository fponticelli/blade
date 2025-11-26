# Research: Expression Evaluator

**Feature**: 001-expression-evaluator
**Date**: 2025-11-25

## Overview

This document captures research findings and design decisions for the Expression Evaluator implementation.

## Decision 1: Evaluation Strategy

**Decision**: Recursive tree-walking interpreter

**Rationale**:
- Direct and maintainable approach for expression evaluation
- Maps cleanly to the discriminated union AST structure
- Easily debuggable with clear stack traces
- No compilation step needed (expressions are already parsed to AST)

**Alternatives considered**:
- Bytecode compilation: Overkill for expression evaluation; adds complexity without meaningful performance benefit for our use case
- Stack-based interpreter: More complex state management for no benefit

## Decision 2: Scope Resolution Order

**Decision**: Resolution order is `locals → data` for regular paths, with `$.` prefix bypassing to globals directly

**Rationale**:
- Per specification Section 5.2: `varName` searches locals then data
- `$.varName` accesses globals only (direct access)
- This enables predictable variable shadowing
- Matches JavaScript's lexical scoping mental model

**Implementation approach**:
```typescript
function resolveFirstSegment(name: string, isGlobal: boolean, scope: Scope): unknown {
  if (isGlobal) {
    return scope.globals[name];
  }
  if (name in scope.locals) {
    return scope.locals[name];
  }
  // Access data as object if possible
  if (scope.data && typeof scope.data === 'object') {
    return (scope.data as Record<string, unknown>)[name];
  }
  return undefined;
}
```

## Decision 3: Implicit Optional Chaining

**Decision**: All path access returns `undefined` for null/undefined intermediate values (never throws)

**Rationale**:
- Per specification Section 4.2: "All path access has implicit optional chaining"
- Prevents runtime errors from missing data
- Matches user expectation that templates gracefully handle missing fields

**Implementation approach**:
```typescript
function accessProperty(obj: unknown, key: string | number): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (typeof obj === 'object') {
    return (obj as Record<string | number, unknown>)[key];
  }
  return undefined;
}
```

## Decision 4: Type Coercion Rules

**Decision**: Follow JavaScript semantics exactly

**Rationale**:
- Per specification Section 4.3: "Follow JavaScript coercion semantics"
- Predictable for developers familiar with JavaScript
- No custom type system to learn

**Key coercion behaviors** (per spec):
| Expression | Result | Rule |
|------------|--------|------|
| `"5" + 3` | `"53"` | String concat when either operand is string |
| `5 + true` | `6` | Boolean to number (true=1, false=0) |
| `5 + null` | `5` | null to 0 in arithmetic |
| `5 + undefined` | `NaN` | undefined to NaN |
| `5 / 0` | `Infinity` | Division by zero |
| `0 / 0` | `NaN` | Zero divided by zero |

## Decision 5: Helper Function Currying

**Decision**: Curry helpers with scope at call time (not registration time)

**Rationale**:
- Per specification Section 5.3: "Scope capture timing: At call time (dynamic)"
- Allows helpers to see current scope state including modified globals
- Matches existing `HelperFunction` signature: `(scope, setWarning) => (...args) => result`

**Implementation approach**:
```typescript
function evaluateCall(node: CallNode, context: EvaluationContext): unknown {
  const helper = context.helpers[node.callee];
  if (!helper) {
    throw new EvaluationError(`Unknown helper function: ${node.callee}`, node.location);
  }

  const warnings: string[] = [];
  const curriedFn = helper(context.scope, (msg) => warnings.push(msg));
  const args = node.args.map(arg => evaluate(arg, context));

  return curriedFn(...args);
}
```

## Decision 6: Array Wildcard Flattening

**Decision**: Nested wildcards produce a single flattened array

**Rationale**:
- Per specification Section 4.2: "Nested wildcards (flattened)"
- Example: `departments[*].employees[*].salary` returns flat `[50000, 60000, 70000, 55000, 65000]`
- Simplifies aggregation functions (sum, avg work on flat arrays)

**Implementation approach**:
```typescript
function evaluateWildcard(node: ArrayWildcardNode, context: EvaluationContext): unknown[] {
  // Process path segments, accumulating results and flattening at each wildcard
  let current: unknown[] = [resolveFirstSegment(...)];

  for (const segment of remainingSegments) {
    if (segment.kind === 'star') {
      // Flatten and expand: each array element becomes multiple results
      current = current.flatMap(item =>
        Array.isArray(item) ? item : []
      );
    } else {
      // Map property access across all current values
      current = current.map(item => accessProperty(item, segment.key ?? segment.index));
    }
  }

  return current;
}
```

## Decision 7: Short-Circuit Evaluation

**Decision**: `&&`, `||`, and `??` use short-circuit evaluation; ternary only evaluates the taken branch

**Rationale**:
- Per JavaScript semantics and specification
- Prevents unnecessary computation
- Prevents errors from evaluating branches with invalid assumptions

**Implementation**:
- `&&`: Return left if falsy, otherwise evaluate and return right
- `||`: Return left if truthy, otherwise evaluate and return right
- `??`: Return left if not null/undefined, otherwise evaluate and return right
- Ternary: Only evaluate truthy or falsy branch based on condition

## Decision 8: Error Handling Strategy

**Decision**: Create custom `EvaluationError` class with location information; propagate helper errors

**Rationale**:
- Constitution V (Developer Experience): "Error messages MUST include source locations"
- Per spec FR-016: "System MUST propagate errors thrown by helper functions"

**Implementation**:
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

## Existing Code Analysis

### Current State of `evaluator/index.ts`

The existing file contains:
- `Scope` interface (locals, data, globals) - **matches spec, keep as-is**
- `EvaluationContext` interface - **keep as-is**
- `HelperRegistry` and `HelperFunction` types - **keep as-is**
- `EvaluatorConfig` interface (maxFunctionDepth, maxRecursionDepth) - **keep as-is**
- Stub `evaluate()` function throwing "Not implemented" - **replace with implementation**

### AST Types to Handle

From `ast/types.ts`, the evaluator must handle these `ExprAst` node types:
1. `LiteralNode` - Direct value return
2. `PathNode` - Scope resolution + property traversal
3. `UnaryNode` - `!` and `-` operators
4. `BinaryNode` - All 14 binary operators
5. `TernaryNode` - Conditional expression
6. `CallNode` - Helper function invocation
7. `ArrayWildcardNode` - Wildcard path expansion

### PathItem Types

Path segments use discriminated unions:
- `KeyPathItem` - Property access by name
- `IndexPathItem` - Array access by numeric index
- `StarPathItem` - Wildcard expansion

## Dependencies

**Internal** (already exist):
- `ExprAst` and related types from `../ast/types.js`
- `Scope`, `EvaluationContext`, `HelperRegistry` from current file

**External**: None required

## Test Strategy

Tests should cover:
1. **Literal evaluation** - All literal types (string, number, boolean, null)
2. **Path resolution** - Scope hierarchy, optional chaining, nested access
3. **Operators** - Each operator with various type combinations
4. **Coercion** - All documented coercion cases
5. **Helpers** - Currying, error propagation, warning collection
6. **Wildcards** - Single and nested wildcards, empty arrays
7. **Edge cases** - Division by zero, out-of-bounds access, circular references
