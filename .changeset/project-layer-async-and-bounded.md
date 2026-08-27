---
'@bladets/template': major
---

Rebuild the project layer: asynchronous throughout, bounded on disk, validated
across the whole component graph, and testable without a directory.

**Discovery no longer walks `node_modules`.** `scanDirectory` recursed into every
folder that did not itself contain an `index.blade`, with a `readdirSync` and a
`statSync` per directory - dependency trees, `dist`, `.turbo`, vendored assets
and all. The language server is single-threaded, so that walk stopped completion,
hover and diagnostics for as long as it ran, and `lsp/project-context.ts`
`await`ed a value that was never a promise. It is now `fs/promises`, with an
explicit exclude set (`DEFAULT_EXCLUDED_DIRECTORIES`), a caller `exclude`, a
`maxDepth`, and no `statSync`: each directory is listed once and the listing
answers both "is this a separate project?" and "what is in it?".

**The module is async, so schema-driven validation exists.** `compileProject` was
synchronous over asynchronous schema and sample loaders, so it could not await
them: `createProjectContext` hard-coded `entry: 'index.blade'`, `schema:
undefined` and `samples: new Map()` with no parameter that could say otherwise,
and every check gated on the context's schema was dead for every project ever
built. `compileProject` and `discoverComponents` now return promises, and the
context carries the entry, schema and samples the project actually has. Turning
it on found three shipped samples that contradicted their own schema.

**Validation covers the whole reachable graph.** Only `index.blade` was compiled
and traversed; component files were read solely to parse `@props`. A typo in a
component's own markup - `<Buton title="x">` inside `card.blade` - produced no
diagnostic at all, and the project reported success. Every discovered component
is now compiled against the full registry, `Diagnostic` gains a `file`, and
component reference cycles are reported as `CIRCULAR_COMPONENT` warnings.

**Props are inferred from the AST, not a regular expression.** A component with
no `@props` had its props inferred by `/\$(\w+)/` over the raw source, and every
match was marked **required**: a component containing `@for(item of items)`
demanded an `item` attribute at every call site, so a project failed to compile
over a loop variable, while `${...}` block expressions were invisible and the
props that really were required went missing. Inference now computes the free
variables of the parsed body (`collectFreeVariables`), and an inferred prop is
never required - an undeclared one is an `UNDECLARED_PROP` warning.

**JSON Schema is Ajv's job.** `schema.json` was read by a hand-rolled model of
six keywords: `$ref`, `$defs`, `allOf` and `oneOf` each produced a property with
no type and no children, so whole subtrees vanished from completions, and a
document whose root was a `$ref` returned a non-null schema with no properties at
all - silently empty completions. `ProjectSchema.validate` is now an Ajv-compiled
validator (`ajv`, `ajv-formats`), and the flattener resolves `$ref` and
composition before it walks. A `schema.json` that cannot be used is reported
instead of swallowed by a bare `catch`.

**`entry` is checked for containment.** It was joined to the project root and
read, so `entry: '../../../etc/passwd'` was parsed as a template and quoted back
in diagnostics. `resolveWithinRoot` resolves both sides through symbolic links
and refuses anything outside the root with a `PathEscapeError`; it is exported,
because any host taking a filename from a message needs the same check.

**I/O is separated from logic.** `readProjectSources` does the reading;
`compileProjectSources` is pure. Everything reads through an injectable
`FileSystem`, and `createMemoryFileSystem` makes a whole project an inline string
map - for tests, and for an editor with unsaved buffers.

Breaking changes:

- `compileProject(root, options?)` and `discoverComponents(root, options?)`
  return promises.
- `createProjectContext(init)` takes one object: `{ rootPath, entry?, schema?,
samples?, components, templateComponents? }`.
- `ProjectOptions` is gone; the options a load takes are `ProjectLoadOptions`
  (`entry`, `io`, `exclude`, `maxDepth`). Its `sourceTracking` flag had never
  been read - source tracking is a render option.
- `extractSchemaProperties(document)` takes the whole document, so that `$ref`
  can resolve; `SchemaPropertyInfo` gains `required`.
- `createMissingPropDiagnostic` is gone: `validation`'s `checkRequiredProps` is
  the one implementation, and `ComponentSchema` gains `definedIn` so it can name
  the file that declares the prop.
- `Diagnostic` gains an optional `file`; `JsonSchema` gains `$schema`, `$ref`,
  `$defs`, `definitions`, `allOf`, `oneOf`, `anyOf`, `additionalProperties`,
  `title` and `format`.
