// Parser module

import type {
  ExprAst,
  TemplateNode,
  ComponentDefinition,
  PropDeclaration,
} from '../ast/types.js';
import { ExpressionParser } from './expression-parser.js';
import type { ExpressionParserOptions } from './expression-parser.js';
import { TemplateParser } from './template-parser.js';

// The one definition of what a backslash means in Blade source.
export { decodeStringEscapes } from './string-escapes.js';
export type { DecodedString } from './string-escapes.js';
export type { Position } from './position.js';
export { START_POSITION } from './position.js';
export type { ExpressionParserOptions } from './expression-parser.js';

// The parser's own nesting limit, for callers that want to raise or lower it.
export { DEFAULT_MAX_NODE_DEPTH } from './template-parser.js';

export interface ParseResult<T> {
  value: T;
  errors: ParseError[];
}

export interface TemplateParseResult {
  value: TemplateNode[];
  errors: ParseError[];
  components: Map<string, ComponentDefinition>;
  /** Props declared by the template's `@props()` directive, in source order. */
  props: PropDeclaration[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

export interface ParseOptions {
  /** Maximum nesting depth of an embedded expression. */
  maxExpressionDepth?: number;
  /** Maximum nesting depth of template nodes. */
  maxNodeDepth?: number;
}

/**
 * Parses a standalone expression.
 *
 * Never throws: an expression that cannot be parsed comes back as
 * `{ value: null, errors }`.
 *
 * @param source - The expression source
 * @param options - Parser limits, and the absolute position `source` was
 *   sliced from when it is part of a larger document
 */
export function parseExpression(
  source: string,
  options?: ExpressionParserOptions
): ParseResult<ExprAst | null> {
  const parser = new ExpressionParser(source, options);
  const result = parser.parse();

  return {
    value: result.value,
    errors: result.errors,
  };
}

/**
 * Parses a template.
 *
 * Never throws: every malformed input comes back as a partial AST plus errors.
 *
 * @param source - The template source
 * @param options - Parser limits
 */
export function parseTemplate(
  source: string,
  options?: ParseOptions
): TemplateParseResult {
  const parser = new TemplateParser(source, options);
  const result = parser.parse();

  return {
    value: result.nodes,
    errors: result.errors,
    components: result.components,
    props: result.props,
  };
}
