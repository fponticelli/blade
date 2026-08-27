// @bladets/tempo - Reactive rendering of a compiled Blade template
//
// This package used to contain a converter per node kind - eleven of them,
// re-implementing the scope rules, the loop and component and slot semantics
// and the escaping decisions that @bladets/template already implemented twice.
// It disagreed with both on eight observable points, and every one of them was
// a consequence of it being a separate traversal rather than a separate sink.
//
// It is now neither: `renderTo` walks the template, `SignalReactivity` decides
// when its decisions are re-made, and `TempoTarget` decides what its output
// looks like. There is one traversal for three renderers, so a fix to `@let`
// scoping or to the iteration ceiling is a fix in all three at once.

import type {
  CompiledTemplate,
  RenderOptions,
} from '@bladets/template/browser';
import { compileOrThrow, renderTo } from '@bladets/template/browser';
import type { Renderable, Signal } from '@tempots/dom';
import { Empty, WithScope } from '@tempots/dom';
import type {
  ErrorHandler,
  FailureDetail,
  SourceLocation,
  TempoRenderOptions,
  TempoRenderer,
} from './types.js';
import { Emitter } from './emitter.js';
import { SignalReactivity } from './reactivity.js';
import { TempoTarget } from './target.js';

/**
 * Default error handler that logs warnings to console.
 *
 * @param error - The error that occurred
 * @param location - Source location of the error
 */
export function defaultErrorHandler(
  error: Error,
  location: SourceLocation,
  detail?: FailureDetail
): void {
  const where = `line ${location.start.line}, column ${location.start.column}`;
  const times =
    detail === undefined || detail.occurrences === 1
      ? ''
      : ` (${detail.occurrences} times`.concat(
          detail.indices.length === 0
            ? ')'
            : `, first at ${detail.indices.join('.')})`
        );
  console.warn(`[blade-tempo] ${where}${times}:`, error.message);
}

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
  if (template.diagnostics.some(d => d.level === 'error')) {
    throw new Error(
      `Template has compilation errors: ${template.diagnostics
        .filter(d => d.level === 'error')
        .map(d => d.message)
        .join(', ')}`
    );
  }

  const onError: ErrorHandler = options?.onError ?? defaultErrorHandler;

  const base: RenderOptions = {
    helpers: options?.helpers,
    globals: options?.globals,
    limits: options?.limits,
    config: {
      includeComments: options?.includeComments ?? false,
      includeSourceTracking: options?.includeSourceTracking ?? false,
      sourceTrackingPrefix: options?.sourceTrackingPrefix ?? 'rd-',
      includeOperationTracking: options?.includeOperationTracking ?? false,
      includeNoteGeneration: options?.includeNoteGeneration ?? false,
      resolveLoopIndices: options?.resolveLoopIndices ?? false,
      helperSourceOps: options?.helperSourceOps,
      allowStyleInterpolation: options?.allowStyleInterpolation ?? false,
    },
  };

  return (data: Signal<T>): Renderable =>
    // Inside a disposal scope, so that every cell the traversal derives is
    // released when the tree it feeds is unmounted.
    WithScope(() => {
      const emitter = new Emitter();
      const reactivity = new SignalReactivity(
        emitter,
        onError,
        template.root.location
      );

      try {
        const { output, metadata } = renderTo(
          template,
          data,
          { ...base, reactivity },
          (budget, position) => new TempoTarget(emitter, budget, position)
        );
        // The engine appends what it substituted or refused to this list as it
        // goes, and an incremental render never stops going.
        reactivity.watchWarnings(metadata.warnings);
        return output;
      } catch (error) {
        // A failure while *building* the tree - a component that recurses past
        // the depth ceiling, an unknown component - has a caller, but that
        // caller is Tempo's renderer and it has no use for an exception. The
        // host hears about it through the same channel as every later failure.
        reactivity.fail(error);
        return Empty;
      }
    });
}

/**
 * Compiles a template source and returns a ready-to-use Tempo renderer.
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
 * const renderer = compileToRenderable<{ name: string }>('<div>Hello, ${name}!</div>');
 * const data = prop({ name: 'World' });
 * render(renderer(data), document.body);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compileToRenderable<T = any>(
  source: string,
  options?: TempoRenderOptions
): TempoRenderer<T> {
  return createTempoRenderer<T>(compileOrThrow(source), options);
}
