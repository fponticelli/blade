#!/usr/bin/env node
/**
 * The public API surface of every published entry point, as a checked-in file.
 *
 * Both entry points used to be `export *` barrels over every module in `src`,
 * which published 348 declarations - 108 kB of `.d.ts` - with nothing marking
 * where the intended API stopped and the implementation began. The cost was
 * real and already paid: two byte-identical `sourceAttributeName` helpers were
 * both public and drifted into separate call sites, and an abandoned parallel
 * design (`HelperFunctionWithMetadata`) sat in the surface for releases because
 * nobody could see it was there.
 *
 * The entry files now list every export by name. This tool is the second half
 * of that: it reads what the entry actually exports - via the TypeScript
 * checker, so a name re-exported three modules deep is still seen - and writes
 * it to `<package>/api/<entry>.api.md`. `--check` compares instead of writing,
 * so an unintended addition or removal shows up as a failed test and a diff a
 * reviewer has to approve, rather than as a silent major-version bug.
 *
 *   node scripts/api-surface.mjs           # verify (same as --check)
 *   node scripts/api-surface.mjs --write   # accept the current surface
 *
 * Names and declaration kinds only, not full signatures: a signature snapshot
 * of this surface would be the same 108 kB nobody reads, and the failure this
 * guards against is a symbol appearing or vanishing, not a parameter changing
 * (which `pnpm typecheck` in the dependent packages already catches).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} EntrySpec
 * @property {string} label     heading in the report, and the `.api.md` basename
 * @property {string} entry     entry module, relative to the repository root
 */

/**
 * @typedef {object} PackageSpec
 * @property {string} pkg        npm name, for reporting
 * @property {string} dir        package directory, relative to the repository root
 * @property {EntrySpec[]} entries
 */

/** @type {PackageSpec[]} */
export const PACKAGES = [
  {
    pkg: '@bladets/template',
    dir: 'packages/blade',
    entries: [
      { label: 'index', entry: 'packages/blade/src/index.ts' },
      { label: 'browser', entry: 'packages/blade/src/browser.ts' },
      { label: 'node', entry: 'packages/blade/src/node.ts' },
    ],
  },
  {
    pkg: '@bladets/lsp-server',
    dir: 'packages/blade-lsp-server',
    entries: [
      { label: 'index', entry: 'packages/blade-lsp-server/src/index.ts' },
      { label: 'server', entry: 'packages/blade-lsp-server/src/server.ts' },
    ],
  },
  {
    pkg: '@bladets/tempo',
    dir: 'packages/blade-tempo',
    entries: [{ label: 'index', entry: 'packages/blade-tempo/src/index.ts' }],
  },
];

/**
 * One package's spec, by npm name.
 *
 * Each package's own suite checks only its own surface, so that a change in a
 * sibling cannot be masked by a cached test run in a package turbo believes is
 * untouched. `pnpm check:api` checks all of them at once.
 *
 * @param {string} name  npm name, e.g. `@bladets/template`
 * @returns {PackageSpec}
 */
export function packageSpec(name) {
  const spec = PACKAGES.find(candidate => candidate.pkg === name);
  if (spec === undefined) {
    throw new Error(
      `${name} has no API surface spec - add it to PACKAGES in scripts/api-surface.mjs`
    );
  }
  return spec;
}

/**
 * The compiler options every entry is read under.
 *
 * Deliberately not a package `tsconfig.json`: the surface must not depend on
 * which package the tool is invoked from, and nothing is emitted, so only
 * resolution has to be right. `bundler` resolution matches what the packages
 * themselves are typechecked with, and the workspace `paths` let an entry that
 * imports a sibling by its npm name be followed to that sibling's source
 * instead of to a `dist` that may not have been built yet.
 *
 * @type {ts.CompilerOptions}
 */
const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  baseUrl: repoRoot,
  paths: {
    '@bladets/template': ['packages/blade/src/index.ts'],
    '@bladets/template/browser': ['packages/blade/src/browser.ts'],
    '@bladets/template/node': ['packages/blade/src/node.ts'],
    '@bladets/lsp-server': ['packages/blade-lsp-server/src/index.ts'],
    '@bladets/corpus': ['packages/blade-corpus/src/index.ts'],
  },
};

/**
 * The declaration kind a name is published as.
 *
 * A single label per symbol, chosen so a value/type confusion is visible: a
 * name that stops being a value and becomes a type-only export is a breaking
 * change for every `import { x }` of it, and the two are indistinguishable if
 * the report only lists names.
 *
 * @param {ts.Symbol} symbol
 * @returns {string}
 */
function kindOf(symbol) {
  const flags = symbol.flags;
  if (flags & ts.SymbolFlags.Alias) return 'alias';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Method) return 'function';
  if (flags & ts.SymbolFlags.ValueModule) return 'namespace';
  if (flags & ts.SymbolFlags.NamespaceModule) return 'namespace';
  if (flags & ts.SymbolFlags.Variable) return 'const';
  if (flags & ts.SymbolFlags.Property) return 'const';
  return 'unknown';
}

/**
 * Reads one entry's exports.
 *
 * @param {ts.Program} program
 * @param {ts.TypeChecker} checker
 * @param {string} entry  absolute path
 * @returns {{ name: string, kind: string, members?: string[] }[]}
 */
function exportsOf(program, checker, entry) {
  const source = program.getSourceFile(entry);
  if (source === undefined) {
    throw new Error(`entry not found in program: ${entry}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) {
    throw new Error(`entry is not a module: ${entry}`);
  }

  return checker
    .getExportsOfModule(moduleSymbol)
    .map(symbol => {
      const resolved =
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      const kind = kindOf(resolved);
      /** @type {{ name: string, kind: string, members?: string[] }} */
      const entryRecord = { name: symbol.getName(), kind };
      if (kind === 'namespace') {
        entryRecord.members = checker
          .getExportsOfModule(resolved)
          .map(member => member.getName())
          .sort();
      }
      return entryRecord;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/**
 * Renders one entry's surface as Markdown.
 *
 * @param {EntrySpec} spec
 * @param {{ name: string, kind: string, members?: string[] }[]} records
 * @returns {string}
 */
function render(spec, records) {
  const lines = [
    `# ${spec.label}`,
    '',
    `Entry: \`${spec.entry}\``,
    '',
    `${records.length} exported declaration${records.length === 1 ? '' : 's'}.`,
    '',
    'Generated by `node scripts/api-surface.mjs --write`. Do not edit by hand.',
    '',
  ];
  for (const record of records) {
    lines.push(`- \`${record.name}\` — ${record.kind}`);
    if (record.members !== undefined) {
      for (const member of record.members) {
        lines.push(`  - \`${record.name}.${member}\``);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * The report for every entry of every package, keyed by the path it belongs at.
 *
 * One program per run: the entries share most of their graph, and the checker
 * has to see all of them anyway to resolve cross-package re-exports.
 *
 * @param {PackageSpec[]} [packages]
 * @returns {Map<string, string>} absolute `.api.md` path -> contents
 */
export function buildApiReports(packages = PACKAGES) {
  const specs = packages.flatMap(pkg =>
    pkg.entries.map(entry => ({ pkg, entry }))
  );
  const entryPaths = specs.map(({ entry }) => resolve(repoRoot, entry.entry));

  const missing = entryPaths.filter(path => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(
      `entry file(s) missing: ${missing.map(p => relative(repoRoot, p)).join(', ')}`
    );
  }

  const program = ts.createProgram(entryPaths, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();

  /** @type {Map<string, string>} */
  const reports = new Map();
  for (const { pkg, entry } of specs) {
    const records = exportsOf(program, checker, resolve(repoRoot, entry.entry));
    const path = resolve(repoRoot, pkg.dir, 'api', `${entry.label}.api.md`);
    reports.set(path, render(entry, records));
  }
  return reports;
}

/**
 * Compares the generated reports against what is checked in.
 *
 * @param {PackageSpec[]} [packages]
 * @returns {string[]} one message per drifted entry; empty when in sync
 */
export function checkApiReports(packages = PACKAGES) {
  const failures = [];
  for (const [path, expected] of buildApiReports(packages)) {
    const shown = relative(repoRoot, path);
    if (!existsSync(path)) {
      failures.push(`${shown} is missing`);
      continue;
    }
    const actual = readFileSync(path, 'utf8');
    if (actual !== expected) {
      failures.push(
        `${shown} is out of date: ${describeDrift(actual, expected)}`
      );
    }
  }
  return failures;
}

/**
 * Names added and removed between two reports, so the failure message says
 * which symbol moved rather than only that the file differs.
 *
 * @param {string} actual
 * @param {string} expected
 * @returns {string}
 */
function describeDrift(actual, expected) {
  const names = source =>
    new Set([...source.matchAll(/^- `([^`]+)`/gm)].map(match => match[1]));
  const before = names(actual);
  const after = names(expected);
  const added = [...after].filter(name => !before.has(name));
  const removed = [...before].filter(name => !after.has(name));
  const parts = [];
  if (added.length > 0) parts.push(`added ${added.join(', ')}`);
  if (removed.length > 0) parts.push(`removed ${removed.join(', ')}`);
  if (parts.length === 0) parts.push('a declaration kind changed');
  return parts.join('; ');
}

/**
 * Writes every report to disk.
 *
 * @param {PackageSpec[]} [packages]
 * @returns {string[]} the paths written, relative to the repository root
 */
export function writeApiReports(packages = PACKAGES) {
  const written = [];
  for (const [path, contents] of buildApiReports(packages)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
    written.push(relative(repoRoot, path));
  }
  return written;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  if (process.argv.includes('--write')) {
    for (const path of writeApiReports()) console.log(`wrote ${path}`);
  } else {
    const failures = checkApiReports();
    if (failures.length > 0) {
      console.error('Public API surface has drifted:\n');
      for (const failure of failures) console.error(`  - ${failure}`);
      console.error(
        '\nIf the change is intended, run `node scripts/api-surface.mjs --write`\n' +
          'and commit the updated `api/*.api.md` so the new surface is reviewed.'
      );
      process.exit(1);
    }
    console.log('Public API surface matches the checked-in reports.');
  }
}
