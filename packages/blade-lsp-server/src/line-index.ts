/**
 * Line/offset conversion for a document version.
 *
 * Both directions used to `split('\n')` the whole document on every call, and
 * `offsetToPosition` additionally `slice`d the entire prefix before splitting
 * it. Three copies of that existed - `document.ts`, `providers/completion.ts`
 * and `providers/definition.ts` - and completion and hover call them several
 * times per keystroke, so a 100 KB template produced hundreds of kilobytes of
 * garbage per character typed.
 *
 * A document's line starts are a property of its text. They are computed once
 * per version, held on the document beside the AST, and both conversions are
 * binary searches over that array: no allocation, O(log lines).
 */

/** Where every line of a document version begins. */
export interface LineIndex {
  /** The text this index describes. */
  readonly content: string;
  /** Offset of the first character of each line; `starts[0]` is always 0. */
  readonly starts: Int32Array;
}

/** A zero-based LSP position. */
export interface LinePosition {
  readonly line: number;
  readonly character: number;
}

/**
 * Indexes the line starts of a string.
 *
 * `\r\n` needs no special handling: the `\r` belongs to the preceding line, and
 * offsets are counted in UTF-16 code units exactly as the protocol requires.
 *
 * @param content - The document text
 * @returns An index valid for exactly that text
 */
export function createLineIndex(content: string): LineIndex {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return { content, starts: Int32Array.from(starts) };
}

/**
 * The offset of a zero-based line/character position.
 *
 * Out-of-range positions are clamped rather than rejected: an editor can ask
 * about a position in a version the server has not applied yet, and answering
 * with the nearest valid offset is what keeps a completion useful instead of
 * throwing inside a request handler.
 *
 * @param index - Index for the document text
 * @param line - Zero-based line
 * @param character - Zero-based character within the line
 * @returns The clamped offset
 */
export function offsetAt(
  index: LineIndex,
  line: number,
  character: number
): number {
  const { starts, content } = index;
  if (line < 0) return 0;
  if (line >= starts.length) return content.length;

  const start = starts[line]!;
  const end = lineEnd(index, line);
  if (character <= 0) return start;
  return Math.min(start + character, end);
}

/**
 * The zero-based position of an offset.
 *
 * @param index - Index for the document text
 * @param offset - Offset into the document
 * @returns The clamped position
 */
export function positionAt(index: LineIndex, offset: number): LinePosition {
  const { starts, content } = index;
  const clamped = Math.max(0, Math.min(offset, content.length));

  // Largest line whose start is <= clamped.
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (starts[mid]! <= clamped) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { line: low, character: clamped - starts[low]! };
}

/** The offset just past the last character of a line, excluding its newline. */
export function lineEnd(index: LineIndex, line: number): number {
  const { starts, content } = index;
  if (line + 1 < starts.length) {
    const nextStart = starts[line + 1]!;
    // Exclude the newline, and the carriage return of a CRLF pair.
    const withoutNewline = nextStart - 1;
    return withoutNewline > starts[line]! &&
      content.charCodeAt(withoutNewline - 1) === 13
      ? withoutNewline - 1
      : withoutNewline;
  }
  return content.length;
}

/** The offset of the first character of the line containing `offset`. */
export function lineStartAt(index: LineIndex, offset: number): number {
  return index.starts[positionAt(index, offset).line]!;
}
