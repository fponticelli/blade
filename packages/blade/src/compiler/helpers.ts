/**
 * Type guard helpers for working with AST nodes.
 *
 * These helpers provide type-safe narrowing for discriminated union types
 * in the Blade AST. They're useful both in tests and in the compiler implementation.
 */

import type {
  ExprAst,
  FunctionExpr,
  MatchExpressionCase,
} from '../ast/types.js';

// =============================================================================
// Text Segment Type Guards
// =============================================================================

/**
 * Type guard for literal text segments.
 *
 * @param segment - Segment to check
 * @returns True if segment is a literal text segment
 */
export function isLiteralSegment(segment: {
  kind: string;
}): segment is { kind: 'literal'; text: string } {
  return segment.kind === 'literal';
}

/**
 * Type guard for expression segments.
 *
 * @param segment - Segment to check
 * @returns True if segment is an expression segment
 */
export function isExprSegment(segment: {
  kind: string;
  expr?: unknown;
}): segment is { kind: 'expr'; expr: ExprAst } {
  return segment.kind === 'expr';
}

// =============================================================================
// Path Item Type Guards
// =============================================================================

/**
 * Type guard for key path items.
 *
 * @param item - Path item to check
 * @returns True if item is a key access (e.g., .foo)
 */
export function isKeyPathItem(item: {
  kind: string;
}): item is { kind: 'key'; key: string } {
  return item.kind === 'key';
}

/**
 * Type guard for index path items.
 *
 * @param item - Path item to check
 * @returns True if item is an index access (e.g., [0])
 */
export function isIndexPathItem(item: {
  kind: string;
}): item is { kind: 'index'; index: number } {
  return item.kind === 'index';
}

// =============================================================================
// Attribute Value Type Guards
// =============================================================================

/**
 * Type guard for static attribute values.
 *
 * @param segment - Attribute segment to check
 * @returns True if segment is a static string value
 */
export function isStaticAttrValue(segment: {
  kind: string;
}): segment is { kind: 'static'; value: string } {
  return segment.kind === 'static';
}

// =============================================================================
// Match Case Type Guards
// =============================================================================

/**
 * Type guard for literal match cases.
 *
 * @param matchCase - Match case to check
 * @returns True if case matches against literal values
 */
export function isLiteralMatchCase(matchCase: { kind: string }): matchCase is {
  kind: 'literal';
  values: readonly (string | number | boolean)[];
} {
  return matchCase.kind === 'literal';
}

/**
 * Type guard for expression match cases.
 *
 * @param matchCase - Match case to check
 * @returns True if case uses a boolean expression
 */
export function isExpressionMatchCase(matchCase: {
  kind: string;
}): matchCase is MatchExpressionCase {
  return matchCase.kind === 'expression';
}

// =============================================================================
// Expression Type Guards
// =============================================================================

/**
 * Type guard for function expressions.
 *
 * @param expr - Expression to check
 * @returns True if expression is an arrow function
 */
export function isFunctionExpr(expr: { kind: string }): expr is FunctionExpr {
  return expr.kind === 'function';
}
