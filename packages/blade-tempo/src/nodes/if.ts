// @bladets/tempo - IfNode Converter
// Converts Blade IfNode to Tempo When conditional rendering

import type { IfNode } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import { When } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';
import { evaluateSafe } from '../evaluator.js';

/**
 * Converts a Blade IfNode to a Tempo Renderable.
 * Uses Tempo's When for conditional rendering.
 *
 * @param node - The IfNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertIfNode(node: IfNode, ctx: RenderContext): Renderable[] {
  // Build nested When calls for if/else-if/else chain
  return buildConditionalChain(node, ctx, 0);
}

/**
 * Recursively builds a chain of When conditionals.
 */
function buildConditionalChain(
  node: IfNode,
  ctx: RenderContext,
  branchIndex: number
): Renderable[] {
  // If we've exhausted all branches, render else or empty
  if (branchIndex >= node.branches.length) {
    if (node.elseBranch) {
      return convertChildren(node.elseBranch, ctx);
    }
    return [];
  }

  const branch = node.branches[branchIndex]!;

  // Create a signal for the condition
  const conditionSignal = ctx.dataSignal.map(data => {
    const result = evaluateSafe(
      branch.condition,
      data,
      ctx.scope,
      ctx.helpers,
      ctx.onError
    );
    return Boolean(result);
  });

  // Create the "then" renderable
  const thenRenderable = () => convertChildren(branch.body, ctx);

  // Create the "else" renderable (next branch or else block)
  const elseRenderable = () =>
    buildConditionalChain(node, ctx, branchIndex + 1);

  // Use Tempo's When for conditional rendering
  return [When(conditionSignal, thenRenderable, elseRenderable)];
}
