/**
 * The package boundary, asserted against the source tree.
 *
 * `scripts/check-bundles.mjs` asserts the same properties against the built
 * artefacts, which is the stronger check - it sees what a consumer actually
 * downloads - but it needs `pnpm build` first, so it can only fail after the
 * fact and only in CI. These assertions run on `src` in milliseconds, so the
 * import that breaks the boundary fails in the suite the author is already
 * running.
 *
 * Two things are pinned.
 *
 * **The default entry reaches no Node built-in.** `src/index.ts` used to do
 * `export * as project from './project/index.js'`, which pulls `readFileSync`,
 * `readdirSync`, `statSync` and `existsSync`. Because those are static
 * top-level imports, the built `dist/index.js` began with `import ... from
 * "fs"`, so `import { compile } from '@bladets/template'` - the first example
 * in the README, using two entirely browser-safe symbols - failed to load on
 * Cloudflare Workers, Vercel Edge and Deno Deploy, and dragged Node built-ins
 * into any Vite or webpack bundle. The filesystem-backed project layer now
 * lives behind `@bladets/template/node`.
 *
 * **The manifest matches.** The engine listed `vscode-languageserver` and
 * `vscode-languageserver-textdocument` as runtime dependencies, so every
 * install of a template engine downloaded ~1.19 MB across five packages that
 * nothing on that path ever loads. The language server is now
 * `@bladets/lsp-server`, and this is what stops the dependency coming back with
 * whatever needs it next.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

const packageRoot = resolve(__dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`),
]);

/** `import ... from 'x'`, `export ... from 'x'`, `import('x')`. */
const SPECIFIER = /(?:^|\s|\()(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gm;

interface Reach {
  /** Bare specifiers the graph resolves at runtime. */
  readonly packages: Set<string>;
  /** Every module in the graph, repo-relative, for the failure message. */
  readonly byPackage: Map<string, string[]>;
}

/**
 * Walks a module's static import graph inside `src`, following relative
 * specifiers and collecting the bare ones.
 *
 * Type-only imports are followed too, deliberately: a `import type { X } from
 * 'fs'` is erased, but this walk is cheap and a false positive is a one-line
 * `import type` away from being fixed, while a false negative is the bug.
 */
function reachableFrom(entry: string): Reach {
  const packages = new Set<string>();
  const byPackage = new Map<string, string[]>();
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        // Source is written with explicit `.js` extensions; the file is `.ts`.
        queue.push(resolve(dirname(file), specifier).replace(/\.js$/, '.ts'));
        continue;
      }
      packages.add(specifier);
      const from = byPackage.get(specifier) ?? [];
      from.push(relative(repoRoot, file));
      byPackage.set(specifier, from);
    }
  }

  return { packages, byPackage };
}

/** Node built-ins reachable from an entry, with the file that imports each. */
function builtinsReachableFrom(entry: string): string[] {
  const { packages, byPackage } = reachableFrom(entry);
  return [...packages]
    .filter(name => NODE_BUILTINS.has(name))
    .sort()
    .map(
      name => `${name} (from ${(byPackage.get(name) ?? []).sort().join(', ')})`
    );
}

interface Manifest {
  readonly sideEffects?: unknown;
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly files?: string[];
}

function manifestOf(dir: string): Manifest {
  return JSON.parse(
    readFileSync(resolve(repoRoot, dir, 'package.json'), 'utf8')
  ) as Manifest;
}

describe('@bladets/template runs anywhere', () => {
  it('reaches no Node built-in from the default entry', () => {
    expect(builtinsReachableFrom(resolve(packageRoot, 'src/index.ts'))).toEqual(
      []
    );
  });

  it('reaches no Node built-in from the browser entry', () => {
    expect(
      builtinsReachableFrom(resolve(packageRoot, 'src/browser.ts'))
    ).toEqual([]);
  });

  it('keeps the filesystem behind the node entry, where it belongs', () => {
    // The inverse assertion: if this ever came back empty, the project layer
    // would have stopped reading the filesystem and the split above would be
    // testing nothing.
    const builtins = builtinsReachableFrom(resolve(packageRoot, 'src/node.ts'));
    expect(builtins.join(' ')).toMatch(/\bfs\b/);
  });
});

describe('@bladets/template manifest', () => {
  const manifest = manifestOf('packages/blade');

  it('declares no VS Code protocol dependency', () => {
    const runtime = Object.keys(manifest.dependencies ?? {});
    expect(runtime.filter(name => name.startsWith('vscode-'))).toEqual([]);
  });

  it('publishes exactly the entries the build produces', () => {
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      '.',
      './browser',
      './node',
      './package.json',
    ]);
  });

  it('routes the browser condition on the default entry', () => {
    // Nested rather than a bare string: bundlers resolve `browser` ahead of
    // `import`/`require`, and a CJS browser build handed an ES module is a
    // syntax error at build time.
    expect(manifest.exports?.['.']).toMatchObject({
      browser: { import: './dist/browser.js', require: './dist/browser.cjs' },
    });
  });

  it('declares itself free of side effects so consumers can tree-shake', () => {
    expect(manifest.sideEffects).toBe(false);
  });
});

describe('@bladets/lsp-server owns the protocol', () => {
  const manifest = manifestOf('packages/blade-lsp-server');

  it('depends on the engine rather than duplicating it', () => {
    expect(manifest.dependencies).toMatchObject({
      '@bladets/template': expect.stringContaining('workspace:'),
    });
  });

  it('owns both VS Code protocol dependencies', () => {
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      '@bladets/template',
      'vscode-languageserver',
      'vscode-languageserver-textdocument',
    ]);
  });
});

describe('the VS Code extension consumes published files only', () => {
  const extension = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'packages/blade-vscode/package.json'),
      'utf8'
    )
  ) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };

  it('bundles the language server from a path that exists in the tarball', () => {
    // The build used to run
    // `esbuild ./node_modules/@bladets/template/src/lsp/server.ts`, a path that
    // resolves only through the pnpm workspace symlink: `files` does not ship
    // `src`, so anyone installing from the registry - a fork, a contributor on
    // npm - got "Could not resolve". It also compiled the server under the
    // wrong package's tsconfig, and esbuild never typechecks, so the shipped
    // language server was typechecked by nobody.
    const script = extension.scripts['esbuild:server'];
    expect(script).toContain('@bladets/lsp-server/dist/');
    expect(script).not.toContain('/src/');

    const published = manifestOf('packages/blade-lsp-server').files ?? [];
    expect(published).toContain('dist');
  });

  it('declares the package it bundles', () => {
    expect(extension.dependencies).toMatchObject({
      '@bladets/lsp-server': expect.stringContaining('workspace:'),
    });
  });
});
