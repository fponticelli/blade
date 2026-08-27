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
