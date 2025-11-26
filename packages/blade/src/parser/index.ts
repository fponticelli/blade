// Parser module

import type {
  ExprAst,
  TemplateNode,
  ComponentDefinition,
} from '../ast/types.js';
import { ExpressionParser } from './expression-parser.js';
import { TemplateParser } from './template-parser.js';

export interface ParseResult<T> {
  value: T;
  errors: ParseError[];
}

export interface TemplateParseResult {
  value: TemplateNode[];
  errors: ParseError[];
  components: Map<string, ComponentDefinition>;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

export interface ParseOptions {
  maxExpressionDepth?: number;
}

export function parseExpression(source: string): ParseResult<ExprAst> {
  const parser = new ExpressionParser(source);
  const result = parser.parse();

  if (result.value === null) {
    throw new Error('Failed to parse expression');
  }

  return {
    value: result.value,
    errors: result.errors,
  };
}

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
  };
}
