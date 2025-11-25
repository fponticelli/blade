/**
 * Template parser for Blade templates
 *
 * Parses HTML structure, text content, and Blade expressions into an AST.
 */

import type { TemplateNode, TextSegment } from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { ExpressionParser } from './expression-parser.js';
import type { ParseError } from './index.js';

export class TemplateParser {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;
  private errors: ParseError[] = [];

  constructor(source: string) {
    this.source = source;
  }

  parse(): { nodes: TemplateNode[]; errors: ParseError[] } {
    const nodes: TemplateNode[] = [];

    while (!this.isAtEnd()) {
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      }
    }

    return { nodes, errors: this.errors };
  }

  private parseNode(): TemplateNode | null {
    // Skip whitespace at the beginning
    this.skipWhitespace();

    if (this.isAtEnd()) return null;

    // Check for HTML tags
    if (this.peek() === '<') {
      // Check if it's a closing tag (we'll handle this in parseElement)
      if (this.peekNext() === '/') {
        return null; // Closing tag, handled by parent
      }
      return this.parseElement();
    }

    // Check for @ directives
    if (this.peek() === '@') {
      return this.parseDirective();
    }

    // Otherwise, parse text (which may contain expressions)
    return this.parseText();
  }

  private parseElement(): TemplateNode {
    const startLoc = this.getLocation();

    this.consume('<');
    const tagName = this.parseIdentifier();

    // Parse attributes
    const attributes: any[] = []; // TODO: Parse attributes properly
    this.skipWhitespace();

    // Check for self-closing tag
    const selfClosing = this.peek() === '/' && this.peekNext() === '>';
    if (selfClosing) {
      this.advance(); // /
      this.advance(); // >
      return ast.element.node({
        tag: tagName,
        attributes,
        children: [],
        selfClosing: true,
        location: this.getLocationFrom(startLoc),
      });
    }

    this.consume('>');

    // Parse children
    const children: TemplateNode[] = [];
    while (!this.isAtEnd()) {
      // Check for closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        break;
      }

      const child = this.parseNode();
      if (child) {
        children.push(child);
      }
    }

    // Parse closing tag
    if (this.peek() === '<' && this.peekNext() === '/') {
      this.advance(); // <
      this.advance(); // /
      const closingTag = this.parseIdentifier();
      if (closingTag !== tagName) {
        this.errors.push({
          message: `Mismatched closing tag: expected </${tagName}>, got </${closingTag}>`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
      }
      this.consume('>');
    }

    return ast.element.node({
      tag: tagName,
      attributes,
      children,
      selfClosing: false,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseText(): TemplateNode {
    const startLoc = this.getLocation();
    const segments: TextSegment[] = [];
    let textBuffer = '';

    while (!this.isAtEnd()) {
      // Check for end of text node
      if (this.peek() === '<' || this.peek() === '@') {
        break;
      }

      // Check for simple expression $identifier
      if (this.peek() === '$' && this.peekNext() !== '{') {
        // Save any accumulated text
        if (textBuffer) {
          segments.push(ast.text.literalSegment(textBuffer, this.getLocationFrom(startLoc)));
          textBuffer = '';
        }

        // Parse simple expression
        const exprStart = this.pos;
        this.advance(); // consume $

        // Check for global $.foo
        if (this.peek() === '.') {
          this.pos = exprStart; // Reset to parse full expression
          const exprSource = this.parseSimpleExpression();
          const exprParser = new ExpressionParser(exprSource);
          const result = exprParser.parse();

          if (result.value) {
            segments.push(ast.text.exprSegment(result.value, this.getLocationFrom(startLoc)));
          }
        } else if (this.isAlpha(this.peek())) {
          // Simple path like $foo or $foo.bar
          this.pos = exprStart; // Reset to parse full expression
          const exprSource = this.parseSimpleExpression();
          const exprParser = new ExpressionParser(exprSource);
          const result = exprParser.parse();

          if (result.value) {
            segments.push(ast.text.exprSegment(result.value, this.getLocationFrom(startLoc)));
          }
        } else {
          // Invalid expression, treat $ as literal
          textBuffer += '$';
        }
        continue;
      }

      // Check for complex expression ${...}
      if (this.peek() === '$' && this.peekNext() === '{') {
        // Save any accumulated text
        if (textBuffer) {
          segments.push(ast.text.literalSegment(textBuffer, this.getLocationFrom(startLoc)));
          textBuffer = '';
        }

        this.advance(); // $
        this.advance(); // {

        // Find matching }
        const exprStart = this.pos;
        let braceCount = 1;
        while (!this.isAtEnd() && braceCount > 0) {
          if (this.peek() === '{') braceCount++;
          if (this.peek() === '}') braceCount--;
          if (braceCount > 0) this.advance();
        }

        const exprSource = this.source.substring(exprStart, this.pos);
        this.advance(); // consume closing }

        // Parse the expression
        const exprParser = new ExpressionParser(exprSource);
        const result = exprParser.parse();

        if (result.value) {
          segments.push(ast.text.exprSegment(result.value, this.getLocationFrom(startLoc)));
        }
        continue;
      }

      // Regular character
      textBuffer += this.advance();
    }

    // Save any remaining text
    if (textBuffer) {
      segments.push(ast.text.literalSegment(textBuffer, this.getLocationFrom(startLoc)));
    }

    return ast.text.node({
      segments,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseSimpleExpression(): string {
    const start = this.pos;
    this.advance(); // consume $

    // Check for global $.
    if (this.peek() === '.') {
      this.advance();
    }

    // Parse identifier
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    // Parse path segments (.foo or [0])
    while (this.peek() === '.' || this.peek() === '[') {
      if (this.peek() === '.') {
        this.advance();
        while (this.isAlphaNumeric(this.peek())) {
          this.advance();
        }
      } else if (this.peek() === '[') {
        this.advance();
        if (this.peek() === '*') {
          this.advance();
        } else {
          while (this.isDigit(this.peek())) {
            this.advance();
          }
        }
        if (this.peek() === ']') {
          this.advance();
        }
      }
    }

    return this.source.substring(start, this.pos);
  }

  private parseDirective(): TemplateNode | null {
    // TODO: Implement directive parsing (@if, @for, @match, etc.)
    // For now, skip directives
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
    return null;
  }

  private parseIdentifier(): string {
    const start = this.pos;
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '-' || this.peek() === ':') {
      this.advance();
    }
    return this.source.substring(start, this.pos);
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && this.isWhitespace(this.peek())) {
      this.advance();
    }
  }

  private consume(expected: string): void {
    if (this.peek() !== expected) {
      this.errors.push({
        message: `Expected '${expected}' but got '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      return;
    }
    this.advance();
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

  private getLocation() {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos,
    };
  }

  private getLocationFrom(start: { line: number; column: number; offset: number }) {
    return ast.loc({
      line: start.line,
      column: start.column,
      offset: start.offset,
      endLine: this.line,
      endColumn: this.column,
      endOffset: this.pos,
    });
  }
}
