/**
 * Template parser for Blade templates.
 *
 * Parses HTML structure, text content, directives and embedded Blade
 * expressions into an AST.
 *
 * Three rules hold for every input, however malformed:
 *
 * 1. **It never throws.** Every user mistake is a {@link ParseError} and a
 *    recovery path, so a partial AST is always returned. `@for(i of )` used to
 *    throw a bare `Error('Invalid for iterable')` at the caller.
 * 2. **It never loses characters silently.** Text that cannot be interpreted as
 *    markup stays text. An unknown `@word` in prose used to be consumed and
 *    dropped, so `write to a@props.com` rendered as `write to a.com`.
 * 3. **Every location is real.** The reading head is a {@link Cursor}, which is
 *    the only thing that may move the offset and always moves line and column
 *    with it, and every embedded expression is parsed with its absolute
 *    {@link Position} as base, so `source.slice(loc.start.offset,
 *    loc.end.offset)` is that node's own source text.
 *
 * The HTML content model - void elements, implied end tags - comes from
 * `ast/html.ts`, which is also what the renderer consults. When the parser kept
 * its own idea of it, `<div>a<br>b</div>` parsed `b` as a child of `<br>` and
 * the renderer, which knew `br` is void, deleted it.
 */

import type {
  TemplateNode,
  TextSegment,
  ComponentDefinition,
  ExprAst,
  AttributeNode,
  SourceLocation,
  MatchCase,
  StaticAttributeValue,
  ExprAttributeValue,
  PropDeclaration,
} from '../ast/types.js';
import * as ast from '../ast/builders.js';
import {
  closedByStartTag,
  hasOptionalEndTag,
  isRawTextElement,
  isVoidElement,
} from '../ast/html.js';
import { ExpressionParser } from './expression-parser.js';
import type { ParseError } from './index.js';
import type { Position } from './position.js';
import { advancePosition } from './position.js';
import {
  Cursor,
  isIdentifierPart,
  isWhitespaceChar,
  scanBalanced,
  scanValue,
} from './cursor.js';
import { decodeStringEscapes } from './string-escapes.js';

export interface TemplateParserOptions {
  /** Maximum nesting depth of an embedded expression. */
  maxExpressionDepth?: number;
  /**
   * Maximum nesting depth of template nodes.
   *
   * Guards against a pathological document exhausting the JS stack. The default
   * is far beyond any realistic markup; the previous limit of 100 rejected 101
   * nested `<div>`s, and a companion "maximum call limit" counted one call per
   * character of text, so a 100 KB text node threw outright.
   */
  maxNodeDepth?: number;
}

/** Default value of {@link TemplateParserOptions.maxNodeDepth}. */
export const DEFAULT_MAX_NODE_DEPTH = 500;

/** What the parser produces. */
export interface TemplateParseOutput {
  nodes: TemplateNode[];
  errors: ParseError[];
  components: Map<string, ComponentDefinition>;
  props: PropDeclaration[];
}

/**
 * The directives the dispatcher implements, mapped to what must follow the
 * name for the word to be read as a directive rather than as prose.
 *
 * This table is the *only* definition of that set: {@link TemplateParser.parseText}
 * derives its terminators from it, so the scanner and the dispatcher cannot
 * disagree. They used to: the text scanner broke out for eleven names, six of
 * which the dispatcher did not handle, and the characters it had consumed were
 * then dropped on the floor with an "Unknown directive" error.
 */
const DIRECTIVES = {
  if: 'paren',
  for: 'paren',
  match: 'paren',
  props: 'paren',
  let: 'space',
} as const;

type DirectiveName = keyof typeof DIRECTIVES;

function isDirectiveName(word: string): word is DirectiveName {
  return Object.prototype.hasOwnProperty.call(DIRECTIVES, word);
}

/**
 * Words reserved for directives the language does not implement.
 *
 * They are reported where they appear, but the text is kept: an error must
 * never be lossy.
 */
const RESERVED_DIRECTIVE_WORDS: ReadonlySet<string> = new Set([
  'endif',
  'endfor',
  'endmatch',
  'elseif',
  'component',
  'slot',
]);

function isAlphaChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_'
  );
}

function isDigitChar(char: string): boolean {
  return char >= '0' && char <= '9';
}

export class TemplateParser {
  private readonly cursor: Cursor;
  private readonly errors: ParseError[] = [];
  private readonly componentDefinitions: Map<string, ComponentDefinition> =
    new Map();
  private readonly propDeclarations: PropDeclaration[] = [];
  private propsDeclared = false;
  private readonly options: TemplateParserOptions;
  private readonly maxNodeDepth: number;
  private nodeDepth = 0;
  private depthExceededReported = false;

  /**
   * Tracks nesting depth inside directive blocks (@if, @for, @match).
   * When > 0, `}` is treated as block terminator. When 0, `}` is literal text.
   */
  private blockDepth = 0;

  /**
   * Names of the elements currently open, outermost first.
   *
   * Lets a closing tag be attributed to the element it actually closes: an end
   * tag for an ancestor closes the elements between, and one for nothing at all
   * is reported where it stands instead of being blamed on the enclosing tag.
   * A fragment (`<>...</>`) is on the stack under the empty name.
   */
  private readonly openElements: string[] = [];

  constructor(source: string, options?: TemplateParserOptions) {
    this.cursor = new Cursor(source);
    this.options = options ?? {};
    this.maxNodeDepth = options?.maxNodeDepth ?? DEFAULT_MAX_NODE_DEPTH;
  }

  parse(): TemplateParseOutput {
    const nodes: TemplateNode[] = [];

    while (!this.cursor.isAtEnd()) {
      const before = this.cursor.offset;
      const node = this.parseNode();
      if (node) {
        // Flatten fragment nodes at the top level when they contain only let
        // statements (e.g., from @@ blocks with multiple declarations)
        if (
          node.kind === 'fragment' &&
          node.children.length > 0 &&
          node.children.every(c => c.kind === 'let')
        ) {
          nodes.push(...node.children);
        } else {
          nodes.push(node);
        }
      } else if (this.cursor.offset === before) {
        // parseNode declined to consume anything: skip the character so the
        // parse always terminates, and say so.
        this.error(`Unexpected character '${this.cursor.peek()}'`);
        this.cursor.advance();
      }
    }

    return {
      nodes,
      errors: this.errors,
      components: this.componentDefinitions,
      props: this.propDeclarations,
    };
  }

  // ===========================================================================
  // Node dispatch
  // ===========================================================================

  private parseNode(): TemplateNode | null {
    if (this.nodeDepth >= this.maxNodeDepth) {
      if (!this.depthExceededReported) {
        this.error(
          `Maximum template nesting depth (${this.maxNodeDepth}) exceeded`
        );
        this.depthExceededReported = true;
      }
      // Consume a character so the caller still makes progress.
      this.cursor.advance();
      return null;
    }

    this.nodeDepth += 1;
    try {
      this.skipWhitespace();

      if (this.cursor.isAtEnd()) return null;

      if (this.cursor.peek() === '<') {
        if (this.cursor.peekAhead(4) === '<!--') {
          return this.parseComment();
        }
        if (this.cursor.peekAhead(9).toUpperCase() === '<!DOCTYPE') {
          return this.parseDoctype();
        }
        if (this.cursor.peek(1) === '/') {
          return this.handleClosingTag();
        }
        return this.parseElement();
      }

      if (this.cursor.peek() === '@' && this.directiveAhead() !== null) {
        return this.parseDirective();
      }

      return this.parseText();
    } finally {
      this.nodeDepth -= 1;
    }
  }

  /**
   * Handles a closing tag met where a node was expected.
   *
   * One that closes an open element is left for its owner to consume; one that
   * closes nothing is consumed and reported here, which is also what catches an
   * explicit `</br>` for a void element.
   */
  private handleClosingTag(): TemplateNode | null {
    const start = this.cursor.position;
    const name = this.peekClosingTagName();

    if (name !== null && this.openIndexOf(name) >= 0) {
      return null; // belongs to an enclosing element
    }

    this.cursor.advanceBy(2); // </
    const consumed = this.parseIdentifier(true);
    this.skipWhitespace();
    if (this.cursor.peek() === '>') this.cursor.advance();
    this.error(
      isVoidElement(consumed)
        ? `Void element <${consumed}> has no closing tag`
        : `Unexpected closing tag </${consumed}>`,
      start
    );
    return null;
  }

  // ===========================================================================
  // Elements
  // ===========================================================================

  private parseElement(): TemplateNode | null {
    const start = this.cursor.position;

    this.consume('<');

    // Fragment syntax <>...</>
    if (this.cursor.peek() === '>') {
      return this.parseFragment(start);
    }

    // Dots are allowed in tag names for component namespacing
    // (e.g., Components.Form.Input)
    const tagName = this.parseIdentifier(true);

    if (tagName === '') {
      this.error(`Invalid tag name at '${this.cursor.peek()}'`);
      // Skip to the next '>' to recover
      while (!this.cursor.isAtEnd() && this.cursor.peek() !== '>') {
        this.cursor.advance();
      }
      if (this.cursor.peek() === '>') this.cursor.advance();
      return null;
    }

    if (tagName.startsWith('template:')) {
      return this.parseComponentDefinition(tagName.substring(9), start);
    }

    const firstChar = tagName[0];
    if (firstChar && firstChar >= 'A' && firstChar <= 'Z') {
      return this.parseComponent(tagName, start);
    }

    if (tagName === 'slot') {
      return this.parseSlot(start);
    }

    // `<slot:header>` fills a hole in the component being called; `<slot>`
    // declares one. Two different things that only look alike, so they are two
    // node kinds - parsed as an ordinary element, a fill matched no slot and
    // was written into the page as an unknown `<slot:header>` tag.
    if (tagName.startsWith('slot:')) {
      return this.parseSlotFill(tagName.substring(5), tagName, start);
    }

    const attributes = this.parseAttributes();

    if (this.cursor.peek() === '/' && this.cursor.peek(1) === '>') {
      this.cursor.advanceBy(2);
      return ast.node.element({
        tag: tagName,
        attributes,
        children: [],
        location: this.locFrom(start),
      });
    }

    this.consume('>');

    // A void element is closed by its start tag. Parsing children here is what
    // made `<head><meta><title>T</title></head>` put the title inside the meta,
    // where the renderer - which does know `meta` is void - deleted it.
    if (isVoidElement(tagName)) {
      return ast.node.element({
        tag: tagName,
        attributes,
        children: [],
        location: this.locFrom(start),
      });
    }

    // `<script>` and `<style>` hold raw text: no markup is parsed inside them,
    // so a CSS rule's `}` is not a block terminator and `if (a < b)` is not a
    // `<b>` element. Blade interpolation still applies - `<style>` templating is
    // the point of putting CSS in a template at all.
    if (isRawTextElement(tagName)) {
      const text = this.parseText({ rawTextTag: tagName });
      this.finishElement(tagName, start, false);

      return ast.node.element({
        tag: tagName,
        attributes,
        children: text ? [text] : [],
        location: this.locFrom(start),
      });
    }

    const { children, impliedClose } = this.parseChildren(tagName);
    this.finishElement(tagName, start, impliedClose);

    return ast.node.element({
      tag: tagName,
      attributes,
      children,
      location: this.locFrom(start),
    });
  }

  /**
   * Parses the children of `tag` up to its end tag.
   *
   * Stops early - reporting nothing - when the element is closed implicitly:
   * either by a start tag that HTML says closes it (`<li>` after `<li>`) or by
   * the end tag of an ancestor.
   */
  private parseChildren(tag: string): {
    children: TemplateNode[];
    impliedClose: boolean;
  } {
    const children: TemplateNode[] = [];
    this.openElements.push(this.tagKey(tag));

    try {
      while (!this.cursor.isAtEnd()) {
        if (this.blockDepth > 0 && this.cursor.peek() === '}') break;

        if (this.cursor.peek() === '<' && this.cursor.peek(1) === '/') {
          const closing = this.peekClosingTagName() ?? '';
          if (this.sameTag(tag, closing)) break; // our own end tag

          const openIndex = this.openIndexOf(closing);
          if (openIndex >= 0 && openIndex < this.openElements.length - 1) {
            // An ancestor is closing; this element ends with it.
            if (!hasOptionalEndTag(tag)) {
              this.error(`Unclosed tag: <${tag}>`);
            }
            return { children, impliedClose: true };
          }
          // The end tag closes nothing that is open - an explicit `</br>`, or a
          // typo. parseNode reports it where it stands and consumes it, rather
          // than letting it be mistaken for this element's own end tag.
        }

        if (this.cursor.peek() === '<' && isAlphaChar(this.cursor.peek(1))) {
          const next = this.peekStartTagName();
          if (next !== null && closedByStartTag(tag, next)) {
            return { children, impliedClose: true };
          }
        }

        const before = this.cursor.offset;
        const child = this.parseNode();
        if (child) {
          children.push(child);
        } else if (this.cursor.offset === before) {
          break;
        }
      }

      return { children, impliedClose: false };
    } finally {
      this.openElements.pop();
    }
  }

  /**
   * Consumes the end tag of an element whose children have been parsed, or
   * reports its absence.
   */
  private finishElement(
    tagName: string,
    start: Position,
    impliedClose: boolean
  ): void {
    if (impliedClose) return;

    if (this.cursor.peek() === '<' && this.cursor.peek(1) === '/') {
      this.cursor.advanceBy(2);
      const closingTag = this.parseIdentifier(true);
      if (!this.sameTag(tagName, closingTag)) {
        this.error(
          `Mismatched closing tag: expected </${tagName}>, got </${closingTag}>`
        );
      }
      this.skipWhitespace();
      this.consume('>');
      return;
    }

    if (!hasOptionalEndTag(tagName)) {
      this.error(`Unclosed tag: <${tagName}>`, start);
    }
  }

  private parseAttributes(): AttributeNode[] {
    const attributes: AttributeNode[] = [];
    this.skipWhitespace();

    while (
      !this.cursor.isAtEnd() &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      const before = this.cursor.offset;
      const attribute = this.parseAttribute();
      if (attribute) {
        attributes.push(attribute);
      } else if (this.cursor.offset === before) {
        break;
      }
      this.skipWhitespace();
    }

    return attributes;
  }

  private parseAttribute(): AttributeNode | null {
    const start = this.cursor.position;
    const name = this.parseIdentifier();

    if (name === '') {
      this.error(`Invalid attribute name at '${this.cursor.peek()}'`);
      this.cursor.advance();
      return null;
    }

    // `on:click` is a binding, not an attribute: whatever the expression
    // evaluates to is handed to the sink as a value, never serialised into a
    // value the browser would have to parse as JavaScript. Only the expression
    // forms can produce one, so a quoted or bare value falls through to the
    // ordinary attribute path and the validator reports it - the parser's job
    // is to represent what was written, not to judge it.
    const event = eventBindingName(name);

    this.skipWhitespace();

    // Boolean attribute like "disabled"
    if (this.cursor.peek() !== '=') {
      return ast.attr.static(name, '', this.locFrom(start));
    }

    this.consume('=');
    this.skipWhitespace();

    // name={expr} or name=${expr}
    if (
      this.cursor.peek() === '{' ||
      (this.cursor.peek() === '$' && this.cursor.peek(1) === '{')
    ) {
      if (this.cursor.peek() === '$') this.cursor.advance();
      this.cursor.advance(); // {

      const scan = scanBalanced(this.cursor, '{', '}');
      if (scan.unterminated) {
        this.error(
          `Unterminated value for attribute '${name}': expected '}'`,
          scan.start
        );
      }

      const value = this.parseSubExpression(
        scan.source,
        scan.start,
        `value for attribute '${name}'`
      );
      if (!value) return null;

      return this.attributeWithExpression(name, event, value, start);
    }

    // name=$path
    if (this.cursor.peek() === '$') {
      const scan = this.scanSimpleExpression();
      const value = this.parseSubExpression(
        scan.source,
        scan.start,
        `value for attribute '${name}'`
      );
      if (!value) return null;

      return this.attributeWithExpression(name, event, value, start);
    }

    // Quoted value, possibly with ${...} interpolation
    if (this.cursor.peek() === '"' || this.cursor.peek() === "'") {
      return this.parseQuotedAttributeValue(name, start);
    }

    // Unquoted value
    const valueStart = this.cursor.position;
    while (
      !this.cursor.isAtEnd() &&
      !isWhitespaceChar(this.cursor.peek()) &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      this.cursor.advance();
    }

    return ast.attr.static(
      name,
      this.cursor.textFrom(valueStart),
      this.locFrom(start)
    );
  }

  /** An expression-valued attribute, or the event binding it spells. */
  private attributeWithExpression(
    name: string,
    event: string | null,
    value: ExprAst,
    start: Position
  ): AttributeNode {
    const location = this.locFrom(start);
    return event === null
      ? ast.attr.expr(name, value, location)
      : ast.attr.event(name, event, value, location);
  }

  private parseQuotedAttributeValue(
    name: string,
    start: Position
  ): AttributeNode {
    const quote = this.cursor.advance();
    const segments: (StaticAttributeValue | ExprAttributeValue)[] = [];
    let runStart = this.cursor.position;

    const flushRun = (): void => {
      const end = this.cursor.position;
      if (end.offset === runStart.offset) return;
      const raw = this.cursor.textBetween(runStart, end);
      const decoded = decodeStringEscapes(raw, runStart);
      this.errors.push(...decoded.errors);
      segments.push(
        ast.attr.staticValue(decoded.value, this.locBetween(runStart, end))
      );
    };

    while (!this.cursor.isAtEnd() && this.cursor.peek() !== quote) {
      if (this.cursor.peek() === '$' && this.cursor.peek(1) === '{') {
        flushRun();

        const exprStart = this.cursor.position;
        this.cursor.advanceBy(2); // ${
        const scan = scanBalanced(this.cursor, '{', '}');
        if (scan.unterminated) {
          this.error(
            `Unterminated interpolation in attribute '${name}': expected '}'`,
            scan.start
          );
        }

        const value = this.parseSubExpression(
          scan.source,
          scan.start,
          `value for attribute '${name}'`
        );
        if (value) {
          segments.push(
            ast.attr.exprValue(
              value,
              this.locBetween(exprStart, this.cursor.position)
            )
          );
        }

        runStart = this.cursor.position;
        continue;
      }

      if (this.cursor.peek() === '\\') {
        this.cursor.advance();
        if (!this.cursor.isAtEnd()) this.cursor.advance();
        continue;
      }

      this.cursor.advance();
    }

    flushRun();

    if (this.cursor.peek() === quote) {
      this.cursor.advance();
    } else {
      this.error(
        `Unterminated value for attribute '${name}': expected a closing ${quote}`,
        start
      );
    }

    const only = segments[0];
    if (segments.length === 0) {
      return ast.attr.static(name, '', this.locFrom(start));
    }
    if (segments.length === 1 && only && only.kind === 'static') {
      return ast.attr.static(name, only.value, this.locFrom(start));
    }

    return ast.attr.mixed(name, segments, this.locFrom(start));
  }

  // ===========================================================================
  // Components
  // ===========================================================================

  private parseComponent(tagName: string, start: Position): TemplateNode {
    const props: Array<{
      name: string;
      value: ExprAst;
      location: SourceLocation;
    }> = [];
    this.skipWhitespace();

    while (
      !this.cursor.isAtEnd() &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      const before = this.cursor.offset;
      const prop = this.parseComponentProp();
      if (prop) {
        props.push(prop);
      } else if (this.cursor.offset === before) {
        break;
      }
      this.skipWhitespace();
    }

    if (this.cursor.peek() === '/' && this.cursor.peek(1) === '>') {
      this.cursor.advanceBy(2);
      return ast.node.component({
        name: tagName,
        props,
        children: [],
        location: this.locFrom(start),
      });
    }

    this.consume('>');

    const { children, impliedClose } = this.parseChildren(tagName);
    this.finishElement(tagName, start, impliedClose);

    return ast.node.component({
      name: tagName,
      props,
      children,
      location: this.locFrom(start),
    });
  }

  private parseComponentProp(): {
    name: string;
    value: ExprAst;
    location: SourceLocation;
  } | null {
    const start = this.cursor.position;
    const name = this.parseIdentifier();

    // No identifier: expected at '>' or '/', so the caller decides.
    if (name === '') return null;

    this.skipWhitespace();

    if (this.cursor.peek() !== '=') {
      this.error(`Component prop '${name}' must have a value`);
      return null;
    }

    this.consume('=');
    this.skipWhitespace();

    // Quoted literal. Decoding here - rather than re-parsing `"` + text + `"`
    // as an expression - is what makes a value containing a quote, or a
    // backslash, mean what it says.
    if (this.cursor.peek() === '"' || this.cursor.peek() === "'") {
      const quoted = this.readQuotedValue(`value for prop '${name}'`);
      return {
        name,
        value: ast.expr.literal(
          quoted.value,
          this.locBetween(quoted.start, quoted.end),
          'string'
        ),
        location: this.locFrom(start),
      };
    }

    if (this.cursor.peek() === '$' && this.cursor.peek(1) === '{') {
      this.cursor.advanceBy(2); // ${
      const scan = scanBalanced(this.cursor, '{', '}');
      if (scan.unterminated) {
        this.error(
          `Unterminated value for prop '${name}': expected '}'`,
          scan.start
        );
      }
      const value = this.parseSubExpression(
        scan.source,
        scan.start,
        `value for prop '${name}'`
      );
      if (!value) return null;
      return { name, value, location: this.locFrom(start) };
    }

    if (this.cursor.peek() === '$') {
      const scan = this.scanSimpleExpression();
      const value = this.parseSubExpression(
        scan.source,
        scan.start,
        `value for prop '${name}'`
      );
      if (!value) return null;
      return { name, value, location: this.locFrom(start) };
    }

    // Unquoted value: an identifier, a number, or anything up to the tag end.
    const valueStart = this.cursor.position;
    while (
      !this.cursor.isAtEnd() &&
      !isWhitespaceChar(this.cursor.peek()) &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      this.cursor.advance();
    }
    const value = this.parseSubExpression(
      this.cursor.textFrom(valueStart),
      valueStart,
      `value for prop '${name}'`
    );
    if (!value) return null;

    return { name, value, location: this.locFrom(start) };
  }

  private parseComponentDefinition(
    name: string,
    start: Position
  ): TemplateNode | null {
    const props: PropDeclaration[] = [];
    this.skipWhitespace();

    while (
      !this.cursor.isAtEnd() &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      const propStart = this.cursor.position;
      const propName = this.parseIdentifier();

      if (propName === '') break;

      let required = false;
      let defaultValue: ExprAst | undefined;

      if (this.cursor.peek() === '!') {
        required = true;
        this.cursor.advance();
      }

      this.skipWhitespace();

      if (this.cursor.peek() === '=') {
        this.cursor.advance();
        this.skipWhitespace();

        if (this.cursor.peek() === '"' || this.cursor.peek() === "'") {
          // A quoted default is a string literal expression, not a bare
          // string: every consumer used to carry a `typeof === 'string'`
          // branch because this one was left unparsed.
          const quoted = this.readQuotedValue(
            `default value for prop '${propName}'`
          );
          defaultValue = ast.expr.literal(
            quoted.value,
            this.locBetween(quoted.start, quoted.end),
            'string'
          );
        } else if (this.cursor.peek() === '{') {
          this.cursor.advance(); // {
          const scan = scanBalanced(this.cursor, '{', '}');
          if (scan.unterminated) {
            this.error(
              `Unterminated default value for prop '${propName}': expected '}'`,
              scan.start
            );
          }
          defaultValue =
            this.parseSubExpression(
              scan.source,
              scan.start,
              `default value for prop '${propName}'`
            ) ?? undefined;
        }
      }

      props.push({
        name: propName,
        required,
        defaultValue,
        location: this.locFrom(propStart),
      });

      this.skipWhitespace();
    }

    if (this.cursor.peek() === '/' && this.cursor.peek(1) === '>') {
      this.cursor.advanceBy(2);
      this.defineComponent(name, props, [], start);
      return null;
    }

    this.consume('>');

    const closingTag = `template:${name}`;
    const { children, impliedClose } = this.parseChildren(closingTag);
    this.finishElement(closingTag, start, impliedClose);

    this.defineComponent(name, props, children, start);
    return null; // Component definitions don't create visible nodes
  }

  private defineComponent(
    name: string,
    props: PropDeclaration[],
    body: TemplateNode[],
    start: Position
  ): void {
    if (this.componentDefinitions.has(name)) {
      this.error(`Duplicate component definition: ${name}`, start);
    }
    this.componentDefinitions.set(name, {
      name,
      props,
      body,
      location: this.locFrom(start),
    });
  }

  private parseSlot(start: Position): TemplateNode {
    let slotName: string | undefined;
    this.skipWhitespace();

    while (
      !this.cursor.isAtEnd() &&
      this.cursor.peek() !== '>' &&
      this.cursor.peek() !== '/'
    ) {
      const attrName = this.parseIdentifier();

      if (attrName === '') {
        this.error(`Invalid slot attribute at '${this.cursor.peek()}'`);
        this.cursor.advance();
        continue;
      }

      this.skipWhitespace();
      if (this.cursor.peek() === '=') {
        this.consume('=');
        this.skipWhitespace();
        if (this.cursor.peek() === '"' || this.cursor.peek() === "'") {
          const quoted = this.readQuotedValue(`value for '${attrName}'`);
          if (attrName === 'name') slotName = quoted.value;
        }
      }

      this.skipWhitespace();
    }

    if (this.cursor.peek() === '/' && this.cursor.peek(1) === '>') {
      this.cursor.advanceBy(2);
      return ast.node.slot({
        name: slotName,
        fallback: undefined,
        location: this.locFrom(start),
      });
    }

    this.consume('>');

    const { children, impliedClose } = this.parseChildren('slot');
    this.finishElement('slot', start, impliedClose);

    return ast.node.slot({
      name: slotName,
      fallback: children,
      location: this.locFrom(start),
    });
  }

  /**
   * `<slot:NAME>content</slot:NAME>` - content for a named slot.
   *
   * Takes no attributes: the name is the tag. A self-closing fill supplies
   * nothing, which is how a caller deliberately blanks a slot that has
   * fallback content.
   */
  private parseSlotFill(
    name: string,
    tagName: string,
    start: Position
  ): TemplateNode {
    if (name === '') {
      this.error(`Slot fill is missing a name: '<${tagName}>'`, start);
    }

    this.skipWhitespace();

    if (this.cursor.peek() === '/' && this.cursor.peek(1) === '>') {
      this.cursor.advanceBy(2);
      return ast.node.slotFill({
        name,
        children: [],
        location: this.locFrom(start),
      });
    }

    this.consume('>');

    const { children, impliedClose } = this.parseChildren(tagName);
    this.finishElement(tagName, start, impliedClose);

    return ast.node.slotFill({
      name,
      children,
      location: this.locFrom(start),
    });
  }

  private parseFragment(start: Position): TemplateNode {
    this.consume('>'); // the '>' of '<>'

    const { children, impliedClose } = this.parseChildren('');

    if (!impliedClose) {
      if (this.cursor.peek() === '<' && this.cursor.peek(1) === '/') {
        this.cursor.advanceBy(2);
        this.parseIdentifier(true);
        this.skipWhitespace();
        this.consume('>');
      } else {
        this.error('Unclosed fragment: expected </>', start);
      }
    }

    return ast.node.fragment(children, this.locFrom(start));
  }

  // ===========================================================================
  // Comments and DOCTYPE
  // ===========================================================================

  private parseComment(): TemplateNode {
    const start = this.cursor.position;
    this.cursor.advanceBy(4); // <!--

    const contentStart = this.cursor.position;
    while (!this.cursor.isAtEnd() && this.cursor.peekAhead(3) !== '-->') {
      this.cursor.advance();
    }
    const text = this.cursor.textFrom(contentStart);

    if (this.cursor.peekAhead(3) === '-->') {
      this.cursor.advanceBy(3);
    } else {
      this.error('Unclosed comment: expected -->', start);
    }

    return ast.node.comment({
      style: 'html',
      text,
      location: this.locFrom(start),
    });
  }

  private parseDoctype(): TemplateNode {
    const start = this.cursor.position;
    this.cursor.advanceBy(2); // <!

    while (!this.cursor.isAtEnd() && isAlphaChar(this.cursor.peek())) {
      this.cursor.advance();
    }

    this.skipWhitespace();

    const valueStart = this.cursor.position;
    while (!this.cursor.isAtEnd() && this.cursor.peek() !== '>') {
      this.cursor.advance();
    }
    const value = this.cursor.textFrom(valueStart).trim();

    if (this.cursor.peek() === '>') this.cursor.advance();

    return ast.node.doctype({ value, location: this.locFrom(start) });
  }

  // ===========================================================================
  // Text and interpolation
  // ===========================================================================

  /**
   * Parses text and its interpolations up to the next construct that ends it.
   *
   * @param options.rawTextTag - When set, the text is the raw content of that
   *   element (`<script>`, `<style>`): only its own end tag ends the text, and
   *   `<`, `}` and `@` are ordinary characters.
   */
  private parseText(options?: { rawTextTag?: string }): TemplateNode | null {
    const rawTextTag = options?.rawTextTag;
    const nodeStart = this.cursor.position;
    const segments: TextSegment[] = [];

    let buffer = '';
    let bufferStart: Position | null = null;

    const startRun = (): void => {
      if (bufferStart === null) bufferStart = this.cursor.position;
    };

    // Each literal run gets its own location. They all used to report the start
    // of the whole text node, so nothing downstream could map a rendered value
    // back to the `${...}` that produced it.
    const flushRun = (): void => {
      if (buffer.length > 0 && bufferStart !== null) {
        segments.push(ast.seg.literal(buffer, this.locFrom(bufferStart)));
      }
      buffer = '';
      bufferStart = null;
    };

    while (!this.cursor.isAtEnd()) {
      const char = this.cursor.peek();

      // Escape sequences: \@, \$, \\
      if (char === '\\') {
        const next = this.cursor.peek(1);
        startRun();
        if (next === '@' || next === '$' || next === '\\') {
          this.cursor.advance(); // the backslash
        }
        buffer += this.cursor.advance();
        continue;
      }

      if (char === '@' && rawTextTag === undefined) {
        if (this.directiveAhead() !== null) break;
        if (this.atWordStart()) this.reportDirectiveLookalike();
        startRun();
        buffer += this.cursor.advance();
        continue;
      }

      // End of a directive block body
      if (this.blockDepth > 0 && char === '}' && rawTextTag === undefined)
        break;

      if (char === '<') {
        if (rawTextTag !== undefined) {
          if (this.atEndTagFor(rawTextTag)) break;
          startRun();
          buffer += this.cursor.advance();
          continue;
        }
        const next = this.cursor.peek(1);
        if (isAlphaChar(next) || next === '/' || next === '!' || next === '>') {
          break;
        }
        startRun();
        buffer += this.cursor.advance();
        continue;
      }

      if (char === '$') {
        const next = this.cursor.peek(1);

        if (next === '{') {
          flushRun();
          this.parseInterpolationBlock(segments, false);
          continue;
        }

        if (next === '!') {
          const afterBang = this.cursor.peek(2);
          if (afterBang === '{') {
            flushRun();
            this.parseInterpolationBlock(segments, true);
            continue;
          }
          if (isAlphaChar(afterBang) || afterBang === '.') {
            flushRun();
            this.parseUnsafeSimpleInterpolation(segments);
            continue;
          }
        }

        if (isAlphaChar(next) || next === '.') {
          flushRun();
          this.parseSimpleInterpolation(segments);
          continue;
        }

        // A lone '$' is literal text.
        startRun();
        buffer += this.cursor.advance();
        continue;
      }

      startRun();
      buffer += this.cursor.advance();
    }

    flushRun();

    if (segments.length === 0) return null;

    return ast.node.text(segments, this.locFrom(nodeStart));
  }

  /** `$path` or `$.global.path`. */
  private parseSimpleInterpolation(segments: TextSegment[]): void {
    const start = this.cursor.position;
    const scan = this.scanSimpleExpression();
    const value = this.parseSubExpression(
      scan.source,
      scan.start,
      'expression'
    );
    if (value) {
      segments.push(ast.seg.expr(value, this.locFrom(start)));
    }
  }

  /**
   * `$!path` - the raw, unescaped form.
   *
   * The expression handed to the sub-parser is `$` + the path, with the `!`
   * taken as the position of the synthetic `$`, so every location inside it
   * still lands on the real characters.
   */
  private parseUnsafeSimpleInterpolation(segments: TextSegment[]): void {
    const start = this.cursor.position;
    this.cursor.advance(); // $
    const bang = this.cursor.position;
    this.cursor.advance(); // !

    const pathStart = this.cursor.position;
    this.scanPathAfterDollar();
    const source = `$${this.cursor.textFrom(pathStart)}`;

    const value = this.parseSubExpression(source, bang, 'expression');
    if (value) {
      segments.push(ast.seg.unsafeExpr(value, this.locFrom(start)));
    }
  }

  /** `${expression}` and `$!{expression}`. */
  private parseInterpolationBlock(
    segments: TextSegment[],
    unsafe: boolean
  ): void {
    const start = this.cursor.position;
    this.cursor.advance(); // $
    if (unsafe) this.cursor.advance(); // !
    this.cursor.advance(); // {

    const scan = scanBalanced(this.cursor, '{', '}');
    if (scan.unterminated) {
      this.error("Unterminated interpolation: expected '}'", scan.start);
    }

    if (scan.source.trim() === '') {
      this.error('Empty expression', scan.start);
      return;
    }

    const value = this.parseSubExpression(
      scan.source,
      scan.start,
      'expression'
    );
    if (!value) return;

    segments.push(
      unsafe
        ? ast.seg.unsafeExpr(value, this.locFrom(start))
        : ast.seg.expr(value, this.locFrom(start))
    );
  }

  /**
   * Whether the cursor stands at the start of a word.
   *
   * `@` in the middle of a word is part of that word - an email address, a
   * handle - and reporting a malformed directive there would squiggle ordinary
   * prose.
   */
  private atWordStart(): boolean {
    const previous = this.cursor.peek(-1);
    return (
      previous === '\0' ||
      isWhitespaceChar(previous) ||
      previous === '>' ||
      previous === '}' ||
      previous === '('
    );
  }

  /**
   * Reports an `@word` that looks like a directive but is not one here.
   *
   * The word itself is left to the caller to append as literal text.
   */
  private reportDirectiveLookalike(): void {
    const word = this.identifierAfterAt();
    if (word === '') return;

    if (isDirectiveName(word)) {
      this.error(
        DIRECTIVES[word] === 'paren'
          ? `Expected '(' after @${word}`
          : `Expected a space after @${word}`
      );
      return;
    }

    if (RESERVED_DIRECTIVE_WORDS.has(word)) {
      this.error(
        `@${word} is reserved for a future directive; write \\@${word} for a literal`
      );
    }
  }

  // ===========================================================================
  // Directives
  // ===========================================================================

  /**
   * The directive starting at the cursor, or null when the `@` is prose.
   *
   * A word is only a directive when what follows it is the directive's own
   * syntax, so `a@props.com` and `@slot machine` stay text.
   */
  private directiveAhead(): DirectiveName | 'block' | null {
    if (this.cursor.peek() !== '@') return null;
    if (this.cursor.peek(1) === '@') return 'block';

    const word = this.identifierAfterAt();
    if (!isDirectiveName(word)) return null;

    let ahead = 1 + word.length;
    if (DIRECTIVES[word] === 'paren') {
      while (isWhitespaceChar(this.cursor.peek(ahead))) ahead += 1;
      return this.cursor.peek(ahead) === '(' ? word : null;
    }
    return isWhitespaceChar(this.cursor.peek(ahead)) ? word : null;
  }

  private parseDirective(): TemplateNode | null {
    const start = this.cursor.position;
    this.consume('@');

    if (this.cursor.peek() === '@') {
      this.cursor.advance();
      return this.parseCodeBlock(start);
    }

    const directive = this.parseIdentifier();

    switch (directive) {
      case 'if':
        return this.parseIf(start);
      case 'for':
        return this.parseFor(start);
      case 'match':
        return this.parseMatch(start);
      case 'let':
        return this.parseLet(start);
      case 'props':
        return this.parseProps(start);
      default:
        this.error(`Unknown directive: @${directive}`, start);
        return null;
    }
  }

  private parseIf(start: Position): TemplateNode {
    const branches: Array<{
      condition: ExprAst;
      body: TemplateNode[];
      location: SourceLocation;
    }> = [];
    let elseBranch: TemplateNode[] | undefined;

    const firstBranch = this.parseIfBranch();
    if (firstBranch) branches.push(firstBranch);

    for (;;) {
      const beforeElse = this.cursor.position;
      this.skipWhitespace();

      // `else` must be a whole word: `peekAhead(4) === 'else'` matched the
      // first four characters of `elsewhere` and swallowed the sentence.
      if (!this.cursor.matchKeyword('else')) {
        this.cursor.seek(beforeElse);
        break;
      }

      this.skipWhitespace();

      if (this.cursor.matchKeyword('if')) {
        const branch = this.parseIfBranch();
        if (branch) branches.push(branch);
        continue;
      }

      this.consume('{');
      elseBranch = this.parseBlockBody();
      this.consume('}');
      break; // else is always last
    }

    return ast.node.ifNode({
      branches,
      elseBranch,
      location: this.locFrom(start),
    });
  }

  private parseIfBranch(): {
    condition: ExprAst;
    body: TemplateNode[];
    location: SourceLocation;
  } | null {
    this.skipWhitespace();
    const start = this.cursor.position;
    this.consume('(');

    const scan = scanBalanced(this.cursor, '(', ')');
    if (scan.unterminated) {
      this.error("Unterminated @if condition: expected ')'", scan.start);
    }
    const condition = this.parseSubExpression(
      scan.source,
      scan.start,
      'if condition'
    );

    this.skipWhitespace();
    this.consume('{');
    const body = this.parseBlockBody();
    this.consume('}');

    return {
      condition: condition ?? this.nilExpression(scan.start),
      body,
      location: this.locFrom(start),
    };
  }

  private parseBlockBody(): TemplateNode[] {
    const body: TemplateNode[] = [];
    this.blockDepth += 1;
    try {
      while (!this.cursor.isAtEnd() && this.cursor.peek() !== '}') {
        const before = this.cursor.offset;
        const node = this.parseNode();
        if (node) {
          body.push(node);
        } else if (this.cursor.offset === before) {
          break;
        }
      }
      return body;
    } finally {
      this.blockDepth -= 1;
    }
  }

  private parseFor(start: Position): TemplateNode {
    this.skipWhitespace();
    this.consume('(');

    const item = this.parsePlainIdentifier();
    if (item === '') {
      this.error('Expected an item variable name in @for');
    }
    this.skipWhitespace();

    let index: string | undefined;
    if (this.cursor.peek() === ',') {
      this.cursor.advance();
      this.skipWhitespace();
      index = this.parsePlainIdentifier();
      if (index === '') this.error('Expected an index variable name in @for');
      this.skipWhitespace();
    }

    const ofKeyword = this.parsePlainIdentifier();
    let iterationType: 'of' | 'in' = 'of';
    if (ofKeyword === 'in') {
      iterationType = 'in';
    } else if (ofKeyword !== 'of') {
      this.error(`Expected 'of' or 'in' in @for directive, got '${ofKeyword}'`);
    }

    this.skipWhitespace();

    const scan = scanBalanced(this.cursor, '(', ')');
    if (scan.unterminated) {
      this.error("Unterminated @for header: expected ')'", scan.start);
    }

    const split = splitLoopKey(scan.source);
    const iterable = this.parseSubExpression(
      split.iterable,
      scan.start,
      'for iterable'
    );

    let key: ExprAst | undefined;
    if (split.key !== null) {
      const keyStart = advancePosition(
        scan.start,
        scan.source.slice(0, split.keyOffset)
      );
      key =
        this.parseSubExpression(split.key, keyStart, 'for key') ?? undefined;
    }

    this.skipWhitespace();
    this.consume('{');
    const body = this.parseBlockBody();
    this.consume('}');

    return ast.node.forLoop({
      itemVar: item,
      indexVar: index === '' ? undefined : index,
      itemsExpr: iterable ?? this.nilExpression(scan.start),
      key,
      iterationType,
      body,
      location: this.locFrom(start),
    });
  }

  private parseMatch(start: Position): TemplateNode {
    this.skipWhitespace();
    this.consume('(');

    const scan = scanBalanced(this.cursor, '(', ')');
    if (scan.unterminated) {
      this.error("Unterminated @match value: expected ')'", scan.start);
    }
    const value = this.parseSubExpression(
      scan.source,
      scan.start,
      'match value'
    );

    this.skipWhitespace();
    this.consume('{');

    const cases: MatchCase[] = [];
    let defaultCase: TemplateNode[] | undefined;

    while (!this.cursor.isAtEnd() && this.cursor.peek() !== '}') {
      this.skipWhitespace();
      if (this.cursor.peek() === '}') break;

      const before = this.cursor.offset;
      const matchCase = this.parseMatchCase();
      if (matchCase) {
        if ('isDefault' in matchCase) {
          defaultCase = matchCase.body;
        } else {
          cases.push(matchCase);
        }
      } else if (this.cursor.offset === before) {
        this.error('Failed to parse match case');
        break;
      }

      this.skipWhitespace();
    }
    this.consume('}');

    return ast.node.match({
      value: value ?? this.nilExpression(scan.start),
      cases,
      defaultCase,
      location: this.locFrom(start),
    });
  }

  private parseMatchCase():
    | MatchCase
    | { isDefault: true; body: TemplateNode[] }
    | null {
    const start = this.cursor.position;

    // Default case: * { ... }
    if (this.cursor.peek() === '*') {
      this.cursor.advance();
      this.skipWhitespace();
      this.consume('{');
      const body = this.parseBlockBody();
      this.consume('}');
      return { isDefault: true, body };
    }

    // Expression case: _ > 100 { ... }
    if (this.cursor.peek() === '_') {
      const scan = scanValue(this.cursor, '{');
      if (scan.unterminated) {
        this.error("Unterminated match case: expected '{'", scan.start);
        return null;
      }

      const condition = this.parseSubExpression(
        scan.source,
        scan.start,
        'match case expression'
      );

      this.consume('{');
      const body = this.parseBlockBody();
      this.consume('}');

      if (!condition) return null;

      return ast.match.expression(condition, body, this.locFrom(start));
    }

    // Literal case: when "a", 1, true { ... }
    if (!this.cursor.matchKeyword('when')) {
      const found = this.parseIdentifier();
      this.error(
        `Expected 'when', '_', or '*' in match case, got '${found === '' ? this.cursor.peek() : found}'`,
        start
      );
      return null;
    }

    this.skipWhitespace();

    const values: (string | number | boolean)[] = [];
    for (;;) {
      this.skipWhitespace();

      if (this.cursor.peek() === '"' || this.cursor.peek() === "'") {
        values.push(this.readQuotedValue('match case value').value);
      } else if (
        isDigitChar(this.cursor.peek()) ||
        (this.cursor.peek() === '-' && isDigitChar(this.cursor.peek(1)))
      ) {
        const numberStart = this.cursor.position;
        if (this.cursor.peek() === '-') this.cursor.advance();
        while (isDigitChar(this.cursor.peek())) this.cursor.advance();
        if (this.cursor.peek() === '.') {
          this.cursor.advance();
          while (isDigitChar(this.cursor.peek())) this.cursor.advance();
        }
        values.push(parseFloat(this.cursor.textFrom(numberStart)));
      } else if (this.cursor.matchKeyword('true')) {
        values.push(true);
      } else if (this.cursor.matchKeyword('false')) {
        values.push(false);
      } else {
        this.error(
          `Expected a literal value in match case, got '${this.cursor.peek()}'`
        );
        break;
      }

      this.skipWhitespace();
      if (this.cursor.peek() === ',') {
        this.cursor.advance();
        continue;
      }
      break;
    }

    this.skipWhitespace();
    this.consume('{');
    const body = this.parseBlockBody();
    this.consume('}');

    return ast.match.literal(values, body, this.locFrom(start));
  }

  private parseLet(
    start: Position,
    options?: { inCodeBlock?: boolean }
  ): TemplateNode {
    this.skipWhitespace();

    // Global assignment: @let $.name = expr
    const isGlobal = this.cursor.peek() === '$' && this.cursor.peek(1) === '.';
    if (isGlobal) this.cursor.advanceBy(2);

    const name = this.parsePlainIdentifier();
    if (name === '') this.error('Expected a variable name after @let');

    this.skipWhitespace();
    this.consume('=');
    this.skipWhitespace();

    // In a code block only a semicolon ends the declaration, so a value may
    // span lines. Outside one, a newline ends it too - and inside a directive
    // block, so does the brace that closes the block, which is the only thing
    // that ends `@if($a) { @let x = 1 }`.
    const terminators = options?.inCodeBlock
      ? ';'
      : this.blockDepth > 0
        ? ';\n}'
        : ';\n';
    const scan = scanValue(this.cursor, terminators);
    if (this.cursor.peek() === ';') this.cursor.advance();

    const value = this.parseSubExpression(scan.source, scan.start, 'let value');

    return ast.node.letNode({
      name,
      value: value ?? this.nilExpression(scan.start),
      isGlobal,
      location: this.locFrom(start),
    });
  }

  private parseCodeBlock(start: Position): TemplateNode {
    this.skipWhitespace();
    this.consume('{');

    const statements: TemplateNode[] = [];

    while (!this.cursor.isAtEnd() && this.cursor.peek() !== '}') {
      const before = this.cursor.offset;
      this.skipWhitespace();

      if (this.cursor.peek() === '}') break;

      const statementStart = this.cursor.position;
      if (this.cursor.matchKeyword('let')) {
        statements.push(this.parseLet(statementStart, { inCodeBlock: true }));
      } else {
        this.error("Expected a 'let' declaration in @@ block", statementStart);
        // Skip the statement without swallowing the block's closing brace.
        scanValue(this.cursor, ';\n}');
        if (this.cursor.peek() === ';') this.cursor.advance();
      }

      this.skipWhitespace();

      if (this.cursor.offset === before) {
        this.error(
          `Unable to parse @@ block content at '${this.cursor.peek()}'`
        );
        break;
      }
    }

    this.consume('}');

    const only = statements[0];
    if (statements.length === 1 && only) return only;

    return ast.node.fragment(statements, this.locFrom(start));
  }

  /**
   * `@props(label, disabled = false, onClick?)`
   *
   * A directive like any other, parsed by this parser into this AST. The
   * declarations are also collected for {@link TemplateParseOutput.props}.
   */
  private parseProps(start: Position): TemplateNode | null {
    this.skipWhitespace();

    if (this.cursor.peek() !== '(') {
      this.error("Expected '(' after @props");
      return null;
    }
    this.cursor.advance();

    const declarations: PropDeclaration[] = [];

    for (;;) {
      this.skipWhitespace();

      if (this.cursor.isAtEnd()) {
        this.error("Expected ')' to close @props", start);
        break;
      }

      if (this.cursor.peek() === ')') {
        this.cursor.advance();
        break;
      }

      const declaration = this.parsePropDeclaration();
      if (!declaration) {
        this.skipToEndOfProps();
        break;
      }
      declarations.push(declaration);

      this.skipWhitespace();
      if (this.cursor.peek() === ',') {
        this.cursor.advance();
        continue;
      }
      if (this.cursor.peek() === ')') {
        this.cursor.advance();
        break;
      }

      this.error(`Expected ',' or ')' in @props`);
      this.skipToEndOfProps();
      break;
    }

    if (this.propsDeclared) {
      this.error('Duplicate @props directive', start);
    } else {
      this.propsDeclared = true;
      this.propDeclarations.push(...declarations);
    }

    return ast.node.props({
      props: declarations.map(declaration => ({ ...declaration })),
      location: this.locFrom(start),
    });
  }

  private parsePropDeclaration(): PropDeclaration | null {
    const start = this.cursor.position;
    const name = this.parsePlainIdentifier();

    if (name === '') {
      this.error('Expected a prop name');
      return null;
    }

    const optional = this.cursor.peek() === '?';
    if (optional) this.cursor.advance();

    this.skipWhitespace();

    if (this.cursor.peek() !== '=') {
      return {
        name,
        required: !optional,
        defaultValue: undefined,
        location: this.locFrom(start),
      };
    }

    this.cursor.advance(); // =
    this.skipWhitespace();

    const scan = scanValue(this.cursor, ',)\n');
    if (scan.source.trim() === '') {
      this.error(
        `Expected a default value expression for prop '${name}'`,
        scan.start
      );
      return null;
    }

    const defaultValue = this.parseSubExpression(
      scan.source,
      scan.start,
      `default value for prop '${name}'`
    );
    if (!defaultValue) return null;

    return {
      name,
      required: false,
      defaultValue,
      location: this.locFrom(start),
    };
  }

  private skipToEndOfProps(): void {
    scanValue(this.cursor, ')');
    if (this.cursor.peek() === ')') this.cursor.advance();
  }

  // ===========================================================================
  // Expression sub-parsing
  // ===========================================================================

  /**
   * Parses an expression sliced out of the template.
   *
   * Every embedded expression goes through here, and here is the only place
   * that decides what happens to the result: the sub-parser's errors are always
   * reported, and a failure to produce a value is reported with the context it
   * failed in. Fourteen of the seventeen call sites used to check
   * `if (result.value)` and throw the errors away, so `<div class={$a $b}>`
   * compiled clean with the attribute silently truncated to `$a`.
   *
   * The slice's absolute position is passed as the sub-parser's base, so every
   * location it produces indexes the whole document.
   */
  private parseSubExpression(
    source: string,
    start: Position,
    context: string
  ): ExprAst | null {
    const parser = new ExpressionParser(source, {
      maxExpressionDepth: this.options.maxExpressionDepth,
      basePosition: start,
    });
    const result = parser.parse();

    this.errors.push(...result.errors);

    if (!result.value) {
      this.error(`Invalid ${context}`, start);
      return null;
    }

    return result.value;
  }

  /** A stand-in for an expression that failed to parse. */
  private nilExpression(at: Position): ExprAst {
    return ast.expr.literal(null, this.locBetween(at, at), 'nil');
  }

  /**
   * Scans `$path`, `$.global.path` or `$items[0].name` at the cursor.
   *
   * A trailing `.` or an unclosed `[` is left unconsumed - `Hello $name.` ends
   * a sentence, and taking the full stop into the expression made the whole
   * interpolation fail to parse and disappear from the output.
   */
  private scanSimpleExpression(): { source: string; start: Position } {
    const start = this.cursor.position;
    this.cursor.advance(); // $
    this.scanPathAfterDollar();
    return { source: this.cursor.textFrom(start), start };
  }

  /** Consumes an optional leading `.` and then a path. */
  private scanPathAfterDollar(): void {
    if (this.cursor.peek() === '.') this.cursor.advance();

    while (isIdentifierPart(this.cursor.peek())) this.cursor.advance();

    for (;;) {
      const mark = this.cursor.position;

      if (this.cursor.peek() === '.') {
        this.cursor.advance();
        if (!isIdentifierPart(this.cursor.peek())) {
          this.cursor.seek(mark);
          return;
        }
        while (isIdentifierPart(this.cursor.peek())) this.cursor.advance();
        continue;
      }

      if (this.cursor.peek() === '[') {
        this.cursor.advance();
        if (this.cursor.peek() === '*') {
          this.cursor.advance();
        } else {
          while (isDigitChar(this.cursor.peek())) this.cursor.advance();
        }
        if (this.cursor.peek() !== ']') {
          this.cursor.seek(mark);
          return;
        }
        this.cursor.advance();
        continue;
      }

      return;
    }
  }

  // ===========================================================================
  // Lexical helpers
  // ===========================================================================

  /**
   * Reads a quoted value, decoding its escapes through the one decoder every
   * Blade parser shares.
   *
   * There used to be three quoted-value scanners with three different ideas of
   * a backslash: one deleted it, two kept it, none decoded it.
   */
  private readQuotedValue(context: string): {
    value: string;
    start: Position;
    end: Position;
  } {
    const quote = this.cursor.advance(); // opening quote
    const start = this.cursor.position;

    while (!this.cursor.isAtEnd() && this.cursor.peek() !== quote) {
      if (this.cursor.peek() === '\\') {
        this.cursor.advance();
        if (!this.cursor.isAtEnd()) this.cursor.advance();
        continue;
      }
      this.cursor.advance();
    }

    const end = this.cursor.position;
    const raw = this.cursor.textBetween(start, end);

    if (this.cursor.peek() === quote) {
      this.cursor.advance();
    } else {
      this.error(`Unterminated ${context}: expected a closing ${quote}`, start);
    }

    const decoded = decodeStringEscapes(raw, start);
    this.errors.push(...decoded.errors);

    return { value: decoded.value, start, end };
  }

  /** The identifier following an `@`, or '' when there is none. */
  private identifierAfterAt(): string {
    if (!isAlphaChar(this.cursor.peek(1))) return '';
    let length = 2;
    while (isIdentifierPart(this.cursor.peek(length))) length += 1;
    return this.cursor.peekAhead(length).slice(1);
  }

  /** Whether the cursor is on the end tag of `tag`, whatever its case. */
  private atEndTagFor(tag: string): boolean {
    const closing = this.peekClosingTagName();
    return closing !== null && this.sameTag(tag, closing);
  }

  /**
   * Whether an end tag closes an element opened as `expected`.
   *
   * HTML tag names are ASCII case-insensitive - `</STYLE>` closes `<style>`.
   * Component names are not: `Card` and `card` are different components, and
   * `<template:Card>` names one of them.
   */
  private sameTag(expected: string, actual: string): boolean {
    if (expected === actual) return true;
    if (this.isComponentTag(expected)) return false;
    return expected.toLowerCase() === actual.toLowerCase();
  }

  /** The name an open element is recorded under on the open-element stack. */
  private tagKey(tag: string): string {
    return this.isComponentTag(tag) ? tag : tag.toLowerCase();
  }

  /**
   * Index of the innermost open element that `closingName` closes, or -1.
   *
   * Stack entries are already normalised by {@link tagKey}, so an exact match
   * covers component names and a lower-cased match covers HTML names.
   */
  private openIndexOf(closingName: string): number {
    const exact = this.openElements.lastIndexOf(closingName);
    if (exact >= 0) return exact;
    return this.openElements.lastIndexOf(closingName.toLowerCase());
  }

  /** Whether the tag names a component rather than an HTML element. */
  private isComponentTag(tag: string): boolean {
    const first = tag[0];
    return (
      (first !== undefined && first >= 'A' && first <= 'Z') ||
      tag.startsWith('template:')
    );
  }

  /** The tag name of the closing tag at the cursor, or null if there is none. */
  private peekClosingTagName(): string | null {
    if (this.cursor.peek() !== '<' || this.cursor.peek(1) !== '/') return null;
    let length = 2;
    while (this.isTagNameChar(this.cursor.peek(length))) length += 1;
    return this.cursor.peekAhead(length).slice(2);
  }

  /** The tag name of the start tag at the cursor, or null if there is none. */
  private peekStartTagName(): string | null {
    if (this.cursor.peek() !== '<') return null;
    if (!isAlphaChar(this.cursor.peek(1))) return null;
    let length = 2;
    while (this.isTagNameChar(this.cursor.peek(length))) length += 1;
    return this.cursor.peekAhead(length).slice(1);
  }

  private isTagNameChar(char: string): boolean {
    return (
      isIdentifierPart(char) || char === '-' || char === ':' || char === '.'
    );
  }

  /** Reads a tag, attribute or prop name. */
  private parseIdentifier(allowDots = false): string {
    const start = this.cursor.position;
    while (
      isIdentifierPart(this.cursor.peek()) ||
      this.cursor.peek() === '-' ||
      this.cursor.peek() === ':' ||
      (allowDots && this.cursor.peek() === '.')
    ) {
      this.cursor.advance();
    }
    return this.cursor.textFrom(start);
  }

  /** Reads a variable-style identifier: `[A-Za-z_][A-Za-z0-9_]*`. */
  private parsePlainIdentifier(): string {
    if (!isAlphaChar(this.cursor.peek())) return '';
    const start = this.cursor.position;
    while (isIdentifierPart(this.cursor.peek())) this.cursor.advance();
    return this.cursor.textFrom(start);
  }

  private skipWhitespace(): void {
    while (!this.cursor.isAtEnd() && isWhitespaceChar(this.cursor.peek())) {
      this.cursor.advance();
    }
  }

  private consume(expected: string): void {
    if (this.cursor.peek() !== expected) {
      this.error(`Expected '${expected}' but got '${this.cursor.peek()}'`);
      return;
    }
    this.cursor.advance();
  }

  private error(message: string, at: Position = this.cursor.position): void {
    this.errors.push({
      message,
      line: at.line,
      column: at.column,
      offset: at.offset,
    });
  }

  private locFrom(start: Position): SourceLocation {
    return this.locBetween(start, this.cursor.position);
  }

  private locBetween(start: Position, end: Position): SourceLocation {
    return ast.location(start, end);
  }
}

// =============================================================================
// Header shapes
// =============================================================================

/**
 * The event an `on:` attribute name binds, or null if it is an ordinary name.
 *
 * `on:` is matched case-insensitively because HTML attribute names are, but
 * everything after it is kept exactly as written: a custom event's name is
 * case-sensitive, and `on:myEvent` and `on:myevent` are different events.
 *
 * `on:` with nothing after it returns the empty string rather than null, so
 * that the validator can say what is wrong with it instead of the parser
 * silently treating it as an attribute called `on:`.
 *
 * @param name - Attribute name as written
 */
function eventBindingName(name: string): string | null {
  return /^on:/i.test(name) ? name.slice(3) : null;
}

/** A `@for` header's tail, split at the `key` keyword. */
interface LoopKeySplit {
  /** Source of the iterable expression. */
  readonly iterable: string;
  /** Source of the key expression, or null when the header has no key. */
  readonly key: string | null;
  /** Where the key's source begins within the header, for its coordinates. */
  readonly keyOffset: number;
}

/**
 * Splits `rows key row.id` into the iterable and the key.
 *
 * `key` is a keyword only where a keyword can go: at the top level of the
 * header, delimited by whitespace, and with an expression already read before
 * it. That last condition is what keeps `@for(x of key)` iterating a field
 * called `key` - there is nothing before the word for it to be a key *of* -
 * and the depth and string tracking keep `items["key"]` and `pick(a, key)`
 * out of it.
 *
 * @param source - Everything between the header's parentheses, after `of`/`in`
 */
function splitLoopKey(source: string): LoopKeySplit {
  const NONE: LoopKeySplit = { iterable: source, key: null, keyOffset: 0 };
  let depth = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;

    if (char === '"' || char === "'") {
      i = skipQuoted(source, i);
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      continue;
    }
    if (depth !== 0 || char !== 'k') continue;
    if (source.slice(i, i + 3) !== 'key') continue;

    const before = source[i - 1];
    const after = source[i + 3];
    if (before === undefined || !isWhitespaceChar(before)) continue;
    if (after !== undefined && !isWhitespaceChar(after)) continue;
    // Nothing to be the key of: the word is the iterable itself.
    if (source.slice(0, i).trim() === '') continue;

    return {
      iterable: source.slice(0, i),
      key: source.slice(i + 3),
      keyOffset: i + 3,
    };
  }

  return NONE;
}

/**
 * The index of the closing quote of the string literal starting at `start`.
 *
 * Returns the last index of the source when the literal is unterminated, which
 * ends the scan - an unterminated string is a diagnostic the expression parser
 * will raise with a better message than this function could.
 */
function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i += 1;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return source.length;
}
