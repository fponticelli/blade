// @bladets/tempo - ForNode Converter
// Converts Blade ForNode to Tempo ForEach iteration

import type { ForNode } from '@bladets/template';
import type { Renderable, Signal, ElementPosition } from '@tempots/dom';
import { ForEach, computedOf } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';
import { evaluateSafe } from '../evaluator.js';

/**
 * Converts a Blade ForNode to a Tempo Renderable.
 * Uses Tempo's ForEach for reactive list rendering.
 *
 * @param node - The ForNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertForNode(
  node: ForNode,
  ctx: RenderContext
): Renderable[] {
  // Create a signal for the items array
  const itemsSignal = ctx.dataSignal.map(data => {
    const items = evaluateSafe(
      node.itemsExpr,
      data,
      ctx.scope,
      ctx.helpers,
      ctx.onError
    );

    // Handle 'of' vs 'in' iteration
    if (node.iterationType === 'of') {
      // Iterate over values
      if (!Array.isArray(items)) {
        return [];
      }
      return items;
    } else {
      // Iterate over keys/indices ('in')
      if (items === null || items === undefined) {
        return [];
      }
      if (Array.isArray(items)) {
        return items.map((_, i) => i);
      }
      return Object.keys(items as object);
    }
  }) as Signal<unknown[]>;

  // Item renderer - creates a child context with loop variables
  const itemRenderer = (
    itemSignal: Signal<unknown>,
    position: ElementPosition
  ) => {
    // Create a combined signal that merges outer data with loop variables.
    // This makes loop variables reactive - when itemSignal changes, any
    // child expressions that depend on the loop variable will re-evaluate
    // (but NOT re-render the entire subtree).
    const loopDataSignal = computedOf(
      ctx.dataSignal,
      itemSignal
    )((outerData, item) => {
      // Inject loop variables into the data object
      const loopData = {
        ...(outerData as object),
        [node.itemVar]: item,
        ...(node.indexVar ? { [node.indexVar]: position.index } : {}),
      };
      return loopData;
    });

    // Create a derived context with the combined signal
    const itemCtx: RenderContext = {
      ...ctx,
      dataSignal: loopDataSignal as Signal<unknown>,
    };

    return convertChildren(node.body, itemCtx);
  };

  return [ForEach(itemsSignal, itemRenderer)];
}
