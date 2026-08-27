# @bladets/tempo

[![npm](https://img.shields.io/npm/v/@bladets/tempo)](https://www.npmjs.com/package/@bladets/tempo)

Blade template integration for [@tempots/dom](https://www.npmjs.com/package/@tempots/dom) - reactive rendering.

## Installation

```bash
npm install @bladets/tempo @bladets/template @tempots/dom
```

## Quick Start

```typescript
import { compile } from '@bladets/template';
import { createTempoRenderer } from '@bladets/tempo';
import { prop, render } from '@tempots/dom';

// 1. Compile a Blade template
const template = compile('<div>Hello, ${name}!</div>');

// 2. Create a Tempo renderer
const renderer = createTempoRenderer(template);

// 3. Create reactive data
const data = prop({ name: 'World' });

// 4. Mount to DOM
render(renderer(data), document.body);

// 5. Update data reactively
data.value = { name: 'Tempo' }; // DOM updates automatically!
```

## What this package is

One sink, not one renderer. The AST walk, the scope rules, the loop, component
and slot semantics, the escaping decisions and the resource ceilings all live in
`@bladets/template` and are shared with its string and DOM renderers; this
package supplies two things they do not need - a representation made of Tempo
`Renderable`s, and a notion of _when_ a decision is re-made.

That is why the feature list below is not a checklist of constructs. Every
construct works here because it is the same traversal, and the
[cross-renderer conformance suite](./tests/parity.test.ts) renders the same
template both ways and compares the documents. What is worth stating is what
this renderer does that the others cannot, and what it does differently.

### It updates in place

A value that changes updates the text node holding it. A `@if` whose condition
changes swaps that arm and nothing else. A component whose props are unchanged
is not re-rendered because something elsewhere in the data moved: expressions
depend on the fields they actually read, and a table of 600 cells performs no
work at all when an unrelated title changes.

### It binds events

```html
<button on:click=${submit}>Save</button>
```

`on:` is a binding, not an attribute: the expression evaluates to a function -
from the data, the globals, or a `@let` arrow - and the function is bound to the
element. Nothing is written to the markup. The handler is read from the
template's scope when the event fires, so a handler that depends on the data
changes with the data, without the element being rebuilt.

A string render has nowhere to put a closure and refuses the binding; compiling
with `target: 'string'` makes that a compile error.

### It can move a row instead of rewriting it

```html
@for(row of rows key row.id) {
<input value=$row.name />
}
```

Without a key, a row's only identity is its position, so re-sorting a table
hands row 0's node - and the caret, the half-typed value and any widget attached
to it - to whatever item sorted into first place. With one, the row's nodes
move. The key changes nothing about the document, and the string and DOM
renderers ignore it, so a template stays portable.

The compiler warns when a keyless loop's body holds a form control or a
component, which are the cases where reuse by position is observable.

### It reports rather than throws

By the time a limit is breached or an expression throws, the call that mounted
the tree has returned. Everything goes to `onError` instead - including values
the render substituted or refused, such as a blocked `javascript:` URL or a
`@for` whose keys are not unique.

Reporting is per _expression_, once per pass: one bad expression in a 200-row
table is one report saying it happened 200 times, together with the loop
position it was first seen at. It arrives at the end of the pass, because that
is when the count exists.

### Comments

`<!-- ... -->` is dropped unless `includeComments` is set, exactly as in the
string renderer. It is the same option, honoured the same way.

## Values on the page

Values are written through `createTextNode` and `setAttribute`, which parse
nothing, so a value means itself: `a & b <c> "d"` renders as `a & b <c> "d"`,
and `href="?a=1&b=2"` stays that URL. There is no HTML-escaping knob, because
HTML escaping is what a _string_ sink needs and would double-encode this one.

The protections that are not about encoding still apply, because they live in
the shared traversal rather than in this package:

- an `on*` attribute built from an expression is refused outright (`on:` event
  bindings are a different thing entirely - see above);
- a URL-valued attribute with a dynamic part is checked for its scheme, so
  `href="${url}"` cannot become `javascript:`;
- a value interpolated into `style` is constrained to be a value, not a
  declaration, unless `allowStyleInterpolation` says otherwise;
- values interpolated into `<script>` and `<style>` are escaped for those
  contexts, where character references are never decoded.

`$!expr` is raw markup by request, and is parsed as HTML - treat its input as
you would `innerHTML`.

## API

### `createTempoRenderer<T>(template, options?)`

Creates a renderer function from a compiled Blade template.

```typescript
const renderer = createTempoRenderer<MyData>(template, {
  // Custom helper functions
  helpers: {
    formatCurrency: () => (n: number) => `$${n.toFixed(2)}`,
  },
  // Global variables (accessible via $.varName)
  globals: {
    siteName: 'My App',
  },
  // Where every runtime failure is reported: an expression that threw, a
  // resource ceiling that was breached, a value the render refused. Called
  // once per distinct failure per pass; `detail` carries the occurrence count,
  // the loop position, and whether the render stopped or substituted.
  onError: (error, location, detail) => console.error(error, detail),
  // Resource ceilings; unset keys keep the engine's defaults
  limits: { maxIterationsPerLoop: 1000, maxComponentDepth: 10 },
  // Emit HTML comments into the tree
  includeComments: false,
  // Enable source tracking attributes
  includeSourceTracking: false,
  // Prefix for source tracking attributes
  sourceTrackingPrefix: 'rd-',
  // Name the loop element rendered (items[7]) rather than the pattern (items[*])
  resolveLoopIndices: false,
});
```

Returns: `(data: Signal<T>) => Renderable`

### `compileToRenderable<T>(source, options?)`

Compiles a template source and returns the same thing, for when you have the
source rather than a compiled template.

## Bundle

<!-- bundle-size:start -->

under 6.5 kB gzipped (ESM), under 4.0 kB gzipped (CJS), with
`@bladets/template` and `@tempots/dom` kept external rather than copied in.

The ESM figure is the larger of the two because Vite deliberately leaves
whitespace and `/* @__PURE__ */` annotations in an `es` lib build: stripping
them is what lets a bundler tree-shake this package, so the number your
application ships is closer to the CJS one.

<!-- bundle-size:end -->

`pnpm check:bundles` measures the built files and fails if either the figure
above has drifted from the truth or a peer dependency has been inlined.

## Peer Dependencies

<!-- peer-dependencies:start -->

- `@bladets/template` ^0.6.0
- `@tempots/dom` ^37.0.0

<!-- peer-dependencies:end -->

Checked against `package.json` by `pnpm check:bundles`.

## Related Packages

- **[@bladets/template](https://www.npmjs.com/package/@bladets/template)** - Core template engine
- **[Blade Templates VS Code Extension](https://marketplace.visualstudio.com/items?itemName=fponticelli.blade-templates)** - Syntax highlighting, LSP, and live preview

## License

MIT
