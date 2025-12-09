# blade Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-25

## Active Technologies
- TypeScript 5.7.2 (ESM modules) + @bladets/template ^0.2.0, @bladets/tempo ^0.1.1, vscode-languageserver ^9.0.1 (011-resume-sample-fix)
- N/A (file-based template processing) (011-resume-sample-fix)

- TypeScript 5.x (ESM modules) + Internal only (ast/types.ts, evaluator/index.ts, helpers/index.ts) (002-renderer)
- TypeScript 5.x (ESM modules) + vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1, vscode-languageserver-textdocument ^1.0.11 (003-blade-lsp)
- N/A (in-memory document state) (003-blade-lsp)
- TypeScript 5.x (ESM modules) + None for this change (pure deletion task) (004-remove-load-directive)
- TypeScript 5.7.2 (ESM modules) + vscode-languageserver ^9.0.1, vscode-languageclient ^9.0.1 (existing) (005-project-template-compilation)
- Filesystem-based (project folders, .blade files, schema.json, samples/\*.json) (005-project-template-compilation)
- TypeScript 5.7.2 (ESM modules) + None (pure TypeScript, internal AST types) (006-template-helpers-escaping)
- N/A (in-memory template processing) (006-template-helpers-escaping)
- TypeScript 5.7.2 (ESM modules) + vscode ^1.85.0, vscode-languageclient ^9.0.1, existing @bladets/template package (007-vscode-preview-mode)
- VSCode workspace state (for persisting selected sample per project) (007-vscode-preview-mode)
- TypeScript 5.x, targeting Node.js 18+ + Vite 6.x (build), vite-plugin-dts (TypeScript declarations) (008-npm-publish)
- N/A (library package) (008-npm-publish)
- TypeScript 5.7.2 (ESM modules) + None (pure TypeScript, internal renderer module) (009-configurable-source-attr)
- N/A (in-memory configuration) (009-configurable-source-attr)
- TypeScript 5.7.2 (ESM modules) + @tempots/dom (peer), @bladets/template (peer) (010-blade-tempo-package)

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
- 011-resume-sample-fix: Added TypeScript 5.7.2 (ESM modules) + @bladets/template ^0.2.0, @bladets/tempo ^0.1.1, vscode-languageserver ^9.0.1

- 010-blade-tempo-package: Added TypeScript 5.7.2 (ESM modules) + @tempots/dom (peer), @bladets/template (peer)
- 009-configurable-source-attr: Added TypeScript 5.7.2 (ESM modules) + None (pure TypeScript, internal renderer module)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
