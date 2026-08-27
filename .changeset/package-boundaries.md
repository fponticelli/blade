---
'@bladets/template': major
'@bladets/tempo': patch
---

Draw the package boundaries where the runtimes are: a runtime-neutral engine, an
explicit Node entry, and the language server in its own package.

**`npm install @bladets/template` no longer downloads the VS Code protocol.**
The package listed `vscode-languageserver` and `vscode-languageserver-textdocument`
as runtime `dependencies`, so a web server or a browser app installed them and
their transitive tree unconditionally: measured from this repository's store,
**1.19 MB across five packages** - `vscode-languageserver` 195,873 B,
`vscode-languageserver-protocol` 365,342 B, `vscode-languageserver-types`
376,701 B, `vscode-jsonrpc` 208,371 B and `vscode-languageserver-textdocument`
40,277 B - that nothing on that install path ever loads. It was install time, CI
cache bytes, disk, and five more rows in every audit and CVE report, on every
install, forever. The language server now lives in **`@bladets/lsp-server`**,
which depends on `@bladets/template` and owns those two dependencies. The
`./lsp/server` export and the `lsp` namespace are gone from this package.

**The default entry is runtime-neutral, and mechanically so.** `src/index.ts`
did `export * as project`, which pulls `readFileSync`/`readdirSync`/`statSync`/
`existsSync`, so the built `dist/index.js` began with `import ... from "fs"` and
`import { compile } from '@bladets/template'` - the first example in the README,
using two entirely browser-safe symbols - failed to load on Cloudflare Workers,
Vercel Edge and Deno Deploy, the per-millisecond-billed platforms where a
template engine is most attractive. The filesystem-backed project layer moved to
an explicit **`@bladets/template/node`** subpath. `dist/index.js` and
`dist/browser.js` now import no Node built-in at all, and
`scripts/check-bundles.mjs` asserts it by following the shared chunks the
entries split into, as a blocking CI job. The `exports` map also routes the
`browser` condition, and both published packages declare `"sideEffects": false`
so a consumer importing one helper can drop the rest.

**The public API is a list, not an accident.** Both entries were `export *`
barrels over every module in `src`: 302 declarations published with nothing
distinguishing API from implementation, so renaming any internal helper was a
breaking change. Both now name every export, `api/*.api.md` records the surface
per entry, and `pnpm check:api` (plus a test in the suite) fails when the two
disagree. Two exports that the barrels had been publishing by accident are
deleted: `HelperFunctionWithMetadata`, an abandoned design that competed with
`helpers/metadata.ts` and had no reference anywhere, and `JsonSchemaProperty`, a
deprecated alias kept "until the LSP is fixed" long after it was. The AST
traversal (`childrenOf`, `walkNodes`, `expressionsOf`, ...) and the helper
metadata table are now published deliberately, because tooling built on the
engine needs the same total switch over `node.kind` that the engine runs on.

**Migrating.**

| Before                                             | After                                          |
| -------------------------------------------------- | ---------------------------------------------- |
| `import { project } from '@bladets/template'`      | `import { ... } from '@bladets/template/node'` |
| `project.compileProject(root)`                     | `compileProject(root)`                         |
| `import '@bladets/template/lsp/server'`            | `import '@bladets/lsp-server/server'`          |
| `import { lsp } from '@bladets/template'`          | `import { ... } from '@bladets/lsp-server'`    |
| `HelperFunctionWithMetadata`, `JsonSchemaProperty` | deleted; use `HelperMetadata`, `JsonSchema`    |

`@bladets/template/browser` is unchanged and still published: it is now an alias
of the default entry rather than the only browser-safe surface.
