/**
 * Document Manager for Blade Language Server
 *
 * Owns the lifecycle of every open document and guarantees one property that
 * everything else depends on: **a document handed to a provider is internally
 * consistent**. Its text, line index, AST, errors and scope all describe the
 * same version.
 *
 * That was not true. `change()` stored the new text immediately and deferred
 * the re-parse behind a 200 ms debouncer, so `ast`, `errors` and `scope`
 * described the *previous* keystroke while `content` described the current one.
 * Diagnostics were published synchronously right after the store, from the
 * stale errors, and the debounced parse - when it finally landed - updated the
 * index and published nothing. So a squiggle appeared only after the *next*
 * keystroke and described the *previous* text, and completion resolved offsets
 * from one version against a scope built for another.
 *
 * The fix is not a shorter debounce. Freshness is a property of the document:
 * `get()` parses on demand when the stored parse is older than the stored text,
 * and the debounce only decides when the *background* parse and its diagnostics
 * happen.
 */

import { parseTemplate } from '@bladets/template';
import type { BladeDocument, LspConfig } from './types.js';
import { DEFAULT_LSP_CONFIG, createEmptyScope } from './types.js';
import { analyzeScope } from './analyzer/scope.js';
import { createLineIndex, offsetAt, positionAt } from './line-index.js';
import type { LinePosition } from './line-index.js';

/** Options that affect how a document is parsed. */
export interface ParseDocumentOptions {
  /** Files larger than this are not parsed at all. */
  readonly maxFileSize?: number;
}

/**
 * Create a new BladeDocument from content
 */
export function createDocument(
  uri: string,
  content: string,
  version: number = 1,
  options?: ParseDocumentOptions
): BladeDocument {
  return parseContent(uri, content, version, options);
}

/**
 * Update document content and re-parse
 */
export function updateDocument(
  doc: BladeDocument,
  content: string,
  version: number,
  options?: ParseDocumentOptions
): BladeDocument {
  return parseContent(doc.uri, content, version, options);
}

/**
 * Parse document content and update AST, errors, components, props and scope.
 *
 * One parser, one coordinate system: `@props` is a directive in the AST, so
 * there is nothing to strip from the source and no offsets to rebase. The old
 * two-pass arrangement patched the line of every diagnostic by the number of
 * lines the stripped @props block occupied and left the column and offset
 * alone, so every squiggle in a file with props landed on the wrong character.
 */
export function parseDocument(
  doc: BladeDocument,
  options?: ParseDocumentOptions
): BladeDocument {
  return parseContent(doc.uri, doc.content, doc.version, options);
}

function parseContent(
  uri: string,
  content: string,
  version: number,
  options?: ParseDocumentOptions
): BladeDocument {
  const lines = createLineIndex(content);
  const maxFileSize = options?.maxFileSize ?? Number.POSITIVE_INFINITY;

  // `performance.maxFileSize` was declared and never enforced, so a
  // multi-megabyte .blade file was fully re-tokenised on every keystroke.
  if (content.length > maxFileSize) {
    return {
      uri,
      version,
      content,
      lines,
      ast: null,
      errors: [],
      components: new Map(),
      props: [],
      scope: createEmptyScope(),
      lastParsed: Date.now(),
      oversized: true,
    };
  }

  const result = parseTemplate(content);

  // Analyse whatever parsed. A document being edited is in an error state most
  // of the time, and that is exactly when completions matter; the parser always
  // returns a partial AST, so there is always something to analyse.
  const scope =
    result.value.length > 0 || result.components.size > 0
      ? analyzeScope(result.value, result.components, content.length)
      : createEmptyScope();

  return {
    uri,
    version,
    content,
    lines,
    ast: result.value,
    errors: result.errors,
    components: result.components,
    props: result.props,
    scope,
    lastParsed: Date.now(),
    oversized: false,
  };
}

// =============================================================================
// Position conversion
// =============================================================================

/**
 * The offset of a zero-based position in a document.
 *
 * Reads the document's own line index; the two former implementations split the
 * whole text on every call.
 */
export function offsetOfPosition(
  doc: BladeDocument,
  position: LinePosition
): number {
  return offsetAt(doc.lines, position.line, position.character);
}

/** The zero-based position of an offset in a document. */
export function positionOfOffset(
  doc: BladeDocument,
  offset: number
): LinePosition {
  return positionAt(doc.lines, offset);
}

// =============================================================================
// Text lookups
// =============================================================================

/** A word and the span it occupies. */
export interface WordInfo {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Get the word at a given offset
 */
export function getWordAtOffset(
  content: string,
  offset: number
): WordInfo | null {
  let start = offset;
  let end = offset;

  // Word characters: alphanumeric, underscore, dollar sign
  const isWordChar = (char: string) => /[\w$]/.test(char);

  while (start > 0 && isWordChar(content[start - 1] ?? '')) {
    start--;
  }

  while (end < content.length && isWordChar(content[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return { word: content.slice(start, end), start, end };
}

/** A path expression and its normalised schema lookup key. */
export interface PathInfo {
  readonly path: string;
  readonly start: number;
  readonly end: number;
  /** `items[0].name` and `items[*].name` both normalise to `items[].name`. */
  readonly basePath: string;
}

/**
 * Get the path expression at offset (e.g., "user.name" from "${user.name}")
 * Also handles array access like "items[0].name" and wildcard "items[*].name"
 */
export function getPathAtOffset(
  content: string,
  offset: number
): PathInfo | null {
  // Path characters: alphanumeric, underscore, dollar sign, dot, brackets, numbers, asterisk
  const isPathChar = (char: string) => /[\w$.[\]*]/.test(char);

  let start = offset;
  let end = offset;

  while (start > 0 && isPathChar(content[start - 1] ?? '')) {
    start--;
  }

  while (end < content.length && isPathChar(content[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  const path = content.slice(start, end);

  // Don't return if it's just dots or brackets
  if (/^[.[\]*]+$/.test(path)) {
    return null;
  }

  // Extract the base path for schema lookups:
  // "items[0].name" -> "items[].name"
  // "items[*].name" -> "items[].name"
  // "$user.address.city" -> "user.address.city"
  let basePath = path.replace(/^\$/, '');
  basePath = basePath.replace(/\[\d+\]/g, '[]');
  basePath = basePath.replace(/\[\*\]/g, '[]');

  return { path, start, end, basePath };
}

/**
 * Debounce helper for document changes
 */
export function createDebouncer(delayMs: number): (fn: () => void) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (fn: () => void) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn();
    }, delayMs);
  };
}

/** One open document: the last parse, and the text that has outrun it. */
interface DocumentEntry {
  parsed: BladeDocument;
  pending: { content: string; version: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Document manager class for managing multiple documents.
 *
 * `onDocumentParsed` is the single point at which a new parse becomes visible,
 * and therefore the single point from which diagnostics are published. It fires
 * whether the parse was triggered by the debounce timer or on demand by a
 * request, so a document can never be left holding errors nobody published.
 */
export class DocumentManager {
  private entries = new Map<string, DocumentEntry>();
  private config: LspConfig;
  private readonly onDocumentParsed?: (doc: BladeDocument) => void;

  constructor(
    config: LspConfig = DEFAULT_LSP_CONFIG,
    onDocumentParsed?: (doc: BladeDocument) => void
  ) {
    this.config = config;
    this.onDocumentParsed = onDocumentParsed;
  }

  /** Replace the configuration used for subsequent parses. */
  updateConfig(config: LspConfig): void {
    this.config = config;
  }

  open(uri: string, content: string, version: number): BladeDocument {
    this.cancel(uri);
    const parsed = createDocument(uri, content, version, this.parseOptions());
    this.entries.set(uri, { parsed, pending: null, timer: null });
    this.onDocumentParsed?.(parsed);
    return parsed;
  }

  /**
   * Record an edit.
   *
   * The text is stored immediately - it is the truth about the buffer - and the
   * parse is scheduled. Nothing observes the stored text without the parse:
   * {@link get} completes it first.
   */
  change(uri: string, content: string, version: number): void {
    const entry = this.entries.get(uri);
    if (!entry) {
      this.open(uri, content, version);
      return;
    }

    // `TextDocuments` reports a content change for the open itself, which the
    // open has already parsed. Re-parsing it would double the work of every
    // file the editor opens.
    if (entry.pending === null && entry.parsed.version === version) {
      return;
    }

    entry.pending = { content, version };
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this.flush(uri);
    }, this.config.performance.debounceMs);
    // A zero-delay timer must not keep a language server process alive on its
    // own; the work is only worth doing while something else is running.
    entry.timer.unref?.();
  }

  close(uri: string): void {
    this.cancel(uri);
    this.entries.delete(uri);
  }

  /**
   * The document, parsed.
   *
   * If an edit is still pending it is parsed here and now, so a provider never
   * observes text and scope from different versions.
   */
  get(uri: string): BladeDocument | undefined {
    const entry = this.entries.get(uri);
    if (!entry) return undefined;
    if (entry.pending) this.flush(uri);
    return entry.parsed;
  }

  getAll(): BladeDocument[] {
    return Array.from(this.entries.keys()).flatMap(uri => {
      const doc = this.get(uri);
      return doc ? [doc] : [];
    });
  }

  has(uri: string): boolean {
    return this.entries.has(uri);
  }

  /** Parse a pending edit now and announce it. */
  flush(uri: string): BladeDocument | undefined {
    const entry = this.entries.get(uri);
    if (!entry) return undefined;
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    const pending = entry.pending;
    if (!pending) return entry.parsed;

    entry.pending = null;
    entry.parsed = createDocument(
      uri,
      pending.content,
      pending.version,
      this.parseOptions()
    );
    this.onDocumentParsed?.(entry.parsed);
    return entry.parsed;
  }

  /** Stop every scheduled parse; the manager is not usable for edits after. */
  dispose(): void {
    for (const uri of this.entries.keys()) this.cancel(uri);
    this.entries.clear();
  }

  private cancel(uri: string): void {
    const entry = this.entries.get(uri);
    if (entry?.timer != null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  private parseOptions(): ParseDocumentOptions {
    return { maxFileSize: this.config.performance.maxFileSize };
  }
}
