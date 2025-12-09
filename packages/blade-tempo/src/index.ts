// @bladets/tempo - Blade template integration for @tempots/dom
// Reactive rendering of Blade templates with Tempo signals

// Main API
export { createTempoRenderer, compileToRenderable } from './renderable.js';

// Public types
export type { TempoRenderOptions, TempoRenderer } from './types.js';

// Re-exports for convenience
export type {
  CompiledTemplate,
  SourceLocation,
  HelperRegistry,
} from './types.js';

export type { Renderable, Signal, Prop } from './types.js';

// Re-export commonly used items from @bladets/template
// so users don't need to import from both packages
export { compile, standardLibrary } from '@bladets/template';
export type { CompileOptions, RenderOptions } from '@bladets/template';
