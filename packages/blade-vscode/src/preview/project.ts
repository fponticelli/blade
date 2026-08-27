/**
 * The preview's view of the Blade projects in the workspace.
 *
 * One {@link ProjectCompiler} per project root, so that a keystroke in the
 * entry file costs one compile rather than one per component. The preview used
 * to carry its own component discovery, its own PascalCase rule and its own
 * component-definition shape - a flat `readdirSync` that skipped directories,
 * so a namespaced `Components.Form.Input` compiled in a build and was invisible
 * in the preview, and a name derived by splitting on `-` alone, so
 * `my_widget.blade` was `My_widget` here and `MyWidget` to the compiler. The
 * preview and the build resolved different component names.
 */

import {
  createProjectCompiler,
  readProjectSources,
} from '@bladets/template/node';
import type { ProjectCompiler } from '@bladets/template/node';
import type { ProjectResult } from '@bladets/template';
import type { PreviewFileSystem } from './filesystem.js';
import { listSamples } from './samples.js';
import type { SampleListing } from './samples.js';

/** A project compile, or the reason there was nothing to compile. */
export type ProjectCompilation =
  | { readonly ok: true; readonly result: ProjectResult }
  | { readonly ok: false; readonly message: string };

/**
 * Compiles the workspace's Blade projects, keeping what it can between calls.
 */
export class PreviewWorkspace {
  private readonly compilers = new Map<string, ProjectCompiler>();
  /**
   * The last sample listing per project root.
   *
   * Samples are read and `JSON.parse`d to populate a dropdown and to feed one
   * render. That used to happen on `ready`, on every `sendSamplesList`, on the
   * no-selected-sample path and again on every refresh - so a project with
   * twenty sample payloads re-parsed all twenty several times per keystroke.
   * Dropped whenever anything on disk is invalidated, which is the only way a
   * sample can change while the panel is open.
   */
  private readonly samples = new Map<string, Promise<SampleListing>>();

  constructor(private readonly io: PreviewFileSystem) {}

  /**
   * The samples a project ships.
   *
   * @param projectRoot - The project root
   * @returns The listing, reused until something on disk is invalidated
   */
  public sampleListing(projectRoot: string): Promise<SampleListing> {
    const cached = this.samples.get(projectRoot);
    if (cached !== undefined) return cached;

    const pending = listSamples(projectRoot, this.io);
    this.samples.set(projectRoot, pending);
    return pending.catch((error: unknown) => {
      if (this.samples.get(projectRoot) === pending) {
        this.samples.delete(projectRoot);
      }
      throw error;
    });
  }

  /**
   * Compiles the project rooted at `projectRoot`.
   *
   * @param projectRoot - A directory containing the entry file
   * @returns The compilation, or why it could not be read
   */
  public async compile(projectRoot: string): Promise<ProjectCompilation> {
    let compiler = this.compilers.get(projectRoot);
    if (compiler === undefined) {
      compiler = createProjectCompiler();
      this.compilers.set(projectRoot, compiler);
    }

    try {
      const sources = await readProjectSources(projectRoot, { io: this.io });
      return { ok: true, result: compiler.compile(sources) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Forgets the bytes read from `path`, and every sample listing. */
  public invalidate(path: string): void {
    this.io.invalidate(path);
    this.samples.clear();
  }

  /** Forgets every cached read. Compiles are keyed by source, so they follow. */
  public clear(): void {
    this.io.clear();
    this.samples.clear();
  }

  /** The filesystem every project read goes through. */
  public get fileSystem(): PreviewFileSystem {
    return this.io;
  }
}
