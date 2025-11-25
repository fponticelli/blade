/**
 * Tokenizer for Blade templates
 *
 * Breaks template source code into tokens for parsing.
 */

export enum TokenType {
  // Literals
  TEXT = 'TEXT',
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
  UNDERSCORE = 'UNDERSCORE', // _

  // Special
  AT = 'AT', // @
  HASH = 'HASH', // #
  EXPR_START = 'EXPR_START', // ${
  EXPR_END = 'EXPR_END', // }

  // HTML
  TAG_OPEN = 'TAG_OPEN', // <
  TAG_CLOSE = 'TAG_CLOSE', // >
  TAG_SELF_CLOSE = 'TAG_SELF_CLOSE', // />
  TAG_END_OPEN = 'TAG_END_OPEN', // </
  EQUALS = 'EQUALS', // =

  // Keywords
  IF = 'IF',
  ELSE = 'ELSE',
  FOR = 'FOR',
  OF = 'OF',
  MATCH = 'MATCH',
  WHEN = 'WHEN',
  LET = 'LET',
  COMPONENT = 'COMPONENT',
  SLOT = 'SLOT',

  // Control
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export class Tokenizer {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.tokens.push(this.makeToken(TokenType.EOF, ''));
    return this.tokens;
  }

  private scanToken(): void {
    const start = this.pos;
    const char = this.advance();

    // Handle whitespace
    if (this.isWhitespace(char)) {
      if (char === '\n') {
        this.tokens.push(
          this.makeToken(TokenType.NEWLINE, char, start, this.line - 1)
        );
      }
      // Other whitespace is skipped
      return;
    }

    // Handle expression start ${
    if (char === '$' && this.peek() === '{') {
      this.advance(); // consume {
      this.tokens.push(this.makeToken(TokenType.EXPR_START, '${', start));
      return;
    }

    // Handle dollar sign for simple expressions
    if (char === '$') {
      this.tokens.push(this.makeToken(TokenType.DOLLAR, char, start));
      return;
    }

    // Handle @ directives
    if (char === '@') {
      this.tokens.push(this.makeToken(TokenType.AT, char, start));
      return;
    }

    // Handle identifiers and keywords
    if (this.isAlpha(char)) {
      this.scanIdentifier(start);
      return;
    }

    // Handle numbers
    if (this.isDigit(char)) {
      this.scanNumber(start);
      return;
    }

    // Handle strings
    if (char === '"' || char === "'") {
      this.scanString(char, start);
      return;
    }

    // Handle operators and delimiters
    switch (char) {
      case '(':
        this.tokens.push(this.makeToken(TokenType.LPAREN, char, start));
        break;
      case ')':
        this.tokens.push(this.makeToken(TokenType.RPAREN, char, start));
        break;
      case '{':
        this.tokens.push(this.makeToken(TokenType.LBRACE, char, start));
        break;
      case '}':
        this.tokens.push(this.makeToken(TokenType.RBRACE, char, start));
        break;
      case '[':
        this.tokens.push(this.makeToken(TokenType.LBRACKET, char, start));
        break;
      case ']':
        this.tokens.push(this.makeToken(TokenType.RBRACKET, char, start));
        break;
      case '.':
        this.tokens.push(this.makeToken(TokenType.DOT, char, start));
        break;
      case ',':
        this.tokens.push(this.makeToken(TokenType.COMMA, char, start));
        break;
      case ':':
        this.tokens.push(this.makeToken(TokenType.COLON, char, start));
        break;
      case '#':
        this.tokens.push(this.makeToken(TokenType.HASH, char, start));
        break;
      case '_':
        this.tokens.push(this.makeToken(TokenType.UNDERSCORE, char, start));
        break;
      case '+':
        this.tokens.push(this.makeToken(TokenType.PLUS, char, start));
        break;
      case '-':
        this.tokens.push(this.makeToken(TokenType.MINUS, char, start));
        break;
      case '*':
        this.tokens.push(this.makeToken(TokenType.STAR, char, start));
        break;
      case '/':
        // Check for self-closing tag />
        if (this.peek() === '>') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.TAG_SELF_CLOSE, '/>', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.SLASH, char, start));
        }
        break;
      case '%':
        this.tokens.push(this.makeToken(TokenType.PERCENT, char, start));
        break;
      case '!':
        if (this.peek() === '=') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.BANG_EQ, '!=', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.BANG, char, start));
        }
        break;
      case '=':
        if (this.peek() === '=') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.EQ_EQ, '==', start));
        } else if (this.peek() === '>') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.ARROW, '=>', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.EQUALS, char, start));
        }
        break;
      case '<':
        if (this.peek() === '=') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.LT_EQ, '<=', start));
        } else if (this.peek() === '/') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.TAG_END_OPEN, '</', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.TAG_OPEN, char, start));
        }
        break;
      case '>':
        if (this.peek() === '=') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.GT_EQ, '>=', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.TAG_CLOSE, char, start));
        }
        break;
      case '&':
        if (this.peek() === '&') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.AMP_AMP, '&&', start));
        }
        break;
      case '|':
        if (this.peek() === '|') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.PIPE_PIPE, '||', start));
        }
        break;
      case '?':
        if (this.peek() === '?') {
          this.advance();
          this.tokens.push(this.makeToken(TokenType.QUESTION_QUESTION, '??', start));
        } else {
          this.tokens.push(this.makeToken(TokenType.QUESTION, char, start));
        }
        break;
      default:
        // Unknown character, skip it
        break;
    }
  }

  private scanIdentifier(start: number): void {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const value = this.source.substring(start, this.pos);
    const type = this.getKeywordType(value);
    this.tokens.push(this.makeToken(type, value, start));
  }

  private scanNumber(start: number): void {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Handle decimal numbers
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // consume .
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.substring(start, this.pos);
    this.tokens.push(this.makeToken(TokenType.NUMBER, value, start));
  }

  private scanString(quote: string, start: number): void {
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        this.advance(); // consume escaped character
      } else {
        this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new Error('Unterminated string');
    }

    this.advance(); // consume closing quote

    const value = this.source.substring(start, this.pos);
    this.tokens.push(this.makeToken(TokenType.STRING, value, start));
  }

  private getKeywordType(value: string): TokenType {
    switch (value) {
      case 'true':
        return TokenType.TRUE;
      case 'false':
        return TokenType.FALSE;
      case 'null':
        return TokenType.NULL;
      case 'if':
        return TokenType.IF;
      case 'else':
        return TokenType.ELSE;
      case 'for':
        return TokenType.FOR;
      case 'of':
        return TokenType.OF;
      case 'match':
        return TokenType.MATCH;
      case 'when':
        return TokenType.WHEN;
      case 'let':
        return TokenType.LET;
      default:
        return TokenType.IDENTIFIER;
    }
  }

  private makeToken(
    type: TokenType,
    value: string,
    offset = this.pos - value.length,
    line = this.line,
    column = this.column - value.length
  ): Token {
    return {
      type,
      value,
      line,
      column,
      offset,
    };
  }

  private advance(): string {
    const char = this.source[this.pos++];
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
    return this.source[this.pos];
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1];
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\r' || char === '\n';
  }

  private isAlpha(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_'
    );
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
