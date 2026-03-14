// Validation module
// Template validation with parse error detection, component validation,
// helper validation, and data schema checking.

import type {
  Diagnostic,
  SourceLocation,
  TemplateNode,
  ComponentDefinition,
  ExprAst,
  ComponentNode,
  ElementNode,
  IfNode,
  ForNode,
  MatchNode,
  LetNode,
  TextNode,
  SlotNode,
  AttributeNode,
} from '../ast/types.js';
import type { HelperRegistry } from '../evaluator/index.js';
import { parseTemplate } from '../parser/index.js';

export interface ValidationOptions {
  schema?: JSONSchema;
  helpers?: HelperRegistry;
  components?: ComponentRegistry;
  strict?: boolean;
}

export interface JSONSchema {
  // Simplified JSON Schema type
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  [key: string]: unknown;
}

export interface ComponentRegistry {
  [name: string]: ComponentSchema;
}

export interface ComponentSchema {
  props: PropSchema[];
}

export interface PropSchema {
  name: string;
  required: boolean;
  type?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

/**
 * Validates a template source string.
 *
 * Performs the following checks:
 * 1. Parse errors - catches syntax errors in the template
 * 2. Component validation - checks for unknown components and missing required props
 * 3. Helper validation - checks for unknown helper function calls (when registry provided)
 * 4. Data path validation - checks top-level paths against JSON schema (when provided)
 *
 * @param source - Template source string to validate
 * @param options - Optional validation configuration
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateTemplate('<div>$name</div>', {
 *   schema: { type: 'object', properties: { name: { type: 'string' } } }
 * });
 * console.log(result.valid); // true
 * ```
 */
export function validateTemplate(
  source: string,
  options?: ValidationOptions
): ValidationResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  // Step 1: Parse the template and collect parse errors
  let nodes: TemplateNode[];
  let templateComponents: Map<string, ComponentDefinition>;

  try {
    const parseResult = parseTemplate(source);
    nodes = parseResult.value;
    templateComponents = parseResult.components;

    // Convert parse errors to diagnostics
    for (const parseError of parseResult.errors) {
      errors.push(
        createDiagnostic(
          'error',
          parseError.message,
          {
            start: {
              line: parseError.line,
              column: parseError.column,
              offset: parseError.offset,
            },
            end: {
              line: parseError.line,
              column: parseError.column,
              offset: parseError.offset,
            },
          },
          'PARSE_ERROR'
        )
      );
    }
  } catch (e) {
    // If parsing fails entirely, report a single error
    errors.push(
      createDiagnostic(
        'error',
        e instanceof Error ? e.message : 'Failed to parse template',
        {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
        'PARSE_ERROR'
      )
    );

    return { valid: false, errors, warnings };
  }

  // If there are parse errors, skip semantic validation
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Build the set of known components (inline template definitions + external registry)
  const knownComponents = new Set<string>();
  for (const name of templateComponents.keys()) {
    knownComponents.add(name);
  }
  if (options?.components) {
    for (const name of Object.keys(options.components)) {
      knownComponents.add(name);
    }
  }

  // Step 2: Walk the AST and validate
  const ctx: ValidationContext = {
    errors,
    warnings,
    knownComponents,
    templateComponents,
    externalComponents: options?.components,
    helpers: options?.helpers,
    schema: options?.schema,
    strict: options?.strict ?? false,
  };

  for (const node of nodes) {
    validateNode(node, ctx);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function createDiagnostic(
  level: 'error' | 'warning',
  message: string,
  location: SourceLocation,
  code?: string
): Diagnostic {
  return { level, message, location, code };
}

// =============================================================================
// Internal Validation
// =============================================================================

interface ValidationContext {
  errors: Diagnostic[];
  warnings: Diagnostic[];
  knownComponents: Set<string>;
  templateComponents: Map<string, ComponentDefinition>;
  externalComponents?: ComponentRegistry;
  helpers?: HelperRegistry;
  schema?: JSONSchema;
  strict: boolean;
}

/**
 * Validates a single template node and recurses into children.
 */
function validateNode(node: TemplateNode, ctx: ValidationContext): void {
  switch (node.kind) {
    case 'text':
      validateTextNode(node, ctx);
      break;
    case 'element':
      validateElementNode(node, ctx);
      break;
    case 'if':
      validateIfNode(node, ctx);
      break;
    case 'for':
      validateForNode(node, ctx);
      break;
    case 'match':
      validateMatchNode(node, ctx);
      break;
    case 'let':
      validateLetNode(node, ctx);
      break;
    case 'component':
      validateComponentNode(node, ctx);
      break;
    case 'fragment':
      for (const child of node.children) {
        validateNode(child, ctx);
      }
      break;
    case 'slot':
      validateSlotNode(node, ctx);
      break;
    case 'comment':
    case 'doctype':
      // No validation needed for comments and doctypes
      break;
  }
}

/**
 * Validates expressions within text segments for unknown helper calls.
 */
function validateTextNode(node: TextNode, ctx: ValidationContext): void {
  for (const segment of node.segments) {
    if (segment.kind === 'expr') {
      validateExpr(segment.expr, ctx, segment.location);
    }
  }
}

/**
 * Validates element attributes and children.
 */
function validateElementNode(node: ElementNode, ctx: ValidationContext): void {
  for (const attr of node.attributes) {
    validateAttribute(attr, ctx);
  }
  for (const child of node.children) {
    validateNode(child, ctx);
  }
}

/**
 * Validates attribute expressions.
 */
function validateAttribute(
  attr: AttributeNode,
  ctx: ValidationContext
): void {
  if (attr.kind === 'expr') {
    validateExpr(attr.expr, ctx, attr.location);
  } else if (attr.kind === 'mixed') {
    for (const segment of attr.segments) {
      if (segment.kind === 'expr') {
        validateExpr(segment.expr, ctx, segment.location);
      }
    }
  }
}

/**
 * Validates if-node conditions and branches.
 */
function validateIfNode(node: IfNode, ctx: ValidationContext): void {
  for (const branch of node.branches) {
    validateExpr(branch.condition, ctx, branch.location);
    for (const child of branch.body) {
      validateNode(child, ctx);
    }
  }
  if (node.elseBranch) {
    for (const child of node.elseBranch) {
      validateNode(child, ctx);
    }
  }
}

/**
 * Validates for-node iteration expression and body.
 */
function validateForNode(node: ForNode, ctx: ValidationContext): void {
  validateExpr(node.itemsExpr, ctx, node.location);
  for (const child of node.body) {
    validateNode(child, ctx);
  }
}

/**
 * Validates match-node value and case expressions.
 */
function validateMatchNode(node: MatchNode, ctx: ValidationContext): void {
  validateExpr(node.value, ctx, node.location);
  for (const matchCase of node.cases) {
    if (matchCase.kind === 'expression') {
      validateExpr(matchCase.condition, ctx, matchCase.location);
    }
    for (const child of matchCase.body) {
      validateNode(child, ctx);
    }
  }
  if (node.defaultCase) {
    for (const child of node.defaultCase) {
      validateNode(child, ctx);
    }
  }
}

/**
 * Validates let-node value expressions.
 */
function validateLetNode(node: LetNode, ctx: ValidationContext): void {
  if (node.value.kind !== 'function') {
    validateExpr(node.value as ExprAst, ctx, node.location);
  } else {
    // Validate function body expression
    validateExpr(node.value.body, ctx, node.location);
  }
}

/**
 * Validates component usage: checks component existence and required props.
 */
function validateComponentNode(
  node: ComponentNode,
  ctx: ValidationContext
): void {
  // Check if component is known
  if (!ctx.knownComponents.has(node.name)) {
    ctx.errors.push(
      createDiagnostic(
        'error',
        `Unknown component: ${node.name}`,
        node.location,
        'UNKNOWN_COMPONENT'
      )
    );
    return;
  }

  // Check required props from external component registry
  if (ctx.externalComponents && ctx.externalComponents[node.name]) {
    const schema = ctx.externalComponents[node.name]!;
    const providedProps = new Set(node.props.map(p => p.name));

    for (const propSchema of schema.props) {
      if (propSchema.required && !providedProps.has(propSchema.name)) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `Missing required prop '${propSchema.name}' for component '${node.name}'`,
            node.location,
            'MISSING_REQUIRED_PROP'
          )
        );
      }
    }
  }

  // Check required props from inline template definitions
  const templateDef = ctx.templateComponents.get(node.name);
  if (templateDef) {
    const providedProps = new Set(node.props.map(p => p.name));

    for (const propDef of templateDef.props) {
      if (propDef.required && !providedProps.has(propDef.name)) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `Missing required prop '${propDef.name}' for component '${node.name}'`,
            node.location,
            'MISSING_REQUIRED_PROP'
          )
        );
      }
    }
  }

  // Validate prop value expressions
  for (const prop of node.props) {
    validateExpr(prop.value, ctx, prop.location);
  }

  // Validate children
  for (const child of node.children) {
    validateNode(child, ctx);
  }
}

/**
 * Validates slot fallback content.
 */
function validateSlotNode(node: SlotNode, ctx: ValidationContext): void {
  if (node.fallback) {
    for (const child of node.fallback) {
      validateNode(child, ctx);
    }
  }
}

/**
 * Validates an expression AST node, checking for unknown helpers.
 */
function validateExpr(
  expr: ExprAst,
  ctx: ValidationContext,
  fallbackLocation: SourceLocation
): void {
  switch (expr.kind) {
    case 'call':
      // Check if helper is known (when registry is provided)
      if (ctx.helpers && !(expr.callee in ctx.helpers)) {
        const location = expr.location ?? fallbackLocation;
        if (ctx.strict) {
          ctx.errors.push(
            createDiagnostic(
              'error',
              `Unknown helper function: ${expr.callee}`,
              location,
              'UNKNOWN_HELPER'
            )
          );
        } else {
          ctx.warnings.push(
            createDiagnostic(
              'warning',
              `Unknown helper function: ${expr.callee}`,
              location,
              'UNKNOWN_HELPER'
            )
          );
        }
      }
      // Validate call arguments
      for (const arg of expr.args) {
        validateExpr(arg, ctx, fallbackLocation);
      }
      break;

    case 'path':
      // Validate top-level data paths against schema (when provided and in strict mode)
      if (ctx.schema && ctx.strict && !expr.isGlobal) {
        const firstSegment = expr.segments[0];
        if (
          firstSegment?.kind === 'key' &&
          ctx.schema.properties &&
          !(firstSegment.key in ctx.schema.properties)
        ) {
          const location = expr.location ?? fallbackLocation;
          ctx.warnings.push(
            createDiagnostic(
              'warning',
              `Property '${firstSegment.key}' not found in schema`,
              location,
              'UNKNOWN_PROPERTY'
            )
          );
        }
      }
      break;

    case 'unary':
      validateExpr(expr.operand, ctx, fallbackLocation);
      break;

    case 'binary':
      validateExpr(expr.left, ctx, fallbackLocation);
      validateExpr(expr.right, ctx, fallbackLocation);
      break;

    case 'ternary':
      validateExpr(expr.condition, ctx, fallbackLocation);
      validateExpr(expr.truthy, ctx, fallbackLocation);
      validateExpr(expr.falsy, ctx, fallbackLocation);
      break;

    case 'wildcard':
      validateExpr(expr.path, ctx, fallbackLocation);
      break;

    case 'array':
      for (const element of expr.elements) {
        validateExpr(element, ctx, fallbackLocation);
      }
      break;

    case 'member':
      validateExpr(expr.object, ctx, fallbackLocation);
      break;

    case 'literal':
      // No validation needed for literals
      break;
  }
}
