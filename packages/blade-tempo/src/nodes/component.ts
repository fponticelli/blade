// @bladets/tempo - ComponentNode Converter
// Converts Blade ComponentNode to nested Renderable with isolated scope

import type { ComponentNode, Scope } from '@bladets/template/browser';
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

  // Create a reactive signal for the component props
  const propsSignal = ctx.dataSignal.map(data => {
    const props: Record<string, unknown> = {};

    // Evaluate props in caller's scope
    for (const prop of node.props) {
      props[prop.name] = evaluateSafe(
        prop.value,
        data,
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
            data,
            ctx.scope,
            ctx.helpers,
            ctx.onError
          );
        }
      }
    }

    return props;
  });

  // Create isolated component scope (only props and globals)
  // Note: scope.data is overridden by the signal value in evaluateSafe,
  // but we provide an empty object here for structure.
  const componentScope: Scope = {
    locals: {},
    data: {},
    globals: ctx.scope.globals,
  };

  // Store slot content from caller
  const slots = new Map(ctx.slots);
  slots.set('default', node.children);

  // Create component context with isolated scope and props signal
  const componentCtx: RenderContext = {
    ...ctx,
    dataSignal: propsSignal,
    scope: componentScope,
    slots,
  };

  // Render component body
  return convertChildren(definition.body, componentCtx);
}
