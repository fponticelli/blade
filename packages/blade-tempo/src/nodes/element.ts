// @bladets/tempo - ElementNode Converter
// Converts Blade ElementNode to Tempo html.* elements

import type { ElementNode, AttributeNode } from '@bladets/template';
import { escapeHtml } from '@bladets/template';
import type { Renderable, Signal } from '@tempots/dom';
import { html, Attr, El } from '@tempots/dom';
import type { RenderContext, RenderConfig } from '../types.js';
import { convertChildren } from '../renderable.js';
import { evaluateSafe, valueToString } from '../evaluator.js';

/**
 * Converts a Blade ElementNode to a Tempo Renderable.
 *
 * @param node - The ElementNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertElementNode(
  node: ElementNode,
  ctx: RenderContext
): Renderable[] {
  // Get the element factory from Tempo's html object
  const tagName = node.tag.toLowerCase();
  const elementFn = (html as Record<string, unknown>)[tagName];

  // Convert attributes
  const attributes = convertAttributes(node.attributes, ctx);

  // Add source tracking attributes if enabled
  if (ctx.config.includeSourceTracking) {
    const sourceAttrs = createSourceTrackingAttributes(node, ctx.config);
    attributes.push(...sourceAttrs);
  }

  // Convert children
  const children = convertChildren(node.children, ctx);

  if (typeof elementFn !== 'function') {
    // Fallback for custom elements or unknown tags - use El for dynamic tag
    return [El(node.tag, ...attributes, children)];
  }

  // Create element with attributes and children
  return [
    (elementFn as (...args: Renderable[]) => Renderable)(
      ...attributes,
      ...children
    ),
  ];
}

/**
 * Converts Blade attributes to Tempo attribute renderables.
 */
function convertAttributes(
  attributes: readonly AttributeNode[],
  ctx: RenderContext
): Renderable[] {
  const result: Renderable[] = [];

  for (const attrNode of attributes) {
    const converted = convertAttribute(attrNode, ctx);
    if (converted !== null) {
      result.push(...converted);
    }
  }

  return result;
}

/**
 * Converts a single attribute node to a Tempo renderable.
 */
function convertAttribute(
  attrNode: AttributeNode,
  ctx: RenderContext
): Renderable[] {
  const name = attrNode.name;

  // Handle event handlers (on:click, etc.)
  if (name.startsWith('on:')) {
    // Event handlers would need special handling
    // For now, skip them (not supported in initial implementation)
    console.warn(`Event handlers not yet supported: ${name}`);
    return [];
  }

  if (attrNode.kind === 'static') {
    // Static attribute - just set the value
    return [Attr(name, attrNode.value)];
  }

  if (attrNode.kind === 'expr') {
    // Expression attribute - reactive
    const valueSignal = ctx.dataSignal.map(data => {
      const value = evaluateSafe(
        attrNode.expr,
        data,
        ctx.scope,
        ctx.helpers,
        ctx.onError
      );

      // Boolean attribute handling
      if (typeof value === 'boolean') {
        return value ? '' : null; // true = present with no value, false = remove
      }

      // Null/undefined = remove attribute
      if (value === null || value === undefined) {
        return null;
      }

      return escapeHtml(valueToString(value));
    });

    return [Attr(name, valueSignal as Signal<string | null>)];
  }

  // Mixed attribute (static + expressions)
  const valueSignal = ctx.dataSignal.map(data => {
    const parts: string[] = [];
    for (const segment of attrNode.segments) {
      if (segment.kind === 'static') {
        parts.push(segment.value);
      } else {
        const value = evaluateSafe(
          segment.expr,
          data,
          ctx.scope,
          ctx.helpers,
          ctx.onError
        );
        parts.push(valueToString(value));
      }
    }
    return escapeHtml(parts.join(''));
  });

  return [Attr(name, valueSignal)];
}

/**
 * Creates source tracking attributes for an element.
 */
function createSourceTrackingAttributes(
  node: ElementNode,
  config: RenderConfig
): Renderable[] {
  const prefix = config.sourceTrackingPrefix;
  const loc = node.location;

  return [
    Attr(
      `${prefix}source`,
      `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`
    ),
  ];
}
