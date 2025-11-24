// Parser module
// TODO: Implement template and expression parsing

import type { ExprAst, TemplateNode } from '../ast/types.js';

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

export function parseExpression(_source: string): ParseResult<ExprAst> {
  // TODO: Implement expression parsing
  throw new Error('Not implemented');
}

export function parseTemplate(_source: string): ParseResult<TemplateNode[]> {
  // TODO: Implement template parsing
  throw new Error('Not implemented');
}
