# blade-templates

## Unreleased

### Preview

- The preview now compiles the project through `@bladets/template`'s own project
  layer instead of eight parallel reimplementations of it. Components in
  subdirectories are discovered and namespaced (`<Components.Form.Input/>`),
  component names match the compiler exactly (`my_widget.blade` is `MyWidget`,
  not `My_widget`), and a Blade project is a directory containing `index.blade` -
  the same definition the language server uses.
- Rendering is incremental. File reads are cached and invalidated from the file
  watcher, unsaved buffers are read from the editor, and a keystroke costs one
  compile - the file being edited - rather than a synchronous re-read and
  re-compile of every component in the project.
- Edits to a component in another tab update the preview, saved or not.
- Rendered output is displayed inside a sandboxed frame with no scripting and no
  access to the panel's API, rather than being injected into the privileged page.
- Images and fonts load: the policy previously named no `img-src` or `font-src`,
  so every image in every previewed template was blocked. Relative URLs resolve
  against the project root.
- The webview's script nonce is now cryptographically random, and the policy
  names `base-uri`, `form-action`, `object-src` and `frame-src`.
- Sample names arriving from the webview are checked against the samples the
  project actually has and can no longer denote a path; the "create sample" flow
  derives the component from the file the extension is tracking and resolves the
  destination with a containment check.
- Opening the preview on a file with no project root now shows "Not a Blade
  Project" instead of "Loading preview..." forever.
- Repeated invocations of the command no longer register another listener set or
  another workspace-wide file watcher. Watchers are scoped to the project.
- `retainContextWhenHidden` is gone; the panel is restored across a window reload
  by a `WebviewPanelSerializer` instead.

### Settings

- Added `blade.lsp.diagnostics.potentiallyUndefined`,
  `blade.lsp.performance.debounceMs` and `blade.lsp.performance.maxFileSize`,
  which the language server read but the manifest never contributed - so they
  could not be set.

### Internal

- Added a test suite. This package had none.

## 0.2.3

### Patch Changes

- Updated dependencies [57ff60c]
- Updated dependencies [57ff60c]
  - @bladets/template@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [1d5f8f9]
  - @bladets/template@0.5.0
