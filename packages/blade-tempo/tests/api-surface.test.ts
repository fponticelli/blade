/**
 * The published API surface of @bladets/tempo, pinned.
 *
 * The surface is small and deliberately so - a renderer factory and the types a
 * host needs to describe its own reactivity. This is what keeps it that way,
 * and what makes an accidental re-export of the whole engine visible.
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

describe('@bladets/tempo public API surface', () => {
  it('matches the checked-in api/*.api.md reports', () => {
    expect(checkApiReports([packageSpec('@bladets/tempo')])).toEqual([]);
  });
});
