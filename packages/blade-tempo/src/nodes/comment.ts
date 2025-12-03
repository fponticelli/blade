// @bladets/tempo - CommentNode Converter
// Handles Blade CommentNode (skip or render based on config)

import type { CommentNode } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import type { RenderContext } from '../types.js';

/**
 * Converts a Blade CommentNode to a Tempo Renderable.
 * Comments are typically skipped in DOM rendering.
 *
 * @param node - The CommentNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable (empty Fragment - comments not rendered to DOM)
 */
export function convertCommentNode(
  _node: CommentNode,
  _ctx: RenderContext
): Renderable[] {
  // Comments are not rendered in Tempo's DOM model
  // Unlike string rendering where we might include HTML comments,
  // DOM-based rendering skips comments
  return [];
}
