# @bladets/lsp-server

[![npm](https://img.shields.io/npm/v/@bladets/lsp-server)](https://www.npmjs.com/package/@bladets/lsp-server)

**The Blade language server** - diagnostics, completion, hover, go-to-definition
and find-references for `.blade` templates, over the Language Server Protocol.

## Why it is its own package

It used to live inside `@bladets/template`, which listed
`vscode-languageserver` and `vscode-languageserver-textdocument` as runtime
dependencies. Every `npm install @bladets/template` - in a web server, in a
browser app, in a Cloudflare Worker - therefore downloaded about **1.19 MB
across five packages** that nothing on that install path ever loads, and carried
them into every audit and CVE report forever.

The analysis was already protocol-free; only the stdio adapter and the
capability declaration touched the protocol types. Splitting the package is what
makes that separation cost something to break.

## Installation

```bash
npm install @bladets/lsp-server
```

## Running it

As a process, over stdio - what an editor launches:

```bash
npx blade-language-server --stdio
```

Or from a bundle of your own:

```js
// Importing the module opens the connection and starts listening.
import '@bladets/lsp-server/server';
```

## Using the analysis directly

The default entry is the language service and everything under it: the document
store, the scope and context analyzers, and the four providers. None of it opens
a connection, so it can be driven from a test, an editor plugin that speaks a
different protocol, or a CLI linter.

```typescript
import { BladeLanguageService } from '@bladets/lsp-server';

const service = new BladeLanguageService({
  publishDiagnostics: (uri, diagnostics) => report(uri, diagnostics),
});

service.setWorkspaceFolders([process.cwd()]);
service.openDocument(uri, source, 1);
const diagnostics = await service.validate(uri);
```

Lower-level pieces are exported too, and are what the service is built from:

- `createDocument` / `DocumentManager` - parsed, versioned documents
- `analyzeScope` / `resolveContext` - what is in scope at an offset, and what
  the cursor is inside
- `generateDiagnostics`, `getCompletions`, `getHoverInfo`, `findDefinition`,
  `findReferences` - the four providers
- `initializeProjectContext` / `ProjectContextCache` - a project's components,
  schema and samples, invalidated on file change
- `createInitializeResult` / `readConfig` - the protocol surface: what the
  server advertises, and how it reads its settings

The public surface is a fixed, named list recorded in [`api/`](./api);
`pnpm check:api` fails when it moves without the record moving with it.

## Configuration

Settings are read from the `blade` section, with the shapes
`readConfig` documents:

| Setting                                      | Default   | Meaning                                     |
| -------------------------------------------- | --------- | ------------------------------------------- |
| `blade.lsp.diagnostics.enabled`              | `true`    | Publish diagnostics at all                  |
| `blade.lsp.diagnostics.unusedVariables`      | `warning` | Severity for an unread `@let` or loop alias |
| `blade.lsp.diagnostics.deprecatedHelpers`    | `warning` | Severity for a deprecated helper call       |
| `blade.lsp.diagnostics.deepNesting`          | `warning` | Severity for deeply nested blocks           |
| `blade.lsp.diagnostics.deepNestingThreshold` | `4`       | Depth at which that fires                   |
| `blade.lsp.completion.snippets`              | `true`    | Offer directive snippets                    |
| `blade.trace.server`                         | `off`     | Log protocol traffic                        |

## Requirements

- Node.js >= 18
- `@bladets/template` (a direct dependency; the versions move together)

## License

Apache-2.0
