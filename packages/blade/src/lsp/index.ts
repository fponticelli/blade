/**
 * Blade Language Server Protocol Module
 * Public exports for the LSP functionality
 */

// Types
export type {
  BladeDocument,
  DocumentScope,
  ScopeVariable,
  ComponentInfo,
  PropInfo,
  SlotInfo,
  ComponentUsage,
  HelperCall,
  WorkspaceIndex,
  HelperDefinition,
  DataSchema,
  SchemaProperty,
  LspConfig,
  DiagnosticConfig,
  CompletionConfig,
  PerformanceConfig,
  DiagnosticSeverity,
  CompletionContext,
  CompletionContextKind,
  Position,
  Range,
  DiagnosticInfo,
  LspDiagnosticSeverity,
  RelatedInfo,
  QuickFix,
  TextEdit,
  DiagnosticCode,
} from './types.js';

export {
  DEFAULT_LSP_CONFIG,
  createEmptyScope,
  createWorkspaceIndex,
} from './types.js';

// Document management
export {
  createDocument,
  updateDocument,
  parseDocument,
  getOffset,
  getPosition,
  getWordAtOffset,
  getPathAtOffset,
  isInsideExpression,
  isAfterDirective,
  isInsideTag,
  createDebouncer,
  DocumentManager,
} from './document.js';

// Analyzers
export {
  analyzeScope,
  getVariablesAtOffset,
  findVariableDefinition,
  findVariableUsages,
  isVariableUsed,
  getNestingDepthAtOffset,
} from './analyzer/scope.js';

export { WorkspaceManager } from './analyzer/workspace.js';

// Providers
export {
  parseErrorToDiagnostic,
  generateDiagnostics,
  severityFromString,
  isHelperDeprecated,
  generateDeprecatedHelperDiagnostics,
  LspDiagnosticSeverityEnum,
  validateSamples,
  getProjectDiagnostics,
  validatePropsAgainstSchema,
  generatePropsValidationDiagnostics,
} from './providers/diagnostic.js';

export type {
  LspDiagnostic,
  SampleValidationResult,
  SampleValidationError,
  PropsValidationError,
} from './providers/diagnostic.js';

// Completion provider
export {
  getCompletionContext,
  getCompletions,
  CompletionItemKind,
} from './providers/completion.js';

export type { CompletionItem } from './providers/completion.js';

// Definition provider
export {
  findDefinition,
  findReferences,
  getComponentDefinition,
} from './providers/definition.js';

export type { DefinitionLocation } from './providers/definition.js';

// Hover provider
export { getHoverInfo } from './providers/hover.js';

export type { HoverInfo } from './providers/hover.js';

// Project context
export {
  initializeProjectContext,
  getProjectSchemaCompletions,
  getProjectComponent,
  getAllProjectComponents,
  shouldRefreshContext,
  refreshProjectContext,
  getProjectSampleValues,
  getProjectSampleHint,
} from './project-context.js';

export type { ProjectLspContext } from './project-context.js';
