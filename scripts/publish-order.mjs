#!/usr/bin/env node
// Emit the set of npm-publishable packages in dependency (topological) order.
//
// The publish list is DERIVED, not hand-maintained. This repo previously carried
// two hand-rolled publish scripts that each covered a different subset of the
// packages; a derived list cannot silently omit a package the way those did.
//
// A package is publishable when it is neither `"private": true` nor listed in
// `.changeset/config.json`'s `ignore` array. That array is already the declared
// source of truth for "this package is versioned here but does not go to npm"
// (it holds `blade-templates`, the VS Code extension, which ships to the
// Marketplace). Reading it here keeps that fact declared in exactly one place.
//
// Output: one line per package, TAB-separated:
//   <dir>\t<name>\t<comma-separated transitive in-repo dep names>
//
// The dep column lets publish.sh cascade a failure: if a package fails to
// publish, every later package that (transitively) depends on it is skipped
// rather than published against a dependency that never shipped.
//
// Edges come from `dependencies` + `peerDependencies` + `optionalDependencies` —
// the specs that must resolve for a consumer. NOT `devDependencies`, which are
// irrelevant to a published consumer and would introduce false cycles (every
// package here dev-depends on its siblings for tests).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgsDir = join(root, 'packages');

/** Packages versioned in this repo but deliberately not published to npm. */
function ignoredByChangesets() {
  const cfg = join(root, '.changeset', 'config.json');
  if (!existsSync(cfg)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(cfg, 'utf8')).ignore ?? []);
  } catch (error) {
    console.error(`publish-order: cannot read ${cfg}: ${error.message}`);
    process.exit(1);
  }
}

const ignored = ignoredByChangesets();

const pkgs = [];
for (const dir of readdirSync(pkgsDir)) {
  const pj = join(pkgsDir, dir, 'package.json');
  if (!existsSync(pj)) continue;
  const json = JSON.parse(readFileSync(pj, 'utf8'));
  pkgs.push({
    dir,
    name: json.name,
    skip: !!json.private || ignored.has(json.name),
    json,
  });
}

const byName = new Map(pkgs.map((p) => [p.name, p]));
const publishable = pkgs.filter((p) => !p.skip);

/** Direct in-repo runtime edges: `dep` must ship before `p`. */
function directDeps(p) {
  const specs = {
    ...(p.json.dependencies || {}),
    ...(p.json.peerDependencies || {}),
    ...(p.json.optionalDependencies || {}),
  };
  return Object.keys(specs).filter((dep) => byName.has(dep) && !byName.get(dep).skip);
}

// Kahn topological sort, tie-broken by name so the output is deterministic.
const names = new Set(publishable.map((p) => p.name));
const adj = new Map(); // dep name -> set of names that depend on it
const indeg = new Map();
for (const p of publishable) {
  indeg.set(p.name, indeg.get(p.name) || 0);
  for (const dep of directDeps(p)) {
    if (!names.has(dep)) continue;
    if (!adj.has(dep)) adj.set(dep, new Set());
    if (!adj.get(dep).has(p.name)) {
      adj.get(dep).add(p.name);
      indeg.set(p.name, (indeg.get(p.name) || 0) + 1);
    }
  }
}

const ready = publishable
  .filter((p) => (indeg.get(p.name) || 0) === 0)
  .map((p) => p.name)
  .sort();
const order = [];
while (ready.length) {
  const name = ready.shift();
  order.push(name);
  for (const d of [...(adj.get(name) || [])].sort()) {
    indeg.set(d, indeg.get(d) - 1);
    if (indeg.get(d) === 0) {
      const i = ready.findIndex((x) => x > d);
      if (i === -1) ready.push(d);
      else ready.splice(i, 0, d);
    }
  }
}

if (order.length !== publishable.length) {
  const missing = publishable.map((p) => p.name).filter((n) => !order.includes(n));
  console.error(
    `publish-order: dependency cycle among publishable packages, unresolved: ${missing.join(', ')}`
  );
  process.exit(1);
}

/** Transitive in-repo dependency closure, over the publishable graph. */
function transitive(name) {
  const seen = new Set();
  const stack = directDeps(byName.get(name)).filter((d) => names.has(d));
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    seen.add(d);
    for (const dd of directDeps(byName.get(d))) if (names.has(dd)) stack.push(dd);
  }
  return [...seen];
}

for (const name of order) {
  const p = byName.get(name);
  process.stdout.write(`${p.dir}\t${p.name}\t${transitive(name).join(',')}\n`);
}
