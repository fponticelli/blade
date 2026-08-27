// The shipped sample projects, through the reactive renderer.
//
// `packages/blade/tests/samples-corpus.test.ts` compiles every project under
// `samples/`, renders every payload it ships through the string and DOM sinks,
// and snapshots the markup. This file completes the set: the same projects, the
// same payloads, mounted reactively, and held to the SAME document.
//
// It deliberately asserts agreement rather than a snapshot of its own. A second
// snapshot of the same pages would be a second thing to update, and two
// snapshots that are updated separately are two answers to one question -
// which is the shape of the defect this whole wave is about.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SAMPLE_GLOBALS,
  asDocument,
  loadSampleProjects,
} from '@bladets/corpus';
import type { SampleProject } from '@bladets/corpus';
import { createStringRenderer, standardLibrary } from '@bladets/template';
import type { ValidTemplate } from '@bladets/template';
// The project layer is the one part of the engine that reads the filesystem,
// so it lives behind the explicit `/node` entry rather than in the default one.
import { compileProject } from '@bladets/template/node';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { FailureDetail } from '../src/types.js';
import { documentOf, settle } from './support/reactive.js';

const projects: SampleProject[] = loadSampleProjects();

/** Distinct entries, in a stable order. */
function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** One failure the reactive renderer reported. */
interface ReportedFailure {
  readonly message: string;
  readonly severity: FailureDetail['severity'];
}

describe('sample projects render the same reactively', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;
  let failures: ReportedFailure[];

  beforeEach(() => {
    // Deliberately detached. A sample is a whole page, `<style>` blocks
    // included, and jsdom parses every stylesheet that enters the document -
    // failing loudly on CSS it does not implement. That noise says nothing
    // about the renderer, and nothing here needs layout or a live document.
    container = document.createElement('div');
    failures = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('finds the sample projects', () => {
    // Without this, a walk that silently returned nothing would make the whole
    // file pass by describing no work at all.
    expect(projects.length).toBeGreaterThanOrEqual(7);
  });

  /** The project's entry template with its components resolved off disk. */
  async function templateOf(sample: SampleProject): Promise<ValidTemplate> {
    const result = await compileProject(sample.dir);
    expect(
      result.errors.map(error => error.message),
      sample.name
    ).toEqual([]);
    if (!result.template) {
      throw new Error(`${sample.name} produced no renderable template`);
    }
    return result.template;
  }

  for (const sample of projects) {
    for (const payload of sample.payloads) {
      it(`${sample.name} / ${payload.name}`, async () => {
        const template = await templateOf(sample);

        const eager = createStringRenderer(template)(payload.data, {
          helpers: standardLibrary,
          // The same pinned clock, locale and zone the snapshot suite renders
          // with. Five of the seven projects call `now()`, and two renderers
          // that each read the real clock disagree across a midnight.
          globals: SAMPLE_GLOBALS,
        });

        cleanup = render(
          createTempoRenderer(template, {
            helpers: standardLibrary,
            globals: SAMPLE_GLOBALS,
            onError: (error, _location, detail) => {
              failures.push({
                message: error.message,
                severity: detail.severity,
              });
            },
          })(prop(payload.data)),
          container
        );
        await settle();

        // Nothing may go wrong that did not go wrong eagerly. Two of the
        // shipped samples do produce warnings - a `style` interpolation the
        // renderer constrained, a `concat` handed a string - and those are
        // sample defects, pinned here and in the snapshots rather than
        // excused. What matters is that BOTH renderers report them: a sink
        // that quietly substituted where the other warned is the divergence
        // this file exists to catch.
        expect(failures.filter(f => f.severity === 'error')).toEqual([]);
        expect(unique(failures.map(f => f.message))).toEqual(
          // The eager list has one entry per occurrence; the reactive one
          // reports a defect once per pass however many rows hit it. Comparing
          // the distinct messages is the most that is true of both.
          unique(eager.metadata.warnings.map(warning => warning.message))
        );

        // Both sides through the same document parser: a sample is a page, and
        // a page's `<html>`/`<head>`/`<body>` do not survive a fragment parse.
        expect(asDocument(documentOf(container))).toBe(asDocument(eager.html));
      });
    }
  }
});
