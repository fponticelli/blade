# blade Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-25

## Active Technologies
- TypeScript 5.x (ESM modules) + Internal only (ast/types.ts, evaluator/index.ts, helpers/index.ts) (002-renderer)
- TypeScript 5.x (ESM modules) + vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1, vscode-languageserver-textdocument ^1.0.11 (003-blade-lsp)
- N/A (in-memory document state) (003-blade-lsp)

- TypeScript 5.x (ESM modules) + None (pure TypeScript, depends only on internal AST types) (001-expression-evaluator)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (ESM modules): Follow standard conventions

## Recent Changes
- 003-blade-lsp: Added TypeScript 5.x (ESM modules) + vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1, vscode-languageserver-textdocument ^1.0.11
- 002-renderer: Added TypeScript 5.x (ESM modules) + Internal only (ast/types.ts, evaluator/index.ts, helpers/index.ts)

- 001-expression-evaluator: Added TypeScript 5.x (ESM modules) + None (pure TypeScript, depends only on internal AST types)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
