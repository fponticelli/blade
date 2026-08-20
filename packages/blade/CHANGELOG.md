# @bladets/template

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
