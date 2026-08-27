import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
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
