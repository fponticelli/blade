/**
 * A single point in a source document.
 *
 * Positions are always ABSOLUTE coordinates in the document the user edits,
 * never coordinates inside some substring that a parser happens to have sliced
 * out. A parser that is handed a slice is also handed the position that slice
 * came from, and reports everything relative to it.
 *
 * @property line - Line number, 1-indexed
 * @property column - Column number, 1-indexed
 * @property offset - Character offset from the start of the document, 0-indexed
 */
export interface Position {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/** The position of the first character of a standalone source. */
export const START_POSITION: Position = { line: 1, column: 1, offset: 0 };

/**
 * The position reached by reading `text` from `start`.
 *
 * A parser that slices a source in two has to hand the second half the
 * coordinates the second half actually occupies, or every diagnostic in it
 * lands on the first character of the first half. Counting the line breaks is
 * the whole of the work, and doing it here means it is done once.
 *
 * @param start - Where the text begins
 * @param text - The text read
 */
export function advancePosition(start: Position, text: string): Position {
  let line = start.line;
  let column = start.column;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column, offset: start.offset + text.length };
}
