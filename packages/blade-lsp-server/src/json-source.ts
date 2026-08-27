/**
 * Where each value of a JSON document sits in its own text.
 *
 * Sample-file diagnostics were all emitted at `{line: 0, character: 0}`, so
 * every squiggle landed on the first character of the file no matter which
 * property was wrong. A validator reports a *path*; turning that path back into
 * a range needs the source positions, which `JSON.parse` throws away.
 *
 * This is a scanner, not a second parser: the text has already parsed, so it
 * only has to walk the same structure again and remember where each value
 * started and ended. Paths use the notation the rest of the tooling uses -
 * `user.tags[1]`, `(root)` - so an entry can be looked up directly by the path
 * an error names.
 */

/** The span a value occupies, as offsets into the JSON text. */
export interface JsonSpan {
  readonly start: number;
  readonly end: number;
}

/** The path the root of a document is reported under. */
export const ROOT_PATH = '(root)';

/**
 * Indexes every value in a JSON document by its path.
 *
 * Object members are indexed twice: once at the value's span and once - under
 * the same path with a `#key` marker - at the key's span, so that a diagnostic
 * about a member can point at the name rather than at the value.
 *
 * @param text - The JSON source
 * @returns Path to span; empty when the text is not JSON
 */
export function indexJsonPaths(text: string): Map<string, JsonSpan> {
  const spans = new Map<string, JsonSpan>();
  const scanner = new Scanner(text, spans);
  try {
    scanner.value(ROOT_PATH);
  } catch {
    // Malformed input: whatever was indexed before the surprise still points
    // at real text, and a partial index is better than none.
  }
  return spans;
}

/**
 * The tightest span for a path, falling back to its nearest indexed ancestor.
 *
 * A "missing required property" error names a path that by definition is not in
 * the document, so the honest place to point is the object that should have
 * contained it.
 *
 * @param spans - Index from {@link indexJsonPaths}
 * @param path - Path in `user.tags[1]` notation, or `(root)`
 */
export function locateJsonPath(
  spans: ReadonlyMap<string, JsonSpan>,
  path: string
): JsonSpan | undefined {
  let current = path;
  for (;;) {
    const found = spans.get(current);
    if (found) return found;

    const bracket = current.lastIndexOf('[');
    const dot = current.lastIndexOf('.');
    const cut = Math.max(bracket, dot);
    if (cut <= 0) break;
    current = current.slice(0, cut);
  }
  return spans.get(ROOT_PATH);
}

/** A recursive-descent walk that records spans and discards values. */
class Scanner {
  private index = 0;

  constructor(
    private readonly text: string,
    private readonly spans: Map<string, JsonSpan>
  ) {}

  value(path: string): void {
    this.whitespace();
    const start = this.index;
    const char = this.text[this.index];

    if (char === '{') {
      this.object(path);
    } else if (char === '[') {
      this.array(path);
    } else if (char === '"') {
      this.string();
    } else {
      this.primitive();
    }

    this.spans.set(path, { start, end: this.index });
  }

  private object(path: string): void {
    this.index++; // {
    this.whitespace();
    if (this.text[this.index] === '}') {
      this.index++;
      return;
    }

    for (;;) {
      this.whitespace();
      const keyStart = this.index;
      const key = this.string();
      const keyEnd = this.index;
      this.whitespace();
      if (this.text[this.index] !== ':') throw new SyntaxError('expected ":"');
      this.index++;

      const childPath = path === ROOT_PATH ? key : `${path}.${key}`;
      this.spans.set(`${childPath}#key`, { start: keyStart, end: keyEnd });
      this.value(childPath);

      this.whitespace();
      const next = this.text[this.index];
      if (next === ',') {
        this.index++;
        continue;
      }
      if (next === '}') {
        this.index++;
        return;
      }
      throw new SyntaxError('expected "," or "}"');
    }
  }

  private array(path: string): void {
    this.index++; // [
    this.whitespace();
    if (this.text[this.index] === ']') {
      this.index++;
      return;
    }

    let element = 0;
    for (;;) {
      this.value(`${path === ROOT_PATH ? '' : path}[${element}]`);
      element++;

      this.whitespace();
      const next = this.text[this.index];
      if (next === ',') {
        this.index++;
        continue;
      }
      if (next === ']') {
        this.index++;
        return;
      }
      throw new SyntaxError('expected "," or "]"');
    }
  }

  /** Consumes a string literal and returns its unescaped value. */
  private string(): string {
    if (this.text[this.index] !== '"') throw new SyntaxError('expected string');
    this.index++;
    let out = '';
    while (this.index < this.text.length) {
      const char = this.text[this.index]!;
      if (char === '"') {
        this.index++;
        return out;
      }
      if (char === '\\') {
        const escape = this.text[this.index + 1];
        this.index += 2;
        switch (escape) {
          case 'n':
            out += '\n';
            break;
          case 't':
            out += '\t';
            break;
          case 'r':
            out += '\r';
            break;
          case 'b':
            out += '\b';
            break;
          case 'f':
            out += '\f';
            break;
          case 'u':
            out += String.fromCharCode(
              parseInt(this.text.slice(this.index, this.index + 4), 16)
            );
            this.index += 4;
            break;
          default:
            out += escape ?? '';
        }
        continue;
      }
      out += char;
      this.index++;
    }
    throw new SyntaxError('unterminated string');
  }

  /** Consumes a number, `true`, `false` or `null`. */
  private primitive(): void {
    const start = this.index;
    while (this.index < this.text.length) {
      const char = this.text[this.index]!;
      if (char === ',' || char === '}' || char === ']' || isSpace(char)) break;
      this.index++;
    }
    if (this.index === start) throw new SyntaxError('expected a value');
  }

  private whitespace(): void {
    while (this.index < this.text.length && isSpace(this.text[this.index]!)) {
      this.index++;
    }
  }
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
