/**
 * The published API surface of @bladets/lsp-server, pinned.
 *
 * This package was carved out of `@bladets/template`, where its exports were
 * one `export * as lsp` namespace inside a barrel and nobody could see what a
 * host was actually entitled to call. Two entries are published now: the
 * analysis, and the stdio adapter that must stay the only thing opening a
 * connection at import time.
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

describe('@bladets/lsp-server public API surface', () => {
  it('matches the checked-in api/*.api.md reports', () => {
    expect(checkApiReports([packageSpec('@bladets/lsp-server')])).toEqual([]);
  });
});
