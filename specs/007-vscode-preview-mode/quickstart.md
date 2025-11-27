# Quickstart: VSCode Preview Mode Implementation

**Feature**: 007-vscode-preview-mode
**Date**: 2025-11-27

## Prerequisites

- VSCode Extension development knowledge
- Familiarity with Blade template engine
- Understanding of webview panels

## Implementation Order

### Phase 1: Basic Preview Panel (P1 Stories)

1. **Register Command** (`package.json`)
   - Add `blade.openPreview` command
   - Add keyboard shortcut `Cmd+Shift+V` / `Ctrl+Shift+V`
   - Add editor title button with preview icon

2. **Create Panel Manager** (`src/preview/panel.ts`)
   - Singleton pattern for preview panel
   - Create webview with `ViewColumn.Beside`
   - Handle panel dispose/recreate

3. **Basic Webview HTML** (`src/preview/panel.ts`)
   - Shell HTML with sample dropdown
   - CSS for preview styling
   - Message passing setup

4. **Sample Discovery** (`src/preview/samples.ts`)
   - Find project root from active file
   - List JSON files in `samples/` folder
   - Load and parse sample data

5. **Template Rendering** (`src/preview/renderer.ts`)
   - Compile template using blade package
   - Render with sample data
   - Return HTML string or error

6. **Wire Up Command** (`src/extension.ts`)
   - Register command handler
   - Connect to panel manager

### Phase 2: Live Preview

7. **File Change Detection** (`src/preview/panel.ts`)
   - Listen to `onDidChangeTextDocument`
   - Filter for `.blade` files
   - Implement 300ms debounce

8. **Re-render Pipeline**
   - Get current document text
   - Compile and render
   - Send update to webview

### Phase 3: Sample Switching

9. **Sample Dropdown** (webview HTML)
   - Populate with available samples
   - Handle selection changes
   - Post message to extension

10. **State Persistence**
    - Save selected sample to workspace state
    - Restore on panel creation

### Phase 4: Error Handling

11. **Error Display** (webview)
    - Styled error box component
    - Show line/column info
    - Preserve last successful render

12. **JSON Validation**
    - Parse sample JSON safely
    - Show parsing errors
    - Schema validation warnings

### Phase 5: Polish (P2 Stories)

13. **Component Preview**
    - Detect component files (not index.blade)
    - Show helpful message
    - "Create Sample" button

14. **Tab Synchronization**
    - Listen to `onDidChangeActiveTextEditor`
    - Update preview for new file
    - Maintain sample selection per project

## Key Files to Create

```
packages/blade-vscode/
├── src/
│   ├── extension.ts              # MODIFY: Register command
│   ├── preview/
│   │   ├── index.ts              # NEW: Module exports
│   │   ├── panel.ts              # NEW: Webview panel management
│   │   ├── renderer.ts           # NEW: Template compilation
│   │   └── samples.ts            # NEW: Sample file handling
│   └── commands/
│       └── preview.ts            # NEW: Command handler
├── media/
│   └── preview.css               # NEW: Webview styles
└── package.json                  # MODIFY: Add contributions
```

## Testing Strategy

1. **Unit Tests** (blade package)
   - Render with sample data
   - Error handling paths

2. **Integration Tests**
   - Preview command opens panel
   - Sample switching updates preview
   - File changes trigger refresh

3. **Manual Testing Checklist**
   - Open preview from command palette
   - Open preview from keyboard shortcut
   - Open preview from editor button
   - Switch samples via dropdown
   - Edit template, see live update
   - Introduce error, see error display
   - Fix error, see recovery
   - Close/reopen, sample selection restored

## Common Pitfalls

1. **ESM vs CJS**: Extension uses CJS, blade package uses ESM. Use dynamic import or bundle.

2. **Webview Security**: Set proper CSP headers, use nonce for scripts.

3. **Path Resolution**: Convert between file:// URIs and paths correctly.

4. **Debounce Cleanup**: Cancel pending debounce on panel dispose.

5. **Multiple Workspaces**: Handle multi-root workspaces - find correct project root.
