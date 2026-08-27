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
  build: {
    lib: {
      entry: {
        // Runtime-neutral. `scripts/check-bundles.mjs` asserts that the built
        // `index` and `browser` bundles import no Node built-in, which is what
        // keeps `import { compile } from '@bladets/template'` loadable on
        // Cloudflare Workers, Vercel Edge and Deno Deploy.
        index: resolve(__dirname, 'src/index.ts'),
        browser: resolve(__dirname, 'src/browser.ts'),
        // The filesystem-backed project layer. The only entry that may reach
        // `fs`, `path` or `url`.
        node: resolve(__dirname, 'src/node.ts'),
      },
      name: 'Blade',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Node built-ins and the JSON Schema validator are external.
      //
      // `ajv` is a runtime dependency, not something to inline: it is only
      // reached from the `node` entry, and a copy in the bundle would be dead
      // weight for anyone importing `@bladets/template`.
      external: [
        /^node:/,
        'fs',
        'fs/promises',
        'path',
        'url',
        /^ajv($|\/)/,
        /^ajv-formats($|\/)/,
      ],
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
    },
  },
});
