/**
 * Message contracts between the extension host and the preview webview.
 *
 * Two rules hold everywhere below, and both were broken before:
 *
 * 1. Nothing that arrives from the webview names a file. A webview is
 *    untrusted input - VS Code's own guidance says so - and it additionally
 *    hosts markup rendered from arbitrary workspace templates. `selectSample`
 *    carries a *name*, which the host resolves against the set of samples it
 *    already discovered; `createSample` carries nothing at all, because the
 *    component it means is the one the host is already tracking.
 * 2. Rendered template output crosses this boundary as a whole sandboxed
 *    document, built by the host, not as markup for the privileged page to
 *    inject into itself.
 */

// ============================================
// Extension → Webview Messages
// ============================================

/** Update the preview with a newly rendered template. */
export interface UpdateMessage {
  type: 'update';
  /**
   * A complete HTML document, with its own restrictive CSP, for the sandboxed
   * preview frame. The privileged page assigns it to `iframe.srcdoc` and never
   * parses it.
   */
  document: string;
  /** The same render as text, for the raw-HTML view. Escaped before display. */
  html: string;
  renderTime: number;
  /** Non-fatal findings: schema mismatches, unreadable samples, warnings. */
  notices: string[];
}

/** Display an error in the preview. */
export interface ErrorMessage {
  type: 'error';
  message: string;
  line?: number;
  column?: number;
  file?: string;
  errorType: 'syntax' | 'validation' | 'runtime' | 'json';
  /** Every other error, so a template with six mistakes reports six. */
  more: string[];
}

/** Update the list of available samples. */
export interface SamplesMessage {
  type: 'samples';
  /** Sample names without the `.json` extension, sorted. */
  files: string[];
  selected: string | null;
}

/** Show loading state. */
export interface LoadingMessage {
  type: 'loading';
}

/** Show an empty state. */
export interface EmptyMessage {
  type: 'empty';
  reason: 'no-samples' | 'no-project' | 'component-file' | 'no-editor';
  /**
   * For `component-file`: the tag name the compiler gives this file.
   *
   * Derived by the host from the project it just compiled, never from the
   * webview and never from a second implementation of the naming rule.
   */
  componentName?: string;
}

export type ToWebviewMessage =
  | UpdateMessage
  | ErrorMessage
  | SamplesMessage
  | LoadingMessage
  | EmptyMessage;

// ============================================
// Webview → Extension Messages
// ============================================

/** User selected a different sample file. */
export interface SelectSampleMessage {
  type: 'selectSample';
  /** A name the host offered in {@link SamplesMessage}; anything else is refused. */
  file: string;
}

/** User requested manual refresh. */
export interface RefreshMessage {
  type: 'refresh';
}

/**
 * User clicked "Create Sample".
 *
 * Deliberately empty: the component is whichever file the host is previewing.
 * It used to carry a name the webview derived by splitting the file path on
 * `/`, which on Windows leaves a whole backslash path to be joined onto the
 * project root.
 */
export interface CreateSampleMessage {
  type: 'createSample';
}

/** Webview is ready to receive content. */
export interface ReadyMessage {
  type: 'ready';
}

export type ToExtensionMessage =
  | SelectSampleMessage
  | RefreshMessage
  | CreateSampleMessage
  | ReadyMessage;

// ============================================
// Panel State
// ============================================

/**
 * What the panel is showing.
 *
 * A discriminated union rather than a nullable record, because every case here
 * is a screen the panel can render. `state` used to be null until a project was
 * found, and both `refresh()` and `sendSamplesList()` began by returning early
 * on null - so opening the preview on a file with no project root reached
 * `showEmptyState('no-project')`, posted one message to a webview whose script
 * had not loaded yet, and then sat on "Loading preview..." for the rest of the
 * session. The documented "Not a Blade Project" screen was unreachable.
 */
export type PreviewState =
  | { readonly kind: 'no-editor' }
  | { readonly kind: 'no-project'; readonly file: string }
  | {
      readonly kind: 'project';
      readonly file: string;
      readonly projectRoot: string;
      /** Sample name without `.json`, or null until one is chosen. */
      selectedSample: string | null;
    };
