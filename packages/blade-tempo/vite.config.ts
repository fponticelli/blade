import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  test: {
    // 5s is vitest's default and assumes a developer's machine. A shared CI
    // runner is several times slower. 15s is still a hard ceiling that catches
    // a genuine hang; the few genuinely long sweeps set their own.
    testTimeout: 15_000,
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BladeTempo',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Peer dependencies are external, including their subpath entry points
      // (e.g. `@bladets/template/browser`). Bare-string externals only match
      // the package root, which would silently inline every subpath import.
      external: [/^@bladets\/template(\/.*)?$/, /^@tempots\/dom(\/.*)?$/],
      output: [
        {
          format: 'es',
          entryFileNames: '[name].js',
          exports: 'named',
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          exports: 'named',
        },
      ],
    },
    sourcemap: true,
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // The shared renderer conformance corpus - the same table
      // @bladets/template's suite drives, so the two cannot drift apart.
      // Test-only: `build.rollupOptions.input` never reaches it.
      '@bladets/corpus': resolve(__dirname, '../blade-corpus/src/index.ts'),
    },
  },
});
