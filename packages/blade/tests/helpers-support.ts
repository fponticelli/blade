/**
 * Shared test support for the standard library helper suites.
 *
 * Helpers are curried as `helper(scope, setWarning)`, so every test needs a
 * real `Scope` and a warning sink. Both live here so the suites agree on what
 * a scope is - a malformed one silently changes what the helpers can read.
 */

import { standardLibrary } from '../src/helpers/index.js';
import type { Scope } from '../src/evaluator/index.js';

/** Builds a real Scope: locals, data and globals, exactly as the renderer does. */
export function createScope(
  globals: Record<string, unknown> = {},
  data: unknown = {},
  locals: Record<string, unknown> = {}
): Scope {
  return { locals, data, globals };
}

/** Collects the warnings a helper emits during one invocation. */
export function createWarningCollector(): {
  warnings: string[];
  setWarning: (msg: string) => void;
} {
  const warnings: string[] = [];
  return {
    warnings,
    setWarning: (msg: string) => warnings.push(msg),
  };
}

/** Invokes a standard library helper with the given arguments and globals. */
export function invokeHelper(
  name: keyof typeof standardLibrary,
  args: unknown[],
  globals: Record<string, unknown> = {}
): { result: unknown; warnings: string[] } {
  const scope = createScope(globals);
  const { warnings, setWarning } = createWarningCollector();
  const helper = standardLibrary[name];
  const fn = helper(scope, setWarning);
  const result = fn(...args);
  return { result, warnings };
}
