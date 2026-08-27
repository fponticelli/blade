---
'@bladets/template': major
---

Rebuild the language server: fresh diagnostics, real projects, one definition of
every predicate, and a handler behind every advertised capability.

**Diagnostics were permanently one edit stale.** `DocumentManager.change()`
stored new text immediately and deferred the re-parse behind a 200 ms debouncer,
so `ast`, `errors` and `scope` still described the previous keystroke; the server
then validated _synchronously_ from those stale errors, and the debounced parse -
when it landed - published nothing at all. Typing `@if(` showed no error until the
next keystroke, and that error described the previous text. Freshness is now a
property of the document: `DocumentManager.get()` parses a pending edit on
demand, so text, line index, AST, errors and scope are always the same version,
and the parse is the single point diagnostics are published from. The same
staleness poisoned completion and hover, which resolved offsets from one version
against a scope built for another.

**A project is the nearest ancestor holding `index.blade`.** The server used
`dirname(file)`, which is true only for the entry file, so opening any component
gave zero schema completions, zero sample hints and zero component tags, with no
diagnostic to say why. `findProjectRoot` in `project/root.ts` is now the one
definition, and the search is bounded by the workspace folder.

**The project cache is invalidated and bounded.** It was a module-level `Map`,
written once per root and never deleted from: editing `schema.json` changed
nothing until the window was reloaded, and every root a session touched stayed
resident for the life of the process. `ProjectContextCache` caches the _outcome_ -
including "not a project", which was previously discarded, so a file outside a
project re-ran the whole recursive filesystem walk on every keystroke - bounds
itself, de-duplicates concurrent loads, evicts by path from
`workspace/didChangeWatchedFiles` and drops roots no open document needs.

**Advertised capabilities now have handlers.** `definitionProvider` and
`referencesProvider` were declared while both handlers returned `null`, leaving
`findDefinition`, `findReferences`, `generateDiagnostics`, `validateSamples` and
`generatePropsValidationDiagnostics` implemented, tested and unreachable - and
hiding a references bug that built `\$$user\b` from a word that already began
with `$`. A contract test now enumerates the declared capabilities and fails if
one has no handler that answers. References come from the expression AST.

**Context detection reads the AST instead of re-lexing by hand.** Three
unbounded backward scanners disagreed with the parser and with each other:
`support@example.com` in prose offered `if`/`for`/`match` in the middle of the
address, a `5 < 10` earlier in a paragraph made everything after it look like a
tag, and `isInsidePropsDirective` had three implementations with 50-character,
100-character and single-line cutoffs. `analyzer/context.ts` locates the node
containing the offset and asks it; the remaining fallback scans never leave the
current line or node.

**Scope is a binary search, not a map scan.** The analyser stored two copies of
the full variable list per AST node and the lookup iterated the whole map -
~4000 entries per completion on a 2000-node template, twice per request. Nested
scopes flatten into a sorted segment table resolved in O(log n). A component
definition body now correctly sees only its own props, as it does at render
time. Line/column conversion is a shared `Int32Array` index computed once per
version, replacing three implementations that split the entire document on every
call.

**The settings do what they say.** `unusedVariables`, `deprecatedHelpers`,
`deepNesting`, `deepNestingThreshold`, `snippets`, `dataSchemaPath`,
`helpersDefinitionPath`, `performance.maxFileSize` and `blade.trace.server` were
all contributed and consumed by nothing; all are implemented, including a
level-checked logger that replaces sixteen unconditional log calls on the
per-request path.

**Sample validation uses the schema.** The hand-rolled walker skipped absent
properties - so a sample missing a required field validated clean - reported a
false type mismatch for every `integer`, and understood no `$ref`, `$defs`,
`oneOf` or `additionalProperties`. It is replaced by `ProjectSchema.validate`,
and each diagnostic points at the offending value instead of at line 0.

Breaking: `DocumentScope.variables` becomes `segments` plus `declarations`,
`usedVariables`, `helpersUsed` and `nestingSites`; `getCompletions(context,
options)` drops its scope parameter; `getOffset`/`getPosition` become
`offsetOfPosition`/`positionOfOffset` over a document; `isInsideExpression`,
`isAfterDirective`, `isInsideTag`, `getNestingDepthAtOffset`,
`shouldRefreshContext` and `refreshProjectContext` are gone, replaced by
`resolveContext`; `SampleValidationError` is the schema's own error type;
`textDocumentSync` is now `Incremental` and `' '` is no longer a completion
trigger.
