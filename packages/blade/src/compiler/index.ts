// Compiler module

import type { CompiledTemplate } from '../ast/types.js';
import * as ast from '../ast/builders.js';
import { parseTemplate } from '../parser/index.js';

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
  // Parse the template
  const parseResult = parseTemplate(source);

  const location = ast.loc({
    line: 1,
    column: 1,
    offset: 0,
    endLine: 1,
    endColumn: source.length + 1,
    endOffset: source.length,
  });

  const rootNode = ast.root.node({
    children: parseResult.value,
    components: new Map(),
    metadata: ast.root.metadata({
      globalsUsed: [],
      pathsAccessed: [],
      helpersUsed: [],
      componentsUsed: [],
    }),
    location,
  });

  // Convert parse errors to diagnostics
  const diagnostics = parseResult.errors.map(err => ({
    level: 'error' as const,
    message: err.message,
    location: ast.loc({
      line: err.line,
      column: err.column,
      offset: err.offset,
    }),
  }));

  return {
    root: rootNode,
    diagnostics,
  };
}
