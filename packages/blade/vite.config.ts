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
        index: resolve(__dirname, 'src/index.ts'),
        'lsp/server': resolve(__dirname, 'src/lsp/server.ts'),
      },
      name: 'Blade',
      formats: ['es'],
    },
    rollupOptions: {
      // Node.js built-ins and vscode LSP packages are external
      external: [
        'fs/promises',
        'path',
        'fs',
        'url',
        'vscode-languageserver/node.js',
        'vscode-languageserver-textdocument',
      ],
      output: {
        exports: 'named',
        // Preserve directory structure for lsp/server.js
        entryFileNames: '[name].js',
      },
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
