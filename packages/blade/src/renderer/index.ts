// Renderer module
// Template rendering for Blade templates

import type {
  CompiledTemplate,
  SourceLocation,
  TemplateNode,
  ComponentDefinition,
  TextNode,
  ElementNode,
  IfNode,
  ForNode,
  MatchNode,
  LetNode,
  ComponentNode,
  FragmentNode,
  SlotNode,
  CommentNode,
  DoctypeNode,
  AttributeNode,
  ExprAst,
  FunctionExpr,
} from '../ast/types.js';
import type {
  HelperRegistry,
  Scope,
  EvaluatorConfig,
} from '../evaluator/index.js';
import { evaluate } from '../evaluator/index.js';
import type { CompileOptions } from '../compiler/index.js';
import { compile } from '../compiler/index.js';

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error codes for render errors.
 */
export type RenderErrorCode =
  | 'LOOP_NESTING_EXCEEDED'
  | 'ITERATION_LIMIT_EXCEEDED'
  | 'COMPONENT_DEPTH_EXCEEDED'
  | 'UNKNOWN_COMPONENT'
  | 'RENDER_FAILED';

/**
 * Error thrown during template rendering.
 * Includes source location for debugging and error code for categorization.
 */
export class RenderError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code: RenderErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

/**
 * Resource limit types that can be exceeded.
 */
export type ResourceLimitType = 'loopNesting' | 'iterations' | 'componentDepth';

/**
 * Error thrown when a resource limit is exceeded during rendering.
 * Extends RenderError with specific limit information.
 */
export class ResourceLimitError extends RenderError {
  public readonly limitType: ResourceLimitType;
  public readonly current: number;
  public readonly max: number;

  constructor(
    limitType: ResourceLimitType,
    current: number,
    max: number,
    location: SourceLocation
  ) {
    const codeMap: Record<ResourceLimitType, RenderErrorCode> = {
      loopNesting: 'LOOP_NESTING_EXCEEDED',
      iterations: 'ITERATION_LIMIT_EXCEEDED',
      componentDepth: 'COMPONENT_DEPTH_EXCEEDED',
    };

    const messageMap: Record<ResourceLimitType, string> = {
      loopNesting: `Loop nesting depth exceeded: ${current} > ${max}`,
      iterations: `Iteration limit exceeded: ${current} > ${max}`,
      componentDepth: `Component nesting depth exceeded: ${current} > ${max}`,
    };

    super(messageMap[limitType], location, codeMap[limitType]);
    this.name = 'ResourceLimitError';
    this.limitType = limitType;
    this.current = current;
    this.max = max;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * HTML entity map for escaping special characters.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Regex for matching HTML special characters.
 */
const HTML_ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_REGEX, char => HTML_ENTITIES[char]!);
}

// =============================================================================
// Source Tracking Configuration
// =============================================================================

/**
 * Valid HTML attribute name prefix pattern.
 * Must start with letter or underscore, followed by alphanumeric, hyphens, or underscores.
 * Empty string is also valid (handled separately).
 */
const VALID_PREFIX_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Validates that a source tracking prefix produces valid HTML attribute names.
 * Empty string is valid (results in unprefixed attributes like "source", "source-op").
 * Non-empty prefix must start with letter/underscore and contain only alphanumeric,
 * hyphens, and underscores.
 *
 * @param prefix - The prefix to validate
 * @throws Error if the prefix is invalid
 *
 * @example
 * ```typescript
 * validateSourceTrackingPrefix('rd-');        // Valid (default)
 * validateSourceTrackingPrefix('data-track-'); // Valid
 * validateSourceTrackingPrefix('');            // Valid (empty)
 * validateSourceTrackingPrefix('123-');        // Throws error
 * validateSourceTrackingPrefix('my@prefix');   // Throws error
 * ```
 */
export function validateSourceTrackingPrefix(prefix: string): void {
  if (prefix === '') {
    return; // Empty string is valid - results in unprefixed attributes
  }
  if (!VALID_PREFIX_REGEX.test(prefix)) {
    throw new Error(
      `Invalid sourceTrackingPrefix "${prefix}". ` +
        `Prefix must be empty or start with a letter/underscore and contain only alphanumeric characters, hyphens, and underscores.`
    );
  }
}

/**
 * Base attribute names for source tracking.
 */
export type SourceAttributeBase = 'source' | 'source-op' | 'source-note';

/**
 * Generates a source tracking attribute name using the configured prefix.
 *
 * @param prefix - The configured prefix (e.g., 'rd-', 'data-track-', or '')
 * @param base - The base attribute name ('source', 'source-op', or 'source-note')
 * @returns The full attribute name (e.g., 'rd-source', 'data-track-source-op', or 'source')
 *
 * @example
 * ```typescript
 * getSourceAttributeName('rd-', 'source');        // 'rd-source'
 * getSourceAttributeName('data-track-', 'source-op'); // 'data-track-source-op'
 * getSourceAttributeName('', 'source');           // 'source'
 * ```
 */
export function getSourceAttributeName(
  prefix: string,
  base: SourceAttributeBase
): string {
  return prefix + base;
}

// =============================================================================
// Render Options and Configuration
// =============================================================================

export interface RenderOptions {
  globals?: Record<string, unknown>;
  helpers?: HelperRegistry;
  config?: Partial<RenderConfig>;
}

export interface RenderConfig {
  includeComments: boolean;
  includeSourceTracking: boolean;
  preserveWhitespace: boolean;
  htmlEscape: boolean;
  sourceTrackingPrefix: string;
  includeOperationTracking: boolean;
  includeNoteGeneration: boolean;
}

// =============================================================================
// Render Results
// =============================================================================

export interface RenderResult {
  html: string;
  metadata: RuntimeMetadata;
}

export interface DomRenderResult {
  nodes: Node[];
  metadata: RuntimeMetadata;
}

export interface RuntimeMetadata {
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;
  renderTime: number;
  iterationCount: number;
  recursionDepth: number;
}

// =============================================================================
// Resource Limits
// =============================================================================

export interface ResourceLimits {
  maxLoopNesting: number;
  maxIterationsPerLoop: number;
  maxTotalIterations: number;
  maxFunctionCallDepth: number;
  maxExpressionNodes: number;
  maxRecursionDepth: number;
  maxComponentDepth: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxLoopNesting: 5,
  maxIterationsPerLoop: 1000,
  maxTotalIterations: 10000,
  maxFunctionCallDepth: 10,
  maxExpressionNodes: 1000,
  maxRecursionDepth: 50,
  maxComponentDepth: 10,
};

/**
 * Default render configuration.
 */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  includeComments: false,
  includeSourceTracking: false,
  preserveWhitespace: false,
  htmlEscape: true,
  sourceTrackingPrefix: 'rd-',
  includeOperationTracking: false,
  includeNoteGeneration: false,
};

// =============================================================================
// Render Context
// =============================================================================

/**
 * Internal rendering context that tracks state during template rendering.
 * Extends the evaluation context with renderer-specific tracking.
 */
export interface RenderContext {
  // Scope for variable resolution
  scope: Scope;

  // Helper functions
  helpers: HelperRegistry;

  // Evaluator configuration
  evaluatorConfig: EvaluatorConfig;

  // Render configuration
  renderConfig: RenderConfig;

  // Resource limits
  limits: ResourceLimits;

  // Runtime tracking (mutable during render)
  currentLoopNesting: number;
  totalIterations: number;
  componentDepth: number;
  maxRecursionDepthReached: number;

  // Metadata collection (mutable during render)
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;

  // Component context
  components: Map<string, ComponentDefinition>;
  slots: Map<string, readonly TemplateNode[]>;
}

/**
 * Creates a new render context from options and template.
 *
 * @param template - The compiled template
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns A fresh render context
 */
export function createRenderContext(
  template: CompiledTemplate,
  data: unknown,
  options?: RenderOptions & { limits?: Partial<ResourceLimits> }
): RenderContext {
  // Merge config with defaults
  const renderConfig = { ...DEFAULT_RENDER_CONFIG, ...options?.config };

  // Validate source tracking prefix before creating context (fail-fast)
  validateSourceTrackingPrefix(renderConfig.sourceTrackingPrefix);

  const scope: Scope = {
    locals: {},
    data,
    globals: options?.globals ?? {},
  };

  return {
    scope,
    helpers: options?.helpers ?? {},
    evaluatorConfig: {
      maxFunctionDepth:
        options?.limits?.maxFunctionCallDepth ??
        DEFAULT_RESOURCE_LIMITS.maxFunctionCallDepth,
      maxRecursionDepth:
        options?.limits?.maxRecursionDepth ??
        DEFAULT_RESOURCE_LIMITS.maxRecursionDepth,
    },
    renderConfig,
    limits: { ...DEFAULT_RESOURCE_LIMITS, ...options?.limits },
    currentLoopNesting: 0,
    totalIterations: 0,
    componentDepth: 0,
    maxRecursionDepthReached: 0,
    pathsAccessed: new Set(),
    helpersUsed: new Set(),
    components: new Map(template.root.components),
    slots: new Map(),
  };
}

/**
 * Creates a child scope for loop iteration with the item and optional index variables.
 *
 * @param parent - Parent scope
 * @param itemVar - Variable name for the current item
 * @param itemValue - Value of the current item
 * @param indexVar - Optional variable name for the index
 * @param indexValue - Optional index value
 * @returns New scope with loop variables added to locals
 */
export function createLoopScope(
  parent: Scope,
  itemVar: string,
  itemValue: unknown,
  indexVar?: string,
  indexValue?: number
): Scope {
  const newLocals = { ...parent.locals, [itemVar]: itemValue };
  if (indexVar !== undefined && indexValue !== undefined) {
    newLocals[indexVar] = indexValue;
  }
  return {
    locals: newLocals,
    data: parent.data,
    globals: parent.globals,
  };
}

/**
 * Creates an isolated scope for component rendering.
 * Components only have access to their props and globals, not parent scope.
 *
 * @param props - Props passed to the component
 * @param globals - Global variables
 * @returns Isolated scope for component
 */
export function createComponentScope(
  props: Record<string, unknown>,
  globals: Record<string, unknown>
): Scope {
  return {
    locals: {},
    data: props,
    globals,
  };
}

/**
 * Adds a variable to the scope (either locals or globals).
 *
 * @param scope - Current scope
 * @param name - Variable name
 * @param value - Variable value
 * @param isGlobal - Whether to add to globals (true) or locals (false)
 * @returns New scope with the variable added
 */
export function addToScope(
  scope: Scope,
  name: string,
  value: unknown,
  isGlobal: boolean
): Scope {
  if (isGlobal) {
    return {
      locals: scope.locals,
      data: scope.data,
      globals: { ...scope.globals, [name]: value },
    };
  }
  return {
    locals: { ...scope.locals, [name]: value },
    data: scope.data,
    globals: scope.globals,
  };
}

// =============================================================================
// Core Render Functions
// =============================================================================

/**
 * Converts a value to a string for text output.
 * Null and undefined render as empty string, not "null" or "undefined".
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Creates an evaluation context from a render context for expression evaluation.
 */
function createEvalContext(ctx: RenderContext) {
  return {
    scope: ctx.scope,
    helpers: ctx.helpers,
    config: ctx.evaluatorConfig,
  };
}

/**
 * Renders a TextNode with literal and expression segments.
 */
function renderText(node: TextNode, ctx: RenderContext): string {
  const parts: string[] = [];

  for (const segment of node.segments) {
    if (segment.kind === 'literal') {
      parts.push(segment.text);
    } else {
      // Expression segment
      const value = evaluate(segment.expr, createEvalContext(ctx));
      const str = valueToString(value);
      // HTML escape expressions by default
      parts.push(ctx.renderConfig.htmlEscape ? escapeHtml(str) : str);
    }
  }

  return parts.join('');
}

/**
 * Renders an attribute value, handling static, expression, and mixed attributes.
 */
function renderAttribute(
  attr: AttributeNode,
  ctx: RenderContext
): string | null {
  if (attr.kind === 'static') {
    return `${attr.name}="${escapeHtml(attr.value)}"`;
  }

  if (attr.kind === 'expr') {
    const value = evaluate(attr.expr, createEvalContext(ctx));

    // Boolean attribute handling
    if (typeof value === 'boolean') {
      return value ? attr.name : null; // true = present, false = omit
    }

    // Omit null/undefined attributes
    if (value === null || value === undefined) {
      return null;
    }

    return `${attr.name}="${escapeHtml(valueToString(value))}"`;
  }

  // Mixed attribute (static + expressions)
  const parts: string[] = [];
  for (const segment of attr.segments) {
    if (segment.kind === 'static') {
      parts.push(segment.value);
    } else {
      const value = evaluate(segment.expr, createEvalContext(ctx));
      parts.push(valueToString(value));
    }
  }
  return `${attr.name}="${escapeHtml(parts.join(''))}"`;
}

/**
 * Set of void/self-closing HTML elements.
 */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Renders an ElementNode with attributes and children.
 */
function renderElement(node: ElementNode, ctx: RenderContext): string {
  const tag = node.tag;
  const attrs: string[] = [];

  // Render attributes
  for (const attr of node.attributes) {
    const rendered = renderAttribute(attr, ctx);
    if (rendered !== null) {
      attrs.push(rendered);
    }
  }

  // Build opening tag
  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Void elements are self-closing
  if (VOID_ELEMENTS.has(tag.toLowerCase())) {
    return `<${tag}${attrStr}/>`;
  }

  // Render children
  const childrenHtml = renderChildren(node.children, ctx);

  return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
}

/**
 * Renders an IfNode by evaluating conditions and rendering the matching branch.
 */
function renderIf(node: IfNode, ctx: RenderContext): string {
  // Evaluate branches in order
  for (const branch of node.branches) {
    const condition = evaluate(branch.condition, createEvalContext(ctx));
    if (condition) {
      return renderChildren(branch.body, ctx);
    }
  }

  // No branch matched, render else branch if present
  if (node.elseBranch) {
    return renderChildren(node.elseBranch, ctx);
  }

  return '';
}

/**
 * Renders a ForNode by iterating over the expression result.
 */
function renderFor(node: ForNode, ctx: RenderContext): string {
  // Check loop nesting limit
  ctx.currentLoopNesting++;
  if (ctx.currentLoopNesting > ctx.limits.maxLoopNesting) {
    throw new ResourceLimitError(
      'loopNesting',
      ctx.currentLoopNesting,
      ctx.limits.maxLoopNesting,
      node.location
    );
  }

  try {
    const items = evaluate(node.itemsExpr, createEvalContext(ctx));
    const results: string[] = [];

    if (node.iterationType === 'of') {
      // Iterate over values
      if (!Array.isArray(items)) {
        // Non-array returns empty
        return '';
      }

      let iterationCount = 0;
      for (let i = 0; i < items.length; i++) {
        // Check iteration limits
        ctx.totalIterations++;
        iterationCount++;

        if (iterationCount > ctx.limits.maxIterationsPerLoop) {
          throw new ResourceLimitError(
            'iterations',
            iterationCount,
            ctx.limits.maxIterationsPerLoop,
            node.location
          );
        }

        if (ctx.totalIterations > ctx.limits.maxTotalIterations) {
          throw new ResourceLimitError(
            'iterations',
            ctx.totalIterations,
            ctx.limits.maxTotalIterations,
            node.location
          );
        }

        // Create loop scope with item and optional index
        const loopScope = createLoopScope(
          ctx.scope,
          node.itemVar,
          items[i],
          node.indexVar,
          i
        );

        // Render body with loop scope
        const childCtx = { ...ctx, scope: loopScope };
        results.push(renderChildren(node.body, childCtx));
      }
    } else {
      // Iterate over keys/indices ('in')
      if (items === null || items === undefined) {
        return '';
      }

      const keys = Array.isArray(items)
        ? items.map((_, i) => i)
        : Object.keys(items as object);

      let iterationCount = 0;
      for (const key of keys) {
        ctx.totalIterations++;
        iterationCount++;

        if (iterationCount > ctx.limits.maxIterationsPerLoop) {
          throw new ResourceLimitError(
            'iterations',
            iterationCount,
            ctx.limits.maxIterationsPerLoop,
            node.location
          );
        }

        if (ctx.totalIterations > ctx.limits.maxTotalIterations) {
          throw new ResourceLimitError(
            'iterations',
            ctx.totalIterations,
            ctx.limits.maxTotalIterations,
            node.location
          );
        }

        // For 'in' iteration, itemVar is the key
        const loopScope = createLoopScope(ctx.scope, node.itemVar, key);
        const childCtx = { ...ctx, scope: loopScope };
        results.push(renderChildren(node.body, childCtx));
      }
    }

    return results.join('');
  } finally {
    ctx.currentLoopNesting--;
  }
}

/**
 * Renders a MatchNode by evaluating cases and rendering the first match.
 */
function renderMatch(node: MatchNode, ctx: RenderContext): string {
  const value = evaluate(node.value, createEvalContext(ctx));

  for (const matchCase of node.cases) {
    if (matchCase.kind === 'literal') {
      // Check if value matches any of the literals
      if (matchCase.values.includes(value as string | number | boolean)) {
        return renderChildren(matchCase.body, ctx);
      }
    } else {
      // Expression case - bind _ to the value and evaluate condition
      const matchScope = createLoopScope(ctx.scope, '_', value);
      const matchCtx = { ...ctx, scope: matchScope };
      const condition = evaluate(
        matchCase.condition,
        createEvalContext(matchCtx)
      );
      if (condition) {
        return renderChildren(matchCase.body, matchCtx);
      }
    }
  }

  // No case matched, render default if present
  if (node.defaultCase) {
    return renderChildren(node.defaultCase, ctx);
  }

  return '';
}

/**
 * Renders a LetNode by adding a variable to scope.
 */
function renderLet(node: LetNode, ctx: RenderContext): string {
  let value: unknown;

  if ('kind' in node.value && node.value.kind === 'function') {
    // Function expression - create a callable function
    const funcExpr = node.value as FunctionExpr;
    value = (...args: unknown[]) => {
      // Create scope with parameters
      let fnScope = ctx.scope;
      for (let i = 0; i < funcExpr.params.length; i++) {
        fnScope = addToScope(fnScope, funcExpr.params[i]!, args[i], false);
      }
      const fnCtx = { ...ctx, scope: fnScope };
      return evaluate(funcExpr.body, createEvalContext(fnCtx));
    };
  } else {
    // Regular expression
    value = evaluate(node.value as ExprAst, createEvalContext(ctx));
  }

  // Update scope
  ctx.scope = addToScope(ctx.scope, node.name, value, node.isGlobal);

  // LetNodes don't render anything
  return '';
}

/**
 * Renders a ComponentNode with isolated scope.
 */
function renderComponent(node: ComponentNode, ctx: RenderContext): string {
  // Check component depth limit
  ctx.componentDepth++;
  if (ctx.componentDepth > ctx.limits.maxComponentDepth) {
    throw new ResourceLimitError(
      'componentDepth',
      ctx.componentDepth,
      ctx.limits.maxComponentDepth,
      node.location
    );
  }

  try {
    // Look up component definition
    const definition = ctx.components.get(node.name);
    if (!definition) {
      throw new RenderError(
        `Unknown component: ${node.name}`,
        node.location,
        'UNKNOWN_COMPONENT'
      );
    }

    // Evaluate props in caller's scope
    const props: Record<string, unknown> = {};
    for (const prop of node.props) {
      props[prop.name] = evaluate(prop.value, createEvalContext(ctx));
    }

    // Apply default values from component definition
    for (const propDef of definition.props) {
      if (!(propDef.name in props) && propDef.defaultValue !== undefined) {
        if (typeof propDef.defaultValue === 'string') {
          props[propDef.name] = propDef.defaultValue;
        } else {
          props[propDef.name] = evaluate(
            propDef.defaultValue,
            createEvalContext(ctx)
          );
        }
      }
    }

    // Create isolated component scope
    const componentScope = createComponentScope(props, ctx.scope.globals);

    // Store slot content from caller
    const slots = new Map<string, readonly TemplateNode[]>();
    slots.set('default', node.children);

    // Create component context
    const componentCtx: RenderContext = {
      ...ctx,
      scope: componentScope,
      slots,
    };

    // Render component body
    return renderChildren(definition.body, componentCtx);
  } finally {
    ctx.componentDepth--;
  }
}

/**
 * Renders a FragmentNode (children only, no wrapper).
 */
function renderFragment(node: FragmentNode, ctx: RenderContext): string {
  return renderChildren(node.children, ctx);
}

/**
 * Renders a SlotNode by inserting caller's slot content or fallback.
 */
function renderSlot(node: SlotNode, ctx: RenderContext): string {
  const slotName = node.name ?? 'default';
  const slotContent = ctx.slots.get(slotName);

  if (slotContent && slotContent.length > 0) {
    // Render caller's slot content
    return renderChildren(slotContent, ctx);
  }

  // Render fallback content if present
  if (node.fallback) {
    return renderChildren(node.fallback, ctx);
  }

  return '';
}

/**
 * Renders a CommentNode (only if includeComments is enabled).
 */
function renderComment(node: CommentNode, ctx: RenderContext): string {
  if (!ctx.renderConfig.includeComments) {
    return '';
  }

  // Only render HTML-style comments to output
  if (node.style === 'html') {
    return `<!--${node.text}-->`;
  }

  return '';
}

/**
 * Renders a DOCTYPE declaration node.
 */
function renderDoctype(node: DoctypeNode, _ctx: RenderContext): string {
  return `<!DOCTYPE ${node.value}>`;
}

/**
 * Renders a single template node based on its kind.
 */
function renderNode(node: TemplateNode, ctx: RenderContext): string {
  switch (node.kind) {
    case 'text':
      return renderText(node, ctx);
    case 'element':
      return renderElement(node, ctx);
    case 'if':
      return renderIf(node, ctx);
    case 'for':
      return renderFor(node, ctx);
    case 'match':
      return renderMatch(node, ctx);
    case 'let':
      return renderLet(node, ctx);
    case 'component':
      return renderComponent(node, ctx);
    case 'fragment':
      return renderFragment(node, ctx);
    case 'slot':
      return renderSlot(node, ctx);
    case 'comment':
      return renderComment(node, ctx);
    case 'doctype':
      return renderDoctype(node, ctx);
    default: {
      // Exhaustive check
      const _exhaustive: never = node;
      throw new Error(
        `Unknown node kind: ${(_exhaustive as TemplateNode).kind}`
      );
    }
  }
}

/**
 * Renders an array of template nodes.
 */
function renderChildren(
  nodes: readonly TemplateNode[],
  ctx: RenderContext
): string {
  const results: string[] = [];
  for (const node of nodes) {
    results.push(renderNode(node, ctx));
  }
  return results.join('');
}

// =============================================================================
// Renderer Function Types
// =============================================================================

/**
 * Function that renders a template to an HTML string.
 *
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Rendered HTML string and metadata
 */
export type StringRenderer = (
  data: unknown,
  options?: RenderOptions
) => RenderResult;

/**
 * Function that renders a template to DOM nodes.
 *
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Array of DOM nodes and metadata
 */
export type DomRenderer = (
  data: unknown,
  options?: RenderOptions
) => DomRenderResult;

// =============================================================================
// Renderer Factory Functions
// =============================================================================

/**
 * Creates a string rendering function from a compiled template.
 *
 * This generates a specialized renderer that takes data and produces HTML strings.
 * The returned function is optimized for repeated rendering with different data.
 *
 * @param template - Compiled template to create renderer from
 * @returns Function that renders the template to HTML strings
 *
 * @example
 * ```typescript
 * const compiled = await compile('<div>Hello, ${name}!</div>');
 * const renderToString = createStringRenderer(compiled);
 *
 * const result1 = renderToString({ name: 'Alice' });
 * console.log(result1.html); // "<div>Hello, Alice!</div>"
 *
 * const result2 = renderToString({ name: 'Bob' });
 * console.log(result2.html); // "<div>Hello, Bob!</div>"
 * ```
 */
export function createStringRenderer(
  template: CompiledTemplate
): StringRenderer {
  return (
    data: unknown,
    options?: RenderOptions & { limits?: Partial<ResourceLimits> }
  ): RenderResult => {
    const startTime = performance.now();

    // Create render context
    const ctx = createRenderContext(template, data, options);

    // Render the template
    const html = renderChildren(template.root.children, ctx);

    const endTime = performance.now();

    return {
      html,
      metadata: {
        pathsAccessed: ctx.pathsAccessed,
        helpersUsed: ctx.helpersUsed,
        renderTime: endTime - startTime,
        iterationCount: ctx.totalIterations,
        recursionDepth: ctx.maxRecursionDepthReached,
      },
    };
  };
}

/**
 * Creates a DOM rendering function from a compiled template.
 *
 * This generates a specialized renderer that takes data and produces DOM nodes.
 * The returned function is optimized for repeated rendering with different data.
 * Useful for client-side rendering in browsers.
 *
 * @param template - Compiled template to create renderer from
 * @returns Function that renders the template to DOM nodes
 *
 * @example
 * ```typescript
 * const compiled = await compile('<div>Hello, ${name}!</div>');
 * const renderToDom = createDomRenderer(compiled);
 *
 * const result = renderToDom({ name: 'Alice' });
 * document.body.append(...result.nodes);
 * ```
 */
export function createDomRenderer(_template: CompiledTemplate): DomRenderer {
  // TODO: Implement DOM renderer factory
  return (_data: unknown, _options?: RenderOptions): DomRenderResult => {
    throw new Error('Not implemented');
  };
}

// =============================================================================
// Legacy/Convenience API
// =============================================================================

/**
 * Renders a compiled template to an HTML string.
 *
 * This is a convenience function that creates a string renderer and immediately
 * executes it. For repeated rendering, use createStringRenderer() instead for
 * better performance.
 *
 * @param template - Compiled template to render
 * @param data - Data to render with
 * @param options - Optional rendering options
 * @returns Rendered HTML string and metadata
 *
 * @deprecated Consider using createStringRenderer() for better performance with repeated renders
 */
export function render(
  template: CompiledTemplate,
  data: unknown,
  options?: RenderOptions
): RenderResult {
  const renderer = createStringRenderer(template);
  return renderer(data, options);
}

export function createScope(
  data: unknown,
  globals: Record<string, unknown> = {}
): Scope {
  return {
    locals: {},
    data,
    globals,
  };
}

// =============================================================================
// One-Step Compilation and Rendering
// =============================================================================

/**
 * Compiles a template source and returns a ready-to-use string renderer.
 *
 * This is a convenience function that combines compile() and createStringRenderer()
 * into a single call.
 *
 * @param source - Template source string
 * @param compileOptions - Optional compilation options
 * @returns A function that renders data to HTML
 *
 * @example
 * ```typescript
 * const render = compileToString('<div>Hello, ${name}!</div>');
 * const result = render({ name: 'World' });
 * console.log(result.html); // "<div>Hello, World!</div>"
 * ```
 */
export function compileToString(
  source: string,
  compileOptions?: CompileOptions
): StringRenderer {
  const template = compile(source, compileOptions);
  return createStringRenderer(template);
}
