// @bladets/tempo - Blade template integration for @tempots/dom
// Reactive rendering of Blade templates with Tempo signals

// Main API
export {
  createTempoRenderer,
  compileToRenderable,
  defaultErrorHandler,
} from './renderable.js';

// The two halves of the engine's render seam this package implements, for a
// host that wants to drive the shared traversal itself.
export { SignalReactivity } from './reactivity.js';
export { TempoTarget } from './target.js';
export { Emitter } from './emitter.js';

// Public types
export type {
  ErrorHandler,
  FailureDetail,
  TempoRenderOptions,
  TempoRenderer,
} from './types.js';

// Re-exports for convenience
export type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
  ResourceLimits,
} from './types.js';

export type { Renderable, Signal, Prop } from './types.js';

// Re-export commonly used items from @bladets/template
// so users don't need to import from both packages
export {
  compile,
  standardLibrary,
  DEFAULT_RESOURCE_LIMITS,
} from '@bladets/template/browser';
export type { CompileOptions, RenderOptions } from '@bladets/template/browser';
