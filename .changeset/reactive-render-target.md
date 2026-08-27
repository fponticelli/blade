---
'@bladets/template': minor
'@bladets/tempo': major
---

Make `@bladets/tempo` the third implementation of the engine's render seam
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
