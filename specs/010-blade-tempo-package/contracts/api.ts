/**
 * @bladets/tempo API Contract
 *
 * This file defines the public API surface of the @bladets/tempo package.
 * Implementation must conform to these type signatures.
 */

import type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
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
 *
 * @example
 * ```typescript
 * const renderer = createTempoRenderer<UserData>(compiledTemplate);
 * const data = prop({ name: 'Alice', age: 30 });
 * render(renderer(data), document.body);
 * ```
 */
export type TempoRenderer<T = unknown> = (data: Signal<T>) => Renderable;

// =============================================================================
// Public Functions
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
 *
 * @throws {Error} If the template has compilation errors
 *
 * @example
 * ```typescript
 * import { compile } from '@bladets/template';
 * import { createTempoRenderer } from '@bladets/tempo';
 * import { prop, render } from '@tempots/dom';
 *
 * // 1. Compile the template
 * const template = compile('<div>Hello, ${name}!</div>');
 *
 * // 2. Create the renderer
 * const renderer = createTempoRenderer(template);
 *
 * // 3. Create reactive data
 * const data = prop({ name: 'World' });
 *
 * // 4. Render to DOM
 * render(renderer(data), document.body);
 *
 * // 5. Update data - DOM updates automatically!
 * data.value = { name: 'Tempo' };
 * ```
 */
export declare function createTempoRenderer<T = unknown>(
  template: CompiledTemplate,
  options?: TempoRenderOptions
): TempoRenderer<T>;

// =============================================================================
// Re-exports for Convenience
// =============================================================================

/**
 * Re-export key types from dependencies for convenience.
 * Users don't need to import from multiple packages for basic usage.
 */
export type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
} from '@bladets/template';
export type { Renderable, Signal, Prop } from '@tempots/dom';
