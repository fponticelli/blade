// The positive path, with the diagnostics checked first.
//
// Every renderer test in this package used to build its AST by hand. 140 uses
// of a `createMockTemplate()` helper, zero calls to `compile()`. The mocks set
// `diagnostics: []` and empty metadata unconditionally, so no renderer test
// ever saw a real diagnostic, and the parser-to-renderer seam - where the
// static-attribute double-escape and the dead `@let`-function path both lived -
// was insulated from the whole suite.
//
// The other half of the same problem was that even the tests which did compile
// never looked at what the compile said. `packages/blade/tests/escaping.test.ts`
// asserted that `@if(true)Hello\@world@endif` CONTAINED `Hello@world`, and it
// did - because the directive failed to parse and degraded to literal text.
// Three error diagnostics, an assertion that passed, and a test that was
// evidence of nothing.
//
// So: one helper, which asserts the compile was clean BEFORE it renders, and a
// rule that every positive-path assertion goes through it. Forgetting is no
// longer possible, because there is nothing to forget - the check is upstream
// of the output.

import { expect } from 'vitest';
import { compile } from '../../src/compiler/index.js';
import type { CompileOptions } from '../../src/compiler/index.js';
import type {
  CompileResult,
  Diagnostic,
  ValidTemplate,
} from '../../src/ast/types.js';
import {
  createDomRenderer,
  createStringRenderer,
} from '../../src/renderer/index.js';
import type {
  DomRenderResult,
  RenderOptions,
  RenderResult,
} from '../../src/renderer/index.js';

/** Every diagnostic a compile produced, whichever way the result went. */
export function diagnosticsOf(result: CompileResult): readonly Diagnostic[] {
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

/** `level:CODE` for each diagnostic - what a negative test asserts on. */
export function diagnosticCodes(source: string, options?: CompileOptions) {
  return diagnosticsOf(compile(source, options)).map(
    diagnostic => `${diagnostic.level}:${diagnostic.code ?? 'NO_CODE'}`
  );
}

/**
 * Compiles, and fails the test unless the compile was completely clean.
 *
 * Not "no errors": no diagnostics at all. A warning on a template a test is
 * about to assert the output of means the test is describing something other
 * than what it claims to describe.
 *
 * @param source - Template source
 * @param options - Compile options
 * @returns The valid template
 */
export function compileOk(
  source: string,
  options?: CompileOptions
): ValidTemplate {
  const result = compile(source, options);
  expect(
    diagnosticsOf(result).map(
      diagnostic =>
        `${diagnostic.level} ${diagnostic.code ?? ''}: ${diagnostic.message} ` +
        `(line ${diagnostic.location.start.line}, column ${diagnostic.location.start.column})`
    ),
    `expected ${JSON.stringify(source)} to compile with no diagnostics`
  ).toEqual([]);
  // Narrowing after the assertion, which has already failed the test if this
  // is not a valid template.
  if (!result.ok) throw new Error('unreachable: compile reported no errors');
  return result.template;
}

/**
 * Compiles cleanly and renders to a string.
 *
 * @param source - Template source
 * @param data - Render data
 * @param options - Render options
 * @returns The rendered HTML and the render's metadata
 */
export function renderOk(
  source: string,
  data: unknown = {},
  options?: RenderOptions,
  compileOptions?: CompileOptions
): RenderResult {
  return createStringRenderer(compileOk(source, compileOptions))(data, options);
}

/** {@link renderOk}, keeping only the markup. */
export function htmlOk(
  source: string,
  data: unknown = {},
  options?: RenderOptions,
  compileOptions?: CompileOptions
): string {
  return renderOk(source, data, options, compileOptions).html;
}

/**
 * Compiles cleanly and renders to DOM nodes.
 *
 * @param source - Template source
 * @param data - Render data
 * @param options - Render options
 * @returns The rendered nodes and the render's metadata
 */
export function renderDomOk(
  source: string,
  data: unknown = {},
  options?: RenderOptions,
  compileOptions?: CompileOptions
): DomRenderResult {
  return createDomRenderer(compileOk(source, compileOptions))(data, options);
}

/** {@link renderDomOk}, serialised - the markup those nodes stand for. */
export function domHtmlOk(
  source: string,
  data: unknown = {},
  options?: RenderOptions,
  compileOptions?: CompileOptions
): string {
  const host = document.createElement('div');
  for (const node of renderDomOk(source, data, options, compileOptions).nodes) {
    host.appendChild(node);
  }
  return host.innerHTML;
}
