# @bladets/template

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
