# @bladets/tempo

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
