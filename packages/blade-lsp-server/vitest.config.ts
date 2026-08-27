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
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      // The shared project fixtures. Aliased rather than installed: it is test
      // data with no dependencies and nothing to build, and both packages that
      // read it reach it the same way.
      //
      // `@bladets/template` is deliberately NOT aliased. It resolves through
      // the workspace link to its built `dist`, so this suite exercises the
      // real package boundary - the `exports` map, and the surface that
      // boundary actually publishes - rather than a source tree that no
      // consumer ever sees.
      '@bladets/corpus': resolve(__dirname, '../blade-corpus/src/index.ts'),
    },
  },
});
