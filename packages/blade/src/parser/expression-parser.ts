/**
 * Expression parser for Blade templates
 *
 * Implements a Pratt parser (operator precedence parser) for parsing expressions.
 */

import type { ExprAst } from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { Token, TokenType, Tokenizer } from './tokenizer.js';
import type { ParseError } from './index.js';

// Operator precedence levels (higher = binds tighter)
enum Precedence {
  NONE = 0,
  NULLISH = 1, // ??
  OR = 2, // ||
  AND = 3, // &&
  EQUALITY = 4, // == !=
  COMPARISON = 5, // < > <= >=
  TERM = 6, // + -
  FACTOR = 7, // * / %
  UNARY = 8, // ! -
  CALL = 9, // ()
  PRIMARY = 10,
}

type PrefixParseFn = () => ExprAst;
type InfixParseFn = (left: ExprAst) => ExprAst;

export class ExpressionParser {
  private tokens: Token[];
  private current = 0;
  private errors: ParseError[] = [];
  private recursionDepth = 0;
  private readonly MAX_RECURSION_DEPTH = 15;

  constructor(source: string) {
    const tokenizer = new Tokenizer(source);
    this.tokens = tokenizer.tokenize();
  }

  parse(): { value: ExprAst | null; errors: ParseError[] } {
    try {
      const expr = this.parseExpression(Precedence.NONE);
      return { value: expr, errors: this.errors };
    } catch (error) {
      return {
        value: null,
        errors: [
          ...this.errors,
          {
            message: error instanceof Error ? error.message : 'Unknown error',
            line: this.peek().line,
            column: this.peek().column,
            offset: this.peek().offset,
          },
        ],
      };
    }
  }

  private parseExpression(precedence: Precedence): ExprAst {
    this.recursionDepth++;
    if (this.recursionDepth > this.MAX_RECURSION_DEPTH) {
      const token = this.peek();
      throw new Error(
        `Expression parser exceeded maximum recursion depth (${this.MAX_RECURSION_DEPTH}).\n` +
        `Current token: ${token.type} at line ${token.line}, column ${token.column}`
      );
    }

    try {
      // Get prefix parser
      const prefixFn = this.getPrefixParser(this.peek().type);
      if (!prefixFn) {
        throw new Error(`Unexpected token: ${this.peek().type}`);
      }

      let left = prefixFn.call(this);

      // Parse infix operators based on precedence
      let iterations = 0;
      const maxIterations = 1000;
      while (precedence < this.getPrecedence(this.peek().type)) {
        if (++iterations > maxIterations) {
          throw new Error('Infinite loop detected in parseExpression');
        }
        const prevCurrent = this.current;
        const infixFn = this.getInfixParser(this.peek().type);
        if (!infixFn) break;
        left = infixFn.call(this, left);
        if (this.current === prevCurrent) {
          throw new Error(`Infix parser did not advance position for token: ${this.peek().type}`);
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
    return ast.literal(value, 'number', this.getLocation(token));
  }

  private parseString(): ExprAst {
    const token = this.advance();
    // Remove quotes and handle escape sequences
    const value = token.value.slice(1, -1).replace(/\\(.)/g, '$1');
    return ast.literal(value, 'string', this.getLocation(token));
  }

  private parseTrue(): ExprAst {
    const token = this.advance();
    return ast.literal(true, 'boolean', this.getLocation(token));
  }

  private parseFalse(): ExprAst {
    const token = this.advance();
    return ast.literal(false, 'boolean', this.getLocation(token));
  }

  private parseNull(): ExprAst {
    const token = this.advance();
    return ast.literal(null, 'nil', this.getLocation(token));
  }

  private parseIdentifier(): ExprAst {
    const start = this.peek();
    const name = this.advance().value;

    // Check if it's a function call
    if (this.match(TokenType.LPAREN)) {
      return this.parseFunctionCall(name, start);
    }

    // Otherwise it's a simple path (variable reference)
    return ast.exprPath([ast.pathKey(name, this.getLocation(start))], false, this.getLocation(start));
  }

  private parsePath(): ExprAst {
    const start = this.peek();
    this.consume(TokenType.DOLLAR, 'Expected $');

    // Check for global path $.foo
    const isGlobal = this.match(TokenType.DOT);

    if (isGlobal && this.peek().type === TokenType.IDENTIFIER) {
      // Global path: $.foo
      const segments = [this.parsePathSegment()];
      while (this.match(TokenType.DOT) || this.match(TokenType.LBRACKET)) {
        if (this.previous().type === TokenType.DOT) {
          segments.push(this.parsePathSegment());
        } else {
          segments.push(this.parseIndexOrWildcard());
          this.consume(TokenType.RBRACKET, 'Expected ]');
        }
      }
      return ast.exprPath(segments, true, this.getLocation(start));
    }

    // Regular path: $foo or $foo.bar or $foo[0]
    if (this.peek().type === TokenType.IDENTIFIER) {
      const segments = [this.parsePathSegment()];
      while (this.match(TokenType.DOT) || this.match(TokenType.LBRACKET)) {
        if (this.previous().type === TokenType.DOT) {
          segments.push(this.parsePathSegment());
        } else {
          segments.push(this.parseIndexOrWildcard());
          this.consume(TokenType.RBRACKET, 'Expected ]');
        }
      }
      return ast.exprPath(segments, false, this.getLocation(start));
    }

    throw new Error('Expected identifier after $');
  }

  private parsePathSegment() {
    const token = this.consume(TokenType.IDENTIFIER, 'Expected identifier');
    return ast.pathKey(token.value, this.getLocation(token));
  }

  private parseIndexOrWildcard() {
    const start = this.peek();

    if (this.match(TokenType.STAR)) {
      return ast.pathStar(this.getLocation(start));
    }

    if (this.peek().type === TokenType.NUMBER) {
      const token = this.advance();
      const index = parseInt(token.value, 10);
      return ast.pathIndex(index, this.getLocation(token));
    }

    throw new Error('Expected number or * in array index');
  }

  private parseGrouping(): ExprAst {
    this.consume(TokenType.LPAREN, 'Expected (');

    // Check for arrow function: (a, b) => expr
    if (this.isArrowFunction()) {
      return this.parseArrowFunction();
    }

    const expr = this.parseExpression(Precedence.NONE);
    this.consume(TokenType.RPAREN, 'Expected )');
    return expr;
  }

  private isArrowFunction(): boolean {
    // Look ahead to see if this is an arrow function
    let i = this.current;

    // Skip parameters
    while (i < this.tokens.length && this.tokens[i].type !== TokenType.RPAREN) {
      if (this.tokens[i].type === TokenType.EOF) return false;
      i++;
    }

    if (i >= this.tokens.length) return false;
    i++; // skip )

    return this.tokens[i]?.type === TokenType.ARROW;
  }

  private parseArrowFunction(): ExprAst {
    const start = this.previous();
    const params: string[] = [];

    // Parse parameters
    if (!this.check(TokenType.RPAREN)) {
      do {
        const param = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
        params.push(param.value);
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');
    this.consume(TokenType.ARROW, 'Expected =>');

    const body = this.parseExpression(Precedence.NONE);

    return ast.functionExpr(params, body, this.getLocation(start));
  }

  private parseUnary(): ExprAst {
    const start = this.peek();
    const operator = this.advance();
    const operand = this.parseExpression(Precedence.UNARY);

    return ast.unary(operator.value as '!' | '-', operand, this.getLocation(start));
  }

  private parseUnderscore(): ExprAst {
    const token = this.advance();
    // _ is a special identifier in match expressions
    return ast.exprPath([ast.pathKey('_', this.getLocation(token))], false, this.getLocation(token));
  }

  // Infix parsers (operators that combine expressions)

  private parseBinary(left: ExprAst): ExprAst {
    // Token already consumed by getInfixParser()
    const operator = this.previous().value;
    const precedence = this.getPrecedence(this.previous().type);
    const right = this.parseExpression(precedence);

    return ast.binary(
      operator as any,
      left,
      right,
      this.getLocation(this.previous())
    );
  }

  private parseTernary(left: ExprAst): ExprAst {
    const questionToken = this.advance(); // Consume the ? token
    const truthy = this.parseExpression(Precedence.NONE);
    this.consume(TokenType.COLON, 'Expected :');
    const falsy = this.parseExpression(Precedence.NONE);

    return ast.ternary(left, truthy, falsy, this.getLocation(questionToken));
  }

  private parseCall(left: ExprAst): ExprAst {
    const start = this.previous();

    // left should be a path node with a single identifier
    if (left.kind !== 'path' || left.segments.length !== 1) {
      throw new Error('Invalid function call');
    }

    const segment = left.segments[0];
    if (segment.kind !== 'key') {
      throw new Error('Invalid function name');
    }

    const callee = segment.key;
    const args: ExprAst[] = [];

    this.consume(TokenType.LPAREN, 'Expected (');

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression(Precedence.NONE));
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return ast.call(callee, args, this.getLocation(start));
  }

  private parseFunctionCall(name: string, start: Token): ExprAst {
    const args: ExprAst[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression(Precedence.NONE));
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, 'Expected )');

    return ast.call(name, args, this.getLocation(start));
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
      case TokenType.UNDERSCORE:
        return this.parseUnderscore;
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
      default:
        return null;
    }
  }

  private getPrecedence(type: TokenType): Precedence {
    switch (type) {
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
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
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
    throw new Error(`${message} at line ${this.peek().line}`);
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private getLocation(token: Token) {
    return ast.location(
      { line: token.line, column: token.column, offset: token.offset },
      { line: token.line, column: token.column + token.value.length, offset: token.offset + token.value.length }
    );
  }
}
