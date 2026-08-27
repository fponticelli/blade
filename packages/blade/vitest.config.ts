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
      '@': resolve(__dirname, './src'),
      // The shared renderer conformance corpus. Aliased rather than installed:
      // it is a table of test data with no dependencies and nothing to build,
      // and both packages that read it reach it the same way.
      '@bladets/corpus': resolve(__dirname, '../blade-corpus/src/index.ts'),
    },
  },
});
