// @bladets/tempo - Type definitions
// Public and internal types for Tempo rendering

import type {
  SourceLocation,
  HelperRegistry,
  TemplateNode,
  ComponentDefinition,
  Scope,
} from '@bladets/template';
import type { Renderable, Signal } from '@tempots/dom';

// =============================================================================
// Public Types
// =============================================================================

/**
 * Configuration options for creating a Tempo renderer.
 */
export interface TempoRenderOptions {
  /**
   * Custom helper functions available in template expressions.
   * @example { formatCurrency: (n: number) => `$${n.toFixed(2)}` }
   */
  helpers?: HelperRegistry;

  /**
   * Global variables accessible via $.name syntax in templates.
   * @example { siteName: 'My App', version: '1.0.0' }
   */
  globals?: Record<string, unknown>;

  /**
   * Enable source tracking attributes (rd-source, rd-source-op, rd-source-note).
   * Useful for debugging and audit trails.
   * @default false
   */
  includeSourceTracking?: boolean;

  /**
   * Prefix for source tracking attributes.
   * @default 'rd-'
   */
  sourceTrackingPrefix?: string;

  /**
   * Callback invoked when a runtime expression error occurs.
   * By default, logs a warning to the console.
   * The error is swallowed and the expression renders as empty string.
   */
  onError?: (error: Error, location: SourceLocation) => void;
}

/**
 * A factory function that creates a Tempo Renderable from a data signal.
 *
 * @typeParam T - The type of data the template expects
 * @param data - A Tempo signal containing the template data
 * @returns A Renderable that can be mounted to the DOM
 */
export type TempoRenderer<T = unknown> = (data: Signal<T>) => Renderable;

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Error handler function type.
 */
export type ErrorHandler = (error: Error, location: SourceLocation) => void;

/**
 * Internal rendering context passed through node converters.
 * Contains all state needed to convert Blade nodes to Tempo Renderables.
 */
export interface RenderContext {
  /** The reactive data signal */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataSignal: Signal<any>;

  /** Current variable scope (locals + data + globals) */
  scope: Scope;

  /** Registered helper functions */
  helpers: HelperRegistry;

  /** Render configuration */
  config: RenderConfig;

  /** Available component definitions from the template */
  components: Map<string, ComponentDefinition>;

  /** Slot content from parent component */
  slots: Map<string, readonly TemplateNode[]>;

  /** Error handler callback */
  onError: ErrorHandler;
}

/**
 * Render configuration.
 */
export interface RenderConfig {
  /** Include source tracking attributes */
  includeSourceTracking: boolean;

  /** Prefix for source tracking attributes */
  sourceTrackingPrefix: string;

  /** Whether to escape HTML in expressions */
  htmlEscape: boolean;
}

/**
 * Default render configuration.
 */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  includeSourceTracking: false,
  sourceTrackingPrefix: 'rd-',
  htmlEscape: true,
};

/**
 * Node converter function signature.
 * Converts a Blade AST node to a Tempo Renderable.
 *
 * @typeParam T - The specific TemplateNode type
 * @param node - The Blade AST node to convert
 * @param ctx - The render context
 * @returns A Tempo Renderable
 */
export type NodeConverter<T extends TemplateNode> = (
  node: T,
  ctx: RenderContext
) => Renderable;

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
  TemplateNode,
  Scope,
} from '@bladets/template';
export type { Renderable, Signal, Prop } from '@tempots/dom';
