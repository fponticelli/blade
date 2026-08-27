import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // 5s is vitest's default and assumes a developer's machine. A shared CI
    // runner is several times slower, and this repo has property tests that
    // sweep every prefix of every sample. 15s is still a hard ceiling that
    // catches a genuine hang; the few genuinely long sweeps set their own.
    testTimeout: 15_000,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'out/', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      // `vscode` is not a package; the extension host injects it at run time.
      // The double implements the surface this extension actually uses, and
      // records what was registered - which is how "listeners are registered
      // exactly once" becomes a test rather than a claim.
      //
      // `@bladets/template` is deliberately NOT aliased. It resolves through
      // the workspace link to its built `dist`, so the suite exercises the real
      // package boundary the extension ships against.
      vscode: resolve(__dirname, 'tests/support/vscode.ts'),
    },
  },
});
