---
'@bladets/template': minor
---

Populate `RenderResult.metadata` instead of returning empty sets

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
