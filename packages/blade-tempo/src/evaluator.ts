// @bladets/tempo - Reactive Expression Evaluator
// Wraps Blade's evaluate() with signal reactivity

import type {
  ExprAst,
  SourceLocation,
  Scope,
  HelperRegistry,
} from '@bladets/template';
import { evaluate } from '@bladets/template';
import type { Signal } from '@tempots/dom';
import type { RenderContext, ErrorHandler } from './types.js';

// =============================================================================
// Evaluator Configuration
// =============================================================================

/**
 * Default evaluator configuration matching Blade's defaults.
 */
const DEFAULT_EVALUATOR_CONFIG = {
  maxFunctionDepth: 10,
  maxRecursionDepth: 50,
};

// =============================================================================
// Reactive Evaluation
// =============================================================================

/**
 * Evaluates an expression reactively by mapping over a data signal.
 * Returns a Signal that updates whenever the data signal changes.
 *
 * @param expr - The expression AST to evaluate
 * @param dataSignal - The reactive data signal
 * @param scope - Current scope (locals + globals)
 * @param helpers - Helper function registry
 * @param onError - Error handler callback
 * @returns A Signal containing the evaluated result
 */
export function evaluateReactive(
  expr: ExprAst,
  dataSignal: Signal<unknown>,
  scope: Scope,
  helpers: Record<string, unknown>,
  onError: ErrorHandler
): Signal<unknown> {
  return dataSignal.map(data => {
    return evaluateSafe(expr, data, scope, helpers, onError);
  });
}

/**
 * Evaluates an expression with error handling.
 * On error, logs a warning and returns empty string.
 *
 * @param expr - The expression AST to evaluate
 * @param data - Current data value
 * @param scope - Current scope
 * @param helpers - Helper function registry
 * @param onError - Error handler callback
 * @returns The evaluated result, or empty string on error
 */
export function evaluateSafe(
  expr: ExprAst,
  data: unknown,
  scope: Scope,
  helpers: Record<string, unknown>,
  onError: ErrorHandler
): unknown {
  try {
    // Create evaluation context with current data
    const evalScope: Scope = {
      locals: scope.locals,
      data: data,
      globals: scope.globals,
    };

    const context = {
      scope: evalScope,
      helpers: helpers as HelperRegistry,
      config: DEFAULT_EVALUATOR_CONFIG,
    };

    return evaluate(expr, context);
  } catch (error) {
    // Call error handler (default: console.warn)
    onError(
      error instanceof Error ? error : new Error(String(error)),
      expr.location
    );
    // Return empty string on error (resilience)
    return '';
  }
}

/**
 * Evaluates an expression synchronously (non-reactive).
 * Used for immediate evaluation within a signal.map() callback.
 *
 * @param expr - The expression AST to evaluate
 * @param ctx - The render context
 * @returns The evaluated result
 */
export function evaluateSync(expr: ExprAst, ctx: RenderContext): unknown {
  // For synchronous evaluation, we get the current value from the signal
  // This is called inside .map() callbacks where we already have the data
  const context = {
    scope: ctx.scope,
    helpers: ctx.helpers,
    config: DEFAULT_EVALUATOR_CONFIG,
  };

  try {
    return evaluate(expr, context);
  } catch (error) {
    ctx.onError(
      error instanceof Error ? error : new Error(String(error)),
      expr.location
    );
    return '';
  }
}

/**
 * Default error handler that logs warnings to console.
 *
 * @param error - The error that occurred
 * @param location - Source location of the error
 */
export function defaultErrorHandler(
  error: Error,
  location: SourceLocation
): void {
  console.warn(
    `[blade-tempo] Expression error at line ${location.start.line}, column ${location.start.column}:`,
    error.message
  );
}

/**
 * Converts a value to string for text output.
 * Null and undefined render as empty string.
 *
 * @param value - The value to convert
 * @returns String representation
 */
export function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
