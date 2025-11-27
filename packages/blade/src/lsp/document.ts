/**
 * Document Manager for Blade Language Server
 * Handles document lifecycle: create, update, parse, dispose
 */

import { parseTemplate } from '../parser/index.js';
import { parseProps } from '../parser/props-parser.js';
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
  // First, parse @props directive if present (strips it from source)
  const propsResult = parseProps(doc.content);

  // Parse the remaining template (after @props is stripped)
  const result = parseTemplate(propsResult.remainingSource);

  // Combine props warnings with template errors
  const allErrors = [
    ...propsResult.warnings.map(w => ({
      message: w.message,
      line: w.line,
      column: w.column,
      offset: w.offset,
    })),
    // Adjust line numbers for template errors if @props was present
    ...result.errors.map(e => ({
      ...e,
      // Offset line numbers to account for stripped @props
      line:
        e.line +
        (propsResult.remainingOffset > 0
          ? countLines(doc.content.slice(0, propsResult.remainingOffset))
          : 0),
    })),
  ];

  let scope =
    result.errors.length === 0 && result.value.length > 0
      ? analyzeScope(result.value, result.components)
      : createEmptyScope();

  // Adjust scope offsets to account for stripped @props directive
  // The AST offsets are relative to remainingSource, but we need them relative to original content
  const propsOffset = propsResult.remainingOffset;
  if (propsOffset > 0) {
    const adjustedVariables = new Map<
      number,
      typeof scope.variables extends Map<number, infer V> ? V : never
    >();
    for (const [offset, vars] of scope.variables) {
      adjustedVariables.set(offset + propsOffset, vars);
    }
    scope = { ...scope, variables: adjustedVariables };
  }

  // Add @props variables to scope as prop variables available everywhere
  const directiveProps = propsResult.directive?.props ?? [];
  if (directiveProps.length > 0) {
    const propsVars = directiveProps.map(p => ({
      name: p.name,
      kind: 'prop' as const,
      location: propsResult.directive?.location ?? {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    }));

    // Add props to all existing scope entries
    for (const [offset, vars] of scope.variables) {
      const existingNames = new Set(vars.map(v => v.name));
      const newProps = propsVars.filter(pv => !existingNames.has(pv.name));
      scope.variables.set(offset, [...newProps, ...vars]);
    }

    // Also ensure there's an entry at offset 0 with just props (before the template starts)
    if (!scope.variables.has(0)) {
      scope.variables.set(0, [...propsVars]);
    }
  }

  return {
    ...doc,
    ast: result.value,
    errors: allErrors,
    components: result.components,
    scope,
    lastParsed: Date.now(),
  };
}

/**
 * Count the number of newlines in a string
 */
function countLines(str: string): number {
  let count = 0;
  for (const char of str) {
    if (char === '\n') count++;
  }
  return count;
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
 * Also handles array access like "items[0].name" and wildcard "items[*].name"
 */
export function getPathAtOffset(
  content: string,
  offset: number
): { path: string; start: number; end: number; basePath: string } | null {
  // Path characters: alphanumeric, underscore, dollar sign, dot, brackets, numbers, asterisk
  const isPathChar = (char: string) => /[\w$.[\]*]/.test(char);

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

  // Don't return if it's just dots or brackets
  if (/^[.[\]*]+$/.test(path)) {
    return null;
  }

  // Extract the base path for schema lookups:
  // "items[0].name" -> "items[].name"
  // "items[*].name" -> "items[].name"
  // "items[0]." -> "items[]"
  // "$user.address.city" -> "user.address.city"
  let basePath = path.replace(/^\$/, ''); // Remove leading $
  basePath = basePath.replace(/\[\d+\]/g, '[]'); // Normalize numeric array indices
  basePath = basePath.replace(/\[\*\]/g, '[]'); // Normalize wildcard array indices

  return { path, start, end, basePath };
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
