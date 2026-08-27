---
'@bladets/template': minor
'@bladets/tempo': major
---

Give templates two things only a live renderer can use - event bindings and loop
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
