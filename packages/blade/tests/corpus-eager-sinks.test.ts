/**
 * @vitest-environment jsdom
 *
 * The shared conformance corpus, through this package's two sinks.
 *
 * `createStringRenderer` and `createDomRenderer` implement one AST and used to
 * be checked by two suites with no case in common - which is why five
 * divergences between them shipped green. The table they are driven through
 * here lives in `packages/blade-corpus`, and `@bladets/tempo`'s suite drives
 * the SAME table through all three renderers, including the reactive one.
 *
 * This file exists in addition to that one because `@bladets/template` is
 * published on its own: a divergence between the string sink and the DOM sink
 * has to turn this package's CI red without the reactive package installed. It
 * adds no expectations of its own - every string in it comes from the corpus -
 * so there is nothing here that can drift away from the three-way suite.
 */

import { describe, expect, it } from 'vitest';
import {
  CORPUS,
  exclusionsIn,
  expectedDocumentFor,
  includesRenderer,
  isCompileFailure,
  reserializeHtml,
  serializeNodes,
} from '@bladets/corpus';
import type { CorpusCase } from '@bladets/corpus';
import { compile } from '../src/compiler/index.js';
import { standardLibrary } from '../src/helpers/index.js';
import {
  createDomRenderer,
  createStringRenderer,
  ResourceLimitError,
} from '../src/renderer/index.js';
import type { RenderOptions } from '../src/renderer/index.js';
import type { RenderWarning } from '../src/evaluator/index.js';
import { diagnosticsOf } from './support/render-ok.js';

// -----------------------------------------------------------------------------
// Adapting a case to this package's option shape
// -----------------------------------------------------------------------------

/** The corpus's options, as `RenderOptions`. */
function renderOptionsFor(corpusCase: CorpusCase): RenderOptions {
  const options = corpusCase.options ?? {};
  return {
    globals: options.globals,
    helpers: options.standardHelpers ? standardLibrary : undefined,
    limits: options.limits,
    config: {
      includeComments: options.includeComments ?? false,
      allowStyleInterpolation: options.allowStyleInterpolation ?? false,
    },
  };
}

/** `level:CODE` for each diagnostic, which is what a case names. */
function diagnosticSignature(corpusCase: CorpusCase): string[] {
  return diagnosticsOf(compile(corpusCase.source)).map(
    diagnostic => `${diagnostic.level}:${diagnostic.code ?? 'NO_CODE'}`
  );
}

/** What the case says the diagnostics should be. */
function expectedDiagnosticSignature(corpusCase: CorpusCase): string[] {
  return (corpusCase.expectedDiagnostics ?? []).map(
    diagnostic => `${diagnostic.level}:${diagnostic.code}`
  );
}

/**
 * Asserts the warnings a render recorded are the ones the case names.
 *
 * Warnings are decided by the shared traversal, so they are part of what the
 * sinks agree on: a blocked URL that one sink reports and another silently
 * substitutes is exactly the class of divergence this corpus exists for.
 */
function expectWarnings(
  warnings: readonly RenderWarning[],
  corpusCase: CorpusCase,
  renderer: string
): void {
  const expected = corpusCase.expectedWarnings ?? [];
  const actual = warnings.map(warning => warning.message);
  expect(actual, `${renderer} warnings for ${corpusCase.name}`).toHaveLength(
    expected.length
  );
  expected.forEach((fragment, index) => {
    expect(actual[index]).toContain(fragment);
  });
}

// -----------------------------------------------------------------------------
// The suite
// -----------------------------------------------------------------------------

const GROUPS = [...new Set(CORPUS.map(corpusCase => corpusCase.group))];

describe('renderer conformance corpus', () => {
  it('has a case in every group it claims to cover', () => {
    // A corpus that silently emptied itself would make everything below
    // vacuous, and a group that lost its last case would do it quietly.
    expect(CORPUS.length).toBeGreaterThanOrEqual(70);
    for (const group of GROUPS) {
      expect(
        CORPUS.filter(corpusCase => corpusCase.group === group).length,
        group
      ).toBeGreaterThan(0);
    }
  });

  it('names every case exactly once', () => {
    const names = CORPUS.map(corpusCase => corpusCase.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('states a reason for every medium-specific expectation', () => {
    for (const corpusCase of CORPUS) {
      if (corpusCase.expectedDomOuterHtml === undefined) continue;
      expect(
        corpusCase.domDifference,
        `${corpusCase.name} overrides the DOM expectation without saying why`
      ).toBeTruthy();
    }
  });

  it('keeps the exclusion list short, and every entry explained', () => {
    const exclusions = exclusionsIn(CORPUS);
    for (const exclusion of exclusions) {
      expect(
        exclusion.reason.length,
        `${exclusion.caseName} excludes ${exclusion.renderer} without a reason`
      ).toBeGreaterThan(40);
    }
    // A short list is a set of design decisions. A long one is a pile of
    // unfixed divergences wearing a different hat - so the list is pinned by
    // name here and printed in full by the three-renderer suite.
    //
    // One entry, and it is a property of the medium rather than a gap: a string
    // cannot hold a closure. `limits/output-size-override [tempo]` used to sit
    // here as a declared bug - the reactive sink was handed the render's
    // `OutputBudget` and dropped it - and is now enforced rather than excused.
    expect(exclusions.map(e => `${e.caseName} [${e.renderer}]`)).toEqual([
      'events/handler-is-bound-and-the-markup-is-unchanged [string]',
    ]);
  });

  for (const group of GROUPS) {
    describe(group, () => {
      for (const corpusCase of CORPUS.filter(c => c.group === group)) {
        describe(corpusCase.name, () => {
          it('compiles with exactly the diagnostics it declares', () => {
            expect(diagnosticSignature(corpusCase)).toEqual(
              expectedDiagnosticSignature(corpusCase)
            );
          });

          if (isCompileFailure(corpusCase)) return;

          const options = renderOptionsFor(corpusCase);
          const template = () => {
            const result = compile(corpusCase.source);
            if (!result.ok)
              throw new Error(`${corpusCase.name} did not compile`);
            return result.template;
          };
          const data = corpusCase.data ?? {};

          if (corpusCase.expectedFailure !== undefined) {
            const { limitType } = corpusCase.expectedFailure;

            if (includesRenderer(corpusCase, 'string')) {
              it(`string: stops on ${limitType}`, () => {
                let thrown: unknown;
                try {
                  createStringRenderer(template())(data, options);
                } catch (error) {
                  thrown = error;
                }
                expect(thrown).toBeInstanceOf(ResourceLimitError);
                expect((thrown as ResourceLimitError).limitType).toBe(
                  limitType
                );
              });
            }

            if (includesRenderer(corpusCase, 'dom')) {
              it(`dom: stops on ${limitType}`, () => {
                let thrown: unknown;
                try {
                  createDomRenderer(template())(data, options);
                } catch (error) {
                  thrown = error;
                }
                expect(thrown).toBeInstanceOf(ResourceLimitError);
                expect((thrown as ResourceLimitError).limitType).toBe(
                  limitType
                );
              });
            }
            return;
          }

          if (includesRenderer(corpusCase, 'string')) {
            it('string: renders the expected markup', () => {
              const result = createStringRenderer(template())(data, options);
              expect(result.html).toBe(corpusCase.expectedHtml);
              expectWarnings(result.metadata.warnings, corpusCase, 'string');
            });
          }

          if (includesRenderer(corpusCase, 'dom')) {
            it('dom: renders the expected document', () => {
              const result = createDomRenderer(template())(data, options);
              expect(serializeNodes(result.nodes)).toBe(
                expectedDocumentFor(corpusCase)
              );
              expectWarnings(result.metadata.warnings, corpusCase, 'dom');
            });
          }

          if (
            includesRenderer(corpusCase, 'string') &&
            includesRenderer(corpusCase, 'dom') &&
            corpusCase.expectedDomOuterHtml === undefined
          ) {
            it('string and dom describe the same document', () => {
              // Derived from the two renders rather than from the table, so a
              // wrong expectation in the table cannot make this pass.
              const html = createStringRenderer(template())(data, options).html;
              const nodes = createDomRenderer(template())(data, options).nodes;
              expect(reserializeHtml(html)).toBe(serializeNodes(nodes));
            });
          }
        });
      }
    });
  }
});
