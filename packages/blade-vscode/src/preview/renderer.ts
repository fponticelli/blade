/**
 * Rendering a compiled project for the preview.
 *
 * What is left after the preview stopped carrying its own copy of the project
 * layer: hand the merged template the engine produced to the string renderer,
 * and report what came back. Discovery, namespacing, component resolution,
 * transitive validation, prop checking and schema validation all happen in
 * `compileProject`, once, in the code the build uses.
 */

import { createStringRenderer, standardLibrary } from '@bladets/template';
import type {
  Diagnostic,
  ProjectResult,
  SourceLocation,
} from '@bladets/template';

/** What one render produced. */
export interface PreviewRender {
  /** The rendered markup, or null when nothing could be rendered. */
  readonly html: string | null;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly renderTime: number;
}

const ORIGIN: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

/**
 * Renders a compiled project with one sample's data.
 *
 * @param project - What `compileProject` returned
 * @param data - The sample data to render with
 * @returns The markup, or the diagnostics that stopped it
 */
export function renderProject(
  project: ProjectResult,
  data: unknown
): PreviewRender {
  const startTime = Date.now();

  if (project.template === null) {
    return {
      html: null,
      // A project with a null template always carries at least one error; the
      // fallback exists so a future change to that invariant is visible rather
      // than silent.
      errors:
        project.errors.length > 0
          ? project.errors
          : [
              {
                level: 'error',
                message: 'The project produced no renderable template.',
                location: ORIGIN,
                code: 'NO_TEMPLATE',
              },
            ],
      warnings: project.warnings,
      renderTime: Date.now() - startTime,
    };
  }

  try {
    const render = createStringRenderer(project.template);
    const result = render(data, { helpers: standardLibrary });

    return {
      html: result.html,
      errors: [],
      warnings: [
        ...project.warnings,
        ...result.metadata.warnings.map(
          (warning): Diagnostic => ({
            level: 'warning',
            message: warning.helper
              ? `${warning.helper}: ${warning.message}`
              : warning.message,
            location: warning.location,
            code: 'RENDER_WARNING',
          })
        ),
      ],
      renderTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      html: null,
      errors: [
        {
          level: 'error',
          message: error instanceof Error ? error.message : String(error),
          location: ORIGIN,
          code: 'RENDER_FAILED',
        },
      ],
      warnings: project.warnings,
      renderTime: Date.now() - startTime,
    };
  }
}
