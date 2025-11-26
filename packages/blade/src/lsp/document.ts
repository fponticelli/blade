/**
 * Document Manager for Blade Language Server
 * Handles document lifecycle: create, update, parse, dispose
 */

import { parseTemplate } from '../parser/index.js';
import type { BladeDocument, LspConfig } from './types.js';
import { createEmptyScope } from './types.js';
import { analyzeScope } from './analyzer/scope.js';

/**
 * Create a new BladeDocument from content
 */
export function createDocument(
  uri: string,
  content: string,
  version: number = 1
): BladeDocument {
  const doc: BladeDocument = {
    uri,
    version,
    content,
    ast: null,
    errors: [],
    components: new Map(),
    scope: createEmptyScope(),
    lastParsed: 0,
  };

  return parseDocument(doc);
}

/**
 * Update document content and re-parse
 */
export function updateDocument(
  doc: BladeDocument,
  content: string,
  version: number
): BladeDocument {
  return parseDocument({
    ...doc,
    content,
    version,
  });
}

/**
 * Parse document content and update AST, errors, components, and scope
 */
export function parseDocument(doc: BladeDocument): BladeDocument {
  const result = parseTemplate(doc.content);

  const scope =
    result.errors.length === 0 && result.value.length > 0
      ? analyzeScope(result.value, result.components)
      : createEmptyScope();

  return {
    ...doc,
    ast: result.value,
    errors: result.errors,
    components: result.components,
    scope,
    lastParsed: Date.now(),
  };
}

/**
 * Get the offset in the document for a given line and character
 */
export function getOffset(
  content: string,
  line: number,
  character: number
): number {
  const lines = content.split('\n');
  let offset = 0;

  for (let i = 0; i < line && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }

  offset += Math.min(character, lines[line]?.length ?? 0);
  return offset;
}

/**
 * Get line and character from offset
 */
export function getPosition(
  content: string,
  offset: number
): { line: number; character: number } {
  const lines = content.split('\n');
  let currentOffset = 0;

  for (let line = 0; line < lines.length; line++) {
    const lineLength = (lines[line]?.length ?? 0) + 1; // +1 for newline

    if (currentOffset + lineLength > offset) {
      return {
        line,
        character: offset - currentOffset,
      };
    }

    currentOffset += lineLength;
  }

  // Past end of document
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1]?.length ?? 0,
  };
}

/**
 * Get the word at a given offset
 */
export function getWordAtOffset(
  content: string,
  offset: number
): { word: string; start: number; end: number } | null {
  // Find word boundaries
  let start = offset;
  let end = offset;

  // Word characters: alphanumeric, underscore, dollar sign
  const isWordChar = (char: string) => /[\w$]/.test(char);

  // Go backward to find start
  while (start > 0 && isWordChar(content[start - 1] ?? '')) {
    start--;
  }

  // Go forward to find end
  while (end < content.length && isWordChar(content[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  return {
    word: content.slice(start, end),
    start,
    end,
  };
}

/**
 * Get the path expression at offset (e.g., "user.name" from "${user.name}")
 */
export function getPathAtOffset(
  content: string,
  offset: number
): { path: string; start: number; end: number } | null {
  // Path characters: alphanumeric, underscore, dollar sign, dot
  const isPathChar = (char: string) => /[\w$.]/.test(char);

  let start = offset;
  let end = offset;

  // Go backward to find start
  while (start > 0 && isPathChar(content[start - 1] ?? '')) {
    start--;
  }

  // Go forward to find end
  while (end < content.length && isPathChar(content[end] ?? '')) {
    end++;
  }

  if (start === end) {
    return null;
  }

  const path = content.slice(start, end);

  // Don't return if it's just dots
  if (/^\.+$/.test(path)) {
    return null;
  }

  return { path, start, end };
}

/**
 * Check if offset is inside an expression ${...}
 */
export function isInsideExpression(content: string, offset: number): boolean {
  // Look backward for ${ that isn't closed
  let depth = 0;

  for (let i = offset - 1; i >= 0; i--) {
    if (content[i] === '}') {
      depth++;
    } else if (content[i] === '{' && i > 0 && content[i - 1] === '$') {
      if (depth === 0) {
        return true;
      }
      depth--;
    }
  }

  return false;
}

/**
 * Check if offset is after @ for directive context
 */
export function isAfterDirective(content: string, offset: number): boolean {
  // Look backward for @ that starts a directive
  for (let i = offset - 1; i >= 0; i--) {
    const char = content[i];

    if (char === '@') {
      return true;
    }

    // Stop at whitespace or other non-word characters (except @)
    if (!char || !/[\w]/.test(char)) {
      return false;
    }
  }

  return false;
}

/**
 * Check if offset is inside an HTML tag
 */
export function isInsideTag(
  content: string,
  offset: number
): { tagName: string; inAttribute: boolean } | null {
  // Look backward for < that isn't closed
  let inTag = false;
  let tagStart = -1;

  for (let i = offset - 1; i >= 0; i--) {
    const char = content[i];

    if (char === '>') {
      // Tag closed before us
      return null;
    }

    if (char === '<') {
      inTag = true;
      tagStart = i;
      break;
    }
  }

  if (!inTag || tagStart === -1) {
    return null;
  }

  // Extract tag name
  let tagEnd = tagStart + 1;
  while (tagEnd < content.length && /[\w-]/.test(content[tagEnd] ?? '')) {
    tagEnd++;
  }

  const tagName = content.slice(tagStart + 1, tagEnd);

  // Check if we're in an attribute (past the tag name)
  const inAttribute = offset > tagEnd;

  return { tagName, inAttribute };
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

/**
 * Document manager class for managing multiple documents
 */
export class DocumentManager {
  private documents = new Map<string, BladeDocument>();
  private debouncers = new Map<string, (fn: () => void) => void>();
  private config: LspConfig;
  private onDocumentParsed?: (doc: BladeDocument) => void;

  constructor(
    config: LspConfig,
    onDocumentParsed?: (doc: BladeDocument) => void
  ) {
    this.config = config;
    this.onDocumentParsed = onDocumentParsed;
  }

  open(uri: string, content: string, version: number): BladeDocument {
    const doc = createDocument(uri, content, version);
    this.documents.set(uri, doc);
    this.debouncers.set(
      uri,
      createDebouncer(this.config.performance.debounceMs)
    );
    this.onDocumentParsed?.(doc);
    return doc;
  }

  change(uri: string, content: string, version: number): void {
    const doc = this.documents.get(uri);
    if (!doc) {
      // Document not open, create it
      this.open(uri, content, version);
      return;
    }

    // Update content immediately but debounce parsing
    const updatedDoc: BladeDocument = {
      ...doc,
      content,
      version,
    };
    this.documents.set(uri, updatedDoc);

    const debounce = this.debouncers.get(uri);
    if (debounce) {
      debounce(() => {
        const currentDoc = this.documents.get(uri);
        if (currentDoc && currentDoc.version === version) {
          const parsed = parseDocument(currentDoc);
          this.documents.set(uri, parsed);
          this.onDocumentParsed?.(parsed);
        }
      });
    }
  }

  close(uri: string): void {
    this.documents.delete(uri);
    this.debouncers.delete(uri);
  }

  get(uri: string): BladeDocument | undefined {
    return this.documents.get(uri);
  }

  getAll(): BladeDocument[] {
    return Array.from(this.documents.values());
  }

  has(uri: string): boolean {
    return this.documents.has(uri);
  }
}
