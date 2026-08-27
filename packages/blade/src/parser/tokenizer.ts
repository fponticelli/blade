/**
 * Tokenizer for Blade expressions.
 *
 * This lexer serves the EXPRESSION grammar only - the template grammar has its
 * own scanner in `template-parser.ts`. It therefore knows nothing about tags,
 * directives or template keywords: `match`, `when`, `for`, `props` and friends
 * are ordinary identifiers here, so a data field may be named after any of them.
 *
 * Two invariants hold for every input, however malformed:
 *
 * 1. **It never throws.** A lexical failure produces a {@link TokenType.ERROR}
 *    token carrying the offending text, plus a {@link ParseError}.
 * 2. **It never drops a character.** Every character is either consumed as
 *    whitespace or covered by exactly one token, so the token stream can always
 *    be sliced back to the source.
 *
 * Positions are recorded when a scan starts and when it ends - never derived by
 * subtracting a length - and are rebased onto the enclosing document through the
 * `basePosition` given to the constructor.
 */

import type { ParseError } from './index.js';
import type { Position } from './position.js';
import { START_POSITION } from './position.js';

export type { Position } from './position.js';

export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL = 'NULL',

  // Identifiers and paths
  IDENTIFIER = 'IDENTIFIER',
  DOLLAR = 'DOLLAR', // $

  // Operators
  PLUS = 'PLUS', // +
  MINUS = 'MINUS', // -
  STAR = 'STAR', // *
  SLASH = 'SLASH', // /
  PERCENT = 'PERCENT', // %
  BANG = 'BANG', // !
  EQ_EQ = 'EQ_EQ', // ==
  BANG_EQ = 'BANG_EQ', // !=
  LT = 'LT', // <
  GT = 'GT', // >
  LT_EQ = 'LT_EQ', // <=
  GT_EQ = 'GT_EQ', // >=
  AMP_AMP = 'AMP_AMP', // &&
  PIPE_PIPE = 'PIPE_PIPE', // ||
  QUESTION_QUESTION = 'QUESTION_QUESTION', // ??
  QUESTION = 'QUESTION', // ?
  COLON = 'COLON', // :

  // Delimiters
  LPAREN = 'LPAREN', // (
  RPAREN = 'RPAREN', // )
  LBRACE = 'LBRACE', // {
  RBRACE = 'RBRACE', // }
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  DOT = 'DOT', // .
  COMMA = 'COMMA', // ,
  ARROW = 'ARROW', // =>

  // Control
  ERROR = 'ERROR',
  EOF = 'EOF',
}

/**
 * A lexeme with the absolute range it occupies in the document.
 *
 * `value` is always `source.slice(start.offset - base.offset, end.offset - base.offset)`,
 * so a token never disagrees with its own range.
 */
export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly start: Position;
  readonly end: Position;
}

/** Everything a tokenizer run produces. Errors are never thrown. */
export interface TokenizeResult {
  tokens: Token[];
  errors: ParseError[];
}

/**
 * Characters that are reserved by the expression grammar but are not operators
 * in it, mapped to the hint shown when one appears on its own.
 */
const SINGLE_CHAR_HINTS: Readonly<Record<string, string>> = {
  '&': "did you mean '&&'?",
  '|': "did you mean '||'?",
  '=': "did you mean '==' or '=>'?",
};

const UNICODE_IDENTIFIER_START = /[\p{L}\p{Nl}]/u;
const UNICODE_IDENTIFIER_PART = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/u;

export class Tokenizer {
  private readonly source: string;
  private readonly base: Position;

  private pos = 0;
  private line: number;
  private column: number;
  private tokens: Token[] = [];
  private errors: ParseError[] = [];

  /**
   * @param source - The expression source, which may be a slice of a larger document
   * @param basePosition - Absolute position of `source[0]` in that document
   */
  constructor(source: string, basePosition: Position = START_POSITION) {
    this.source = source;
    this.base = basePosition;
    this.line = basePosition.line;
    this.column = basePosition.column;
  }

  /**
   * Scans the whole source. Never throws; repeated calls return the same result.
   */
  tokenize(): TokenizeResult {
    this.pos = 0;
    this.line = this.base.line;
    this.column = this.base.column;
    this.tokens = [];
    this.errors = [];

    while (!this.isAtEnd()) {
      const before = this.pos;
      this.scanToken();
      if (this.pos === before) {
        // Unreachable: scanToken() consumes at least one character on every
        // path. Kept so a future scanner that forgets to advance cannot hang.
        this.advance();
      }
    }

    const end = this.position();
    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      start: end,
      end,
    });
    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    const start = this.position();
    const startIndex = this.pos;
    const char = this.advance();

    if (this.isWhitespace(char)) {
      // Whitespace carries no meaning in an expression, and no token.
      return;
    }

    if (this.isIdentifierStart(char)) {
      this.scanIdentifier(startIndex, start);
      return;
    }

    if (this.isDigit(char)) {
      this.scanNumber(startIndex, start);
      return;
    }

    if (char === '"' || char === "'") {
      this.scanString(char, startIndex, start);
      return;
    }

    switch (char) {
      case '$':
        return this.push(TokenType.DOLLAR, startIndex, start);
      case '(':
        return this.push(TokenType.LPAREN, startIndex, start);
      case ')':
        return this.push(TokenType.RPAREN, startIndex, start);
      case '{':
        return this.push(TokenType.LBRACE, startIndex, start);
      case '}':
        return this.push(TokenType.RBRACE, startIndex, start);
      case '[':
        return this.push(TokenType.LBRACKET, startIndex, start);
      case ']':
        return this.push(TokenType.RBRACKET, startIndex, start);
      case '.':
        return this.push(TokenType.DOT, startIndex, start);
      case ',':
        return this.push(TokenType.COMMA, startIndex, start);
      case ':':
        return this.push(TokenType.COLON, startIndex, start);
      case '+':
        return this.push(TokenType.PLUS, startIndex, start);
      case '-':
        return this.push(TokenType.MINUS, startIndex, start);
      case '*':
        return this.push(TokenType.STAR, startIndex, start);
      case '/':
        return this.push(TokenType.SLASH, startIndex, start);
      case '%':
        return this.push(TokenType.PERCENT, startIndex, start);
      case '!':
        return this.pushIfNext(
          '=',
          TokenType.BANG_EQ,
          TokenType.BANG,
          startIndex,
          start
        );
      case '<':
        return this.pushIfNext(
          '=',
          TokenType.LT_EQ,
          TokenType.LT,
          startIndex,
          start
        );
      case '>':
        return this.pushIfNext(
          '=',
          TokenType.GT_EQ,
          TokenType.GT,
          startIndex,
          start
        );
      case '?':
        return this.pushIfNext(
          '?',
          TokenType.QUESTION_QUESTION,
          TokenType.QUESTION,
          startIndex,
          start
        );
      case '&':
        return this.pushPairOrError('&', TokenType.AMP_AMP, startIndex, start);
      case '|':
        return this.pushPairOrError(
          '|',
          TokenType.PIPE_PIPE,
          startIndex,
          start
        );
      case '=':
        if (this.peek() === '>') {
          this.advance();
          return this.push(TokenType.ARROW, startIndex, start);
        }
        return this.pushPairOrError('=', TokenType.EQ_EQ, startIndex, start);
      default:
        return this.pushError(
          `Unexpected character ${this.describe(char)} in expression`,
          startIndex,
          start
        );
    }
  }

  private scanIdentifier(startIndex: number, start: Position): void {
    while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
      this.advance();
    }

    const value = this.source.substring(startIndex, this.pos);
    this.push(this.identifierType(value), startIndex, start);
  }

  private scanNumber(startIndex: number, start: Position): void {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // consume .
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    this.push(TokenType.NUMBER, startIndex, start);
  }

  private scanString(quote: string, startIndex: number, start: Position): void {
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        if (this.isAtEnd()) break;
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      this.pushError(
        `Unterminated string literal (expected a closing ${quote})`,
        startIndex,
        start
      );
      return;
    }

    this.advance(); // consume closing quote
    this.push(TokenType.STRING, startIndex, start);
  }

  /**
   * `true`, `false` and `null` are literals only where a literal can appear.
   * Directly after a `.` or a `$` they are path segments, so a data field may be
   * named after one.
   */
  private identifierType(value: string): TokenType {
    const previous = this.tokens[this.tokens.length - 1]?.type;
    if (previous === TokenType.DOT || previous === TokenType.DOLLAR) {
      return TokenType.IDENTIFIER;
    }
    switch (value) {
      case 'true':
        return TokenType.TRUE;
      case 'false':
        return TokenType.FALSE;
      case 'null':
        return TokenType.NULL;
      default:
        return TokenType.IDENTIFIER;
    }
  }

  // Token construction -------------------------------------------------------

  private push(type: TokenType, startIndex: number, start: Position): void {
    this.tokens.push({
      type,
      value: this.source.substring(startIndex, this.pos),
      start,
      end: this.position(),
    });
  }

  private pushIfNext(
    next: string,
    whenPaired: TokenType,
    whenAlone: TokenType,
    startIndex: number,
    start: Position
  ): void {
    if (this.peek() === next) {
      this.advance();
      this.push(whenPaired, startIndex, start);
      return;
    }
    this.push(whenAlone, startIndex, start);
  }

  /**
   * Handles the characters that are only ever valid doubled (`&&`, `||`, `==`).
   * A single one is reserved, not silently ignored.
   */
  private pushPairOrError(
    char: string,
    paired: TokenType,
    startIndex: number,
    start: Position
  ): void {
    if (this.peek() === char) {
      this.advance();
      this.push(paired, startIndex, start);
      return;
    }
    const hint = SINGLE_CHAR_HINTS[char];
    this.pushError(
      `Unexpected character '${char}' in expression${hint ? ` - ${hint}` : ''}`,
      startIndex,
      start
    );
  }

  private pushError(
    message: string,
    startIndex: number,
    start: Position
  ): void {
    this.push(TokenType.ERROR, startIndex, start);
    this.errors.push({
      message,
      line: start.line,
      column: start.column,
      offset: start.offset,
    });
  }

  private describe(char: string): string {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return `'${char}'`;
  }

  // Cursor -------------------------------------------------------------------

  private position(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.base.offset + this.pos,
    };
  }

  private advance(): string {
    const char = this.source[this.pos] ?? '\0';
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.pos] ?? '\0';
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1] ?? '\0';
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  // Character classes --------------------------------------------------------

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\r' || char === '\n';
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    if (
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_'
    ) {
      return true;
    }
    return char > '\x7f' && UNICODE_IDENTIFIER_START.test(char);
  }

  private isIdentifierPart(char: string): boolean {
    if (this.isIdentifierStart(char) || this.isDigit(char)) return true;
    return char > '\x7f' && UNICODE_IDENTIFIER_PART.test(char);
  }
}
