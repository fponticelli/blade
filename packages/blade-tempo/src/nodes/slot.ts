// @bladets/tempo - SlotNode Converter
// Converts Blade SlotNode to content projection

import type { SlotNode } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';

/**
 * Converts a Blade SlotNode to a Tempo Renderable.
 * Renders the slot content provided by the parent component,
 * or fallback content if no slot content was provided.
 *
 * @param node - The SlotNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertSlotNode(
  node: SlotNode,
  ctx: RenderContext
): Renderable[] {
  const slotName = node.name ?? 'default';
  const slotContent = ctx.slots.get(slotName);

  if (slotContent && slotContent.length > 0) {
    // Render caller's slot content
    return convertChildren(slotContent, ctx);
  }

  // Render fallback content if present
  if (node.fallback) {
    return convertChildren(node.fallback, ctx);
  }

  return [];
}
