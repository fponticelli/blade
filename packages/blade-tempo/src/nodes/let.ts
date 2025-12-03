// @bladets/tempo - LetNode Converter
// Converts Blade LetNode to local signal/computed creation

import type { LetNode, ExprAst, FunctionExpr, Scope } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { evaluateSafe } from '../evaluator.js';

/**
 * Converts a Blade LetNode to a Tempo Renderable.
 * Let nodes add variables to scope but don't render anything.
 *
 * @param node - The LetNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable (empty Fragment, but scope is modified)
 */
export function convertLetNode(
  node: LetNode,
  ctx: RenderContext
): Renderable[] {
  // Evaluate the value and add to scope
  // Note: This modifies the context scope for subsequent nodes

  if ('kind' in node.value && node.value.kind === 'function') {
    // Function expression - create a callable function
    const funcExpr = node.value as FunctionExpr;
    const fn = (...args: unknown[]) => {
      // Create scope with parameters
      let fnScope = ctx.scope;
      for (let i = 0; i < funcExpr.params.length; i++) {
        fnScope = addToScope(fnScope, funcExpr.params[i]!, args[i], false);
      }

      // Get current data value for evaluation
      const data = ctx.dataSignal.value;
      return evaluateSafe(
        funcExpr.body,
        data,
        fnScope,
        ctx.helpers,
        ctx.onError
      );
    };

    // Add function to scope
    if (node.isGlobal) {
      ctx.scope = addToScope(ctx.scope, node.name, fn, true);
    } else {
      ctx.scope = addToScope(ctx.scope, node.name, fn, false);
    }
  } else {
    // Regular expression - evaluate and add to scope
    // For reactive behavior, we'd need to create a computed signal
    // but for simplicity, we evaluate once at render time
    const value = evaluateSafe(
      node.value as ExprAst,
      ctx.dataSignal.value,
      ctx.scope,
      ctx.helpers,
      ctx.onError
    );

    if (node.isGlobal) {
      ctx.scope = addToScope(ctx.scope, node.name, value, true);
    } else {
      ctx.scope = addToScope(ctx.scope, node.name, value, false);
    }
  }

  // LetNodes don't render anything
  return [];
}

/**
 * Adds a variable to the scope.
 */
function addToScope(
  scope: Scope,
  name: string,
  value: unknown,
  isGlobal: boolean
): Scope {
  if (isGlobal) {
    return {
      locals: scope.locals,
      data: scope.data,
      globals: { ...scope.globals, [name]: value },
    };
  }
  return {
    locals: { ...scope.locals, [name]: value },
    data: scope.data,
    globals: scope.globals,
  };
}
