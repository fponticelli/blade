/**
 * Parser for @props() directive
 *
 * Parses @props(var1, var2?, var3 = defaultExpr, ...) declarations at the start of .blade files.
 *
 * Syntax:
 * - `name` - required prop
 * - `name?` - optional prop (defaults to undefined)
 * - `name = expr` - optional prop with default value
 */

import type {
  PropDeclaration,
  PropsDirective,
  SourceLocation,
} from '../ast/types.js';
import { ExpressionParser } from './expression-parser.js';

export interface PropsParseResult {
  /** Parsed @props directive, or undefined if not present */
  directive: PropsDirective | undefined;
  /** Remaining source after @props directive (for template parsing) */
  remainingSource: string;
  /** Start offset of remaining source in original */
  remainingOffset: number;
  /** Any parse warnings (syntax errors that were recovered from) */
  warnings: PropsParseWarning[];
}

export interface PropsParseWarning {
  message: string;
  line: number;
  column: number;
  offset: number;
}

/**
 * Parse @props directive from the beginning of a template source.
 *
 * If @props is not present or has syntax errors, returns undefined directive
 * and the full source as remainingSource.
 *
 * @param source - Template source code
 * @returns Parse result with directive and remaining source
 */
export function parseProps(source: string): PropsParseResult {
  const parser = new PropsParser(source);
  return parser.parse();
}

class PropsParser {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;
  private warnings: PropsParseWarning[] = [];

  constructor(source: string) {
    this.source = source;
  }

  parse(): PropsParseResult {
    // Skip leading whitespace and newlines
    this.skipWhitespace();

    // Check for @props at start
    if (!this.matchString('@props')) {
      return {
        directive: undefined,
        remainingSource: this.source,
        remainingOffset: 0,
        warnings: [],
      };
    }

    const startOffset = this.pos - 6; // '@props' is 6 chars
    const startLine = this.line;
    const startColumn = this.column - 6;

    // Skip whitespace between @props and (
    this.skipWhitespace();

    // Expect (
    if (!this.match('(')) {
      this.warnings.push({
        message: "Expected '(' after @props",
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      return this.fallbackResult();
    }

    // Parse prop declarations
    const props: PropDeclaration[] = [];
    this.skipWhitespace();

    // Handle empty @props()
    if (this.match(')')) {
      return this.createResult(props, startOffset, startLine, startColumn);
    }

    // Parse first prop
    const firstProp = this.parsePropDeclaration();
    if (!firstProp) {
      return this.fallbackResult();
    }
    props.push(firstProp);

    // Parse remaining props
    this.skipWhitespace();
    while (this.match(',')) {
      this.skipWhitespace();
      if (this.peek() === ')') {
        // Allow trailing comma
        break;
      }
      const prop = this.parsePropDeclaration();
      if (!prop) {
        return this.fallbackResult();
      }
      props.push(prop);
      this.skipWhitespace();
    }

    // Expect )
    if (!this.match(')')) {
      this.warnings.push({
        message: "Expected ')' to close @props",
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      return this.fallbackResult();
    }

    return this.createResult(props, startOffset, startLine, startColumn);
  }

  private parsePropDeclaration(): PropDeclaration | null {
    const startOffset = this.pos;
    const startLine = this.line;
    const startColumn = this.column;

    // Parse identifier (no $ prefix required)
    const name = this.parseIdentifier();
    if (!name) {
      this.warnings.push({
        message: 'Expected prop name',
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      return null;
    }

    // Check for ? suffix (optional prop)
    const isOptionalSuffix = this.match('?');

    this.skipWhitespace();

    // Check for default value
    if (this.match('=')) {
      this.skipWhitespace();

      // Parse default value expression
      const exprStart = this.pos;
      const exprSource = this.parseDefaultValueExpression();

      if (!exprSource) {
        this.warnings.push({
          message: `Expected default value expression for prop ${name}`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        return null;
      }

      // Parse the expression
      const exprParser = new ExpressionParser(exprSource);
      const { value: defaultValue, errors } = exprParser.parse();

      if (errors.length > 0 || !defaultValue) {
        this.warnings.push({
          message: `Invalid default value expression for prop ${name}: ${errors[0]?.message ?? 'unknown error'}`,
          line: startLine,
          column: startColumn,
          offset: exprStart,
        });
        return null;
      }

      return {
        name,
        required: false,
        defaultValue,
        location: this.createLocation(
          startOffset,
          startLine,
          startColumn,
          this.pos
        ),
      };
    }

    // Optional prop with ? suffix (no default value, defaults to undefined)
    if (isOptionalSuffix) {
      return {
        name,
        required: false,
        defaultValue: undefined,
        location: this.createLocation(
          startOffset,
          startLine,
          startColumn,
          this.pos
        ),
      };
    }

    // Required prop (no ? suffix and no default value)
    return {
      name,
      required: true,
      defaultValue: undefined,
      location: this.createLocation(
        startOffset,
        startLine,
        startColumn,
        this.pos
      ),
    };
  }

  private parseIdentifier(): string | null {
    const start = this.pos;
    const firstChar = this.peek();

    if (!this.isAlpha(firstChar)) {
      return null;
    }

    this.advance();
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    return this.source.substring(start, this.pos);
  }

  private parseDefaultValueExpression(): string | null {
    // Parse until we hit a comma, closing paren, or end of line
    // Handle nested parens, brackets, braces, and strings
    const start = this.pos;
    let depth = 0;

    while (!this.isAtEnd()) {
      const char = this.peek();

      // Handle string literals
      if (char === '"' || char === "'") {
        this.parseStringLiteral(char);
        continue;
      }

      // Handle nesting
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        this.advance();
        continue;
      }

      if (char === ')' || char === ']' || char === '}') {
        if (depth === 0 && char === ')') {
          break; // End of prop list
        }
        depth--;
        this.advance();
        continue;
      }

      // Stop at comma if at top level
      if (char === ',' && depth === 0) {
        break;
      }

      // Stop at newline (not allowed in @props line)
      if (char === '\n') {
        break;
      }

      this.advance();
    }

    const expr = this.source.substring(start, this.pos).trim();
    return expr || null;
  }

  private parseStringLiteral(quote: string): void {
    this.advance(); // consume opening quote
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        if (!this.isAtEnd()) {
          this.advance(); // consume escaped char
        }
      } else {
        this.advance();
      }
    }
    if (!this.isAtEnd()) {
      this.advance(); // consume closing quote
    }
  }

  private matchString(str: string): boolean {
    if (this.source.substring(this.pos, this.pos + str.length) === str) {
      for (let i = 0; i < str.length; i++) {
        this.advance();
      }
      return true;
    }
    return false;
  }

  private match(char: string): boolean {
    if (this.peek() === char) {
      this.advance();
      return true;
    }
    return false;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.pos]!;
  }

  private advance(): string {
    const char = this.source[this.pos++] ?? '\0';
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isAlpha(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_'
    );
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || (char >= '0' && char <= '9');
  }

  private createLocation(
    startOffset: number,
    startLine: number,
    startColumn: number,
    endOffset: number
  ): SourceLocation {
    return {
      start: {
        offset: startOffset,
        line: startLine,
        column: startColumn,
      },
      end: {
        offset: endOffset,
        line: this.line,
        column: this.column,
      },
    };
  }

  private createResult(
    props: PropDeclaration[],
    startOffset: number,
    startLine: number,
    startColumn: number
  ): PropsParseResult {
    // Skip trailing whitespace/newlines before remaining content
    this.skipWhitespace();

    const directive: PropsDirective = {
      type: 'PropsDirective',
      props,
      location: this.createLocation(
        startOffset,
        startLine,
        startColumn,
        this.pos
      ),
    };

    return {
      directive,
      remainingSource: this.source.substring(this.pos),
      remainingOffset: this.pos,
      warnings: this.warnings,
    };
  }

  private fallbackResult(): PropsParseResult {
    return {
      directive: undefined,
      remainingSource: this.source,
      remainingOffset: 0,
      warnings: this.warnings,
    };
  }
}
