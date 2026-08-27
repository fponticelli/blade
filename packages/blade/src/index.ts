// Blade - Sharp templates for modern apps
//
// The default entry, and the runtime-neutral one: compile a template, evaluate
// expressions, render to a string or to the DOM. Nothing reachable from here
// touches `fs`, `path` or `url`, so this module loads unchanged on Cloudflare
// Workers, Vercel Edge, Deno Deploy and in a browser bundle.
//
// That property is mechanical, not aspirational. `scripts/check-bundles.mjs`
// asserts that the built `dist/index.js` imports no Node built-in, and CI runs
// it as a blocking job. The entry used to `export * as project` from a module
// that reads the filesystem, which put `import "fs"` on the first line of the
// bundle and made `import { compile } from '@bladets/template'` - the first
// example in the README - fail to load on every one of those platforms.
//
// The filesystem-backed project API now lives at `@bladets/template/node`.
//
// Every export below is named, deliberately. Both entries were `export *`
// barrels over every module in `src`, which published 348 declarations with no
// line between API and implementation: renaming an internal helper was a
// breaking change, and two byte-identical `sourceAttributeName`s were both
// public for long enough to drift into separate call sites. The checked-in
// `api/*.api.md` reports pin this list; `scripts/api-surface.mjs` regenerates
// them and `tests/api-surface.test.ts` fails when the surface moves without
// the report moving with it.

// =============================================================================
// AST
// =============================================================================

export type {
  ArrayNode,
  ArrayWildcardNode,
  AttributeNode,
  BaseNode,
  BinaryNode,
  BinaryOperator,
  CallNode,
  CommentNode,
  CompiledTemplate,
  CompileResult,
  ComponentDefinition,
  ComponentInfo,
  ComponentNode,
  ComponentProp,
  Diagnostic,
  DoctypeNode,
  ElementNode,
  EventAttributeNode,
  ExprAst,
  ExprAttributeNode,
  ExprAttributeValue,
  ForNode,
  FragmentNode,
  FunctionExpr,
  IfBranch,
  IfNode,
  IndexPathItem,
  JsonSchema,
  KeyPathItem,
  LetNode,
  LiteralNode,
  LiteralType,
  MatchCase,
  MatchExpressionCase,
  MatchLiteralCase,
  MatchNode,
  MemberAccessNode,
  MixedAttributeNode,
  PartialTemplate,
  PathItem,
  PathMetadata,
  PathNode,
  ProjectConfig,
  ProjectContext,
  ProjectResult,
  PropDeclaration,
  PropsNode,
  RootNode,
  SlotFillNode,
  SlotNode,
  SourceLocation,
  StarPathItem,
  StaticAttributeNode,
  StaticAttributeValue,
  TemplateMetadata,
  TemplateNode,
  TernaryNode,
  TextNode,
  TextSegment,
  UnaryNode,
  ValidTemplate,
} from './ast/types.js';

// The one traversal every walk in this repository is built on. Public because
// tooling on top of Blade - the language server, a formatter, a linter - needs
// the same total switch over `node.kind` the engine uses, and the alternative
// is each of them writing a partial copy that silently skips new node kinds.
export type { AnyExpr, ExprVisitor, NodeVisitor } from './ast/visitor.js';
export {
  attributeExpressions,
  childrenOf,
  expressionsOf,
  subExpressionsOf,
  walkExpressions,
  walkNodes,
} from './ast/visitor.js';

// =============================================================================
// Parser
// =============================================================================

export type {
  DecodedString,
  ExpressionParserOptions,
  ParseError,
  ParseOptions,
  ParseResult,
  Position,
  TemplateParseResult,
} from './parser/index.js';
export {
  DEFAULT_MAX_NODE_DEPTH,
  START_POSITION,
  decodeStringEscapes,
  parseExpression,
  parseTemplate,
} from './parser/index.js';

// =============================================================================
// Compiler
// =============================================================================

export type { CompileOptions } from './compiler/index.js';
export {
  CompileError,
  DEFAULT_MAX_EXPRESSION_NODES,
  compile,
  compileOrThrow,
} from './compiler/index.js';

// =============================================================================
// Evaluator
// =============================================================================

export type {
  Bindings,
  EvaluationContext,
  EvaluationErrorCode,
  EvaluationTracking,
  EvaluatorConfig,
  HelperFunction,
  HelperLimits,
  HelperRegistry,
  RenderWarning,
  Scope,
} from './evaluator/index.js';
export {
  DEFAULT_EVALUATOR_CONFIG,
  EvaluationError,
  HelperError,
  TemplateFunction,
  callValue,
  createBindings,
  createHelperRegistry,
  evaluate,
  extendBindings,
  hasBinding,
  hasHelper,
  isCallable,
  isReservedPropertyName,
  isTemplateFunction,
} from './evaluator/index.js';

// =============================================================================
// Renderer
// =============================================================================

export type {
  AttributeBinding,
  AttributePart,
  DomRenderResult,
  DomRenderer,
  Dyn,
  DynScope,
  ElementSpec,
  EscapeContext,
  EventBinding,
  Namespace,
  Reactivity,
  RenderConfig,
  RenderContext,
  RenderErrorCode,
  RenderOptions,
  RenderPosition,
  RenderResult,
  RenderStats,
  RenderTarget,
  RenderedAttribute,
  ResourceLimitType,
  ResourceLimits,
  RuntimeMetadata,
  SanitizedUrl,
  SlotContent,
  StringRenderer,
  TargetFactory,
  TemplateEventHandler,
} from './renderer/index.js';
export {
  BLOCKED_URL,
  DEFAULT_RENDER_CONFIG,
  DEFAULT_RESOURCE_LIMITS,
  DomTarget,
  EAGER,
  OutputBudget,
  RenderError,
  ResourceLimitError,
  canonicalAttributeName,
  canonicalTagName,
  compileToString,
  constant,
  createDomRenderer,
  createRenderContext,
  createRenderStats,
  createStringRenderer,
  decodeHtmlText,
  escapeAttributeDelimiter,
  escapeCommentText,
  escapeContextForAttribute,
  escapeContextForElementText,
  escapeCssValue,
  escapeForContext,
  escapeHtmlBody,
  escapeJsString,
  escapeJsonInScript,
  render,
  renderTo,
  sanitizeUrlAttribute,
  serializeJsonForScript,
  StringTarget,
  stripUrlControlCharacters,
  validateSourceTrackingPrefix,
} from './renderer/index.js';

// =============================================================================
// Validation
// =============================================================================

export type {
  ComponentRegistry,
  ComponentSchema,
  PropSchema,
  RenderTargetKind,
  ValidationDiagnostics,
  ValidationOptions,
  ValidationResult,
} from './validation/index.js';
export {
  checkRequiredProps,
  createDiagnostic,
  validateNodes,
  validateTemplate,
} from './validation/index.js';

// =============================================================================
// Standard library helpers
// =============================================================================

export type { DateFormatStyle } from './helpers/index.js';
export {
  MAX_HELPER_STRING_LENGTH,
  MAX_INTL_CACHE_ENTRIES,
  abs,
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  avg,
  capitalize,
  ceil,
  charAt,
  clamp,
  compact,
  concat,
  contains,
  count,
  dateTimeFormatter,
  day,
  defaultHelper,
  diffDays,
  endsWith,
  first,
  flatten,
  floor,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  fromJson,
  hour,
  includes,
  indexOf,
  intlCacheStats,
  isAfter,
  isArray,
  isBefore,
  isBoolean,
  isDefined,
  isEmpty,
  isFiniteHelper,
  isNaNHelper,
  isNull,
  isNumber,
  isString,
  join,
  last,
  len,
  lower,
  lowercase,
  max,
  min,
  minute,
  month,
  now,
  numberFormatter,
  padEnd,
  padStart,
  parseDate,
  pluck,
  pow,
  random,
  randomInt,
  repeat,
  replace,
  resetIntlCaches,
  reverse,
  round,
  second,
  sign,
  slice,
  sort,
  split,
  sqrt,
  standardLibrary,
  startsWith,
  substring,
  sum,
  titlecase,
  toInt,
  toJson,
  toNumber,
  toStringHelper,
  trim,
  trunc,
  truncate,
  typeHelper,
  uncapitalize,
  unique,
  upper,
  uppercase,
  weekday,
  year,
} from './helpers/index.js';

// What each helper is, in machine-readable form: the categories, signatures and
// deprecations the language server completes and hovers from. The renderer
// already reads this table (`producesJsonSource`), so publishing it adds
// nothing to the bundle.
export type { HelperCategory, HelperMetadata } from './helpers/metadata.js';
export { helperMetadata, producesJsonSource } from './helpers/metadata.js';

// =============================================================================
// Source tracking
// =============================================================================

export type {
  BuildSourceExpressionOptions,
  CacheCounts,
  ElementSourceTracking,
  ElementSourceTrackingOptions,
  PathAliases,
  SourceExpression,
  SourceOp,
  SourceOpCategory,
  SourceOpTable,
  SourceTrackingCacheStats,
} from './source-tracking/index.js';
export {
  SOURCE_OP_NONE,
  buildElementSourceTracking,
  buildSourceExpression,
  classifyExpression,
  collectElementExpressions,
  collectPaths,
  componentAliases,
  describeExpression,
  formatSourceNoteValue,
  formatSourceOp,
  formatSourceOpValue,
  formatSourceValue,
  hasAuthoredSource,
  loopAliases,
  resetSourceTrackingCaches,
  resolvePath,
  serializePath,
  sourceAttributeName,
  sourceTrackingCacheStats,
} from './source-tracking/index.js';
