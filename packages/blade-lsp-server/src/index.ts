/**
 * Blade Language Server Protocol Module
 * Public exports for the LSP functionality
 */

// Types
export type {
  BladeDocument,
  DocumentScope,
  ScopeSegment,
  ScopeVariable,
  NestingSite,
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
  TraceLevel,
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

// Line index
export {
  createLineIndex,
  offsetAt,
  positionAt,
  lineStartAt,
  lineEnd,
} from './line-index.js';

export type { LineIndex, LinePosition } from './line-index.js';

// Document management
export {
  createDocument,
  updateDocument,
  parseDocument,
  offsetOfPosition,
  positionOfOffset,
  getWordAtOffset,
  getPathAtOffset,
  createDebouncer,
  DocumentManager,
} from './document.js';

export type { ParseDocumentOptions, WordInfo, PathInfo } from './document.js';

// Analyzers
export {
  analyzeScope,
  getVariablesAtOffset,
  findVariableDefinition,
  findVariableAtOffset,
  findVariableByName,
  isVariableUsed,
} from './analyzer/scope.js';

export {
  resolveContext,
  isInsidePropsDirective,
  innermostNodeAt,
  definitionAt,
  partialTokenAt,
} from './analyzer/context.js';

export type { PositionContext, DirectiveContext } from './analyzer/context.js';

export { WorkspaceManager } from './analyzer/workspace.js';

// Logging
export { Logger, silentSink } from './logger.js';
export type { LogSink } from './logger.js';

// JSON source positions
export { indexJsonPaths, locateJsonPath, ROOT_PATH } from './json-source.js';
export type { JsonSpan } from './json-source.js';

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
  validateDeclaredProps,
  generatePropsValidationDiagnostics,
} from './providers/diagnostic.js';

export type {
  LspDiagnostic,
  DiagnosticOptions,
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

export type {
  CompletionItem,
  CompletionOptions,
} from './providers/completion.js';

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
  ProjectContextCache,
  getProjectSchemaCompletions,
  getProjectComponent,
  getAllProjectComponents,
  getProjectSampleValues,
  getProjectSampleHint,
} from './project-context.js';

export type {
  ProjectLspContext,
  ProjectContextOptions,
} from './project-context.js';

// Protocol surface
export {
  createInitializeResult,
  clientCapabilityFlags,
  readConfig,
} from './protocol.js';

export type { ClientCapabilityFlags } from './protocol.js';

// The service: everything the server does, minus the protocol.
export {
  BladeLanguageService,
  parseHelperDefinitions,
  toFilePath,
} from './service.js';

export type { LanguageServiceHost } from './service.js';
