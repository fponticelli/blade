// Parser module

import type { ExprAst, TemplateNode } from '../ast/types.js';
import { ExpressionParser } from './expression-parser.js';

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

export function parseTemplate(_source: string): ParseResult<TemplateNode[]> {
  // TODO: Implement full template parsing
  throw new Error('Not implemented');
}
