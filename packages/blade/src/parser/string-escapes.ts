/**
 * String escape decoding, shared by every Blade parser.
 *
 * There is exactly one definition of what a backslash means in Blade source,
 * and it lives here. The expression parser uses it for string literals; the
 * template parser uses it for quoted attribute and directive values.
 *
 * Supported escapes:
 *
 * | Escape       | Meaning                                    |
 * | ------------ | ------------------------------------------ |
 * | `\n`         | line feed (U+000A)                         |
 * | `\r`         | carriage return (U+000D)                   |
 * | `\t`         | tab (U+0009)                               |
 * | `\b`         | backspace (U+0008)                         |
 * | `\f`         | form feed (U+000C)                         |
 * | `\v`         | vertical tab (U+000B)                      |
 * | `\0`         | null (U+0000)                              |
 * | `\\`         | backslash                                  |
 * | `\"` / `\'`  | quote                                      |
 * | `\xHH`       | code unit from exactly two hex digits      |
 * | `\uHHHH`     | code unit from exactly four hex digits     |
 * | `\u{H...}`   | code point from one to six hex digits      |
 *
 * Anything else is an error. Unknown and malformed escapes are reported and
 * their source text is preserved verbatim in the decoded value, so a mistake
 * is visible in the output instead of silently changing it.
 */

import type { ParseError } from './index.js';
import type { Position } from './position.js';
import { START_POSITION } from './position.js';

/** Result of decoding a string body. */
export interface DecodedString {
  /** The decoded text. Malformed escapes are preserved verbatim. */
  value: string;
  /** One error per unknown or malformed escape sequence. */
  errors: ParseError[];
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  '\\': '\\',
  '"': '"',
  "'": "'",
  // `@` and `$` open a directive and an interpolation in template source, so
  // escaping them is how an author writes one literally. They decode here too:
  // one decoder for the whole language beats a second dialect per parser.
  '@': '@',
  $: '$',
};

const HEX = /^[0-9a-fA-F]+$/;

function isHex(text: string): boolean {
  return text.length > 0 && HEX.test(text);
}

/**
 * Decodes the escape sequences in a string body.
 *
 * @param raw - The body of the string, *without* its surrounding quotes
 * @param start - Absolute position of `raw[0]` in the enclosing document;
 *   defaults to the start of a standalone source
 */
export function decodeStringEscapes(
  raw: string,
  start: Position = START_POSITION
): DecodedString {
  const errors: ParseError[] = [];
  let value = '';

  let line = start.line;
  let column = start.column;
  let offset = start.offset;
  let index = 0;

  const positionHere = (): Position => ({ line, column, offset });

  /** Copies `count` characters from the source to the output, tracking lines. */
  const emitRaw = (count: number): void => {
    for (let i = 0; i < count; i++) {
      const char = raw[index] ?? '';
      value += char;
      index++;
      offset++;
      if (char === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  };

  /** Consumes `count` source characters and emits `replacement` instead. */
  const emitDecoded = (count: number, replacement: string): void => {
    for (let i = 0; i < count; i++) {
      const char = raw[index] ?? '';
      index++;
      offset++;
      if (char === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    value += replacement;
  };

  while (index < raw.length) {
    if (raw[index] !== '\\') {
      emitRaw(1);
      continue;
    }

    const escapeStart = positionHere();
    const next = raw[index + 1];

    const fail = (message: string, length: number): void => {
      errors.push({
        message,
        line: escapeStart.line,
        column: escapeStart.column,
        offset: escapeStart.offset,
      });
      emitRaw(length);
    };

    if (next === undefined) {
      fail('Unterminated escape sequence at end of string', 1);
      continue;
    }

    const simple = SIMPLE_ESCAPES[next];
    if (simple !== undefined) {
      emitDecoded(2, simple);
      continue;
    }

    if (next === 'x') {
      const digits = raw.slice(index + 2, index + 4);
      if (digits.length === 2 && isHex(digits)) {
        emitDecoded(4, String.fromCharCode(parseInt(digits, 16)));
      } else {
        fail(
          `Invalid hexadecimal escape sequence '\\x${digits}' (expected two hex digits)`,
          2
        );
      }
      continue;
    }

    if (next === 'u') {
      if (raw[index + 2] === '{') {
        const close = raw.indexOf('}', index + 3);
        const digits = close === -1 ? '' : raw.slice(index + 3, close);
        const codePoint = isHex(digits) ? parseInt(digits, 16) : NaN;
        if (
          close !== -1 &&
          digits.length <= 6 &&
          Number.isFinite(codePoint) &&
          codePoint <= 0x10ffff
        ) {
          emitDecoded(close - index + 1, String.fromCodePoint(codePoint));
        } else {
          fail(
            `Invalid unicode escape sequence '\\u{${digits}}' (expected one to six hex digits up to 10FFFF)`,
            3
          );
        }
        continue;
      }

      const digits = raw.slice(index + 2, index + 6);
      if (digits.length === 4 && isHex(digits)) {
        emitDecoded(6, String.fromCharCode(parseInt(digits, 16)));
      } else {
        fail(
          `Invalid unicode escape sequence '\\u${digits}' (expected four hex digits)`,
          2
        );
      }
      continue;
    }

    fail(`Unknown escape sequence '\\${next}'`, 2);
  }

  return { value, errors };
}
