// Parser module

import type { ExprAst, TemplateNode } from '../ast/types.js';
import { ExpressionParser } from './expression-parser.js';
import { TemplateParser } from './template-parser.js';

export interface ParseResult<T> {
  value: T;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
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

export function parseTemplate(source: string): ParseResult<TemplateNode[]> {
  const parser = new TemplateParser(source);
  const result = parser.parse();

  return {
    value: result.nodes,
    errors: result.errors,
  };
}
