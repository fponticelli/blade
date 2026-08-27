/**
 * The published API surface of @bladets/template, pinned.
 *
 * Both entry points used to be `export *` barrels over every module in `src`:
 * 302 declarations reachable from `@bladets/template` with nothing marking
 * where the intended API stopped and the implementation began. Renaming any
 * internal helper was therefore a breaking change, and things nobody used sat
 * in the surface unnoticed - `HelperFunctionWithMetadata`, an abandoned design
 * that competed with `helpers/metadata.ts`, and a `JsonSchemaProperty` alias
 * deprecated "until the LSP is fixed" long after it was.
 *
 * The entry files list every export by name, and the checked-in reports under
 * `api/` record what that list resolves to. An addition or a removal fails here
 * and shows up as a diff a reviewer has to approve, which is the whole
 * mechanism: nothing stops the surface changing, only its changing silently.
 *
 * When the change is intended: `pnpm api:update` from the repository root, then
 * commit the updated `api/*.api.md`.
 */

import { describe, it, expect } from 'vitest';
import { checkApiReports, packageSpec } from '../../../scripts/api-surface.mjs';

describe('@bladets/template public API surface', () => {
  // Runs the TypeScript checker over every entry point, so it is far slower than a
  // unit test and needs a timeout to match on a CI runner.
  it('matches the checked-in api/*.api.md reports', () => {
    expect(checkApiReports([packageSpec('@bladets/template')])).toEqual([]);
  }, 30_000);
});
