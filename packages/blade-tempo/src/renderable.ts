// @bladets/tempo - Core Renderable Creation
// Converts compiled Blade templates to Tempo Renderables

import type { CompiledTemplate, TemplateNode, Scope } from '@bladets/template';
import { compile } from '@bladets/template';
import type { Renderable, Signal } from '@tempots/dom';
import { Fragment } from '@tempots/dom';
import type {
  TempoRenderOptions,
  TempoRenderer,
  RenderContext,
  RenderConfig,
  ErrorHandler,
} from './types.js';
import { DEFAULT_RENDER_CONFIG } from './types.js';
import { defaultErrorHandler } from './evaluator.js';

// Node converters - will be implemented in Phase 3
import { convertTextNode } from './nodes/text.js';
import { convertElementNode } from './nodes/element.js';
import { convertIfNode } from './nodes/if.js';
import { convertForNode } from './nodes/for.js';
import { convertFragmentNode } from './nodes/fragment.js';
// Phase 4 converters
import { convertMatchNode } from './nodes/match.js';
import { convertLetNode } from './nodes/let.js';
import { convertComponentNode } from './nodes/component.js';
import { convertSlotNode } from './nodes/slot.js';
import { convertCommentNode } from './nodes/comment.js';

// =============================================================================
// Node Dispatcher
// =============================================================================

/**
 * Converts a Blade AST node to a Tempo Renderable.
 * Dispatches to the appropriate converter based on node kind.
 *
 * @param node - The Blade AST node to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export function convertNode(
  node: TemplateNode,
  ctx: RenderContext
): Renderable[] {
  switch (node.kind) {
    case 'text':
      return convertTextNode(node, ctx);
    case 'element':
      return convertElementNode(node, ctx);
    case 'if':
      return convertIfNode(node, ctx);
    case 'for':
      return convertForNode(node, ctx);
    case 'fragment':
      return convertFragmentNode(node, ctx);
    case 'match':
      return convertMatchNode(node, ctx);
    case 'let':
      return convertLetNode(node, ctx);
    case 'component':
      return convertComponentNode(node, ctx);
    case 'slot':
      return convertSlotNode(node, ctx);
    case 'comment':
      return convertCommentNode(node, ctx);
    case 'doctype':
      // DOCTYPE is not applicable in Tempo rendering (DOM-based)
      return [];
    default: {
      // Exhaustive check
      const _exhaustive: never = node;
      throw new Error(
        `Unknown node kind: ${(_exhaustive as TemplateNode).kind}`
      );
    }
  }
}

/**
 * Converts an array of Blade AST nodes to Tempo Renderables.
 *
 * @param nodes - Array of Blade AST nodes
 * @param ctx - The render context
 * @returns A Tempo Renderable containing all children
 */
export function convertChildren(
  nodes: readonly TemplateNode[],
  ctx: RenderContext
): Renderable[] {
  if (nodes.length === 0) {
    return [];
  }
  return nodes.flatMap(node => convertNode(node, ctx));
}

// =============================================================================
// Renderer Factory
// =============================================================================

/**
 * Creates a Tempo renderer from a compiled Blade template.
 *
 * The returned function accepts a data signal and produces a Renderable
 * that updates automatically when the signal changes.
 *
 * @typeParam T - The type of data the template expects
 * @param template - A compiled Blade template (from @bladets/template)
 * @param options - Optional configuration for rendering behavior
 * @returns A factory function that creates Renderables from data signals
 * @throws {Error} If the template has compilation errors
 *
 * @example
 * ```typescript
 * import { compile } from '@bladets/template';
 * import { createTempoRenderer } from '@bladets/tempo';
 * import { prop, render } from '@tempots/dom';
 *
 * const template = compile('<div>Hello, ${name}!</div>');
 * const renderer = createTempoRenderer(template);
 * const data = prop({ name: 'World' });
 * render(renderer(data), document.body);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTempoRenderer<T = any>(
  template: CompiledTemplate,
  options?: TempoRenderOptions
): TempoRenderer<T> {
  // Validate template
  if (template.diagnostics.some(d => d.level === 'error')) {
    throw new Error(
      `Template has compilation errors: ${template.diagnostics
        .filter(d => d.level === 'error')
        .map(d => d.message)
        .join(', ')}`
    );
  }

  // Build render config
  const config: RenderConfig = {
    includeSourceTracking:
      options?.includeSourceTracking ??
      DEFAULT_RENDER_CONFIG.includeSourceTracking,
    sourceTrackingPrefix:
      options?.sourceTrackingPrefix ??
      DEFAULT_RENDER_CONFIG.sourceTrackingPrefix,
    htmlEscape: DEFAULT_RENDER_CONFIG.htmlEscape,
  };

  // Error handler
  const onError: ErrorHandler = options?.onError ?? defaultErrorHandler;

  // Helpers and globals
  const helpers = options?.helpers ?? {};
  const globals = options?.globals ?? {};

  // Return the renderer factory function
  return (dataSignal: Signal<T>): Renderable => {
    // Create initial scope structure.
    // NOTE: scope.data is NOT used for reactive evaluation.
    // Reactivity is achieved through dataSignal.map() in node converters,
    // where the fresh data value is passed to evaluateSafe() which
    // creates a new scope with the current data.
    const scope: Scope = {
      locals: {},
      data: null, // Placeholder - actual data comes from signal in evaluateSafe
      globals,
    };

    // Create render context
    const ctx: RenderContext = {
      dataSignal,
      scope,
      helpers,
      config,
      components: new Map(template.root.components),
      slots: new Map(),
      onError,
    };

    // Convert template children to Renderables
    return Fragment(...convertChildren(template.root.children, ctx));
  };
}

// =============================================================================
// One-Step Compilation and Rendering
// =============================================================================

/**
 * Compiles a template source and returns a ready-to-use Tempo renderer.
 *
 * This is a convenience function that combines compile() and createTempoRenderer()
 * into a single async call.
 *
 * @typeParam T - The type of data the template expects
 * @param source - Template source string
 * @param options - Optional configuration for rendering behavior
 * @returns A factory function that creates Renderables from data signals
 *
 * @example
 * ```typescript
 * import { compileToRenderable } from '@bladets/tempo';
 * import { prop, render } from '@tempots/dom';
 *
 * const renderer = await compileToRenderable<{ name: string }>('<div>Hello, ${name}!</div>');
 * const data = prop({ name: 'World' });
 * render(renderer(data), document.body);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compileToRenderable<T = any>(
  source: string,
  options?: TempoRenderOptions
): TempoRenderer<T> {
  const template = compile(source);
  return createTempoRenderer<T>(template, options);
}
