# Research: Blade Language Server (LSP)

**Feature**: 003-blade-lsp
**Date**: 2025-11-25

## Overview

This document captures research findings for implementing the Blade Language Server Protocol server and VS Code extension.

## NEEDS CLARIFICATION Resolution

### LSP Library Choice

**Decision**: vscode-languageserver + vscode-languageclient (Microsoft official stack)

**Rationale**:
- Official Microsoft libraries, battle-tested across major language extensions
- Full TypeScript support with strong typing
- Well-documented with official guides and samples
- Language-agnostic server means potential future support for other editors
- Mature ecosystem ensures long-term maintenance

**Alternatives Considered**:
- **monaco-languageclient (TypeFox)**: Rejected - primarily for browser/web scenarios; adds complexity without benefit for VS Code
- **Direct vscode.languages API**: Rejected - VS Code only, not reusable for other editors
- **tower-lsp (Rust)**: Rejected - would require maintaining Rust codebase separately from TypeScript parser

**Dependencies**:
```json
{
  "vscode-languageserver": "^9.0.1",
  "vscode-languageclient": "^9.0.1",
  "vscode-languageserver-textdocument": "^1.0.11",
  "vscode-languageserver-protocol": "^3.17.5"
}
```

## Technology Research

### TextMate Grammar Best Practices

**Key Findings**:

1. **Use Standard Scopes**: Don't invent custom scopes - themes already style `keyword.control`, `string.quoted`, `comment`, etc.

2. **Repository Pattern**: Store reusable patterns in `repository` object for DRY grammars:
   ```json
   {
     "repository": {
       "directives": { ... },
       "expressions": { ... }
     }
   }
   ```

3. **Embedded Languages**: Use `begin`/`end` patterns with `include` for embedded JS/HTML:
   ```json
   {
     "begin": "\\$\\{",
     "end": "\\}",
     "name": "meta.embedded.expression.blade",
     "patterns": [{ "include": "source.js" }]
   }
   ```

4. **Register Embedded Languages** in package.json:
   ```json
   "embeddedLanguages": {
     "meta.embedded.block.javascript": "javascript"
   }
   ```

5. **Debugging**: Use VS Code's scope inspector (Ctrl+Shift+P: "Inspect TM Scopes")

### LSP Server Architecture

**Recommended Structure**:

```
server/
├── server.ts           # Entry point, connection setup
├── document.ts         # TextDocument manager with caching
├── providers/
│   ├── completion.ts   # CompletionItemProvider
│   ├── diagnostic.ts   # DiagnosticProvider
│   ├── definition.ts   # DefinitionProvider
│   ├── hover.ts        # HoverProvider
│   └── reference.ts    # ReferenceProvider
└── analyzer/
    ├── scope.ts        # Variable scope tracking
    └── workspace.ts    # Multi-file indexing
```

**Key Patterns**:

1. **Document Synchronization**: Start with `TextDocumentSyncKind.Full`, graduate to incremental for performance

2. **Error Recovery**: Parser must handle malformed input gracefully, producing partial ASTs for incomplete code

3. **Capabilities Declaration**: Server declares supported features in `ServerCapabilities`:
   ```typescript
   capabilities: {
     textDocumentSync: TextDocumentSyncKind.Full,
     completionProvider: { resolveProvider: true },
     hoverProvider: true,
     definitionProvider: true,
     referencesProvider: true,
     diagnosticProvider: { interFileDependencies: true }
   }
   ```

### Template Language Extension Patterns

**Case Studies**:

| Extension | Approach | Lessons |
|-----------|----------|---------|
| Handlebars | TextMate + basic LSP | Separate patterns for `{{...}}` delimiters |
| EJS | TextMate embedded JS | Simple `<% %>` delimiters, full JS highlighting |
| Angular Templates | Full LSP service | Gold standard for directive-based templates |
| Laravel Blade | TextMate + LSP | Most similar to our case (@if, @for directives) |

**Key Insight**: Combine TextMate for immediate syntax highlighting with LSP for intelligent features. TextMate is synchronous/fast; LSP handles complex analysis asynchronously.

### Performance Considerations

1. **Large Files**: Must handle 10,000+ line templates without degradation
   - Solution: Incremental parsing, AST caching per document

2. **Completion Response Time**: Target <100ms
   - Solution: Pre-compute scope at cursor position, cache component/helper indices

3. **Diagnostic Latency**: Target <300ms after edit
   - Solution: Debounce parsing on rapid edits (200ms delay)

4. **Memory Management**:
   - Dispose document state on close
   - Limit workspace indexing to .blade files only

### Package Structure Decision

**Decision**: Two-package monorepo structure

```
packages/
├── blade/                    # Core library (existing)
│   └── src/lsp/              # LSP server code (new)
└── blade-vscode/             # VS Code extension (new)
    ├── package.json          # Extension manifest
    ├── syntaxes/             # TextMate grammar
    └── src/extension.ts      # Client entry
```

**Rationale**:
- LSP server shares parser/AST with core library
- Extension is thin client that spawns server
- Separate package for extension-specific dependencies (@vscode/vscode-languageclient)
- Clear separation allows future editor support (Neovim, Sublime, etc.)

**Alternative Rejected**: Single package with extension bundled
- Would pollute core library with VS Code dependencies
- Makes browser usage of core library difficult

## Integration Patterns

### Reusing Existing Parser

The existing Blade parser (`packages/blade/src/parser/`) provides:
- `parseTemplate(source)` → `{ value: TemplateNode[], errors: ParseError[] }`
- `ParseError` with line, column, offset

**LSP Integration**:
```typescript
import { parseTemplate, ParseError } from '@fponticelli/blade';

function validateDocument(doc: TextDocument): Diagnostic[] {
  const result = parseTemplate(doc.getText());
  return result.errors.map(errorToDiagnostic);
}

function errorToDiagnostic(error: ParseError): Diagnostic {
  return {
    range: {
      start: { line: error.line - 1, character: error.column - 1 },
      end: { line: error.line - 1, character: error.column + 10 }
    },
    severity: DiagnosticSeverity.Error,
    message: error.message,
    source: 'blade'
  };
}
```

### Scope Analysis for Completions

The evaluator's `Scope` interface provides basis for completion context:
```typescript
interface Scope {
  locals: Record<string, unknown>;  // @let declarations
  data: unknown;                    // Template data
  globals: Record<string, unknown>; // $.xxx globals
}
```

**LSP Completion Strategy**:
1. Parse document to AST
2. Walk AST to cursor position, collecting `@let` declarations
3. Analyze `@for` loops for iteration variables
4. Combine with configured data schema for suggestions

## Configuration Schema

**blade.lsp.* settings**:
```json
{
  "blade.lsp.diagnostics.enabled": true,
  "blade.lsp.diagnostics.unusedVariables": "warning",
  "blade.lsp.diagnostics.deprecatedHelpers": "warning",
  "blade.lsp.completion.dataSchema": "./blade-schema.json",
  "blade.lsp.completion.helpersFile": "./blade-helpers.d.ts"
}
```

## References

- [VS Code LSP Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [VS Code Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
- [Microsoft vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [TextMate Language Grammars](https://manual.macromates.com/en/language_grammars)
- [Laravel Blade VS Code Support](https://blog.devsense.com/2024/blade-language-support-vs-code-1/)
