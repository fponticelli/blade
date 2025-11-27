# Research: VSCode Preview Mode

**Feature**: 007-vscode-preview-mode
**Date**: 2025-11-27

## R1: VSCode Webview Panel API

### Decision
Use `vscode.window.createWebviewPanel()` with `ViewColumn.Beside` for side-by-side preview.

### Rationale
- Native VSCode API designed for preview-style panels
- Supports HTML/CSS/JS content rendering
- Built-in security with Content Security Policy
- Can retain state across visibility changes with `retainContextWhenHidden`

### Alternatives Considered
- **Custom Editor**: Too heavyweight, meant for file editing not preview
- **Output Channel**: Text-only, no HTML rendering
- **Tree View**: Not suitable for rich HTML content

### Implementation Pattern
```typescript
const panel = vscode.window.createWebviewPanel(
  'bladePreview',
  'Blade Preview',
  vscode.ViewColumn.Beside,
  {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [mediaFolder]
  }
);
```

## R2: File Watching for Live Refresh

### Decision
Use VSCode's `workspace.onDidChangeTextDocument` with 300ms debounce for live typing feedback.

### Rationale
- Built-in event, no external dependencies
- Fires on every edit (not just save) - required for live preview
- Can filter by document languageId ('blade')
- Debouncing prevents excessive renders during rapid typing

### Alternatives Considered
- **onDidSaveTextDocument**: Only fires on save, doesn't support live typing
- **FileSystemWatcher**: For external file changes, overkill for active editor
- **Polling**: Inefficient, poor UX

### Implementation Pattern
```typescript
const debounce = (fn: Function, ms: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
};

workspace.onDidChangeTextDocument(debounce((e) => {
  if (e.document.languageId === 'blade') {
    updatePreview(e.document);
  }
}, 300));
```

## R3: Sample File Discovery

### Decision
Reuse existing `loadProjectSamples()` from blade package's project module.

### Rationale
- Already implemented and tested
- Returns structured sample data with file paths
- Handles JSON parsing and validation
- Consistent with LSP sample validation

### Code Location
`packages/blade/src/project/samples.ts`

### API
```typescript
export async function loadProjectSamples(
  projectRoot: string
): Promise<ProjectSamples>;
// Returns: { files: string[], data: Map<string, object> }
```

## R4: Template Compilation for Preview

### Decision
Use `compileProject()` for full project context, or `compile()` for single-file preview.

### Rationale
- `compileProject()` handles component discovery and resolution
- Provides full error reporting with line numbers
- Returns AST that can be rendered with sample data
- Already handles project structure conventions

### Compilation Flow
1. Get project root from active file path
2. Call `compileProject(projectRoot)` or `compile(source)`
3. Use `render(ast, sampleData)` to produce HTML
4. Wrap in preview HTML shell with styling

## R5: Webview-Extension Communication

### Decision
Use webview postMessage API for bidirectional communication.

### Rationale
- Standard VSCode pattern for webview communication
- Type-safe with message interfaces
- Supports async request/response patterns

### Message Types
```typescript
// Extension → Webview
type ToWebview =
  | { type: 'update', html: string }
  | { type: 'error', message: string, line?: number }
  | { type: 'samples', files: string[], selected: string };

// Webview → Extension
type ToExtension =
  | { type: 'selectSample', file: string }
  | { type: 'refresh' };
```

## R6: State Persistence

### Decision
Use `context.workspaceState` for per-project sample selection.

### Rationale
- Persists across VSCode sessions
- Scoped to workspace (project), not global
- Simple key-value API
- No file system pollution

### Implementation
```typescript
// Save
context.workspaceState.update(`preview.sample.${projectRoot}`, selectedFile);

// Restore
const saved = context.workspaceState.get<string>(`preview.sample.${projectRoot}`);
```

## R7: Error Display Strategy

### Decision
Show errors inline in preview panel with styled error box, preserving last successful render.

### Rationale
- User can see both the error and their previous output
- Error location (line number) helps debugging
- Consistent with other preview tools (Markdown)

### Error Display Format
```html
<div class="preview-error">
  <h3>⚠️ Compilation Error</h3>
  <p class="error-message">Unexpected token at line 15</p>
  <p class="error-hint">Check your template syntax</p>
</div>
<!-- Previous successful render preserved below -->
```

## R8: package.json Contributions

### Decision
Add command, keybinding, and editor title button contributions.

### Required Additions
```json
{
  "contributes": {
    "commands": [{
      "command": "blade.openPreview",
      "title": "Open Preview",
      "category": "Blade",
      "icon": "$(open-preview)"
    }],
    "keybindings": [{
      "command": "blade.openPreview",
      "key": "ctrl+shift+v",
      "mac": "cmd+shift+v",
      "when": "editorLangId == blade"
    }],
    "menus": {
      "editor/title": [{
        "command": "blade.openPreview",
        "when": "editorLangId == blade",
        "group": "navigation"
      }]
    }
  }
}
```
