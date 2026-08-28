# @bladets/template

## 0.7.0

### Minor Changes

- b28fe6e: Give templates two things only a live renderer can use - event bindings and loop
  keys - and make the reactive renderer's failure channel usable.

  **Event bindings.** `on:click=${handler}` binds a function to an element:

  ```html
  <button on:click=${submit}>Save</button>
  ```

  It is not an attribute. An attribute carries text and no text is a function,
  which is exactly why interpolating into a legacy `onclick=` has always been
  refused. An `on:` binding never becomes source: the expression evaluates to
  something callable - a function from the data or the globals, or a `@let` arrow -
  and the sink binds it. Nothing is written to the markup.
  - New AST kind `EventAttributeNode` in the `AttributeNode` union; `attr.event`
    builds one. An exhaustive switch over attributes must handle it.
  - `RenderTarget` gains `readonly bindsEvents: boolean` and `ElementSpec` gains
    `listeners: readonly EventBinding[]`. A sink that answers `false` never sees a
    listener: the traversal refuses the binding once, with a location, rather than
    leaving each sink to decide what to do with something it cannot represent.
  - `StringTarget` answers false and the render warns; `DomTarget` and
    `@bladets/tempo`'s `TempoTarget` attach a real listener that reads the handler
    from its cell when the event fires.
  - `CompileOptions.target` (`'dom' | 'string'`, default `'dom'`) turns that
    warning into a compile error for a template meant to be serialised.
  - New evaluator exports `isCallable` and `callValue`, so a `TemplateFunction` and
    a host function can be called through one path.
  - New diagnostics: `EVENT_NOT_AN_EXPRESSION`, `EVENT_WITHOUT_NAME`,
    `EVENT_IN_STRING_TARGET`.

  **Loop keys.** `@for(row of rows key row.id)` names what a pass _is_ rather than
  where it sits.
  - `ForNode.key?: ExprAst`, parsed from a `key` keyword at the top level of the
    header. `@for(x of key)` still iterates a field called `key`.
  - `Reactivity.each` takes an optional `keyOf`, and its `body` now receives the
    index as a `Dyn<number>` rather than a number - a keyed row keeps its DOM when
    it moves, so its position is exactly the thing that changes.
  - An eager render ignores the key: it builds every pass from scratch and has no
    earlier row to match. `@bladets/tempo` dispatches to `KeyedForEach`, so
    re-sorting a list moves rows instead of rewriting whatever now sits in each
    slot - which is the difference between sorting a table and moving the reader's
    cursor into a different row.
  - Duplicate keys are reported at render time; a key that reads the index variable
    is a compile error (`KEY_USES_INDEX`); a keyless loop whose body holds a form
    control or a component is a warning (`UNKEYED_LOOP`).

  **@bladets/tempo's failure channel.** `onError` is called once per distinct
  failure per pass, at the end of the pass, with a third argument carrying the
  occurrence count, the loop position it was first seen at, and whether the render
  stopped or substituted. One bad expression in a 200-row table was 200
  `console.warn`s at mount and 200 more on every change; it is now one report
  saying it happened 200 times. Values the engine refused or substituted - a
  blocked `javascript:` URL, a `@for` with duplicate keys - reach the same channel,
  which an incremental render previously had no way to surface at all.

  Breaking: `ErrorHandler` gained a third parameter (a two-argument handler still
  compiles), and reports now arrive at the end of the pass rather than during it.

  **Also:** `pnpm check:bundles` now checks each README's peer-dependency list
  against its `package.json` and its stated bundle size against the built files.

- b28fe6e: Rebuild the language server: fresh diagnostics, real projects, one definition of
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

- b28fe6e: Draw the package boundaries where the runtimes are: a runtime-neutral engine, an
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

- b28fe6e: Add `createProjectCompiler()` to `@bladets/template/node`: a project compile that
  reuses the per-component work it already did, keyed by the bytes it was computed
  from.

  `compileProjectSources` parses and compiles every component on every call, which
  is right for a build and wrong for a live preview or a language server, where the
  only thing that changed since the last call is the buffer being typed into. A
  twenty-component project paid twenty parses and twenty compiles per keystroke
  burst to rebuild a byte-identical component set. A compiler re-parses a component
  when its own source or path changes, re-compiles the component set when any of
  them changes - a component is checked against the registry of all of them - and
  compiles the entry file every time, because that is the one that changed.

  Nothing here reads a clock or an mtime: a cached value is reused only when the
  exact input that produced it comes back, so `compiler.compile(sources)` and
  `compileProjectSources(sources)` always agree.

- b28fe6e: Rebuild the project layer: asynchronous throughout, bounded on disk, validated
  across the whole component graph, and testable without a directory.

  **Discovery no longer walks `node_modules`.** `scanDirectory` recursed into every
  folder that did not itself contain an `index.blade`, with a `readdirSync` and a
  `statSync` per directory - dependency trees, `dist`, `.turbo`, vendored assets
  and all. The language server is single-threaded, so that walk stopped completion,
  hover and diagnostics for as long as it ran, and `lsp/project-context.ts`
  `await`ed a value that was never a promise. It is now `fs/promises`, with an
  explicit exclude set (`DEFAULT_EXCLUDED_DIRECTORIES`), a caller `exclude`, a
  `maxDepth`, and no `statSync`: each directory is listed once and the listing
  answers both "is this a separate project?" and "what is in it?".

  **The module is async, so schema-driven validation exists.** `compileProject` was
  synchronous over asynchronous schema and sample loaders, so it could not await
  them: `createProjectContext` hard-coded `entry: 'index.blade'`, `schema:
undefined` and `samples: new Map()` with no parameter that could say otherwise,
  and every check gated on the context's schema was dead for every project ever
  built. `compileProject` and `discoverComponents` now return promises, and the
  context carries the entry, schema and samples the project actually has. Turning
  it on found three shipped samples that contradicted their own schema.

  **Validation covers the whole reachable graph.** Only `index.blade` was compiled
  and traversed; component files were read solely to parse `@props`. A typo in a
  component's own markup - `<Buton title="x">` inside `card.blade` - produced no
  diagnostic at all, and the project reported success. Every discovered component
  is now compiled against the full registry, `Diagnostic` gains a `file`, and
  component reference cycles are reported as `CIRCULAR_COMPONENT` warnings.

  **Props are inferred from the AST, not a regular expression.** A component with
  no `@props` had its props inferred by `/\$(\w+)/` over the raw source, and every
  match was marked **required**: a component containing `@for(item of items)`
  demanded an `item` attribute at every call site, so a project failed to compile
  over a loop variable, while `${...}` block expressions were invisible and the
  props that really were required went missing. Inference now computes the free
  variables of the parsed body (`collectFreeVariables`), and an inferred prop is
  never required - an undeclared one is an `UNDECLARED_PROP` warning.

  **JSON Schema is Ajv's job.** `schema.json` was read by a hand-rolled model of
  six keywords: `$ref`, `$defs`, `allOf` and `oneOf` each produced a property with
  no type and no children, so whole subtrees vanished from completions, and a
  document whose root was a `$ref` returned a non-null schema with no properties at
  all - silently empty completions. `ProjectSchema.validate` is now an Ajv-compiled
  validator (`ajv`, `ajv-formats`), and the flattener resolves `$ref` and
  composition before it walks. A `schema.json` that cannot be used is reported
  instead of swallowed by a bare `catch`.

  **`entry` is checked for containment.** It was joined to the project root and
  read, so `entry: '../../../etc/passwd'` was parsed as a template and quoted back
  in diagnostics. `resolveWithinRoot` resolves both sides through symbolic links
  and refuses anything outside the root with a `PathEscapeError`; it is exported,
  because any host taking a filename from a message needs the same check.

  **I/O is separated from logic.** `readProjectSources` does the reading;
  `compileProjectSources` is pure. Everything reads through an injectable
  `FileSystem`, and `createMemoryFileSystem` makes a whole project an inline string
  map - for tests, and for an editor with unsaved buffers.

  Breaking changes:
  - `compileProject(root, options?)` and `discoverComponents(root, options?)`
    return promises.
  - `createProjectContext(init)` takes one object: `{ rootPath, entry?, schema?,
samples?, components, templateComponents? }`.
  - `ProjectOptions` is gone; the options a load takes are `ProjectLoadOptions`
    (`entry`, `io`, `exclude`, `maxDepth`). Its `sourceTracking` flag had never
    been read - source tracking is a render option.
  - `extractSchemaProperties(document)` takes the whole document, so that `$ref`
    can resolve; `SchemaPropertyInfo` gains `required`.
  - `createMissingPropDiagnostic` is gone: `validation`'s `checkRequiredProps` is
    the one implementation, and `ComponentSchema` gains `definedIn` so it can name
    the file that declares the prop.
  - `Diagnostic` gains an optional `file`; `JsonSchema` gains `$schema`, `$ref`,
    `$defs`, `definitions`, `allOf`, `oneOf`, `anyOf`, `additionalProperties`,
    `title` and `format`.

- b28fe6e: Make `@bladets/tempo` the third implementation of the engine's render seam
  rather than a fourth traversal of its semantics.

  **@bladets/template** — the single traversal is now parameterised by _when_ it
  decides as well as by _where_ it writes. A new `Reactivity` (`renderer/reactive.ts`)
  sits alongside `RenderTarget`: `Dyn<T>` is a value that may change, `DynScope`
  holds bindings as cells, and the traversal routes every data-dependent decision
  - an expression, an attribute, an `@if` arm, a loop's list, a `@let`, a
    component's props - through it. `EAGER` is the implementation the string and DOM
    sinks use and behaves exactly as before.

  Breaking, for hosts driving the renderer directly:
  - `RenderContext.scope` is a `DynScope` (read `scope.snapshot()` for the concrete
    `Scope`) and is now `readonly`; block constructs derive a child context instead
    of writing through it.
  - `createLoopScope`, `createComponentScope` and `addToScope` are replaced by
    `Reactivity.extendScope` / `componentScope` / `extendGlobals`.
  - `RenderTarget.text` and `RenderTarget.rawHtml` take a `Dyn<string>`, and
    `ElementSpec.attributes` is a list of `AttributeBinding`s.
  - `RenderContext.slotDepth`, `componentDepth` and `currentLoopNesting` are
    per-context values rather than counters mutated on the way in and out, so they
    are still right when a region is built after the traversal that created it
    returned.
  - The iteration budget is enforced on a loop's list rather than pass by pass, and
    re-measuring a list replays that loop's contribution instead of adding to it.
  - `canonicalTagName`, `canonicalAttributeName`, `Namespace` and `decodeHtmlText`
    are exported for out-of-tree targets.

  **@bladets/tempo** — rewritten as `SignalReactivity` + `TempoTarget` over the
  engine's `renderTo`. The eleven node converters are gone, and with them eight
  divergences from the other two renderers:
  - Values are no longer HTML-escaped on the way into `createTextNode` and
    `setAttribute`, which parse nothing: `a & b <c> "d"` now renders as itself
    rather than `a &amp; b &lt;c&gt; &quot;d&quot;`, and `href="?a=1&b=2"` is no
    longer a different URL. `htmlEscape` is gone from the options - it is a
    string-serializer knob with no meaning for a DOM sink. URL-scheme validation,
    the refusal of `on*` handlers, the `style` value policy and `<script>`/`<style>`
    escaping all still apply, from the shared traversal.
  - `@let` is a binding, not a one-shot snapshot, and is re-evaluated when its data
    changes - inside a loop body too. `@let` arrow functions are callable.
  - A `@let` binding no longer leaks out of one `@if` arm into another.
  - Loop variables are locals rather than entries spread into the data, so an
    enclosing `@let` of the same name no longer shadows them, and the caller's data
    object is no longer copied once per item per update.
  - `@match` binds `_` to the value it matched inside expression case bodies, and
    evaluates its subject once rather than once per case.
  - A nested component starts with an empty slot map instead of inheriting the
    caller's.
  - The engine's resource ceilings apply, configurable through the new `limits`
    option and reported through `onError` rather than thrown at a caller that has
    already returned. A 50,000-row `@for` and a self-recursive component are now
    bounded.
  - An expression depends on the data paths it reads rather than on the whole
    payload, and recomputes only when those actually move: a 200-row table whose
    unrelated title changes now performs no expression evaluations at all.

  `evaluateSafe`, `evaluateReactive`, `evaluateSync` and `valueToString` are no
  longer exported; `SignalReactivity`, `TempoTarget` and `Emitter` are.

### Patch Changes

- b28fe6e: Fix `$.now`: a configured clock is now reachable from a template.

  `now()` is documented and implemented to return `$.now` when the host sets one,
  and that is how a caller renders a template at a fixed instant. It never
  worked. `$` is also a binding scope, and callee resolution searched the
  bindings before the helpers, so `$.now` was read as a binding named `now` that
  happened to hold a `Date` - and every `now()` in the template failed with
  `Cannot call now: it is bound to a object, not a function`. Setting the clock
  was the one thing `$.now` existed for, and it was the one thing that broke it.

  The helper's unit test called the helper directly through the registry, which
  is the level at which the collision is invisible; nothing rendered a template
  with `$.now` set. The regression tests added here render one.

  A global bound to a name a helper claims is now treated as configuration for
  that helper - the same way `formatDate` already reads `$.locale` and
  `$.timezone` - and falls through to it. Nothing else changes: a **local** still
  shadows a helper and still raises `NOT_CALLABLE`, a global bound to a host
  function is still refused, and a global bound under a name no helper claims is
  still `NOT_CALLABLE` with the message it always had.

## 0.6.0

### Minor Changes

- 57ff60c: Source tracking: `resolveLoopIndices` names the loop element, not the pattern

  Automatic source tracking reported a loop body as the pattern, so every
  iteration emitted the identical string:

  ```html
  <td rd-source="mtd_positions[*].weight">1.40%</td>
  <td rd-source="mtd_positions[*].weight">1.31%</td>
  ```

  That is right for one consumer and useless for the other. The pattern
  identifies the template node, which is what a click-to-select editor needs. It
  does not identify the value, so a provenance registry cannot join a rendered
  cell back to the datum behind it - the row index was discarded before the
  markup was written.

  Set `resolveLoopIndices: true` on the render config (string, DOM and Tempo
  renderers alike) to emit the element instead:

  ```html
  <td rd-source="mtd_positions[0].weight">1.40%</td>
  <td rd-source="mtd_positions[1].weight">1.31%</td>
  ```

  The default is unchanged. Concrete indices collapse to the pattern with
  `path.replace(/\[\d+\]/g, '[*]')`; the reverse is impossible, so a consumer
  that wants both should ask for the index.

  Indices are used whether or not the author named one, so `@for(p of items)` is
  tracked as precisely as `@for(p, i of items)`. Nested loops compose -
  `invoice.lines[2].taxes[0].rate` - and `in` iteration is unaffected, because
  the variable there is a key rather than an element. Hand-written `rd-source`
  still wins over all of it.

  `loopAliases()` takes an optional fifth argument, the index. Existing calls
  behave exactly as before.

  **Breaking:** `RenderConfig` (both packages) gains a required
  `resolveLoopIndices`. Nothing changes for the usual path - `RenderOptions.config`
  takes a `Partial<RenderConfig>` and the default is merged in - but code that
  builds a complete `RenderConfig` literal must add the field.

- 57ff60c: Populate `RenderResult.metadata` instead of returning empty sets

  `pathsAccessed` and `helpersUsed` were declared, initialised and returned, but
  nothing ever wrote to them. Every render reported that the template read no
  data and called no helpers - a silent wrong answer rather than a missing one.

  They are now filled by the evaluator, which is the only place that knows which
  branches ran. The runtime set is therefore a strict subset of the static
  `compiled.root.metadata`: an untaken `@if` arm, the right-hand side of a
  short-circuited `||` and a loop over an empty array all contribute nothing.
  Both sets use the same path notation, so `static \ runtime` is exactly the set
  of fields a given render never touched.

  Two neighbouring fields were wrong for a related reason. Every loop and
  component derives its child context with `{...ctx}`, so a counter kept on the
  context stopped travelling back up at the first copy:
  - `recursionDepth` was always `0`. It now reports the deepest component nesting
    reached, as a high-water mark.
  - `iterationCount` missed every iteration inside a nested loop or inside a
    component. It now counts the whole render.

  The run-wide counters moved behind one shared reference to make that hold.

  **Breaking:** `RenderContext` no longer carries `totalIterations`,
  `maxRecursionDepthReached`, `pathsAccessed` or `helpersUsed` directly; they
  live on `ctx.stats` (`RenderStats`). `RenderResult.metadata` is unchanged.

  **Breaking:** `compiled.root.metadata.pathsAccessed` now serializes paths the
  way the rest of the library does - `rows[0].n` rather than `rows.[0].n`, and
  `$.currency` for globals. Without that the static and runtime sets could not be
  compared.

  **Breaking:** because `iterationCount` is now a true total, `maxTotalIterations`
  bounds the render as a whole rather than only the frame it was counted in. A
  template with loops nested inside other loops or inside components was
  previously undercounted and could exceed the configured budget without
  tripping it; such a template may now raise `ResourceLimitError`. Raise
  `maxTotalIterations` if you were relying on the leak. `maxIterationsPerLoop` is
  unchanged and still bounds one loop.

  Note on scope: `pathsAccessed` records paths as the expression wrote them, so
  inside a loop or component you get the local name (`r.n`, not `rows[*].n`).
  That is deliberate - it is the notation the compiler uses statically, and
  sharing one vocabulary is what makes the two sets comparable. Provenance in the
  caller's terms is what the `rd-source` attributes are for.

## 0.5.0

### Minor Changes

- 1d5f8f9: Implement source tracking emission.

  `rd-source`, `rd-source-op` and `rd-source-note` were specified and configurable
  but never generated: `getSourceAttributeName` was called only from tests, and no
  path collection or classification existed. All three renderers now emit them in
  the wire format of Specification section 9, which is a contract with consumers
  such as ReDoc3.
  - Paths are collected per expression and grouped `;` between expressions, `,`
    within one, with one `rd-source-op` per expression.
  - Component props and loop variables resolve to caller paths, composing through
    nesting: `@for(line of invoice.lines)` plus `<Row amount=$line.amount />`
    reports `invoice.lines[*].amount`.
  - An element claims only the expressions it renders itself; nested elements and
    components own theirs. An authored `rd-source` is never overwritten.
  - Helpers carry a `sourceOp` in the metadata registry; `helperSourceOps`
    classifies custom helpers.

  `@bladets/tempo` previously emitted template line:column coordinates as
  `rd-source`. It now emits data provenance like the other renderers, and gained
  `includeOperationTracking`, `includeNoteGeneration` and `helperSourceOps`.

  BREAKING: `ComponentNode.propPathMapping` is removed. It only ever captured
  props whose value was a bare path and was read by nothing; the renderer computes
  aliases at render time instead.
