/**
 * Message contracts between VSCode extension and webview
 * Feature: 007-vscode-preview-mode
 */

// ============================================
// Extension → Webview Messages
// ============================================

/** Update the preview with new HTML content */
export interface UpdateMessage {
  type: 'update';
  html: string;
  renderTime: number;
}

/** Display an error in the preview */
export interface ErrorMessage {
  type: 'error';
  message: string;
  line?: number;
  column?: number;
  file?: string;
  errorType: 'syntax' | 'validation' | 'runtime' | 'json';
}

/** Update the list of available samples */
export interface SamplesMessage {
  type: 'samples';
  files: SampleInfo[];
  selected: string | null;
}

export interface SampleInfo {
  name: string;
  isValid: boolean;
  error?: string;
}

/** Show loading state */
export interface LoadingMessage {
  type: 'loading';
}

/** Show empty state (no samples available) */
export interface EmptyMessage {
  type: 'empty';
  reason: 'no-samples' | 'no-project' | 'component-file';
  templateFile?: string;
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

/** User selected a different sample file */
export interface SelectSampleMessage {
  type: 'selectSample';
  file: string;
}

/** User requested manual refresh */
export interface RefreshMessage {
  type: 'refresh';
}

/** User clicked "Create Sample" for component */
export interface CreateSampleMessage {
  type: 'createSample';
  componentName: string;
}

/** Webview is ready to receive content */
export interface ReadyMessage {
  type: 'ready';
}

export type ToExtensionMessage =
  | SelectSampleMessage
  | RefreshMessage
  | CreateSampleMessage
  | ReadyMessage;
