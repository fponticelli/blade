// The project fixtures: small on-disk Blade projects used as test input.
//
// They live here rather than under one package's `tests/` because two suites
// read them - `@bladets/template`'s project layer and `@bladets/lsp-server`'s
// analysis - and they described the same eleven projects before the language
// server was extracted. Keeping one copy is the point: a fixture that gains a
// `schema.json` has to change the answer for both suites at once, and a second
// copy is how the two would silently start testing different things.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory holding every project fixture. */
export const PROJECT_FIXTURES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'project'
);

/**
 * The absolute path of one project fixture.
 *
 * No existence check: several tests deliberately name a directory that is not
 * there (`does-not-exist`) to exercise the missing-project path.
 *
 * @param name - Directory name under the fixtures root, e.g. `with-schema`.
 */
export function projectFixture(name: string): string {
  return join(PROJECT_FIXTURES_ROOT, name);
}
