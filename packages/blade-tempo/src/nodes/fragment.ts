// @bladets/tempo - FragmentNode Converter
// Converts Blade FragmentNode to Tempo Fragment

import type { FragmentNode } from '@bladets/template';
import { type Renderable } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';

/**
 * Converts a Blade FragmentNode to a Tempo Renderable.
 * Uses Tempo's Fragment to group children without a wrapper element.
 *
 * @param node - The FragmentNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertFragmentNode(
  node: FragmentNode,
  ctx: RenderContext
): Renderable[] {
  return convertChildren(node.children, ctx);
}
