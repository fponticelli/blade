// Evaluator module
// TODO: Implement expression evaluation

import type { ExprAst } from '../ast/types.js';

export interface Scope {
  locals: Record<string, unknown>;
  data: unknown;
  globals: Record<string, unknown>;
}

export interface EvaluationContext {
  scope: Scope;
  helpers: HelperRegistry;
  config: EvaluatorConfig;
}

export interface HelperRegistry {
  [name: string]: HelperFunction;
}

export type HelperFunction = (
  scope: Scope
) => (...args: unknown[]) => unknown;

export interface HelperFunctionWithMetadata {
  fn: HelperFunction;
  metadata?: {
    op?: 'format' | 'aggregate' | 'calculated' | 'system';
    label?: string;
  };
}

export interface EvaluatorConfig {
  maxFunctionDepth: number;
  maxRecursionDepth: number;
}

export function evaluate(
  _expr: ExprAst,
  _context: EvaluationContext
): unknown {
  // TODO: Implement expression evaluation
  throw new Error('Not implemented');
}
