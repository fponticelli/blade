# @bladets/tempo

## 0.6.0

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

- b28fe6e: Enforce the output-size and wall-clock ceilings in the reactive renderer.

  `maxOutputChars` and `maxRenderMillis` are the two ceilings counted at the sink
  rather than in the shared traversal, and `TempoTarget` was handed the
  `OutputBudget` by `renderTo` and dropped it. Every other ceiling was enforced,
  which is why the hole survived review: the renderer was demonstrably "subject to
  the limits" without either of the two a target has to opt into ever being
  checked. A 900-row table of 5 kB rows rendered 4.5 MB into the reader's tab with
  `maxOutputChars: 10000` set, and reported nothing - a template a server would
  refuse to render allocating without bound on the machine least able to afford it.

  The sink now charges what it writes: element tags, attribute names and their
  opening values, listener names, text, `$!` markup and comments, using the same
  figures `DomTarget` charges, so the three renderers are bounded by comparable
  numbers. A breach arrives through `onError` as a `ResourceLimitError`, like every
  other ceiling here.

  Only the **build pass** is accounted - the traversal that produces the initial
  tree. A ceiling is a promise about one render, and a mounted tree is not a render
  in progress: charging later updates against the budget the build spent would fail
  a page that had already mounted, ten seconds after the fact, when the deadline set
  at mount expired. Bounding what a live tree accumulates over its lifetime needs a
  limit of its own.

  A breached ceiling is also now reported once rather than once per row. Failures
  with no expression behind them were keyed on their message, and a size ceiling
  reports how much has been written - a different number every check - so a `@for`
  whose rows exhausted the budget reported once per refused row. Resource limits key
  on which ceiling was breached.

  `limits/output-size-override` is no longer excluded from the conformance corpus
  for this renderer; the corpus now declares exactly one exclusion.

## 0.5.0

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

### Patch Changes

- Updated dependencies [57ff60c]
- Updated dependencies [57ff60c]
  - @bladets/template@0.6.0

## 0.4.0

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

### Patch Changes

- Updated dependencies [1d5f8f9]
  - @bladets/template@0.5.0
