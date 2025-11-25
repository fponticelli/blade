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
      const prevPos = this.pos;
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      } else if (this.pos === prevPos) {
        // If parseNode returned null and didn't advance, skip the current character
        this.errors.push({
          message: `Unexpected character '${this.peek()}'`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        this.advance();
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
      // Check if it's a comment
      if (this.peekNext() === '!' && this.peekAhead(4) === '<!--') {
        return this.parseComment();
      }
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

    // Handle empty tag name (malformed HTML like <!DOCTYPE or <!)
    if (tagName === '') {
      this.errors.push({
        message: `Invalid tag name at '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      // Skip to next > or end of input to recover
      while (!this.isAtEnd() && this.peek() !== '>') {
        this.advance();
      }
      if (this.peek() === '>') {
        this.advance();
      }
      // Return an empty text node as fallback
      return ast.text.node({
        segments: [],
        location: this.getLocationFrom(startLoc),
      });
    }

    // Check if it's a component (starts with capital letter)
    if (tagName.length > 0 && tagName[0] >= 'A' && tagName[0] <= 'Z') {
      return this.parseComponent(tagName, startLoc);
    }

    // Check if it's a slot tag
    if (tagName === 'slot') {
      return this.parseSlot(startLoc);
    }

    // Parse attributes
    const attributes: any[] = [];
    this.skipWhitespace();

    while (!this.isAtEnd() && this.peek() !== '>' && this.peek() !== '/') {
      const prevPos = this.pos;
      const attr = this.parseAttribute();
      if (attr) {
        attributes.push(attr);
      } else if (this.pos === prevPos) {
        // If parseAttribute returned null and didn't advance, break to avoid infinite loop
        break;
      }
      this.skipWhitespace();
    }

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

      const prevPos = this.pos;
      const child = this.parseNode();
      if (child) {
        children.push(child);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
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

  private parseComponent(tagName: string, startLoc: { line: number; column: number; offset: number }): TemplateNode {
    // Parse component props (must be expressions, not attributes)
    const props: Array<{ name: string; value: any; location: any }> = [];
    const propPathMapping = new Map<string, readonly string[]>();
    this.skipWhitespace();

    while (!this.isAtEnd() && this.peek() !== '>' && this.peek() !== '/') {
      const prevPos = this.pos;
      const prop = this.parseComponentProp();
      if (prop) {
        props.push(prop);
        // Extract path mapping if the value is a path expression
        if (prop.value.kind === 'path' && !prop.value.isGlobal) {
          const pathSegments = prop.value.segments
            .filter((seg: any) => seg.kind === 'key')
            .map((seg: any) => seg.key);
          if (pathSegments.length > 0) {
            propPathMapping.set(prop.name, pathSegments);
          }
        }
      } else if (this.pos === prevPos) {
        // If parseComponentProp returned null and didn't advance, break to avoid infinite loop
        break;
      }
      this.skipWhitespace();
    }

    // Check for self-closing component
    const selfClosing = this.peek() === '/' && this.peekNext() === '>';
    if (selfClosing) {
      this.advance(); // /
      this.advance(); // >
      return ast.component.node({
        name: tagName,
        props,
        children: [],
        propPathMapping,
        location: this.getLocationFrom(startLoc),
      });
    }

    this.consume('>');

    // Parse children (including slots)
    const children: TemplateNode[] = [];
    while (!this.isAtEnd()) {
      // Check for closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        break;
      }

      const prevPos = this.pos;
      const child = this.parseNode();
      if (child) {
        children.push(child);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
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

    return ast.component.node({
      name: tagName,
      props,
      children,
      propPathMapping,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseComponentProp(): { name: string; value: any; location: any } | null {
    const startLoc = this.getLocation();
    const name = this.parseIdentifier();

    // If no valid identifier, don't consume the character - let parent loop handle it
    if (name === '') {
      // This is expected when we reach '>' or '/', so don't report error
      return null;
    }

    this.skipWhitespace();

    // Component props must have a value (no boolean props)
    if (this.peek() !== '=') {
      this.errors.push({
        message: `Component prop '${name}' must have a value`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      // Don't advance - let the parent loop handle the next character
      // This allows proper handling of '>' or '/' that ends the tag
      return null;
    }

    this.consume('=');
    this.skipWhitespace();

    // Parse the expression value
    let exprSource: string;

    if (this.peek() === '"' || this.peek() === "'") {
      // Quoted string literal - convert to literal expression
      const quote = this.peek();
      this.advance(); // opening quote
      const valueStart = this.pos;
      while (!this.isAtEnd() && this.peek() !== quote) {
        if (this.peek() === '\\') {
          this.advance();
        }
        this.advance();
      }
      const value = this.source.substring(valueStart, this.pos);
      this.advance(); // closing quote

      // Create a string literal expression
      const exprParser = new ExpressionParser(`"${value}"`);
      const result = exprParser.parse();

      if (!result.value) {
        throw new Error(`Invalid prop value for '${name}'`);
      }

      return {
        name,
        value: result.value,
        location: this.getLocationFrom(startLoc),
      };
    } else if (this.peek() === '$') {
      // Expression starting with $
      if (this.peekNext() === '{') {
        // Complex expression ${...}
        this.advance(); // $
        this.advance(); // {
        const exprStart = this.pos;
        let braceCount = 1;
        while (!this.isAtEnd() && braceCount > 0) {
          if (this.peek() === '{') braceCount++;
          if (this.peek() === '}') braceCount--;
          if (braceCount > 0) this.advance();
        }
        exprSource = this.source.substring(exprStart, this.pos);
        this.advance(); // consume }
      } else {
        // Simple expression $path
        exprSource = this.parseSimpleExpression();
      }

      const exprParser = new ExpressionParser(exprSource);
      const result = exprParser.parse();

      if (!result.value) {
        throw new Error(`Invalid prop expression for '${name}'`);
      }

      return {
        name,
        value: result.value,
        location: this.getLocationFrom(startLoc),
      };
    } else {
      // Unquoted value - parse as identifier or number
      const valueStart = this.pos;
      while (!this.isAtEnd() && !this.isWhitespace(this.peek()) && this.peek() !== '>' && this.peek() !== '/') {
        this.advance();
      }
      const value = this.source.substring(valueStart, this.pos);

      // Try to parse as expression
      const exprParser = new ExpressionParser(value);
      const result = exprParser.parse();

      if (!result.value) {
        throw new Error(`Invalid prop value for '${name}'`);
      }

      return {
        name,
        value: result.value,
        location: this.getLocationFrom(startLoc),
      };
    }
  }

  private parseSlot(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    // Parse slot attributes (looking for "name" attribute)
    let slotName: string | null = null;
    this.skipWhitespace();

    while (!this.isAtEnd() && this.peek() !== '>' && this.peek() !== '/') {
      const attrStartLoc = this.getLocation();
      const attrName = this.parseIdentifier();

      // If no valid identifier, skip invalid character
      if (attrName === '') {
        this.errors.push({
          message: `Invalid slot attribute at '${this.peek()}'`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        this.advance();
        continue;
      }

      if (attrName === 'name') {
        this.skipWhitespace();
        this.consume('=');
        this.skipWhitespace();

        // Parse slot name (must be quoted string)
        if (this.peek() === '"' || this.peek() === "'") {
          const quote = this.peek();
          this.advance(); // opening quote
          const nameStart = this.pos;
          while (!this.isAtEnd() && this.peek() !== quote) {
            this.advance();
          }
          slotName = this.source.substring(nameStart, this.pos);
          this.advance(); // closing quote
        }
      } else {
        // Skip other attributes on slot tag (not standard but be lenient)
        this.skipWhitespace();
        if (this.peek() === '=') {
          this.consume('=');
          this.skipWhitespace();
          if (this.peek() === '"' || this.peek() === "'") {
            const quote = this.peek();
            this.advance();
            while (!this.isAtEnd() && this.peek() !== quote) {
              this.advance();
            }
            this.advance();
          }
        }
      }

      this.skipWhitespace();
    }

    // Check for self-closing slot
    const selfClosing = this.peek() === '/' && this.peekNext() === '>';
    if (selfClosing) {
      this.advance(); // /
      this.advance(); // >
      return ast.slot.node({
        name: slotName,
        fallback: [],
        location: this.getLocationFrom(startLoc),
      });
    }

    this.consume('>');

    // Parse fallback content
    const fallback: TemplateNode[] = [];
    while (!this.isAtEnd()) {
      // Check for closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        break;
      }

      const prevPos = this.pos;
      const child = this.parseNode();
      if (child) {
        fallback.push(child);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
      }
    }

    // Parse closing tag
    if (this.peek() === '<' && this.peekNext() === '/') {
      this.advance(); // <
      this.advance(); // /
      const closingTag = this.parseIdentifier();
      if (closingTag !== 'slot') {
        this.errors.push({
          message: `Mismatched closing tag: expected </slot>, got </${closingTag}>`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
      }
      this.consume('>');
    }

    return ast.slot.node({
      name: slotName,
      fallback,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseComment(): TemplateNode {
    const startLoc = this.getLocation();

    // Consume <!--
    this.advance(); // <
    this.advance(); // !
    this.advance(); // -
    this.advance(); // -

    // Read comment content until -->
    const contentStart = this.pos;
    while (!this.isAtEnd()) {
      if (this.peek() === '-' && this.peekNext() === '-' && this.peekAhead(3) === '-->') {
        break;
      }
      this.advance();
    }

    const text = this.source.substring(contentStart, this.pos);

    // Consume -->
    if (this.peek() === '-') {
      this.advance(); // -
      this.advance(); // -
      this.advance(); // >
    }

    return ast.comment.node({
      style: 'html',
      text,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseAttribute(): any {
    const startLoc = this.getLocation();
    const name = this.parseIdentifier();

    // If no valid identifier was parsed, skip the current character to avoid infinite loop
    if (name === '') {
      this.errors.push({
        message: `Invalid attribute name at '${this.peek()}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      this.advance(); // Skip invalid character
      return null;
    }

    this.skipWhitespace();

    // Check for boolean attribute (no value)
    if (this.peek() !== '=') {
      // Boolean attribute like "disabled"
      return ast.attribute.static({
        name,
        value: '',
        location: this.getLocationFrom(startLoc),
      });
    }

    this.consume('=');
    this.skipWhitespace();

    // Check for expression attribute: name=$expr or name=${expr}
    if (this.peek() === '$') {
      if (this.peekNext() === '{') {
        // Complex expression: name=${expr}
        this.advance(); // $
        this.advance(); // {

        const exprStart = this.pos;
        let braceCount = 1;
        while (!this.isAtEnd() && braceCount > 0) {
          if (this.peek() === '{') braceCount++;
          if (this.peek() === '}') braceCount--;
          if (braceCount > 0) this.advance();
        }

        const exprSource = this.source.substring(exprStart, this.pos);
        this.advance(); // consume }

        const exprParser = new ExpressionParser(exprSource);
        const exprResult = exprParser.parse();

        if (!exprResult.value) {
          throw new Error('Invalid attribute expression');
        }

        return ast.attribute.expr({
          name,
          expr: exprResult.value,
          location: this.getLocationFrom(startLoc),
        });
      } else {
        // Simple expression: name=$path
        const exprSource = this.parseSimpleExpression();
        const exprParser = new ExpressionParser(exprSource);
        const exprResult = exprParser.parse();

        if (!exprResult.value) {
          throw new Error('Invalid attribute expression');
        }

        return ast.attribute.expr({
          name,
          expr: exprResult.value,
          location: this.getLocationFrom(startLoc),
        });
      }
    }

    // Static or mixed attribute with quotes
    if (this.peek() === '"' || this.peek() === "'") {
      const quote = this.peek();
      this.advance(); // opening quote

      // Check if it contains expressions (mixed attribute)
      const valueStart = this.pos;
      const segments: any[] = [];
      let textBuffer = '';

      while (!this.isAtEnd() && this.peek() !== quote) {
        // Check for expression in string
        if (this.peek() === '$' && this.peekNext() === '{') {
          // Save accumulated text
          if (textBuffer) {
            segments.push(ast.attribute.staticValue(textBuffer, this.getLocationFrom(startLoc)));
            textBuffer = '';
          }

          this.advance(); // $
          this.advance(); // {

          const exprStart = this.pos;
          let braceCount = 1;
          while (!this.isAtEnd() && braceCount > 0) {
            if (this.peek() === '{') braceCount++;
            if (this.peek() === '}') braceCount--;
            if (braceCount > 0) this.advance();
          }

          const exprSource = this.source.substring(exprStart, this.pos);
          this.advance(); // consume }

          const exprParser = new ExpressionParser(exprSource);
          const exprResult = exprParser.parse();

          if (exprResult.value) {
            segments.push(ast.attribute.exprValue(exprResult.value, this.getLocationFrom(startLoc)));
          }
        } else if (this.peek() === '\\') {
          // Escape sequence
          this.advance();
          if (!this.isAtEnd()) {
            textBuffer += this.advance();
          }
        } else {
          textBuffer += this.advance();
        }
      }

      // Save remaining text
      if (textBuffer || segments.length === 0) {
        segments.push(ast.attribute.staticValue(textBuffer, this.getLocationFrom(startLoc)));
      }

      this.advance(); // closing quote

      // If only one static segment, return static attribute
      if (segments.length === 1 && segments[0].kind === 'static') {
        return ast.attribute.static({
          name,
          value: segments[0].value,
          location: this.getLocationFrom(startLoc),
        });
      }

      // Mixed attribute
      return ast.attribute.mixed({
        name,
        segments,
        location: this.getLocationFrom(startLoc),
      });
    }

    // Unquoted value (treat as static)
    const start = this.pos;
    while (!this.isAtEnd() && !this.isWhitespace(this.peek()) && this.peek() !== '>' && this.peek() !== '/') {
      this.advance();
    }
    const value = this.source.substring(start, this.pos);

    return ast.attribute.static({
      name,
      value,
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
          // Invalid expression, treat $ as literal and reset position
          this.pos = exprStart; // Reset back to before the $
          textBuffer += this.advance(); // Add $ and advance past it
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
    const startLoc = this.getLocation();
    this.consume('@');

    // Check for @@ (code block)
    if (this.peek() === '@') {
      this.advance();
      return this.parseCodeBlock(startLoc);
    }

    const directive = this.parseIdentifier();

    switch (directive) {
      case 'if':
        return this.parseIf(startLoc);
      case 'for':
        return this.parseFor(startLoc);
      case 'match':
        return this.parseMatch(startLoc);
      case 'let':
        return this.parseLet(startLoc);
      default:
        this.errors.push({
          message: `Unknown directive: @${directive}`,
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        return null;
    }
  }

  private parseIf(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    this.skipWhitespace();
    this.consume('(');

    // Parse condition expression
    const condStart = this.pos;
    let parenCount = 1;
    while (!this.isAtEnd() && parenCount > 0) {
      if (this.peek() === '(') parenCount++;
      if (this.peek() === ')') parenCount--;
      if (parenCount > 0) this.advance();
    }
    const condSource = this.source.substring(condStart, this.pos);
    this.advance(); // consume )

    const exprParser = new ExpressionParser(condSource);
    const condResult = exprParser.parse();

    this.skipWhitespace();
    this.consume('{');

    // Parse then body
    const thenBody: TemplateNode[] = [];
    while (!this.isAtEnd() && this.peek() !== '}') {
      // Check for unexpected closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        this.errors.push({
          message: 'Unexpected closing tag in @if body',
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        break;
      }
      const prevPos = this.pos;
      const node = this.parseNode();
      if (node) {
        thenBody.push(node);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
      }
    }
    this.consume('}');

    // Check for @else
    this.skipWhitespace();
    let elseBody: TemplateNode[] | null = null;

    if (this.peek() === '@' && this.peekAhead(5) === '@else') {
      this.advance(); // @
      this.parseIdentifier(); // else
      this.skipWhitespace();
      this.consume('{');

      elseBody = [];
      while (!this.isAtEnd() && this.peek() !== '}') {
        // Check for unexpected closing tag
        if (this.peek() === '<' && this.peekNext() === '/') {
          this.errors.push({
            message: 'Unexpected closing tag in @else body',
            line: this.line,
            column: this.column,
            offset: this.pos,
          });
          break;
        }
        const prevPos = this.pos;
        const node = this.parseNode();
        if (node) {
          elseBody.push(node);
        } else if (this.pos === prevPos) {
          // parseNode didn't advance, break to avoid infinite loop
          break;
        }
      }
      this.consume('}');
    }

    if (!condResult.value) {
      throw new Error('Invalid if condition');
    }

    return ast.ifNode.node({
      condition: condResult.value,
      then: thenBody,
      else: elseBody,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseFor(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    this.skipWhitespace();
    this.consume('(');

    // Parse: item, index of items
    const item = this.parseIdentifier();
    this.skipWhitespace();

    let index: string | null = null;
    if (this.peek() === ',') {
      this.advance();
      this.skipWhitespace();
      index = this.parseIdentifier();
      this.skipWhitespace();
    }

    // Expect 'of'
    const ofKeyword = this.parseIdentifier();
    if (ofKeyword !== 'of') {
      this.errors.push({
        message: `Expected 'of' in @for directive, got '${ofKeyword}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
    }

    this.skipWhitespace();

    // Parse iterable expression
    const iterStart = this.pos;
    let parenCount = 1;
    while (!this.isAtEnd() && parenCount > 0) {
      if (this.peek() === '(') parenCount++;
      if (this.peek() === ')') parenCount--;
      if (parenCount > 0) this.advance();
    }
    const iterSource = this.source.substring(iterStart, this.pos);
    this.advance(); // consume )

    const exprParser = new ExpressionParser(iterSource);
    const iterResult = exprParser.parse();

    this.skipWhitespace();
    this.consume('{');

    // Parse body
    const body: TemplateNode[] = [];
    while (!this.isAtEnd() && this.peek() !== '}') {
      // Check for unexpected closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        this.errors.push({
          message: 'Unexpected closing tag in @for body',
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        break;
      }
      const prevPos = this.pos;
      const node = this.parseNode();
      if (node) {
        body.push(node);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
      }
    }
    this.consume('}');

    if (!iterResult.value) {
      throw new Error('Invalid for iterable');
    }

    return ast.forNode.node({
      item,
      index: index ?? undefined,
      iterable: iterResult.value,
      body,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseMatch(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    this.skipWhitespace();
    this.consume('(');

    // Parse match value expression
    const valueStart = this.pos;
    let parenCount = 1;
    while (!this.isAtEnd() && parenCount > 0) {
      if (this.peek() === '(') parenCount++;
      if (this.peek() === ')') parenCount--;
      if (parenCount > 0) this.advance();
    }
    const valueSource = this.source.substring(valueStart, this.pos);
    this.advance(); // consume )

    const exprParser = new ExpressionParser(valueSource);
    const valueResult = exprParser.parse();

    this.skipWhitespace();
    this.consume('{');

    // Parse cases
    const cases: any[] = [];
    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespace();

      if (this.peek() === '}') break;

      // Parse case
      const caseNode = this.parseMatchCase();
      if (caseNode) {
        cases.push(caseNode);
      }

      this.skipWhitespace();
    }
    this.consume('}');

    if (!valueResult.value) {
      throw new Error('Invalid match value');
    }

    return ast.matchNode.node({
      value: valueResult.value,
      cases,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseMatchCase(): any {
    const startLoc = this.getLocation();

    // Check for 'when' keyword or underscore (default case)
    if (this.peek() === '_' && (this.peekNext() === ' ' || this.peekNext() === '{')) {
      this.advance(); // consume _
      this.skipWhitespace();
      this.consume('{');

      const body: TemplateNode[] = [];
      while (!this.isAtEnd() && this.peek() !== '}') {
        const node = this.parseNode();
        if (node) body.push(node);
      }
      this.consume('}');

      // Default case - match all
      return ast.matchNode.literalCase({
        values: [],
        body,
        location: this.getLocationFrom(startLoc),
      });
    }

    const keyword = this.parseIdentifier();
    if (keyword !== 'when') {
      this.errors.push({
        message: `Expected 'when' in match case, got '${keyword}'`,
        line: this.line,
        column: this.column,
        offset: this.pos,
      });
      return null;
    }

    this.skipWhitespace();

    // Parse case values or expression
    // Check if it's a literal case or expression case
    const caseStart = this.pos;

    // Try to parse as literals first
    const values: (string | number | boolean)[] = [];
    let isExpressionCase = false;

    // Check for underscore (wildcard expression case)
    if (this.peek() === '_') {
      // This is an expression case like: _.startsWith("error")
      isExpressionCase = true;
    } else {
      // Try to parse literals
      while (true) {
        this.skipWhitespace();

        if (this.peek() === '"' || this.peek() === "'") {
          // String literal
          const quote = this.peek();
          this.advance();
          const start = this.pos;
          while (!this.isAtEnd() && this.peek() !== quote) {
            if (this.peek() === '\\') {
              this.advance();
            }
            this.advance();
          }
          const value = this.source.substring(start, this.pos);
          this.advance(); // closing quote
          values.push(value);
        } else if (this.isDigit(this.peek()) || this.peek() === '-') {
          // Number literal
          const start = this.pos;
          if (this.peek() === '-') this.advance();
          while (this.isDigit(this.peek())) {
            this.advance();
          }
          if (this.peek() === '.') {
            this.advance();
            while (this.isDigit(this.peek())) {
              this.advance();
            }
          }
          const value = parseFloat(this.source.substring(start, this.pos));
          values.push(value);
        } else if (this.peekAhead(4) === 'true') {
          this.pos += 4;
          values.push(true);
        } else if (this.peekAhead(5) === 'false') {
          this.pos += 5;
          values.push(false);
        } else {
          // Not a literal, must be expression case
          isExpressionCase = true;
          break;
        }

        this.skipWhitespace();
        if (this.peek() === ',') {
          this.advance();
        } else {
          break;
        }
      }
    }

    this.skipWhitespace();
    this.consume('{');

    const body: TemplateNode[] = [];
    while (!this.isAtEnd() && this.peek() !== '}') {
      // Check for unexpected closing tag
      if (this.peek() === '<' && this.peekNext() === '/') {
        this.errors.push({
          message: 'Unexpected closing tag in match case body',
          line: this.line,
          column: this.column,
          offset: this.pos,
        });
        break;
      }
      const prevPos = this.pos;
      const node = this.parseNode();
      if (node) {
        body.push(node);
      } else if (this.pos === prevPos) {
        // parseNode didn't advance, break to avoid infinite loop
        break;
      }
    }
    this.consume('}');

    if (isExpressionCase) {
      // Parse as expression case
      this.pos = caseStart; // Reset to parse expression
      const exprEnd = this.source.indexOf('{', this.pos);
      const exprSource = this.source.substring(this.pos, exprEnd).trim();
      this.pos = exprEnd;

      const exprParser = new ExpressionParser(exprSource);
      const exprResult = exprParser.parse();

      if (!exprResult.value) {
        throw new Error('Invalid match case expression');
      }

      return ast.matchNode.expressionCase({
        condition: exprResult.value,
        body,
        location: this.getLocationFrom(startLoc),
      });
    } else {
      // Literal case
      return ast.matchNode.literalCase({
        values,
        body,
        location: this.getLocationFrom(startLoc),
      });
    }
  }

  private parseLet(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    this.skipWhitespace();

    // Check for global assignment: let $.var = expr
    const isGlobal = this.peek() === '$' && this.peekNext() === '.';
    if (isGlobal) {
      this.advance(); // $
      this.advance(); // .
    }

    const name = this.parseIdentifier();

    this.skipWhitespace();
    this.consume('=');
    this.skipWhitespace();

    // Parse value expression
    const valueStart = this.pos;
    let end = this.pos;

    // Find the end (semicolon or newline)
    while (!this.isAtEnd()) {
      if (this.peek() === ';' || this.peek() === '\n') {
        end = this.pos;
        break;
      }
      this.advance();
      end = this.pos;
    }

    if (this.peek() === ';') {
      this.advance();
    }

    const valueSource = this.source.substring(valueStart, end).trim();
    const exprParser = new ExpressionParser(valueSource);
    const valueResult = exprParser.parse();

    if (!valueResult.value) {
      throw new Error('Invalid let value');
    }

    return ast.letNode.node({
      name,
      value: valueResult.value,
      isGlobal,
      location: this.getLocationFrom(startLoc),
    });
  }

  private parseCodeBlock(startLoc: { line: number; column: number; offset: number }): TemplateNode {
    this.skipWhitespace();
    this.consume('{');

    const statements: TemplateNode[] = [];

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespace();

      if (this.peek() === '}') break;

      // Parse let statement
      if (this.peekAhead(3) === 'let') {
        this.parseIdentifier(); // consume 'let'
        const letNode = this.parseLet(this.getLocation());
        statements.push(letNode);
      } else {
        // Skip unknown content
        while (!this.isAtEnd() && this.peek() !== ';' && this.peek() !== '\n') {
          this.advance();
        }
        if (this.peek() === ';') this.advance();
      }

      this.skipWhitespace();
    }

    this.consume('}');

    // For code blocks, we return all the statements as-is
    // The AST doesn't have a CodeBlock node, so we return a fragment
    return ast.fragment.node({
      children: statements,
      location: this.getLocationFrom(startLoc),
    });
  }

  private peekAhead(count: number): string {
    if (this.pos + count > this.source.length) {
      return this.source.substring(this.pos);
    }
    return this.source.substring(this.pos, this.pos + count);
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
