// @bladets/tempo - ComponentNode Converter
// Converts Blade ComponentNode to nested Renderable with isolated scope

import type { ComponentNode, Scope } from '@bladets/template';
import type { Renderable } from '@tempots/dom';
import type { RenderContext } from '../types.js';
import { convertChildren } from '../renderable.js';
import { evaluateSafe } from '../evaluator.js';

/**
 * Converts a Blade ComponentNode to a Tempo Renderable.
 * Components have isolated scope - only props and globals are accessible.
 *
 * @param node - The ComponentNode to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertComponentNode(
  node: ComponentNode,
  ctx: RenderContext
): Renderable[] {
  // Look up component definition
  const definition = ctx.components.get(node.name);
  if (!definition) {
    ctx.onError(new Error(`Unknown component: ${node.name}`), node.location);
    return [];
  }

  // Evaluate props in caller's scope
  const props: Record<string, unknown> = {};
  for (const prop of node.props) {
    props[prop.name] = evaluateSafe(
      prop.value,
      ctx.dataSignal.value,
      ctx.scope,
      ctx.helpers,
      ctx.onError
    );
  }

  // Apply default values from component definition
  for (const propDef of definition.props) {
    if (!(propDef.name in props) && propDef.defaultValue !== undefined) {
      if (typeof propDef.defaultValue === 'string') {
        props[propDef.name] = propDef.defaultValue;
      } else {
        props[propDef.name] = evaluateSafe(
          propDef.defaultValue,
          ctx.dataSignal.value,
          ctx.scope,
          ctx.helpers,
          ctx.onError
        );
      }
    }
  }

  // Create isolated component scope (only props and globals)
  const componentScope: Scope = {
    locals: {},
    data: props,
    globals: ctx.scope.globals,
  };

  // Store slot content from caller
  const slots = new Map(ctx.slots);
  slots.set('default', node.children);

  // Create component context with isolated scope
  const componentCtx: RenderContext = {
    ...ctx,
    scope: componentScope,
    slots,
  };

  // Render component body
  return convertChildren(definition.body, componentCtx);
}
