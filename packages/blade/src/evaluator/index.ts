// Evaluator module
// Expression evaluation for Blade templates

import type {
  ExprAst,
  LiteralNode,
  PathNode,
  UnaryNode,
  BinaryNode,
  TernaryNode,
  CallNode,
  ArrayWildcardNode,
  SourceLocation,
} from '../ast/types.js';

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Error thrown during expression evaluation.
 * Includes source location for debugging and optional error code.
 */
export class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'EvaluationError';
  }
}

export interface Scope {
  locals: Record<string, unknown>;
  data: unknown;
  globals: Record<string, unknown>;
}

export interface EvaluationContext {
  scope: Scope;
  helpers: HelperRegistry;
  config: EvaluatorConfig;
}

export interface HelperRegistry {
  [name: string]: HelperFunction;
}

export type HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => (...args: unknown[]) => unknown;

export interface HelperFunctionWithMetadata {
  fn: HelperFunction;
  metadata?: {
    op?: 'format' | 'aggregate' | 'calculated' | 'system';
    label?: string;
  };
}

export interface EvaluatorConfig {
  maxFunctionDepth: number;
  maxRecursionDepth: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Safely access a property on an object with implicit optional chaining.
 * Returns undefined if obj is null/undefined or doesn't have the property.
 */
function accessProperty(obj: unknown, key: string | number): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (typeof obj === 'object' || typeof obj === 'function') {
    return (obj as Record<string | number, unknown>)[key];
  }
  return undefined;
}

/**
 * Resolve the first segment of a path through the scope hierarchy.
 * For regular paths: locals → data
 * For global paths ($.prefix): globals only
 */
function resolveFirstSegment(
  name: string,
  isGlobal: boolean,
  scope: Scope
): unknown {
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

// =============================================================================
// Node Evaluators
// =============================================================================

/**
 * Evaluate a literal node - returns the value directly.
 */
function evaluateLiteral(node: LiteralNode): unknown {
  return node.value;
}

/**
 * Evaluate a path node - traverse through scope and properties.
 */
function evaluatePath(node: PathNode, context: EvaluationContext): unknown {
  const { segments, isGlobal } = node;
  if (segments.length === 0) {
    return undefined;
  }

  // First segment must be a key
  const firstSegment = segments[0]!;
  if (firstSegment.kind !== 'key') {
    return undefined;
  }

  let current = resolveFirstSegment(
    firstSegment.key,
    isGlobal,
    context.scope
  );

  // Traverse remaining segments
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.kind === 'key') {
      current = accessProperty(current, segment.key);
    } else if (segment.kind === 'index') {
      current = accessProperty(current, segment.index);
    } else if (segment.kind === 'star') {
      // Star segments are handled by evaluateWildcard
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a unary node - apply ! or - operator.
 */
function evaluateUnary(node: UnaryNode, context: EvaluationContext): unknown {
  const operand = evaluate(node.operand, context);
  switch (node.operator) {
    case '!':
      return !operand;
    case '-':
      return -(operand as number);
  }
}

/**
 * Evaluate a binary node - apply operator with type coercion.
 */
function evaluateBinary(node: BinaryNode, context: EvaluationContext): unknown {
  const { operator, left, right } = node;

  // Short-circuit evaluation for logical operators
  if (operator === '&&') {
    const leftVal = evaluate(left, context);
    if (!leftVal) return leftVal;
    return evaluate(right, context);
  }
  if (operator === '||') {
    const leftVal = evaluate(left, context);
    if (leftVal) return leftVal;
    return evaluate(right, context);
  }
  if (operator === '??') {
    const leftVal = evaluate(left, context);
    if (leftVal !== null && leftVal !== undefined) return leftVal;
    return evaluate(right, context);
  }

  // Evaluate both operands for non-short-circuit operators
  const leftVal = evaluate(left, context);
  const rightVal = evaluate(right, context);

  switch (operator) {
    // Arithmetic
    case '+':
      // String concatenation if either operand is string
      if (typeof leftVal === 'string' || typeof rightVal === 'string') {
        return String(leftVal) + String(rightVal);
      }
      return (leftVal as number) + (rightVal as number);
    case '-':
      return (leftVal as number) - (rightVal as number);
    case '*':
      return (leftVal as number) * (rightVal as number);
    case '/':
      return (leftVal as number) / (rightVal as number);
    case '%':
      return (leftVal as number) % (rightVal as number);

    // Comparison
    case '==':
      return leftVal == rightVal;
    case '!=':
      return leftVal != rightVal;
    case '<':
      return (leftVal as number) < (rightVal as number);
    case '>':
      return (leftVal as number) > (rightVal as number);
    case '<=':
      return (leftVal as number) <= (rightVal as number);
    case '>=':
      return (leftVal as number) >= (rightVal as number);

    default:
      return undefined;
  }
}

/**
 * Evaluate a ternary node - evaluate condition and return appropriate branch.
 */
function evaluateTernary(
  node: TernaryNode,
  context: EvaluationContext
): unknown {
  const condition = evaluate(node.condition, context);
  if (condition) {
    return evaluate(node.truthy, context);
  } else {
    return evaluate(node.falsy, context);
  }
}

/**
 * Evaluate a call node - curry helper with scope and invoke.
 */
function evaluateCall(node: CallNode, context: EvaluationContext): unknown {
  const helper = context.helpers[node.callee];
  if (!helper) {
    throw new EvaluationError(
      `Unknown helper function: ${node.callee}`,
      node.location,
      'UNKNOWN_HELPER'
    );
  }

  // Curry the helper with scope
  const warnings: string[] = [];
  const curriedFn = helper(context.scope, (msg) => warnings.push(msg));

  // Evaluate all arguments
  const args = node.args.map((arg) => evaluate(arg, context));

  // Invoke and return result
  return curriedFn(...args);
}

/**
 * Evaluate a wildcard node - expand path across array elements and flatten.
 */
function evaluateWildcard(
  node: ArrayWildcardNode,
  context: EvaluationContext
): unknown[] {
  const { path } = node;
  const { segments, isGlobal } = path;

  if (segments.length === 0) {
    return [];
  }

  // First segment must be a key
  const firstSegment = segments[0]!;
  if (firstSegment.kind !== 'key') {
    return [];
  }

  // Start with the first resolved value wrapped in array
  let current: unknown[] = [
    resolveFirstSegment(firstSegment.key, isGlobal, context.scope),
  ];

  // Process remaining segments
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;

    if (segment.kind === 'star') {
      // Flatten and expand: each array element becomes multiple results
      current = current.flatMap((item) =>
        Array.isArray(item) ? item : []
      );
    } else if (segment.kind === 'key') {
      // Map property access across all current values
      current = current.map((item) => accessProperty(item, segment.key));
    } else if (segment.kind === 'index') {
      // Map index access across all current values
      current = current.map((item) => accessProperty(item, segment.index));
    }
  }

  return current;
}

// =============================================================================
// Main Evaluate Function
// =============================================================================

/**
 * Evaluate an expression AST node and return the result.
 *
 * @param expr - The expression AST node to evaluate
 * @param context - The evaluation context (scope, helpers, config)
 * @returns The evaluated result
 * @throws EvaluationError if evaluation fails
 */
export function evaluate(expr: ExprAst, context: EvaluationContext): unknown {
  switch (expr.kind) {
    case 'literal':
      return evaluateLiteral(expr);
    case 'path':
      return evaluatePath(expr, context);
    case 'unary':
      return evaluateUnary(expr, context);
    case 'binary':
      return evaluateBinary(expr, context);
    case 'ternary':
      return evaluateTernary(expr, context);
    case 'call':
      return evaluateCall(expr, context);
    case 'wildcard':
      return evaluateWildcard(expr, context);
    default: {
      // Exhaustive check
      const _exhaustive: never = expr;
      throw new Error(`Unknown expression kind: ${(_exhaustive as ExprAst).kind}`);
    }
  }
}
