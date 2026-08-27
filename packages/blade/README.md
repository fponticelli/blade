# @bladets/template

[![npm](https://img.shields.io/npm/v/@bladets/template)](https://www.npmjs.com/package/@bladets/template)

**Sharp templates for modern apps**

A TypeScript-first HTML template engine with expression evaluation, control flow directives, reusable components, and built-in safety controls.

## Installation

```bash
npm install @bladets/template
```

## Quick Start

```typescript
import { compile, createStringRenderer } from '@bladets/template';

const template = `<div class="greeting">Hello, \${name}!</div>`;

const compiled = await compile(template);
const render = createStringRenderer(compiled);

const result = render({ name: 'World' });
console.log(result.html);
// Output: <div class="greeting">Hello, World!</div>
```

## Template Syntax

### Expressions

Embed dynamic values with `$identifier` or `${expression}`:

```html
<p>Welcome, $user.name!</p>
<p>Total: ${price * quantity}</p>
<p>Status: ${isActive ? 'Active' : 'Inactive'}</p>
```

### Control Flow

#### Conditionals (`@if`, `else if`, `else`)

```html
@if(user.isAdmin) {
<span class="badge">Admin</span>
} else if(user.isModerator) {
<span class="badge">Mod</span>
} else {
<span class="badge">User</span>
}
```

#### Loops (`@for`)

```html
@for item of items {
<li>$item.name - ${formatCurrency(item.price)}</li>
} @for item, index of items {
<li>${index + 1}. $item.name</li>
}
```

A header may end with `key <expression>`, naming what each pass _is_ rather than
where it sits:

```html
@for(row of rows key row.id) {
<input value=$row.name />
}
```

The string and DOM renderers ignore it - they build every pass from scratch, so
there is no earlier row for a key to identify. A renderer that updates in place,
such as `@bladets/tempo`, uses it to move a row's nodes instead of rewriting
whatever row now sits in that slot. Reading the index variable in a key is a
compile error, and a keyless loop whose body holds a form control or a component
is a warning.

#### Pattern Matching (`@match`)

```html
@match(status) { when "pending" { <span class="yellow">Pending</span> } when
"approved" { <span class="green">Approved</span> } when "rejected" {
<span class="red">Rejected</span> } * { <span>Unknown</span> } }
```

### Variables (`@@`)

```html
@@ { let total = price * quantity; let discounted = total * 0.9; }
<p>Final price: ${formatCurrency(discounted)}</p>
```

### Components

Define reusable components with `<template:Name>`:

```html
<!-- Component definition -->
<template:Card title! subtitle>
  <div class="card">
    <h2>$title</h2>
    <p class="subtitle">$subtitle</p>
    <div class="content">
      <slot />
    </div>
  </div>
</template:Card>

<!-- Component usage -->
<Card title="Welcome" subtitle="Getting started">
  <p>Card content goes here</p>
</Card>
```

Props marked with `!` are required. Use `?` for optional props with defaults.

### Event Bindings (`on:`)

```html
<button on:click=${submit}>Save</button>
```

The value must be an expression that evaluates to something callable - a
function from the data or the globals, or a `@let` arrow - and is called with the
event. This is a binding, not an attribute: nothing is written to the markup,
which is why it is allowed where interpolating into a legacy `onclick=` is
refused.

Only a sink that can hold a listener gets one. `createDomRenderer` attaches a
real listener; `createStringRenderer` cannot, drops the binding and records a
warning. Compile with `target: 'string'` to make that a compile error instead.

## Built-in Helpers

### Formatting

```html
${formatCurrency(99.99)}
<!-- $99.99 -->
${formatNumber(1234.5, 2)}
<!-- 1,234.50 -->
${formatPercent(0.156, 1)}
<!-- 15.6% -->
${formatDate(date, 'long')}
<!-- November 27, 2025 -->
```

### String Operations

```html
${upper(name)}
<!-- JOHN -->
${lower(name)}
<!-- john -->
${capitalize(word)}
<!-- Hello -->
${truncate(text, 50)}
<!-- Long text... -->
${trim(input)}
<!-- trimmed -->
${replace(str, 'old', 'new')}
<!-- replaced -->
```

### Array Operations

```html
${len(items)}
<!-- 5 -->
${join(tags, ', ')}
<!-- a, b, c -->
${first(items)}
<!-- first item -->
${last(items)}
<!-- last item -->
${sort(numbers)}
<!-- sorted array -->
${unique(values)}
<!-- deduplicated -->
${pluck(users, 'name')}
<!-- ['Alice', 'Bob'] -->
```

### Math

```html
${sum(1, 2, 3)}
<!-- 6 -->
${avg(values)}
<!-- average -->
${min(a, b, c)}
<!-- minimum -->
${max(a, b, c)}
<!-- maximum -->
${round(3.7)}
<!-- 4 -->
${clamp(value, 0, 100)}
<!-- bounded -->
```

### Date/Time

```html
${now()}
<!-- current date -->
${year(date)}
<!-- 2025 -->
${addDays(date, 7)}
<!-- date + 7 days -->
${diffDays(start, end)}
<!-- days between -->
${isBefore(date1, date2)}
<!-- true/false -->
```

### Type Checking

```html
${isDefined(value)}
<!-- true if not null/undefined -->
${isEmpty(arr)}
<!-- true if empty -->
${isArray(value)}
<!-- true if array -->
${type(value)}
<!-- 'string', 'number', etc -->
```

## API Reference

### `compile(source, options?)`

Compiles a template string. The result is discriminated on `ok`, so a caller
cannot reach a template without deciding what to do about failure; only a
template that compiled cleanly can be rendered.

```typescript
const result = compile(templateString, {
  strict: true, // Soft findings become errors, and compile() throws
  helpers: standardLibrary, // Registry to check helper calls against
  components: { Card: { props: [{ name: 'title', required: true }] } },
  schema, // JSON Schema for top-level path checks
});

if (!result.ok) throw new CompileError(result.diagnostics);
const render = createStringRenderer(result.template);
```

`compileOrThrow(source, options?)` is the same thing for callers with nothing
useful to do with a partial tree.

### `createStringRenderer(compiled)`

Creates a reusable render function for server-side HTML generation.

```typescript
const render = createStringRenderer(compiled);

const result = render(data, {
  globals: { locale: 'en-US', currency: 'USD' },
  helpers: customHelpers,
  config: {
    htmlEscape: true, // Auto-escape expressions (default: true)
    includeComments: false, // Strip HTML comments (default: false)
    includeSourceTracking: false, // Emit rd-source attributes (default: false)
    resolveLoopIndices: false, // items[7] rather than items[*] (default: false)
  },
});

console.log(result.html);
console.log(result.metadata.renderTime);

// What this render actually read, as opposed to what the template could read
// (`compiled.root.metadata`). An untaken `@if` arm contributes nothing, so the
// difference between the two sets is what this render never evaluated.
console.log([...result.metadata.pathsAccessed]); // ['order.total', 'order.tax']
console.log([...result.metadata.helpersUsed]); // ['formatCurrency']
```

Paths are recorded exactly as the expression wrote them - the same notation the
compiler records statically, which is what makes the two sets comparable. Inside
a loop or component that means the local name: `@for(r of rows) { ${r.n} }`
contributes `rows` and `r.n`, not `rows[*].n`. For provenance in the caller's
terms, read the `rd-source` attributes instead (`includeSourceTracking`).

### Source Tracking Cost

`includeSourceTracking` adds `rd-source` to **every element that renders an
expression**, and `includeOperationTracking` / `includeNoteGeneration` add
`rd-source-op` and `rd-source-note` beside it. That is bytes on every response,
over the wire, on every request, so it is worth sizing before turning it on.

The overhead per tracked element is the attribute text itself: roughly 12 bytes
of name and quoting plus the serialized paths for `rd-source`, and again for
each of the other two attributes, whose values are longer. Two measured points,
both a 900-row × 4-column table:

| Template                                              | Config             | Added per tracked element | Total HTML |
| ----------------------------------------------------- | ------------------ | ------------------------- | ---------- |
| short paths (`rows[*].a`)                             | source             | +24 B                     | +167 %     |
| invoice paths (`invoice.lines[*].unitPrice`, helpers) | source             | +46 B                     | +270 %     |
| invoice paths (`invoice.lines[*].unitPrice`, helpers) | source + op + note | +132 B                    | +779 %     |

Deeper paths, more expressions per element and helper-heavy notes push this
further; overheads around +90 B/element (source alone) and +293 B/element (with
op and note) have been measured on such templates. Ops and notes are off by
default and roughly triple the cost of the feature, so turn them on only if a
consumer reads them.

CPU cost is small by comparison and does not grow with the size of the data:
everything the attributes are derived from is a property of the template, so it
is computed once per template node and reused for every row and every render.
The exception is `resolveLoopIndices`, which gives each row its own paths
(`lines[7].amount` rather than `lines[*].amount`) and therefore genuinely
rebuilds the attribute values per row.

### `createDomRenderer(compiled)`

Creates a renderer for client-side DOM node generation.

```typescript
const render = createDomRenderer(compiled);

const result = render(data);
document.body.append(...result.nodes);
```

### Resource Limits

Prevent runaway templates with configurable limits:

```typescript
const result = render(data, {
  limits: {
    maxLoopNesting: 5, // Max nested @for depth
    maxIterationsPerLoop: 1000, // Max items per loop
    maxTotalIterations: 10000, // Max total iterations
    maxComponentDepth: 10, // Max component nesting
    maxSlotDepth: 16, // Max chained <slot> expansions
    maxOutputChars: 33_554_432, // Max characters of output
    maxRenderMillis: 10_000, // Wall-clock budget for one render
    maxFunctionDepth: 10, // Max nested helper calls
    maxRecursionDepth: 50, // Max nested @let function calls
    maxHelperStringLength: 1_000_000, // Max string one helper call may build
  },
});
```

`maxOutputChars` and `maxRenderMillis` are enforced at the output sink, the one
place every character of a render passes through, so they bound the render as a
whole rather than any one construct. Breaching any limit throws a
`ResourceLimitError` carrying the location of the construct that breached it.

### Writing a render target

There is one traversal of the AST, parameterised by an output sink. Everything
that decides _what_ to render - the walk, the scope rules, the loop, component
and slot semantics, the choice of escaper for each position, the resource
accounting - lives in the traversal. A `RenderTarget` decides only how a
finished piece of output is represented, and has no control flow of its own.

```typescript
import { renderTo } from '@bladets/template';
import type {
  Dyn,
  ElementSpec,
  EscapeContext,
  RenderTarget,
} from '@bladets/template';

class TextTarget implements RenderTarget<string> {
  // Characters cannot carry a closure, so `on:` bindings are refused for this
  // sink - by the traversal, once, with a location.
  readonly bindsEvents = false;

  private out = '';

  element(spec: ElementSpec, children: () => void): void {
    children(); // tags are dropped; only the words are wanted
  }
  literalText(source: string, _context: EscapeContext): void {
    this.out += source;
  }
  text(value: Dyn<string>, _context: EscapeContext): void {
    this.out += value.value;
  }
  rawHtml(html: Dyn<string>): void {
    this.out += html.value;
  }
  comment(): void {}
  doctype(): void {}
  finish(): string {
    return this.out;
  }
}

const { output, metadata } = renderTo(template, data, options, () => new TextTarget());
```

Values arrive as cells (`Dyn<T>`) rather than as values, because a sink that
updates in place binds them once instead of being called again. An eager sink
reads `.value` and is otherwise unaffected.

The traversal never escapes: it says what a value **is** - author-written HTML
source (`literalText`), an evaluated value (`text`), evaluated markup
(`rawHtml`) - and which sink it is going into, and the target applies the
escaper correct for the pair. `escapeForContext` from this package is the single
dispatch point if your target wants HTML-shaped encoding.

`StringTarget` and `DomTarget` are the two built-in implementations, each a few
dozen lines, and both are exported. `StringTarget` takes an optional chunk sink,
which makes a render streaming - peak memory becomes a chunk rather than the
document:

```typescript
renderTo(template, data, options, (budget, position) =>
  new StringTarget(budget, position, chunk => response.write(chunk))
);
```

## Module Exports

Two entry points, split by what they need from the platform rather than by what
they do.

### `@bladets/template` - the engine

Runtime-neutral. Nothing reachable from this entry imports `fs`, `path` or
`url`, so it loads unchanged on Cloudflare Workers, Vercel Edge, Deno Deploy and
in a browser bundle. `scripts/check-bundles.mjs` asserts that mechanically on
every build, and CI runs it as a blocking job.

- `compile` / `compileOrThrow` - Template compiler
- `createStringRenderer` - Server-side renderer factory
- `createDomRenderer` - Client-side renderer factory
- `renderTo` / `RenderTarget` - The engine, against an output sink of your own
- `parseTemplate` - Low-level parser
- `evaluate` - Expression evaluator
- `standardLibrary` / `helperMetadata` - Built-in helpers, and what they are
- `childrenOf` / `walkNodes` / `expressionsOf` - The AST traversal the engine
  itself runs on, for tooling built on top of it
- Source tracking: `buildElementSourceTracking`, `sourceAttributeName`, ...

`@bladets/template/browser` is an alias of this entry, kept because it was the
only browser-safe surface before the default one became runtime-neutral.

### `@bladets/template/node` - the project layer

The half that reads the filesystem: discovering components in a directory,
loading `schema.json` and `samples/*.json`, and compiling a multi-file project
into one renderable template.

```typescript
import { compileProject } from '@bladets/template/node';

const { template, errors } = await compileProject('./templates');
```

- `compileProject` / `compileProjectSources` - Multi-file compilation
- `discoverComponents` / `resolveComponent` - Component discovery
- `loadProjectSchema` / `loadProjectSamples` - Project metadata
- `nodeFileSystem` / `createMemoryFileSystem` - The `FileSystem` seam every
  read goes through
- `resolveWithinRoot` - Path containment; throws `PathEscapeError`

Import it only from code that runs on Node. It is deliberately _not_ a superset
of `@bladets/template`, so a file's import list says which half it depends on.

### Language server

The Blade language server lives in its own package,
[`@bladets/lsp-server`](../blade-lsp-server). It used to ship from here, which
meant `npm install @bladets/template` pulled down `vscode-languageserver` and
its tree - about 1.19 MB across five packages - into every web server and
browser app that never loads a line of it.

### Public API surface

Both entry points export a fixed, named list, recorded in
[`api/`](./api). `pnpm check:api` fails when the surface moves without the
record moving with it, so an addition or a removal is a reviewed diff rather
than an accidental major version.

## Module Formats

This package supports both ES modules and CommonJS:

```javascript
// ESM
import { compile } from '@bladets/template';

// CommonJS
const { compile } = require('@bladets/template');
```

**Note**: Avoid mixing ESM and CommonJS imports of this package in the same application to prevent the dual package hazard.

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  CompiledTemplate,
  RenderResult,
  RenderOptions,
  ResourceLimits,
  HelperRegistry,
} from '@bladets/template';
```

## Related Packages

- **[@bladets/tempo](https://www.npmjs.com/package/@bladets/tempo)** - Reactive DOM rendering with fine-grained updates
- **[Blade Templates VS Code Extension](https://marketplace.visualstudio.com/items?itemName=fponticelli.blade-templates)** - Syntax highlighting, LSP, and live preview

## License

MIT
