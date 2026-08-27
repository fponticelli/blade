---
'@bladets/tempo': patch
---

Enforce the output-size and wall-clock ceilings in the reactive renderer.

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
