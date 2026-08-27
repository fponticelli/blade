/**
 * The reading head of the template parser.
 *
 * Two bugs motivated this module, and both were bugs of *ownership*.
 *
 * The template parser used to keep `pos`, `line` and `column` as three
 * independent fields. `advance()` maintained all three, but nine other sites
 * moved `pos` on their own - `this.pos += 4` to skip `else`, `this.pos =
 * exprEnd` to jump to a scanned expression, `this.pos = exprStart` to rewind -
 * so line and column silently drifted away from the offset. The drift was
 * cumulative: one `$foo` per line permanently shifted every subsequent column
 * in the file, and LSP squiggles are placed from the column. One of those jumps
 * was fed by an unchecked `indexOf`, so a missing `{` drove the cursor to -1,
 * where `isAtEnd()` is false and `peek()` returns `'\0'` forever.
 *
 * Here the offset is private and the only mutators are {@link Cursor.advance},
 * {@link Cursor.advanceBy} and {@link Cursor.seek}. All three maintain
 * line/column with the offset, and all three keep the offset inside
 * `[0, source.length]`, so neither bug class can be written again.
 *
 * The module also owns the *one* balanced-delimiter scanner. There used to be
 * nine copies of that six-line loop, and not one of them knew what a string
 * literal was: `${ concat("}", $a) }` ended the interpolation at the `}` inside
 * the string, and `@let x = "a;b"` split the declaration at the `;` inside the
 * string. The scanners below consume string literals as units.
 */

import type { Position } from './position.js';

/** Returned by {@link Cursor.peek} past the end of the source. */
export const EOF_CHAR = '\0';

/** Whether the character can continue an identifier (`[A-Za-z0-9_]`). */
export function isIdentifierPart(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    (char >= '0' && char <= '9') ||
    char === '_'
  );
}

/** Whether the character is template whitespace. */
export function isWhitespaceChar(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

export class Cursor {
  private readonly text: string;
  private off = 0;
  private ln = 1;
  private col = 1;

  constructor(source: string) {
    this.text = source;
  }

  /** The whole document being read. */
  get source(): string {
    return this.text;
  }

  /** Offset of the reading head, 0-indexed. Always in `[0, source.length]`. */
  get offset(): number {
    return this.off;
  }

  /** Line of the reading head, 1-indexed. */
  get line(): number {
    return this.ln;
  }

  /** Column of the reading head, 1-indexed. */
  get column(): number {
    return this.col;
  }

  /**
   * The reading head as a {@link Position}.
   *
   * The three coordinates are captured together and can only have been produced
   * together, so a caller can save one and {@link seek} back to it without the
   * coordinates ever disagreeing.
   */
  get position(): Position {
    return { line: this.ln, column: this.col, offset: this.off };
  }

  isAtEnd(): boolean {
    return this.off >= this.text.length;
  }

  /** The character `ahead` positions from the head, or `'\0'` past the end. */
  peek(ahead = 0): string {
    return this.text[this.off + ahead] ?? EOF_CHAR;
  }

  /** The next `count` characters, or fewer at the end of the source. */
  peekAhead(count: number): string {
    return this.text.slice(this.off, this.off + count);
  }

  /** The source between two saved positions. */
  textBetween(start: Position, end: Position): string {
    return this.text.slice(start.offset, end.offset);
  }

  /** The source from a saved position to the reading head. */
  textFrom(start: Position): string {
    return this.text.slice(start.offset, this.off);
  }

  /** Consumes one character and returns it (`'\0'` at the end of the source). */
  advance(): string {
    if (this.isAtEnd()) return EOF_CHAR;
    const char = this.text[this.off] as string;
    this.off += 1;
    if (char === '\n') {
      this.ln += 1;
      this.col = 1;
    } else {
      this.col += 1;
    }
    return char;
  }

  /**
   * Consumes up to `count` characters, walking them one at a time so line and
   * column stay correct, and returns the text consumed.
   */
  advanceBy(count: number): string {
    const start = this.off;
    for (let i = 0; i < count && !this.isAtEnd(); i += 1) {
      this.advance();
    }
    return this.text.slice(start, this.off);
  }

  /**
   * Moves the head back (or forward) to a position produced by this cursor.
   *
   * @throws if the offset is outside the source - that can only be a parser
   *   bug, and it is the bug that used to send the cursor to -1.
   */
  seek(position: Position): void {
    if (
      !Number.isInteger(position.offset) ||
      position.offset < 0 ||
      position.offset > this.text.length
    ) {
      throw new RangeError(
        `Cursor.seek: offset ${position.offset} is outside [0, ${this.text.length}]`
      );
    }
    this.off = position.offset;
    this.ln = position.line;
    this.col = position.column;
  }

  /** Whether the source at the head starts with `text`. */
  startsWith(text: string): boolean {
    return this.text.startsWith(text, this.off);
  }

  /** Consumes `text` if the source at the head starts with it. */
  match(text: string): boolean {
    if (!this.startsWith(text)) return false;
    this.advanceBy(text.length);
    return true;
  }

  /**
   * Consumes `word` only when it is followed by a non-identifier character.
   *
   * `peekAhead(4) === 'else'` matched the first four characters of `elsewhere`,
   * and `peekAhead(3) === 'let'` matched `letters`; both produced a directive
   * out of ordinary prose with no diagnostic at all.
   */
  matchKeyword(word: string): boolean {
    if (!this.startsWith(word)) return false;
    if (isIdentifierPart(this.peek(word.length))) return false;
    this.advanceBy(word.length);
    return true;
  }

  /** Whether `word` appears at the head as a whole word. */
  peekKeyword(word: string): boolean {
    return this.startsWith(word) && !isIdentifierPart(this.peek(word.length));
  }
}

// =============================================================================
// Delimiter scanning
// =============================================================================

/** A run of source text scanned out for a sub-parser, with its absolute span. */
export interface ScannedSource {
  /** The text between the delimiters; the delimiters themselves are excluded. */
  source: string;
  /** Absolute position of `source[0]`. */
  start: Position;
  /** Absolute position one past the last character of `source`. */
  end: Position;
  /** True when the end of the source was reached before the terminator. */
  unterminated: boolean;
}

const QUOTES = new Set(['"', "'"]);
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

/**
 * Consumes a string literal, including its quotes and backslash escapes.
 *
 * Mirrors the expression tokenizer: a literal may span newlines, and one that
 * is never closed runs to the end of the source, where the expression parser
 * reports it.
 */
function skipStringLiteral(cursor: Cursor): void {
  const quote = cursor.advance();
  while (!cursor.isAtEnd()) {
    const char = cursor.peek();
    if (char === '\\') {
      cursor.advance();
      if (!cursor.isAtEnd()) cursor.advance();
      continue;
    }
    cursor.advance();
    if (char === quote) return;
  }
}

function scanned(
  cursor: Cursor,
  start: Position,
  end: Position,
  unterminated: boolean
): ScannedSource {
  return {
    source: cursor.textBetween(start, end),
    start,
    end,
    unterminated,
  };
}

/**
 * Scans to the delimiter matching one already consumed, and consumes it.
 *
 * The opening delimiter must already have been consumed, so the scan starts at
 * depth 1. Nested pairs are counted and string literals are skipped whole.
 *
 * @param cursor - Positioned just after the opening delimiter
 * @param open - The opening delimiter, counted for nesting
 * @param close - The closing delimiter to stop at and consume
 */
export function scanBalanced(
  cursor: Cursor,
  open: string,
  close: string
): ScannedSource {
  const start = cursor.position;
  let depth = 1;

  while (!cursor.isAtEnd()) {
    const char = cursor.peek();

    if (QUOTES.has(char)) {
      skipStringLiteral(cursor);
      continue;
    }

    if (char === open) {
      depth += 1;
      cursor.advance();
      continue;
    }

    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        const end = cursor.position;
        cursor.advance(); // the closing delimiter
        return scanned(cursor, start, end, false);
      }
      cursor.advance();
      continue;
    }

    cursor.advance();
  }

  return scanned(cursor, start, cursor.position, true);
}

/**
 * Scans to the first of `stopChars` that appears outside every bracket pair and
 * every string literal, and leaves the cursor ON it.
 *
 * Used wherever a value runs up to a terminator rather than to a closing
 * delimiter: a `@props` default value (`,` or `)`), a `@let` value (`;` or a
 * newline), a `@match` case condition (`{`).
 *
 * @param cursor - Positioned at the first character of the value
 * @param stopChars - Characters that end the value at bracket depth 0
 */
export function scanValue(cursor: Cursor, stopChars: string): ScannedSource {
  const start = cursor.position;
  let depth = 0;

  while (!cursor.isAtEnd()) {
    const char = cursor.peek();

    if (QUOTES.has(char)) {
      skipStringLiteral(cursor);
      continue;
    }

    if (depth === 0 && stopChars.includes(char)) {
      return scanned(cursor, start, cursor.position, false);
    }

    if (OPENERS.has(char)) {
      depth += 1;
    } else if (CLOSERS.has(char) && depth > 0) {
      depth -= 1;
    }

    cursor.advance();
  }

  return scanned(cursor, start, cursor.position, true);
}
