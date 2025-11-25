// Compiler module

import type { CompiledTemplate } from '../ast/types.js';
import * as ast from '../ast/builders.js';

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
  source: string,
  _options?: CompileOptions
): Promise<CompiledTemplate> {
  // TODO: Implement full compilation with parser
  // For now, return a minimal AST structure to make tests fail gracefully

  const location = ast.loc({
    line: 1,
    column: 1,
    offset: 0,
    endLine: 1,
    endColumn: source.length + 1,
    endOffset: source.length,
  });

  const rootNode = ast.root.node({
    children: [], // Empty children for now
    components: new Map(),
    metadata: ast.root.metadata({
      globalsUsed: [],
      pathsAccessed: [],
      helpersUsed: [],
      componentsUsed: [],
    }),
    location,
  });

  return {
    root: rootNode,
    diagnostics: [],
  };
}
