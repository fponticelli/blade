// @bladets/tempo - MatchNode Converter
// Converts Blade MatchNode to Tempo conditional rendering

import type { MatchNode, Scope } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import { When } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';
import { evaluateSafe } from '../evaluator.js';

/**
 * Converts a Blade MatchNode to a Tempo Renderable.
 * Uses nested When calls to implement pattern matching.
 *
 * @param node - The MatchNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertMatchNode(
  node: MatchNode,
  ctx: RenderContext
): Renderable[] {
  // Build nested When calls for match cases
  return buildMatchChain(node, ctx, 0);
}

/**
 * Recursively builds a chain of When conditionals for match cases.
 */
function buildMatchChain(
  node: MatchNode,
  ctx: RenderContext,
  caseIndex: number
): Renderable[] {
  // If we've exhausted all cases, render default or empty
  if (caseIndex >= node.cases.length) {
    if (node.defaultCase) {
      return convertChildren(node.defaultCase, ctx);
    }
    return [];
  }

  const matchCase = node.cases[caseIndex]!;

  // Create condition signal based on case type
  const conditionSignal = ctx.dataSignal.map(data => {
    // First, evaluate the match value
    const matchValue = evaluateSafe(
      node.value,
      data,
      ctx.scope,
      ctx.helpers,
      ctx.onError
    );

    if (matchCase.kind === 'literal') {
      // Check if value matches any of the literals
      return matchCase.values.includes(matchValue as string | number | boolean);
    } else {
      // Expression case - bind _ to the value and evaluate condition
      const matchScope: Scope = {
        locals: { ...ctx.scope.locals, _: matchValue },
        data: ctx.scope.data,
        globals: ctx.scope.globals,
      };

      const conditionResult = evaluateSafe(
        matchCase.condition,
        data,
        matchScope,
        ctx.helpers,
        ctx.onError
      );

      return Boolean(conditionResult);
    }
  });

  // Create context for the case body (with _ bound for expression cases)
  const caseCtx: RenderContext = {
    ...ctx,
    scope:
      matchCase.kind === 'expression'
        ? {
            locals: { ...ctx.scope.locals, _: null }, // Will be updated reactively
            data: ctx.scope.data,
            globals: ctx.scope.globals,
          }
        : ctx.scope,
  };

  // Create the "then" renderable
  const thenRenderable = () => convertChildren(matchCase.body, caseCtx);

  // Create the "else" renderable (next case or default)
  const elseRenderable = () => buildMatchChain(node, ctx, caseIndex + 1);

  return [When(conditionSignal, thenRenderable, elseRenderable)];
}
