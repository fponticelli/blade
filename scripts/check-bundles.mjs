#!/usr/bin/env node
/**
 * Verifies that the published bundles keep their peer dependencies external
 * instead of inlining them, and that each package's README still describes the
 * package it ships with.
 *
 * @bladets/tempo shipped twice (0.4.0 and 0.5.0) with the whole @bladets/template
 * engine inlined: 26.3 kB gzip instead of ~3 kB, and two copies of the engine in
 * any app that depends on both packages. The cause is a Rollup `external` entry
 * that lists the bare specifier `@bladets/template` while the source only ever
 * imports the `@bladets/template/browser` subpath, so nothing matches and the
 * whole graph is pulled in.
 *
 * Three independent signals are asserted per bundle, because no single one is
 * reliable on its own:
 *
 *   1. `requiredExternals` - the specifier must appear as a real import/require
 *      target. Proves the dependency is still a module edge and not a copy.
 *   2. `forbiddenMarkers` - identifiers that exist only inside the dependency's
 *      implementation and are not part of this package's public API. Only keys
 *      of the helper registry are used, because an object key survives
 *      minification while a local binding does not.
 *   3. `maxGzipBytes` - a transfer-size budget. Catches a regression that slips
 *      past both string checks.
 *
 * The README claims are checked against the same two sources of truth, because
 * a README is documentation that rots silently: this one told readers to install
 * `@tempots/dom` ^35 while package.json required ^37 - an ERESOLVE failure for
 * anyone who followed it - and advertised "< 3KB gzipped" for a bundle that was
 * measured at 26.3 kB. Both numbers are now derived from the artefacts.
 *
 * A fourth, independent assertion covers the entry points that must run
 * anywhere: `@bladets/template`'s default and browser bundles are checked to
 * import NO Node built-in, following the shared chunks they split into. The
 * main entry used to `export * as project` a module that reads the filesystem,
 * so `dist/index.js` began with `import ... from "fs"` and
 * `import { compile } from '@bladets/template'` - the first example in the
 * README - failed to load on Cloudflare Workers, Vercel Edge and Deno Deploy.
 * Nothing but a mechanical check keeps a single convenience re-export from
 * putting it back.
 *
 * Run after `pnpm build`. Exits non-zero with a per-bundle report on failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} BundleSpec
 * @property {string} pkg               npm name, for reporting only
 * @property {string} file              path relative to the repository root
 * @property {'esm' | 'cjs'} format     how module edges are spelled in the file
 * @property {string[]} requiredExternals  specifiers that must remain imports;
 *                                         a subpath of the entry counts as a match
 * @property {string[]} forbiddenMarkers   identifiers that prove an inlined copy
 * @property {number} maxGzipBytes         transfer-size budget
 */

/** Helper-registry keys of @bladets/template; unmangleable and not re-exported by dependants. */
const TEMPLATE_ENGINE_MARKERS = ['formatCurrency', 'formatPercent'];

/** @type {BundleSpec[]} */
const BUNDLES = [
  {
    pkg: '@bladets/tempo',
    file: 'packages/blade-tempo/dist/index.js',
    format: 'esm',
    requiredExternals: ['@bladets/template', '@tempots/dom'],
    forbiddenMarkers: TEMPLATE_ENGINE_MARKERS,
    maxGzipBytes: 8 * 1024,
  },
  {
    pkg: '@bladets/tempo',
    file: 'packages/blade-tempo/dist/index.cjs',
    format: 'cjs',
    requiredExternals: ['@bladets/template', '@tempots/dom'],
    forbiddenMarkers: TEMPLATE_ENGINE_MARKERS,
    maxGzipBytes: 8 * 1024,
  },
  // The language server was carved out of @bladets/template so that installing
  // a template engine stops downloading ~1.19 MB of `vscode-languageserver*`
  // that a web server never loads. The same rule applies in reverse: this
  // package must keep the engine an edge, or the VSIX ends up carrying two
  // differently-built copies of it again.
  {
    pkg: '@bladets/lsp-server',
    file: 'packages/blade-lsp-server/dist/server.js',
    format: 'esm',
    requiredExternals: ['@bladets/template', 'vscode-languageserver'],
    forbiddenMarkers: TEMPLATE_ENGINE_MARKERS,
    maxGzipBytes: 32 * 1024,
  },
  {
    pkg: '@bladets/lsp-server',
    file: 'packages/blade-lsp-server/dist/server.cjs',
    format: 'cjs',
    requiredExternals: ['@bladets/template', 'vscode-languageserver'],
    forbiddenMarkers: TEMPLATE_ENGINE_MARKERS,
    maxGzipBytes: 32 * 1024,
  },
];

/**
 * Module names Node resolves without a `node_modules` entry.
 *
 * `builtinModules` omits the `node:`-prefixed spellings, which resolve to the
 * same modules and would otherwise slip through.
 */
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`),
]);

/**
 * @typedef {object} NeutralSpec
 * @property {string} pkg     npm name, for reporting only
 * @property {string} file    entry bundle, relative to the repository root
 * @property {'esm' | 'cjs'} format
 * @property {string[]} forbiddenPackages  non-builtin specifiers that must not
 *                                         be reachable either
 */

/**
 * Entry points that must load on a runtime with no Node built-ins at all:
 * Cloudflare Workers, Vercel Edge, Deno Deploy, a browser bundle.
 *
 * @type {NeutralSpec[]}
 */
const RUNTIME_NEUTRAL = [
  {
    pkg: '@bladets/template',
    file: 'packages/blade/dist/index.js',
    format: 'esm',
    forbiddenPackages: ['vscode-languageserver', 'ajv'],
  },
  {
    pkg: '@bladets/template',
    file: 'packages/blade/dist/index.cjs',
    format: 'cjs',
    forbiddenPackages: ['vscode-languageserver', 'ajv'],
  },
  {
    pkg: '@bladets/template',
    file: 'packages/blade/dist/browser.js',
    format: 'esm',
    forbiddenPackages: ['vscode-languageserver', 'ajv'],
  },
  {
    pkg: '@bladets/template',
    file: 'packages/blade/dist/browser.cjs',
    format: 'cjs',
    forbiddenPackages: ['vscode-languageserver', 'ajv'],
  },
  {
    pkg: '@bladets/tempo',
    file: 'packages/blade-tempo/dist/index.js',
    format: 'esm',
    forbiddenPackages: ['vscode-languageserver'],
  },
  {
    pkg: '@bladets/tempo',
    file: 'packages/blade-tempo/dist/index.cjs',
    format: 'cjs',
    forbiddenPackages: ['vscode-languageserver'],
  },
];

/**
 * @typedef {object} ReadmeSpec
 * @property {string} pkg       npm name, for reporting only
 * @property {string} readme    path relative to the repository root
 * @property {string} manifest  package.json the peer section must agree with
 * @property {Record<string, string>} bundles  label -> bundle path
 */

/** @type {ReadmeSpec[]} */
const READMES = [
  {
    pkg: '@bladets/tempo',
    readme: 'packages/blade-tempo/README.md',
    manifest: 'packages/blade-tempo/package.json',
    bundles: {
      ESM: 'packages/blade-tempo/dist/index.js',
      CJS: 'packages/blade-tempo/dist/index.cjs',
    },
  },
];

const IMPORT_PATTERNS = {
  // `import x from"m"`, `import"m"`, `export{a}from"m"`, `import("m")`
  esm: /(?:from|import)\s*\(?\s*["']([^"']+)["']/g,
  cjs: /require\s*\(\s*["']([^"']+)["']/g,
};

/**
 * Collects every module specifier the bundle still resolves at runtime.
 *
 * @param {string} source
 * @param {'esm' | 'cjs'} format
 * @returns {Set<string>}
 */
function collectExternals(source, format) {
  const specifiers = new Set();
  for (const match of source.matchAll(IMPORT_PATTERNS[format])) {
    specifiers.add(match[1]);
  }
  return specifiers;
}

/**
 * A required external is satisfied by the bare specifier or any of its subpaths,
 * so `@bladets/template/browser` counts as `@bladets/template`.
 *
 * @param {Set<string>} specifiers
 * @param {string} required
 * @returns {boolean}
 */
function isExternal(specifiers, required) {
  for (const specifier of specifiers) {
    if (specifier === required || specifier.startsWith(`${required}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {BundleSpec} spec
 * @returns {string[]} one message per violation; empty when the bundle is sound
 */
function checkBundle(spec) {
  const absolute = resolve(repoRoot, spec.file);
  if (!existsSync(absolute)) {
    return [`${spec.file} is missing - run \`pnpm build\` before this check`];
  }

  // The whole entry, chunks included. An entry with two chunks is one artefact
  // as far as a consumer is concerned: the import that proves a dependency is
  // still external, the identifier that proves it is not, and the bytes on the
  // wire can all be one hop away from the file named here.
  const { specifiers, files, missing } = collectReachableSpecifiers(
    absolute,
    spec.format
  );
  const failures = missing.map(
    file => `${file} is imported by the bundle but does not exist`
  );
  const sources = files.map(file => readFileSync(file, 'utf8'));

  for (const required of spec.requiredExternals) {
    if (!isExternal(specifiers, required)) {
      failures.push(
        `${required} is not imported - it has been inlined into the bundle. ` +
          `Add it (and its subpaths) to \`build.rollupOptions.external\`.`
      );
    }
  }

  for (const marker of spec.forbiddenMarkers) {
    if (sources.some(source => source.includes(marker))) {
      failures.push(
        `found \`${marker}\`, which only exists inside @bladets/template - ` +
          `a copy of the engine has been bundled in.`
      );
    }
  }

  const gzipBytes = sources.reduce(
    (total, source) => total + gzipSync(source).length,
    0
  );
  if (gzipBytes > spec.maxGzipBytes) {
    failures.push(
      `${formatBytes(gzipBytes)} gzipped exceeds the ${formatBytes(spec.maxGzipBytes)} budget.`
    );
  }

  return failures;
}

/**
 * Every module specifier an entry still resolves at runtime, following the
 * chunks it splits into.
 *
 * The transitive walk is the whole point. Rollup hoists code shared by two
 * entries into a chunk, so `dist/index.js` can be a one-line re-export of
 * `./index-A1b2C3.js` and a check that reads only the entry file would see
 * nothing. `import "fs"` two hops down still breaks the load on an edge
 * runtime.
 *
 * @param {string} entry   absolute path of the entry bundle
 * @param {'esm' | 'cjs'} format
 * @returns {{ specifiers: Set<string>, files: string[], missing: string[] }}
 *   bare specifiers the graph resolves, the files it is made of, and any
 *   relative chunk that could not be read
 */
function collectReachableSpecifiers(entry, format) {
  const specifiers = new Set();
  const files = [];
  const missing = [];
  const seen = new Set();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    if (!existsSync(file)) {
      missing.push(relative(repoRoot, file));
      continue;
    }
    files.push(file);

    const source = readFileSync(file, 'utf8');
    for (const specifier of collectExternals(source, format)) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        queue.push(resolve(dirname(file), specifier));
      } else {
        specifiers.add(specifier);
      }
    }
  }

  return { specifiers, files, missing };
}

/**
 * Asserts that an entry point reaches no Node built-in and no Node-only
 * dependency.
 *
 * @param {NeutralSpec} spec
 * @returns {string[]} one message per violation
 */
function checkRuntimeNeutral(spec) {
  const absolute = resolve(repoRoot, spec.file);
  if (!existsSync(absolute)) {
    return [`${spec.file} is missing - run \`pnpm build\` before this check`];
  }

  const { specifiers, missing } = collectReachableSpecifiers(
    absolute,
    spec.format
  );
  const failures = missing.map(
    file => `${file} is imported by the bundle but does not exist`
  );

  const builtins = [...specifiers].filter(name => NODE_BUILTINS.has(name));
  if (builtins.length > 0) {
    failures.push(
      `imports the Node built-in${builtins.length === 1 ? '' : 's'} ` +
        `${builtins.sort().join(', ')}. This entry has to load on Cloudflare ` +
        `Workers, Vercel Edge, Deno Deploy and in a browser bundle, where ` +
        `none of them resolve. Move whatever needs them behind the ` +
        `\`./node\` entry.`
    );
  }

  for (const forbidden of spec.forbiddenPackages) {
    for (const specifier of specifiers) {
      if (specifier === forbidden || specifier.startsWith(`${forbidden}/`)) {
        failures.push(
          `imports \`${specifier}\`, which belongs to the Node-only surface ` +
            `and must not be reachable from this entry.`
        );
      }
    }
  }

  return failures;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/**
 * The figure a README may claim: the measured size, rounded UP to the next
 * half-kilobyte.
 *
 * A bound rather than the exact number, so that a hundred bytes of new code
 * does not make the README wrong - and only half a kilobyte of slack, so that
 * the claim cannot quietly become a boast either.
 *
 * @param {number} bytes
 * @returns {string}
 */
function claimableSize(bytes) {
  return (Math.ceil(bytes / 1024 / 0.5) * 0.5).toFixed(1);
}

/**
 * The text between two marker comments, or null when the block is missing.
 *
 * @param {string} source
 * @param {string} name
 * @returns {string | null}
 */
function markedBlock(source, name) {
  const start = source.indexOf(`<!-- ${name}:start -->`);
  const end = source.indexOf(`<!-- ${name}:end -->`);
  if (start === -1 || end === -1 || end < start) return null;
  return source.slice(start, end);
}

/**
 * Checks one README against package.json and the built bundles.
 *
 * @param {ReadmeSpec} spec
 * @returns {string[]} one message per violation
 */
function checkReadme(spec) {
  const readmePath = resolve(repoRoot, spec.readme);
  if (!existsSync(readmePath)) return [`${spec.readme} is missing`];
  const source = readFileSync(readmePath, 'utf8');

  return [...checkReadmePeers(spec, source), ...checkReadmeSize(spec, source)];
}

/**
 * Every declared peer dependency is listed, at the range that is declared, and
 * nothing else is.
 *
 * @param {ReadmeSpec} spec
 * @param {string} source
 * @returns {string[]}
 */
function checkReadmePeers(spec, source) {
  const block = markedBlock(source, 'peer-dependencies');
  if (block === null) {
    return [
      `${spec.readme} has no <!-- peer-dependencies:start --> ... :end block`,
    ];
  }

  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, spec.manifest), 'utf8')
  );
  const declared = manifest.peerDependencies ?? {};
  const failures = [];

  const listed = new Map();
  for (const match of block.matchAll(/^- `([^`]+)` (.+)$/gm)) {
    listed.set(match[1], match[2].trim());
  }

  for (const [name, range] of Object.entries(declared)) {
    const stated = listed.get(name);
    if (stated === undefined) {
      failures.push(`${spec.readme} does not list the peer \`${name}\``);
    } else if (stated !== range) {
      failures.push(
        `${spec.readme} says \`${name}\` ${stated}; package.json says ${range}`
      );
    }
    listed.delete(name);
  }

  for (const name of listed.keys()) {
    failures.push(`${spec.readme} lists \`${name}\`, which is not a peer`);
  }

  return failures;
}

/**
 * The stated bundle size is the real one, to within the rounding the claim is
 * allowed.
 *
 * @param {ReadmeSpec} spec
 * @param {string} source
 * @returns {string[]}
 */
function checkReadmeSize(spec, source) {
  const block = markedBlock(source, 'bundle-size');
  if (block === null) {
    return [`${spec.readme} has no <!-- bundle-size:start --> ... :end block`];
  }

  const failures = [];
  for (const [label, file] of Object.entries(spec.bundles)) {
    const absolute = resolve(repoRoot, file);
    if (!existsSync(absolute)) {
      failures.push(
        `${file} is missing - run \`pnpm build\` before this check`
      );
      continue;
    }
    const size = claimableSize(gzipSync(readFileSync(absolute)).length);
    const claim = `under ${size} kB gzipped (${label})`;
    if (!block.includes(claim)) {
      failures.push(
        `${spec.readme} does not claim "${claim}" - the ${label} bundle is ` +
          `${formatBytes(gzipSync(readFileSync(absolute)).length)} gzipped.`
      );
    }
  }
  return failures;
}

let failed = false;
for (const spec of READMES) {
  const failures = checkReadme(spec);
  if (failures.length === 0) {
    console.log(`ok   ${spec.readme} (${spec.pkg})`);
  } else {
    failed = true;
    console.error(`FAIL ${spec.readme} (${spec.pkg})`);
    for (const failure of failures) console.error(`       - ${failure}`);
  }
}

for (const spec of BUNDLES) {
  const failures = checkBundle(spec);
  if (failures.length === 0) {
    console.log(`ok   ${spec.file} (${spec.pkg})`);
    continue;
  }
  failed = true;
  console.error(`FAIL ${spec.file} (${spec.pkg})`);
  for (const failure of failures) {
    console.error(`       - ${failure}`);
  }
}

for (const spec of RUNTIME_NEUTRAL) {
  const failures = checkRuntimeNeutral(spec);
  if (failures.length === 0) {
    console.log(`ok   ${spec.file} (${spec.pkg}, runtime-neutral)`);
    continue;
  }
  failed = true;
  console.error(`FAIL ${spec.file} (${spec.pkg}, runtime-neutral)`);
  for (const failure of failures) {
    console.error(`       - ${failure}`);
  }
}

if (failed) {
  console.error(
    '\nBundle check failed. The published package would either ship a duplicate\n' +
      'copy of a peer dependency, or fail to load on an edge runtime. Fix the\n' +
      '`external` configuration - or move the offending code behind the `./node`\n' +
      'entry - rather than raising the budget in scripts/check-bundles.mjs.'
  );
  process.exit(1);
}

console.log(
  `\nAll ${BUNDLES.length} bundles keep their peer dependencies external, ` +
    `${RUNTIME_NEUTRAL.length} entry points reach no Node built-in, and ` +
    `${READMES.length} README${READMES.length === 1 ? '' : 's'} still ` +
    `describe${READMES.length === 1 ? 's' : ''} what is shipped.`
);
