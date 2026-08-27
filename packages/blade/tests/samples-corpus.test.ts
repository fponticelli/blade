/**
 * @vitest-environment jsdom
 *
 * The shipped sample projects are part of the test suite.
 *
 * They are the only end-to-end evidence that the language as documented is the
 * language the compiler accepts, and they rotted: twelve of the thirteen files
 * under `samples/` failed to compile with "Unknown directive: @props", because
 * `@props` was handled by a preprocessor that `compile()` never ran. An entire
 * spec-plan-implement cycle had been spent making ONE of them parse, without a
 * regression test - so it broke again, and took the other twelve with it.
 *
 * This file is that regression test, and it goes further than compiling:
 * a template that parses and renders nothing useful is not a working sample.
 * Every project is compiled AS A PROJECT - sibling components resolved off
 * disk, exactly as a host would - and then rendered with every payload the
 * project ships, through both of this package's sinks. The markup is
 * snapshotted, so a change to any of it has to be looked at and accepted; and
 * the two sinks are compared against each other, so a divergence between them
 * fails here as well as in the conformance corpus.
 *
 * `@bladets/tempo`'s suite walks the same projects and payloads and holds the
 * reactive renderer to the same output.
 */

import { describe, expect, it } from 'vitest';
import {
  SAMPLE_GLOBALS,
  asDocument,
  loadSampleProjects,
  serializeNodes,
} from '@bladets/corpus';
import type { SampleProject } from '@bladets/corpus';
import { compile } from '../src/compiler/index.js';
import { compileProject } from '../src/project/compile.js';
import { standardLibrary } from '../src/helpers/index.js';
import { parseTemplate } from '../src/parser/index.js';
import {
  createDomRenderer,
  createStringRenderer,
} from '../src/renderer/index.js';
import type { ComponentRegistry } from '../src/validation/index.js';
import { diagnosticsOf } from './support/render-ok.js';

const projects: SampleProject[] = loadSampleProjects();

const allTemplates = projects.flatMap(project => project.templates);

/**
 * The components a sample's siblings define, as the compiler wants them.
 *
 * Used only for the per-file checks below: a component file compiled on its own
 * still calls its siblings, and reporting each of those as unknown would say
 * nothing about the sample. Rendering goes through `compileProject`, which
 * resolves them properly.
 */
function siblingComponents(project: SampleProject): ComponentRegistry {
  const registry: ComponentRegistry = {};
  for (const template of project.templates) {
    // The template itself included: a component may call itself, and
    // `blog/Comment.blade` does exactly that to render a reply thread.
    if (template.isEntry) continue;
    const result = compile(template.source);
    const root = result.ok ? result.template.root : result.partial.root;
    registry[template.componentName] = { props: root.props };
  }
  return registry;
}

describe('sample corpus', () => {
  it('finds the sample projects', () => {
    // A corpus that silently became empty would make every test below vacuous.
    expect(projects.length).toBeGreaterThanOrEqual(7);
    expect(allTemplates.length).toBeGreaterThanOrEqual(13);
  });

  it('ships at least one payload for every project', () => {
    // A project with no sample data can be compiled but never rendered, and a
    // sample nobody can render is a sample that rots unobserved.
    for (const project of projects) {
      expect(project.payloads.length, project.name).toBeGreaterThan(0);
    }
  });

  for (const project of projects) {
    describe(project.name, () => {
      // -------------------------------------------------------------------
      // Every file, on its own
      // -------------------------------------------------------------------
      for (const template of project.templates) {
        describe(template.name, () => {
          it('parses without throwing', () => {
            expect(() => parseTemplate(template.source)).not.toThrow();
          });

          it('compiles with no error diagnostics', () => {
            const compiled = compile(template.source, {
              components: siblingComponents(project),
            });
            const errors = diagnosticsOf(compiled).filter(
              diagnostic => diagnostic.level === 'error'
            );
            expect(
              errors.map(
                error =>
                  `${error.message} (line ${error.location.start.line}, column ${error.location.start.column})`
              )
            ).toEqual([]);
          });

          it('produces locations that index its own source', () => {
            const { value } = parseTemplate(template.source);
            for (const node of value) {
              expect(node.location.start.offset).toBeGreaterThanOrEqual(0);
              expect(node.location.end.offset).toBeLessThanOrEqual(
                template.source.length
              );
              expect(node.location.end.offset).toBeGreaterThanOrEqual(
                node.location.start.offset
              );
            }
          });
        });
      }

      // -------------------------------------------------------------------
      // The project, as a host compiles it
      // -------------------------------------------------------------------
      it('compiles as a project with no errors', async () => {
        const result = await compileProject(project.dir);
        expect(
          result.errors.map(
            error =>
              `${error.message} (line ${error.location.start.line}, column ${error.location.start.column})`
          )
        ).toEqual([]);
        // The renderable template is the point: `ast` alone cannot resolve a
        // component that lives in a sibling file.
        expect(
          result.template,
          `${project.name} produced no template`
        ).not.toBeNull();
      });

      // -------------------------------------------------------------------
      // The project, rendered with everything it ships
      // -------------------------------------------------------------------
      for (const payload of project.payloads) {
        describe(`payload ${payload.name}`, () => {
          it('renders to a string', async () => {
            const template = (await compileProject(project.dir)).template;
            expect(template).not.toBeNull();
            const { html } = createStringRenderer(template!)(payload.data, {
              helpers: standardLibrary,
              // Pinned clock, locale and zone: five of the seven projects call
              // `now()`, so an unpinned render snapshots the day it ran on.
              globals: SAMPLE_GLOBALS,
            });
            expect(html.length).toBeGreaterThan(0);
            await expect(html).toMatchFileSnapshot(
              `./__snapshots__/samples/${project.name}.${payload.name}.html`
            );
          });

          it('renders the same document to the DOM', async () => {
            const template = (await compileProject(project.dir)).template;
            const { html } = createStringRenderer(template!)(payload.data, {
              helpers: standardLibrary,
              globals: SAMPLE_GLOBALS,
            });
            const { nodes } = createDomRenderer(template!)(payload.data, {
              helpers: standardLibrary,
              globals: SAMPLE_GLOBALS,
            });
            // Both sides through the same document parser: a sample is a
            // page, and a page's `<html>`/`<head>`/`<body>` do not survive a
            // fragment parse.
            expect(asDocument(serializeNodes(nodes))).toBe(asDocument(html));
          });
        });
      }
    });
  }

  it('ships samples that satisfy the schema they are shipped with', async () => {
    // Sample validation was an advertised feature that no project could reach:
    // `compileProject` built every context with `schema: undefined`, so the
    // check was gated off for every build there has ever been. With it running,
    // three of the shipped samples disagreed with their own schema on the
    // first try - a null `endDate` for a current job, a null `giftMessage`,
    // and a `start` schema still describing items the sample stopped carrying.
    for (const project of projects) {
      const result = await compileProject(project.dir);
      const mismatches = result.warnings.filter(
        warning => warning.code === 'SAMPLE_SCHEMA_MISMATCH'
      );
      expect(
        mismatches.map(warning => `${warning.file}: ${warning.message}`),
        project.name
      ).toEqual([]);
    }
  });

  it('declares props on every component that takes them', () => {
    // Every sample that opens with @props must expose those declarations on the
    // compiled root - that is what a component loader reads.
    for (const project of projects) {
      for (const template of project.templates) {
        if (!template.source.startsWith('@props')) continue;
        const result = compile(template.source, {
          components: siblingComponents(project),
        });
        const declared = (
          result.ok ? result.template.root : result.partial.root
        ).props;
        expect(declared.length, template.name).toBeGreaterThan(0);
      }
    }
  });
});
