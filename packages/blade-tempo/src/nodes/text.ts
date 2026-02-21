// @bladets/tempo - TextNode Converter
// Converts Blade TextNode to Tempo text/interpolation

import type { TextNode as BladeTextNode } from '@bladets/template/browser';
import { escapeHtml } from '@bladets/template/browser';
import type { Renderable, Signal } from '@tempots/dom';
import { TextNode, html, attr } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { evaluateSafe, valueToString } from '../evaluator.js';

/**
 * Converts a Blade TextNode to a Tempo Renderable.
 * Handles both literal text and expression interpolations.
 *
 * @param node - The TextNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertTextNode(
  node: BladeTextNode,
  ctx: RenderContext
): Renderable[] {
  // If all segments are literal, return static text
  if (node.segments.every(seg => seg.kind === 'literal')) {
    const text = node.segments
      .map(seg => (seg.kind === 'literal' ? seg.text : ''))
      .join('');
    return [TextNode(text)];
  }

  // Check if any segment is unsafe (raw HTML)
  const hasUnsafe = node.segments.some(
    seg => seg.kind === 'expr' && seg.unsafe
  );

  // If no unsafe segments, use the existing combined-signal approach
  if (!hasUnsafe) {
    return convertSafeTextNode(node, ctx);
  }

  // Has unsafe segments — emit each segment as a separate Renderable
  const renderables: Renderable[] = [];

  for (const segment of node.segments) {
    if (segment.kind === 'literal') {
      renderables.push(TextNode(segment.text));
    } else if (segment.unsafe) {
      // Unsafe expression — use innerHTML on a span for raw HTML rendering
      const htmlSignal = ctx.dataSignal.map(data => {
        const value = evaluateSafe(
          segment.expr,
          data,
          ctx.scope,
          ctx.helpers,
          ctx.onError
        );
        return valueToString(value);
      });
      renderables.push(html.span(attr.innerHTML(htmlSignal)));
    } else {
      // Safe expression — use TextNode with escaping
      const exprSignal = ctx.dataSignal.map(data => {
        const value = evaluateSafe(
          segment.expr,
          data,
          ctx.scope,
          ctx.helpers,
          ctx.onError
        );
        const str = valueToString(value);
        return ctx.config.htmlEscape ? escapeHtml(str) : str;
      });
      renderables.push(TextNode(exprSignal));
    }
  }

  return renderables;
}

/**
 * Converts a text node with only safe (escaped) segments.
 * Uses a combined signal approach for efficiency.
 */
function convertSafeTextNode(
  node: BladeTextNode,
  ctx: RenderContext
): Renderable[] {
  const parts: (string | Signal<string>)[] = [];

  for (const segment of node.segments) {
    if (segment.kind === 'literal') {
      parts.push(segment.text);
    } else {
      // Expression segment - map signal to evaluated value
      const exprSignal = ctx.dataSignal.map(data => {
        const value = evaluateSafe(
          segment.expr,
          data,
          ctx.scope,
          ctx.helpers,
          ctx.onError
        );
        const str = valueToString(value);
        // HTML escape expression outputs by default
        return ctx.config.htmlEscape ? escapeHtml(str) : str;
      });
      parts.push(exprSignal);
    }
  }

  // Combine parts into a single text renderable
  // For mixed content, we need to use Tempo's signal-aware text
  if (parts.length === 1) {
    const part = parts[0]!;
    if (typeof part === 'string') {
      return [TextNode(part)];
    }
    // Single signal - use Text with signal
    return [TextNode(part)];
  }

  // Multiple parts - combine signals
  // Create a derived signal that concatenates all parts
  const combinedSignal = ctx.dataSignal.map(() => {
    return parts
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        return part.value;
      })
      .join('');
  });

  return [TextNode(combinedSignal)];
}
