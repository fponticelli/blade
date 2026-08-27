/**
 * Expression parser for Blade templates
 *
 * Implements a Pratt parser (operator precedence parser) for parsing expressions.
 *
 * The parser is TOTAL: {@link ExpressionParser.parse} never throws, whatever the
 * input. Lexical failures arrive as {@link TokenType.ERROR} tokens with errors
 * attached, and syntax failures unwind through a private exception that `parse()`
 * converts into a {@link ParseError}.
 *
 * Every location it reports is an ABSOLUTE position in the document the
 * expression was sliced out of, provided the caller passes the `basePosition`
 * that slice came from. Node locations are spans: a node's range covers its own
 * source text from its first character to its last, so
 * `source.slice(node.location.start.offset, node.location.end.offset)` is that
 * node's source.
 */

import type {
  ExprAst,
  PathItem,
  BinaryOperator,
  SourceLocation,
} from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { Token, TokenType, Tokenizer } from './tokenizer.js';
import type { Position } from './position.js';
import { START_POSITION } from './position.js';
import { decodeStringEscapes } from './string-escapes.js';
import type { ParseError } from './index.js';

// Operator precedence levels (higher = binds tighter)
enum Precedence {
  NONE = 0,
  TERNARY = 1, // ? :
  NULLISH = 2, // ??
  OR = 3, // ||
  AND = 4, // &&
  EQUALITY = 5, // == !=
  COMPARISON = 6, // < > <= >=
  TERM = 7, // + -
  FACTOR = 8, // * / %
  UNARY = 9, // ! -
  CALL = 10, // ()
  PRIMARY = 11,
}

type PrefixParseFn = () => ExprAst;
type InfixParseFn = (left: ExprAst) => ExprAst;

/**
 * Nesting limit for the recursive descent itself - a guard against a stack
 * overflow on pathological input such as `((((((...))))))`.
 *
 * It bounds NESTING, never the length of an operator chain: `1 + 1 + ... + 1`
 * with a thousand terms is a flat loop and is not affected.
 */
const DEFAULT_MAX_EXPRESSION_DEPTH = 64;

export interface ExpressionParserOptions {
  /** Maximum nesting depth of the recursive descent. Defaults to 64. */
  maxExpressionDepth?: number;
  /**
   * Absolute position of `source[0]` in the enclosing document.
   *
   * Callers that slice an expression out of a template MUST pass the position
   * they sliced from; every reported location is rebased onto it. Defaults to
   * the start of a standalone source.
   */
  basePosition?: Position;
}

/**
 * Internal control-flow signal for an unrecoverable syntax error.
 *
 * It never escapes {@link ExpressionParser.parse}, which turns it into a
 * {@link ParseError}.
 */
class ExpressionSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: Position
  ) {
    super(message);
    this.name = 'ExpressionSyntaxError';
  }
}

export class ExpressionParser {
  private readonly source: string;
  private readonly base: Position;
  private readonly maxExpressionDepth: number;

  private tokens: Token[] = [];
  private current = 0;
  private errors: ParseError[] = [];
  private recursionDepth = 0;

  constructor(source: string, options?: ExpressionParserOptions) {
    this.source = source;
    this.base = options?.basePosition ?? START_POSITION;
    this.maxExpressionDepth =
      options?.maxExpressionDepth ?? DEFAULT_MAX_EXPRESSION_DEPTH;
  }

  /**
   * Parses the source. Never throws, and may be called more than once.
   *
   * @returns the expression, or `null` when it could not be parsed, together
   *   with every lexical and syntax error found
   */
  parse(): { value: ExprAst | null; errors: ParseError[] } {
    const { tokens, errors } = new Tokenizer(this.source, this.base).tokenize();
    this.tokens = tokens;
    this.errors = [...errors];
    this.current = 0;
    this.recursionDepth = 0;

    try {
      const expr = this.parseExpression(Precedence.NONE);

      // Check for unconsumed tokens (excluding EOF)
      if (!this.isAtEnd()) {
        const token = this.peek();
        this.errors.push({
          message: `Unexpected token in expression: ${token.type}`,
          line: token.start.line,
          column: token.start.column,
          offset: token.start.offset,
        });
      }

      return { value: expr, errors: this.errors };
    } catch (error) {
      const position =
        error instanceof ExpressionSyntaxError
          ? error.position
          : this.peek().start;
      this.errors.push({
        message: error instanceof Error ? error.message : 'Unknown error',
        line: position.line,
        column: position.column,
        offset: position.offset,
      });
      return { value: null, errors: this.errors };
    }
  }

  private parseExpression(precedence: Precedence): ExprAst {
    this.recursionDepth++;
    if (this.recursionDepth > this.maxExpressionDepth) {
      throw new ExpressionSyntaxError(
        `Expression exceeds the maximum nesting depth (${this.maxExpressionDepth})`,
        this.peek().start
      );
    }

    try {
      // Get prefix parser
      const prefixFn = this.getPrefixParser(this.peek().type);
      if (!prefixFn) {
        throw this.syntaxError(`Unexpected token: ${this.peek().type}`);
      }

      let left = prefixFn.call(this);

      // Parse infix operators. The loop is bounded by the input: every
      // iteration must consume at least one token, which is asserted below.
      while (precedence < this.getPrecedence(this.peek().type)) {
        const prevCurrent = this.current;
        const infixFn = this.getInfixParser(this.peek().type);
        if (!infixFn) break;
        left = infixFn.call(this, left);
        if (this.current === prevCurrent) {
          throw this.syntaxError(
            `Infix parser did not advance position for token: ${this.peek().type}`
          );
        }
      }

      return left;
    } finally {
      this.recursionDepth--;
    }
  }

  // Prefix parsers (tokens that start an expression)

  private parseNumber(): ExprAst {
    const token = this.advance();
    const value = parseFloat(token.value);
    return ast.expr.literal(value, this.tokenLocation(token), 'number');
  }

  private parseString(): ExprAst {
    const token = this.advance();
    return ast.expr.literal(
      this.decodeString(token),
      this.tokenLocation(token),
      'string'
    );
  }

  private parseTrue(): ExprAst {
    const token = this.advance();
    return ast.expr.literal(true, this.tokenLocation(token), 'boolean');
  }

  private parseFalse(): ExprAst {
    const token = this.advance();
    return ast.expr.literal(false, this.tokenLocation(token), 'boolean');
  }

  private parseNull(): ExprAst {
    const token = this.advance();
    return ast.expr.literal(null, this.tokenLocation(token), 'nil');
  }

  private parseIdentifier(): ExprAst {
    const start = this.peek();
    const name = this.advance().value;

    // Check if it's a function call
    if (this.match(TokenType.LPAREN)) {
      return this.parseFunctionCall(name, start);
    }

    // Check if it's a path with array access or property access
    const segments: PathItem[] = [ast.path.key(name)];
    const hasWildcard = this.parsePathTail(segments);

    return this.finishPath(segments, false, start, hasWildcard);
  }

  private parsePath(): ExprAst {
    const start = this.peek();
    this.consume(TokenType.DOLLAR, 'Expected $');

    // Check for global path $.foo
    const isGlobal = this.match(TokenType.DOT);

    if (this.peek().type === TokenType.IDENTIFIER) {
      // Global path `$.foo` or regular path `$foo`, `$foo.bar`, `$foo[0]`
      const segments: PathItem[] = [this.parsePathSegment()];
      const hasWildcard = this.parsePathTail(segments);
      return this.finishPath(segments, isGlobal, start, hasWildcard);
    }

    throw this.syntaxError('Expected identifier after $');
  }

  /**
   * Parses the `.key`, `[0]`, `[*]` and `["key"]` steps that follow a path root.
   *
   * @returns whether any step was a wildcard
   */
  private parsePathTail(segments: PathItem[]): boolean {
    let hasWildcard = false;
    while (this.match(TokenType.DOT) || this.match(TokenType.LBRACKET)) {
      if (this.previous().type === TokenType.DOT) {
        segments.push(this.parsePathSegment());
      } else {
        const segment = this.parseIndexOrWildcard();
        if (segment.kind === 'star') hasWildcard = true;
        segments.push(segment);
        this.consume(TokenType.RBRACKET, 'Expected ]');
      }
    }
    return hasWildcard;
  }

  private finishPath(
    segments: PathItem[],
    isGlobal: boolean,
    start: Token,
    hasWildcard: boolean
  ): ExprAst {
    const location = this.spanFrom(start);
    const pathNode = ast.expr.pathNode(segments, location, isGlobal);
    if (hasWildcard) {
      return ast.expr.wildcard(pathNode, location);
    }
    return pathNode;
  }

  private parsePathSegment(): PathItem {
    const token = this.consume(TokenType.IDENTIFIER, 'Expected identifier');
    return ast.path.key(token.value);
  }

  /**
   * Parses a bracket subscript: `[0]`, `[*]` or `["any key"]`.
   *
   * The string form is the escape hatch for keys that are not identifiers -
   * spaces, dashes, punctuation, anything a JSON payload may contain.
   */
  private parseIndexOrWildcard(): PathItem {
    if (this.match(TokenType.STAR)) {
      return ast.path.star();
    }

    if (this.peek().type === TokenType.NUMBER) {
      const token = this.advance();
      return ast.path.index(parseInt(token.value, 10));
    }

    if (this.peek().type === TokenType.STRING) {
      const token = this.advance();
      return ast.path.key(this.decodeString(token));
    }

    throw this.syntaxError('Expected a number, a string key or * in []');
  }

  private parseGrouping(): ExprAst {
    const start = this.peek();
    this.consume(TokenType.LPAREN, 'Expected (');

    // Check for arrow function: (a, b) => expr
    if (this.isArrowFunction()) {
      return this.parseArrowFunction();
    }

    const expr = this.parseExpression(Precedence.NONE);
    this.consume(TokenType.RPAREN, 'Expected )');
    // The parenthesised expression's source range includes the parentheses.
    return withLocation(expr, this.spanFrom(start));
  }

  private isArrowFunction(): boolean {
    // Look ahead to see if this is an arrow function
    let i = this.current;

    // Skip parameters
    while (i < this.tokens.length) {
      const token = this.tokens[i];
      if (!token || token.type === TokenType.EOF) return false;
      if (token.type === TokenType.RPAREN) break;
      i++;
    }

    if (i >= this.tokens.length) return false;
    i++; // skip )

    const nextToken = this.tokens[i];
    return nextToken?.type === TokenType.ARROW;
  }

  private parseArrowFunction(): ExprAst {
    const start = this.previous();
    const params: string[] = [];

    // Parse parameters
    if (!this.check(TokenType.RPAREN)) {
      do {
        const param = this.consume(
          TokenType.IDENTIFIER,
          'Expected parameter name'
        );
        params.push(param.value);
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');
    this.consume(TokenType.ARROW, 'Expected =>');

    const body = this.parseExpression(Precedence.NONE);

    return ast.expr.fn(
      params,
      body,
      span(this.tokenLocation(start), body.location)
    );
  }

  private parseUnary(): ExprAst {
    const operator = this.advance();
    const operand = this.parseExpression(Precedence.UNARY);

    return ast.expr.unary(
      operator.value as '!' | '-',
      operand,
      span(this.tokenLocation(operator), operand.location)
    );
  }

  private parseArray(): ExprAst {
    const start = this.peek();
    this.consume(TokenType.LBRACKET, 'Expected [');

    const elements: ExprAst[] = [];

    // Handle empty array []
    if (!this.check(TokenType.RBRACKET)) {
      do {
        elements.push(this.parseExpression(Precedence.NONE));
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RBRACKET, 'Expected ]');

    return ast.expr.array(elements, this.spanFrom(start));
  }

  // Infix parsers (operators that combine expressions)

  private parseBinary(left: ExprAst): ExprAst {
    // Operator token already consumed by getInfixParser()
    const operator = this.previous();
    const right = this.parseExpression(this.getPrecedence(operator.type));

    return ast.expr.binary(
      operator.value as BinaryOperator,
      left,
      right,
      span(left.location, right.location)
    );
  }

  private parseTernary(left: ExprAst): ExprAst {
    this.advance(); // Consume the ? token
    const truthy = this.parseExpression(Precedence.NONE);
    this.consume(TokenType.COLON, 'Expected :');
    const falsy = this.parseExpression(Precedence.NONE);

    return ast.expr.ternary(
      left,
      truthy,
      falsy,
      span(left.location, falsy.location)
    );
  }

  private parseFunctionCall(name: string, start: Token): ExprAst {
    const args: ExprAst[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression(Precedence.NONE));
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return ast.expr.call(name, args, this.spanFrom(start));
  }

  /**
   * Parse member access as an infix operation: expr[index], expr[*], expr.property
   * This handles cases like foo()[0], foo()[*].bar, (a || b).length
   */
  private parseMemberAccess(left: ExprAst): ExprAst {
    const segments: PathItem[] = [];
    let hasWildcard = false;

    // Parse all consecutive member accesses
    while (this.check(TokenType.LBRACKET) || this.check(TokenType.DOT)) {
      if (this.match(TokenType.LBRACKET)) {
        const seg = this.parseIndexOrWildcard();
        if (seg.kind === 'star') hasWildcard = true;
        segments.push(seg);
        this.consume(TokenType.RBRACKET, 'Expected ]');
      } else if (this.match(TokenType.DOT)) {
        segments.push(this.parsePathSegment());
      }
    }

    if (segments.length === 0) {
      return left;
    }

    return ast.expr.member(
      left,
      segments,
      hasWildcard,
      span(left.location, this.tokenLocation(this.previous()))
    );
  }

  // Parser rule tables

  private getPrefixParser(type: TokenType): PrefixParseFn | null {
    switch (type) {
      case TokenType.NUMBER:
        return this.parseNumber;
      case TokenType.STRING:
        return this.parseString;
      case TokenType.TRUE:
        return this.parseTrue;
      case TokenType.FALSE:
        return this.parseFalse;
      case TokenType.NULL:
        return this.parseNull;
      case TokenType.IDENTIFIER:
        return this.parseIdentifier;
      case TokenType.DOLLAR:
        return this.parsePath;
      case TokenType.LPAREN:
        return this.parseGrouping;
      case TokenType.BANG:
      case TokenType.MINUS:
        return this.parseUnary;
      case TokenType.LBRACKET:
        return this.parseArray;
      default:
        return null;
    }
  }

  private getInfixParser(type: TokenType): InfixParseFn | null {
    switch (type) {
      case TokenType.PLUS:
      case TokenType.MINUS:
      case TokenType.STAR:
      case TokenType.SLASH:
      case TokenType.PERCENT:
      case TokenType.EQ_EQ:
      case TokenType.BANG_EQ:
      case TokenType.LT:
      case TokenType.GT:
      case TokenType.LT_EQ:
      case TokenType.GT_EQ:
      case TokenType.AMP_AMP:
      case TokenType.PIPE_PIPE:
      case TokenType.QUESTION_QUESTION:
        this.advance();
        return this.parseBinary;
      case TokenType.QUESTION:
        return this.parseTernary;
      case TokenType.LBRACKET:
      case TokenType.DOT:
        // Member access: expr[index], expr[*], expr.property
        return this.parseMemberAccess;
      default:
        return null;
    }
  }

  private getPrecedence(type: TokenType): Precedence {
    switch (type) {
      case TokenType.QUESTION:
        return Precedence.TERNARY;
      case TokenType.QUESTION_QUESTION:
        return Precedence.NULLISH;
      case TokenType.PIPE_PIPE:
        return Precedence.OR;
      case TokenType.AMP_AMP:
        return Precedence.AND;
      case TokenType.EQ_EQ:
      case TokenType.BANG_EQ:
        return Precedence.EQUALITY;
      case TokenType.LT:
      case TokenType.GT:
      case TokenType.LT_EQ:
      case TokenType.GT_EQ:
        return Precedence.COMPARISON;
      case TokenType.PLUS:
      case TokenType.MINUS:
        return Precedence.TERM;
      case TokenType.STAR:
      case TokenType.SLASH:
      case TokenType.PERCENT:
        return Precedence.FACTOR;
      case TokenType.LPAREN:
        return Precedence.CALL;
      case TokenType.LBRACKET:
      case TokenType.DOT:
        // Member access has same precedence as function calls
        return Precedence.CALL;
      default:
        return Precedence.NONE;
    }
  }

  // Token management helpers

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.current] ?? this.endToken();
  }

  private previous(): Token {
    return this.tokens[this.current - 1] ?? this.peek();
  }

  private endToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    if (last) return last;
    const position: Position = this.base;
    return {
      type: TokenType.EOF,
      value: '',
      start: position,
      end: position,
    };
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.syntaxError(message);
  }

  private isAtEnd(): boolean {
    const token = this.tokens[this.current];
    return !token || token.type === TokenType.EOF;
  }

  private syntaxError(message: string): ExpressionSyntaxError {
    const token = this.peek();
    return new ExpressionSyntaxError(
      `${message} at line ${token.start.line}, column ${token.start.column}`,
      token.start
    );
  }

  // Locations

  /** The absolute source range of a single token. */
  private tokenLocation(token: Token): SourceLocation {
    return ast.location(token.start, token.end);
  }

  /** The absolute source range from `start` to the last consumed token. */
  private spanFrom(start: Token): SourceLocation {
    return ast.location(start.start, this.previous().end);
  }

  /** Decodes a STRING token's body, recording any bad escape as an error. */
  private decodeString(token: Token): string {
    const body = token.value.slice(1, -1);
    const bodyStart: Position = {
      line: token.start.line,
      column: token.start.column + 1,
      offset: token.start.offset + 1,
    };
    const { value, errors } = decodeStringEscapes(body, bodyStart);
    this.errors.push(...errors);
    return value;
  }
}

/** A source range covering everything from `start`'s start to `end`'s end. */
function span(start: SourceLocation, end: SourceLocation): SourceLocation {
  return ast.location(start.start, end.end);
}

/** Returns `node` with a different source range. */
function withLocation<T extends { location: SourceLocation }>(
  node: T,
  location: SourceLocation
): T {
  return { ...node, location };
}
