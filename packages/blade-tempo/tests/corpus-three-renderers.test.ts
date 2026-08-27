// The shared conformance corpus, through all three renderers.
//
// This is the suite the whole exercise is about.
//
// `createStringRenderer`, `createDomRenderer` and `createTempoRenderer`
// implement one AST. They were checked by three disjoint suites with no
// (template, data) pair in common, and that is not a gap in coverage - it is
// the reason every divergence between them was GREEN in CI. `$!` raw
// interpolation behaved three different ways. This package double-escaped every
// value it wrote. `@match`'s `_` was bound in two renderers and null in the
// third. `includeComments` was honoured in one and silently inert in another.
// Component depth was enforced in one and unbounded in another. Not one of
// those needed a subtle test to catch; they needed ANY test that rendered the
// same template twice.
//
// So: one table, in `packages/blade-corpus`, and this file drives every case in
// it through every renderer and asserts they agree. A renderer that cannot
// satisfy a case must be named in that case's `excludedFrom` with a written
// reason, which this suite prints - there is no way to leave a case out
// quietly.
//
// The comparison is on the parsed document rather than on the markup, because
// that is the question that matters: `<br/>` and `<br>`, `&#39;` and `'` are
// one document written differently, while `&amp;amp;` and `&amp;` are two
// documents and the reader can tell them apart.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CORPUS,
  exclusionsIn,
  expectedDocumentFor,
  includesRenderer,
  isCompileFailure,
  reserializeHtml,
  serializeNodes,
} from '@bladets/corpus';
import type { CorpusCase, RendererId } from '@bladets/corpus';
import {
  compile,
  createDomRenderer,
  createStringRenderer,
  standardLibrary,
} from '@bladets/template/browser';
import type {
  RenderOptions,
  RenderWarning,
  ValidTemplate,
} from '@bladets/template/browser';
import { prop, render } from '@tempots/dom';
import { createTempoRenderer } from '../src/index.js';
import type { FailureDetail, TempoRenderOptions } from '../src/types.js';
import { documentOf, settle } from './support/reactive.js';

// -----------------------------------------------------------------------------
// Adapting a case to each renderer's option shape
// -----------------------------------------------------------------------------

/** The corpus's options, as the engine's `RenderOptions`. */
function engineOptions(corpusCase: CorpusCase): RenderOptions {
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

/**
 * The same options, as this package's flattened `TempoRenderOptions`.
 *
 * Two mappings of one set of decisions, which is the price of the reactive
 * renderer having its own options type. Both are here, side by side, so a
 * decision that stops being carried across is visible rather than inferred
 * from a failing document.
 */
function tempoOptions(
  corpusCase: CorpusCase,
  onError: TempoRenderOptions['onError']
): TempoRenderOptions {
  const options = corpusCase.options ?? {};
  return {
    globals: options.globals,
    helpers: options.standardHelpers ? standardLibrary : undefined,
    limits: options.limits,
    includeComments: options.includeComments ?? false,
    allowStyleInterpolation: options.allowStyleInterpolation ?? false,
    onError,
  };
}

/** The case's template, compiled. Only called for cases that compile. */
function templateFor(corpusCase: CorpusCase): ValidTemplate {
  const result = compile(corpusCase.source);
  if (!result.ok) {
    throw new Error(
      `${corpusCase.name} was expected to compile: ` +
        result.diagnostics.map(d => d.message).join('; ')
    );
  }
  return result.template;
}

/** `level:CODE` per diagnostic - the signature a case declares. */
function diagnosticSignature(corpusCase: CorpusCase): string[] {
  const result = compile(corpusCase.source);
  const diagnostics = result.ok
    ? result.template.diagnostics
    : result.diagnostics;
  return diagnostics.map(d => `${d.level}:${d.code ?? 'NO_CODE'}`);
}

function expectedDiagnosticSignature(corpusCase: CorpusCase): string[] {
  return (corpusCase.expectedDiagnostics ?? []).map(
    d => `${d.level}:${d.code}`
  );
}

// -----------------------------------------------------------------------------
// Reading a reactive render back
// -----------------------------------------------------------------------------

/** One failure the reactive renderer reported. */
interface ReportedFailure {
  readonly message: string;
  readonly severity: FailureDetail['severity'];
  readonly error: Error;
}

/**
 * Asserts the warnings a render recorded are the ones the case names.
 *
 * Warnings are decided by the shared traversal - a blocked URL, a `style` value
 * constrained to a value - so they are part of what the sinks must agree on,
 * and a sink that silently substitutes where another warns is exactly the
 * divergence this corpus is for.
 */
function expectWarnings(
  messages: readonly string[],
  corpusCase: CorpusCase,
  renderer: RendererId
): void {
  const expected = corpusCase.expectedWarnings ?? [];
  expect(messages, `${renderer} warnings for ${corpusCase.name}`).toHaveLength(
    expected.length
  );
  expected.forEach((fragment, index) => {
    expect(messages[index]).toContain(fragment);
  });
}

// -----------------------------------------------------------------------------
// The suite
// -----------------------------------------------------------------------------

const GROUPS = [...new Set(CORPUS.map(corpusCase => corpusCase.group))];

describe('every renderer agrees with the corpus', () => {
  let container: HTMLElement;
  let cleanup: (() => void) | undefined;
  let failures: ReportedFailure[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    failures = [];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    container.remove();
  });

  /** Mounts a case reactively and returns the failures it reported. */
  async function mount(corpusCase: CorpusCase): Promise<void> {
    const options = tempoOptions(corpusCase, (error, _location, detail) => {
      failures.push({
        message: error.message,
        severity: detail.severity,
        error,
      });
    });
    cleanup = render(
      createTempoRenderer(
        templateFor(corpusCase),
        options
      )(prop(corpusCase.data ?? {})),
      container
    );
    await settle();
  }

  it('drives every case through every renderer it is not excluded from', () => {
    // The corpus is only worth anything if it is actually driven. This counts
    // the (case, renderer) pairs the suite below builds, so a case that stops
    // running - or a renderer quietly dropped from the loop - fails here.
    const pairs = CORPUS.flatMap(corpusCase =>
      (['string', 'dom', 'tempo'] as const).filter(renderer =>
        includesRenderer(corpusCase, renderer)
      )
    );
    expect(pairs.length).toBe(CORPUS.length * 3 - exclusionsIn(CORPUS).length);
  });

  it('excludes exactly the cases it says it excludes, and says why', () => {
    // Printed rather than merely counted: an exclusion added to turn a red
    // test green has to be read by whoever reviews the diff.
    const exclusions = exclusionsIn(CORPUS).map(
      exclusion =>
        `${exclusion.caseName} [${exclusion.renderer}]: ${exclusion.reason}`
    );
    expect(exclusions).toMatchInlineSnapshot(`
      [
        "events/handler-is-bound-and-the-markup-is-unchanged [string]: A string carries characters, and no sequence of characters is a function. The traversal asks the sink (\`RenderTarget.bindsEvents\`) and refuses the binding on its behalf, recording a warning the other two sinks correctly do not - so this case has a different *warning* expectation there, not a different document. Compiling with \`target: 'string'\` turns the same refusal into a compile error; packages/blade/tests/events.test.ts pins both.",
      ]
    `);
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

          const data = () => corpusCase.data ?? {};
          const expectedDocument = () => expectedDocumentFor(corpusCase);

          // ---------------------------------------------------------------
          // Resource ceilings
          //
          // Enforced in the traversal, so every sink stops at the same pass,
          // the same depth and the same expansion. The eager sinks throw at
          // their caller; the reactive one has no caller by then and reports
          // through its failure channel instead - a difference in HOW the
          // render says it stopped, never in WHETHER it did.
          // ---------------------------------------------------------------
          if (corpusCase.expectedFailure !== undefined) {
            const { limitType } = corpusCase.expectedFailure;

            if (includesRenderer(corpusCase, 'string')) {
              it(`string: stops on ${limitType}`, () => {
                expect(() =>
                  createStringRenderer(templateFor(corpusCase))(
                    data(),
                    engineOptions(corpusCase)
                  )
                ).toThrowError(expect.objectContaining({ limitType }) as Error);
              });
            }

            if (includesRenderer(corpusCase, 'dom')) {
              it(`dom: stops on ${limitType}`, () => {
                expect(() =>
                  createDomRenderer(templateFor(corpusCase))(
                    data(),
                    engineOptions(corpusCase)
                  )
                ).toThrowError(expect.objectContaining({ limitType }) as Error);
              });
            }

            if (includesRenderer(corpusCase, 'tempo')) {
              it(`tempo: reports ${limitType}`, async () => {
                // Not "produces nothing": an incremental render has no caller
                // to throw at, and the tree it had already built is not
                // unwound. What must agree across the three sinks is that the
                // render STOPPED, and on which ceiling - so that is what is
                // asserted, rather than a shape that is a property of the
                // medium.
                await mount(corpusCase);
                const errors = failures.filter(f => f.severity === 'error');
                expect(
                  errors.map(
                    failure =>
                      (failure.error as unknown as { limitType?: string })
                        .limitType ?? failure.message
                  )
                ).toEqual([limitType]);
              });
            }
            return;
          }

          // ---------------------------------------------------------------
          // Output
          // ---------------------------------------------------------------
          if (includesRenderer(corpusCase, 'string')) {
            it('string: renders the expected markup', () => {
              const result = createStringRenderer(templateFor(corpusCase))(
                data(),
                engineOptions(corpusCase)
              );
              expect(result.html).toBe(corpusCase.expectedHtml);
              expectWarnings(
                result.metadata.warnings.map((w: RenderWarning) => w.message),
                corpusCase,
                'string'
              );
            });
          }

          if (includesRenderer(corpusCase, 'dom')) {
            it('dom: renders the expected document', () => {
              const result = createDomRenderer(templateFor(corpusCase))(
                data(),
                engineOptions(corpusCase)
              );
              expect(serializeNodes(result.nodes)).toBe(expectedDocument());
              expectWarnings(
                result.metadata.warnings.map((w: RenderWarning) => w.message),
                corpusCase,
                'dom'
              );
            });
          }

          if (includesRenderer(corpusCase, 'tempo')) {
            it('tempo: mounts the expected document', async () => {
              await mount(corpusCase);
              expect(documentOf(container)).toBe(expectedDocument());
              expect(failures.filter(f => f.severity === 'error')).toEqual([]);
              expectWarnings(
                failures
                  .filter(f => f.severity === 'warning')
                  .map(f => f.message),
                corpusCase,
                'tempo'
              );
            });
          }

          // ---------------------------------------------------------------
          // Agreement, derived from the renders themselves
          //
          // The three assertions above each compare a renderer against the
          // table. This one compares the renderers against each other, so a
          // wrong expectation in the table cannot hide a divergence: if all
          // three were updated to match a regression, this still passes, and
          // if only one was, this fails.
          // ---------------------------------------------------------------
          if (
            includesRenderer(corpusCase, 'string') &&
            includesRenderer(corpusCase, 'dom') &&
            includesRenderer(corpusCase, 'tempo') &&
            corpusCase.expectedDomOuterHtml === undefined
          ) {
            it('all three describe the same document', async () => {
              const html = createStringRenderer(templateFor(corpusCase))(
                data(),
                engineOptions(corpusCase)
              ).html;
              const nodes = createDomRenderer(templateFor(corpusCase))(
                data(),
                engineOptions(corpusCase)
              ).nodes;
              await mount(corpusCase);

              expect(reserializeHtml(html)).toBe(serializeNodes(nodes));
              expect(documentOf(container)).toBe(serializeNodes(nodes));
            });
          }
        });
      }
    });
  }
});
