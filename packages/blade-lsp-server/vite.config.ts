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
        // The analysis, as a library: everything a host can call.
        index: resolve(__dirname, 'src/index.ts'),
        // The stdio adapter. Importing it opens a JSON-RPC connection, which
        // is why it is a separate entry and not part of `index`.
        server: resolve(__dirname, 'src/server.ts'),
      },
      name: 'BladeLspServer',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Everything this package does not own stays a module edge. Subpaths are
      // matched explicitly: a bare-string external only matches the package
      // root, which is how @bladets/tempo shipped an inlined copy of the whole
      // engine twice.
      external: [
        /^node:/,
        'fs',
        'fs/promises',
        'path',
        'url',
        /^@bladets\/template(\/.*)?$/,
        /^vscode-languageserver(\/.*)?$/,
        /^vscode-languageserver-textdocument(\/.*)?$/,
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
});
