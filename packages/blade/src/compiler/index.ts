// Compiler module
// TODO: Implement template compilation

import type { CompiledTemplate } from '../ast/types.js';

export interface CompileOptions {
  loader?: TemplateLoader;
  maxLoadDepth?: number;
  validate?: boolean;
  strict?: boolean;
  includeSourceMap?: boolean;
  includeMetadata?: boolean;
  maxExpressionDepth?: number;
  maxFunctionDepth?: number;
}

export interface TemplateLoader {
  load(name: string): Promise<CompiledTemplate> | CompiledTemplate;
}

export async function compile(
  _source: string,
  _options?: CompileOptions
): Promise<CompiledTemplate> {
  // TODO: Implement compilation
  throw new Error('Not implemented');
}
