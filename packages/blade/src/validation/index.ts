// Validation module
//
// Static checks over a parsed template: unknown components, missing required
// props, unknown helper calls and data paths that the schema does not describe.
//
// Both walks below run on `ast/visitor.ts`, and both switches end in a `never`
// guard. They used to be hand-rolled and non-exhaustive - which matters more
// here than anywhere else, because a missed kind in an analysis pass is not a
// crash, it is a diagnostic that silently never appears. `validateExpr` had no
// `function` case, so an unknown helper inside a `@let` arrow body produced
// nothing at all.

import type {
  AttributeNode,
  ComponentDefinition,
  ComponentNode,
  Diagnostic,
  ExprAst,
  ForNode,
  JsonSchema,
  SourceLocation,
  TemplateNode,
} from '../ast/types.js';
import {
  attributeExpressions,
  expressionsOf,
  walkExpressions,
  walkNodes,
} from '../ast/visitor.js';
import {
  isEventHandlerAttribute,
  isMathmlElement,
  isSvgElement,
} from '../ast/html.js';
import type { AnyExpr } from '../ast/visitor.js';
import { hasHelper } from '../evaluator/index.js';
import type { HelperRegistry } from '../evaluator/index.js';
import { parseTemplate } from '../parser/index.js';

export interface ValidationOptions {
  /** Schema describing the render data, for top-level path checks. */
  schema?: JsonSchema;
  /**
   * The helper registry the template will be rendered with. Calls to anything
   * it does not contain are reported; without it, no helper is checked,
   * because there is nothing to check against.
   */
  helpers?: HelperRegistry;
  /** Components provided by the host, in addition to inline `<template:>`. */
  components?: ComponentRegistry;
  /** Report soft findings (unknown helper, unknown property) as errors. */
  strict?: boolean;
  /**
   * The renderer this template is being compiled for.
   *
   * Only `on:` bindings care. A string render produces characters, and
   * characters cannot carry a closure, so a template that declares
   * `target: 'string'` is told at build time that its handlers will never fire
   * - rather than at three in the morning, by a button that does nothing.
   *
   * @default 'dom'
   */
  target?: RenderTargetKind;
}

/**
 * What a compiled template is going to be rendered by.
 *
 * `'dom'` covers every sink that holds live elements - the DOM renderer and
 * the reactive one - and is the default, because a template that never says is
 * more likely to be mounted than serialised, and because the alternative is
 * refusing a construct nobody asked to refuse.
 */
export type RenderTargetKind = 'dom' | 'string';

export interface ComponentRegistry {
  [name: string]: ComponentSchema;
}

/**
 * What the validator needs to know about one prop.
 *
 * Deliberately narrower than {@link PropDeclaration}: a host declaring the
 * components it will supply knows their names and which are required, and has
 * no source location or default expression to offer. A parsed
 * `PropDeclaration` satisfies this structurally, so the two paths are checked
 * by the same code.
 */
export interface PropSchema {
  readonly name: string;
  readonly required: boolean;
  /** Where it was declared, when that is known and in another file. */
  readonly location?: SourceLocation;
}

/**
 * What the validator needs to know about a component declared elsewhere.
 *
 * A {@link ComponentDefinition} satisfies it structurally, so an inline
 * definition and an external declaration are checked by the same code.
 */
export interface ComponentSchema {
  readonly props: readonly PropSchema[];
  /**
   * The component's body, when it is known.
   *
   * Only needed to learn which slots the component declares, so that a
   * `<slot:name>` fill that matches none of them can be reported. A misspelled
   * fill otherwise vanishes without a trace: the slot renders its fallback and
   * the caller's content is silently dropped.
   */
  readonly body?: readonly TemplateNode[];
  /**
   * The file that declares it, when it is another file.
   *
   * A project compile resolves components off disk, and "add the `label` prop"
   * is only actionable if the reader is told which file declares it.
   */
  readonly definedIn?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

/** Diagnostics produced by a validation pass, split by level. */
export interface ValidationDiagnostics {
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

/**
 * Validates a template source string.
 *
 * Performs the following checks:
 * 1. Parse errors - catches syntax errors in the template
 * 2. Component validation - unknown components and missing required props
 * 3. Helper validation - unknown helper calls (when a registry is provided)
 * 4. Data path validation - top-level paths against a JSON schema (strict mode)
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
  const parseResult = parseTemplate(source);

  const errors: Diagnostic[] = parseResult.errors.map(parseError =>
    createDiagnostic(
      'error',
      parseError.message,
      pointAt(parseError.line, parseError.column, parseError.offset),
      'PARSE_ERROR'
    )
  );

  // A tree the parser could not make sense of produces cascades of nonsense
  // semantic diagnostics; the parse errors are the ones worth reporting.
  if (errors.length > 0) {
    return { valid: false, errors, warnings: [] };
  }

  const semantic = validateNodes(
    parseResult.value,
    parseResult.components,
    options
  );

  return {
    valid: semantic.errors.length === 0,
    errors: semantic.errors,
    warnings: semantic.warnings,
  };
}

/**
 * Validates an already-parsed template.
 *
 * This is the single semantic pass: `compile()` runs it too, so the compiler
 * and the standalone validator cannot drift apart again.
 *
 * @param nodes - Top-level template nodes
 * @param templateComponents - Components defined inline with `<template:>`
 * @param options - Optional validation configuration
 * @returns Diagnostics split by level
 */
export function validateNodes(
  nodes: readonly TemplateNode[],
  templateComponents: ReadonlyMap<string, ComponentDefinition>,
  options?: ValidationOptions
): ValidationDiagnostics {
  const ctx: ValidationContext = {
    errors: [],
    warnings: [],
    templateComponents,
    externalComponents: options?.components,
    helpers: options?.helpers,
    schema: options?.schema,
    strict: options?.strict ?? false,
    target: options?.target ?? 'dom',
    placedFills: new Set(),
  };

  walkNodes(nodes, node => checkNode(node, ctx));

  // A component body is template code like any other; nothing else walks it.
  for (const definition of templateComponents.values()) {
    walkNodes(definition.body, node => checkNode(node, ctx));
    for (const declaration of definition.props) {
      if (declaration.defaultValue) {
        validateExpr(declaration.defaultValue, ctx);
      }
    }
  }

  return { errors: ctx.errors, warnings: ctx.warnings };
}

export function createDiagnostic(
  level: 'error' | 'warning',
  message: string,
  location: SourceLocation,
  code?: string
): Diagnostic {
  return { level, message, location, code };
}

/**
 * The required props a component usage failed to provide.
 *
 * The one implementation of this check. It was written four times - twice in
 * the same function of this file, once in the compiler and once in the project
 * loader - and the copies had already drifted apart on which prop shape they
 * accepted.
 *
 * @param check - The declared props, the provided names, and where to report
 * @returns One diagnostic per missing required prop, in declaration order
 */
export function checkRequiredProps(check: {
  componentName: string;
  declared: readonly PropSchema[];
  provided: Iterable<string>;
  location: SourceLocation;
  /** Path of the file that declares the props, when it is another file. */
  definedIn?: string;
}): Diagnostic[] {
  const provided = new Set(check.provided);
  const diagnostics: Diagnostic[] = [];

  for (const declaration of check.declared) {
    if (!declaration.required || provided.has(declaration.name)) continue;

    let message = `Missing required prop '${declaration.name}' for component '${check.componentName}'`;
    if (check.definedIn) {
      message +=
        `.\n  Used at: line ${check.location.start.line}, column ${check.location.start.column}` +
        `\n  Defined at: ${check.definedIn}` +
        (declaration.location ? `:${declaration.location.start.line}` : '');
    }

    diagnostics.push(
      createDiagnostic(
        'error',
        message,
        check.location,
        'MISSING_REQUIRED_PROP'
      )
    );
  }

  return diagnostics;
}

// =============================================================================
// Internal Validation
// =============================================================================

interface ValidationContext {
  errors: Diagnostic[];
  warnings: Diagnostic[];
  templateComponents: ReadonlyMap<string, ComponentDefinition>;
  externalComponents?: ComponentRegistry;
  helpers?: HelperRegistry;
  schema?: JsonSchema;
  strict: boolean;
  target: RenderTargetKind;
  /**
   * Slot fills already accounted for by the component call that owns them.
   *
   * The walk is pre-order, so a component is visited before its children; a
   * fill that is not in this set by the time it is reached is not the direct
   * child of any component call, and names a slot that cannot exist.
   */
  readonly placedFills: Set<TemplateNode>;
}

function pointAt(line: number, column: number, offset: number): SourceLocation {
  return {
    start: { line, column, offset },
    end: { line, column, offset },
  };
}

/** Reports a soft finding: a warning normally, an error under `strict`. */
function report(
  ctx: ValidationContext,
  message: string,
  location: SourceLocation,
  code: string
): void {
  if (ctx.strict) {
    ctx.errors.push(createDiagnostic('error', message, location, code));
  } else {
    ctx.warnings.push(createDiagnostic('warning', message, location, code));
  }
}

/**
 * Checks one node and its own expressions.
 *
 * @returns `false` to stop the walk from descending into this node's children
 */
function checkNode(
  node: TemplateNode,
  ctx: ValidationContext
): false | undefined {
  switch (node.kind) {
    case 'element': {
      // A tag with an internal capital is a component name spelled wrong -
      // `<myWidget>` is never a valid HTML element.
      //
      // Except in a foreign vocabulary, where an internal capital is the
      // element's real spelling: `<clipPath>`, `<linearGradient>`,
      // `<feGaussianBlur>` and `<foreignObject>` are SVG, and `<mspace>`'s
      // neighbours in MathML are the same. `ast/html.ts` already holds both
      // vocabularies - `canonicalTagName` exists precisely so a sink can
      // restore that spelling - and asking it here is what stops this check
      // from contradicting the renderer it is supposed to protect.
      const tag = node.tag;
      if (
        /[a-z][A-Z]/.test(tag) &&
        tag[0] === tag[0]?.toLowerCase() &&
        !isSvgElement(tag) &&
        !isMathmlElement(tag)
      ) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `Component name must start with a capital letter: ${tag}`,
            node.location,
            'INVALID_COMPONENT_NAME'
          )
        );
      }
      checkAttributeSinks(node.attributes, ctx);
      break;
    }
    case 'component': {
      if (node.name[0] === node.name[0]?.toLowerCase()) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `Component name must start with a capital letter: ${node.name}`,
            node.location,
            'INVALID_COMPONENT_NAME'
          )
        );
      }

      const declaration = componentSchema(ctx, node.name);
      if (!declaration) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `Unknown component: ${node.name}`,
            node.location,
            'UNKNOWN_COMPONENT'
          )
        );
        // Nothing below an unknown component can be judged.
        return false;
      }

      ctx.errors.push(
        ...checkRequiredProps({
          componentName: node.name,
          declared: declaration.props,
          provided: node.props.map(prop => prop.name),
          location: node.location,
          definedIn: declaration.definedIn,
        })
      );

      checkComponentEvents(node, ctx);
      checkSlotFills(node, declaration, ctx);
      break;
    }
    case 'slot-fill': {
      if (!ctx.placedFills.has(node)) {
        ctx.errors.push(
          createDiagnostic(
            'error',
            `<slot:${node.name}> must be a direct child of a component call; here it fills no slot and renders nothing`,
            node.location,
            'MISPLACED_SLOT_FILL'
          )
        );
      }
      break;
    }
    case 'for':
      checkLoopKey(node, ctx);
      break;
    case 'text':
    case 'if':
    case 'match':
    case 'let':
    case 'fragment':
    case 'slot':
    case 'props':
    case 'comment':
    case 'doctype':
      break;
    default: {
      // Exhaustiveness guard: a new TemplateNode kind fails to compile here.
      const _never: never = node;
      return _never;
    }
  }

  for (const expr of expressionsOf(node)) {
    validateExpr(expr, ctx);
  }

  return undefined;
}

/**
 * The declared props of a component, from an inline definition or the host
 * registry. `undefined` means the component is unknown.
 */
/**
 * Reports interpolation into an attribute position this engine cannot encode.
 *
 * An `on*` handler's value is JavaScript source that this engine never parses,
 * so every escape it could apply would be a guess about a language it is not
 * reading. Refusing at compile time is the honest answer; the alternative is
 * emitting something that looks escaped and is not.
 *
 * `style` is deliberately NOT refused. Its value is a CSS declaration list, and
 * the renderer has an escaper that is correct for the position an interpolation
 * almost always occupies - the value half of a declaration - so `style="width:
 * ${pct}%"` is safe by default rather than rejected. Interpolating a whole
 * declaration needs `RenderConfig.allowStyleInterpolation`.
 */
function checkAttributeSinks(
  attributes: readonly AttributeNode[],
  ctx: ValidationContext
): void {
  for (const attribute of attributes) {
    const location = attribute.location;

    if (checkEventBinding(attribute, ctx, location)) continue;
    if (attributeExpressions(attribute).length === 0) continue;

    if (isEventHandlerAttribute(attribute.name)) {
      ctx.errors.push(
        createDiagnostic(
          'error',
          `Cannot interpolate into event handler attribute '${attribute.name}': its value is JavaScript source, and there is no correct way to escape a template value into it. Bind the handler in code instead.`,
          location,
          'UNENCODABLE_ATTRIBUTE'
        )
      );
    }
  }
}

/**
 * Checks one attribute for the three ways an `on:` binding goes wrong.
 *
 * A quoted value is the interesting one. `on:click="submit()"` reads exactly
 * like the `onclick` it replaces, and an author who writes it has written
 * something that can never work: the binding wants a *value*, and a quoted
 * value is text. Saying so is the whole reason `on:` is a separate node kind
 * rather than a name the renderer notices.
 *
 * @returns True when the attribute was an `on:` binding and needs no further
 *   checking as an attribute
 */
function checkEventBinding(
  attribute: AttributeNode,
  ctx: ValidationContext,
  location: SourceLocation
): boolean {
  if (attribute.kind !== 'event') {
    if (!/^on:/i.test(attribute.name)) return false;
    ctx.errors.push(
      createDiagnostic(
        'error',
        `'${attribute.name}' must be given an expression that evaluates to a function: write ${attribute.name}=\${handler}. A quoted value is text, and no text is a handler.`,
        location,
        'EVENT_NOT_AN_EXPRESSION'
      )
    );
    return true;
  }

  if (attribute.event === '') {
    ctx.errors.push(
      createDiagnostic(
        'error',
        `'${attribute.name}' names no event: write on:click, on:input, on:my-event.`,
        location,
        'EVENT_WITHOUT_NAME'
      )
    );
    return true;
  }

  if (ctx.target === 'string') {
    ctx.errors.push(
      createDiagnostic(
        'error',
        `'${attribute.name}' cannot be rendered to a string: a string carries characters, and no sequence of characters is a function. Render to the DOM, or drop the binding.`,
        location,
        'EVENT_IN_STRING_TARGET'
      )
    );
  }

  return true;
}

/**
 * Refuses an `on:` binding on a component call.
 *
 * A component is not an element: it has no node of its own to listen on, and
 * `on:click` reaching it is parsed as a prop whose name no expression inside the
 * component can even spell. It would be a handler that is never called and never
 * mentioned again. Pass the function as an ordinary prop and let the component
 * bind it to the element it means.
 */
function checkComponentEvents(
  node: ComponentNode,
  ctx: ValidationContext
): void {
  for (const prop of node.props) {
    if (!/^on:/i.test(prop.name)) continue;
    ctx.errors.push(
      createDiagnostic(
        'error',
        `'${prop.name}' cannot be bound on <${node.name}>: a component has no element of its own to listen on. Pass the handler as a prop - ${prop.name.slice(3)}=\${handler} - and bind it inside the component.`,
        prop.location,
        'EVENT_ON_COMPONENT'
      )
    );
  }
}

/**
 * Checks a `@for`'s key, and says when one is missing and would have mattered.
 *
 * A key names what a pass *is*. Reading the index variable in it therefore
 * contradicts itself - the position is precisely what a key exists to be
 * independent of - so that is an error rather than a warning.
 *
 * The missing-key warning is deliberately narrow. Every keyless loop reuses
 * rows by position, but that is only *observable* when a row holds state the
 * DOM keeps for it: what a form control contains, where the caret is, what a
 * component decided. Warning about the rest would be noise, and noise is how a
 * warning stops being read.
 */
function checkLoopKey(node: ForNode, ctx: ValidationContext): void {
  if (node.key !== undefined) {
    if (node.indexVar !== undefined && readsName(node.key, node.indexVar)) {
      ctx.errors.push(
        createDiagnostic(
          'error',
          `A @for key cannot read '${node.indexVar}': a key says what a pass is, and the position is what it must not depend on.`,
          node.key.location,
          'KEY_USES_INDEX'
        )
      );
    }
    return;
  }

  if (!holdsOwnState(node.body)) return;
  ctx.warnings.push(
    createDiagnostic(
      'warning',
      `This @for has no key, so its rows are identified by position. A row here holds state the browser keeps for it - a form control's value, focus, a component - and reordering the list will move that state onto a different row. Write @for(${node.itemVar} ... key <expression>).`,
      node.location,
      'UNKEYED_LOOP'
    )
  );
}

/** Whether an expression reads `name` as a root binding. */
function readsName(expr: ExprAst, name: string): boolean {
  let found = false;
  walkExpressions(expr, node => {
    if (found) return;
    const path =
      node.kind === 'path' ? node : node.kind === 'wildcard' ? node.path : null;
    if (path === null || path.isGlobal) return;
    const first = path.segments[0];
    if (first?.kind === 'key' && first.key === name) found = true;
  });
  return found;
}

/**
 * Elements whose state lives in the node rather than in the template.
 *
 * Re-rendering one of these in place is not the same as rebuilding it: the
 * value the user typed, the option they picked, the caret, the scroll offset
 * and the frame's whole session are all attached to the node and to nothing
 * this engine can see.
 */
const STATEFUL_ELEMENTS: ReadonlySet<string> = new Set([
  'audio',
  'canvas',
  'details',
  'dialog',
  'embed',
  'iframe',
  'input',
  'object',
  'option',
  'progress',
  'select',
  'textarea',
  'video',
]);

/** Whether any node in the body owns state the DOM keeps for it. */
function holdsOwnState(body: readonly TemplateNode[]): boolean {
  let found = false;
  walkNodes(body, node => {
    if (found) return false;
    if (node.kind === 'component') found = true;
    else if (
      node.kind === 'element' &&
      STATEFUL_ELEMENTS.has(node.tag.toLowerCase())
    ) {
      found = true;
    }
    return undefined;
  });
  return found;
}

/**
 * Checks the `<slot:name>` fills of one component call against the slots the
 * component actually declares.
 *
 * A fill naming a slot that does not exist used to disappear without a trace:
 * the slot rendered its fallback and the caller's content went nowhere.
 */
function checkSlotFills(
  node: ComponentNode,
  declaration: ComponentSchema,
  ctx: ValidationContext
): void {
  const declared = declaration.body
    ? declaredSlotNames(declaration.body)
    : undefined;

  for (const child of node.children) {
    if (child.kind !== 'slot-fill') continue;
    ctx.placedFills.add(child);
    // Without the component's body there is nothing to check against; an
    // externally declared component is taken at its word.
    if (declared === undefined) continue;
    if (declared.has(child.name)) continue;
    ctx.errors.push(
      createDiagnostic(
        'error',
        `Component ${node.name} declares no slot named '${child.name}'` +
          (declared.size > 0
            ? `; it declares ${Array.from(declared)
                .map(name => `'${name}'`)
                .join(', ')}`
            : ' and no named slots at all'),
        child.location,
        'UNKNOWN_SLOT'
      )
    );
  }
}

/** Names of the `<slot name="...">` declarations in a component body. */
function declaredSlotNames(body: readonly TemplateNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  walkNodes(body, node => {
    if (node.kind === 'slot' && node.name !== undefined) names.add(node.name);
  });
  return names;
}

function componentSchema(
  ctx: ValidationContext,
  name: string
): ComponentSchema | undefined {
  const inline = ctx.templateComponents.get(name);
  if (inline) return inline;
  if (
    ctx.externalComponents &&
    Object.prototype.hasOwnProperty.call(ctx.externalComponents, name)
  ) {
    return ctx.externalComponents[name];
  }
  return undefined;
}

/**
 * Validates an expression and everything below it, including the body of a
 * function expression.
 */
function validateExpr(expr: AnyExpr, ctx: ValidationContext): void {
  walkExpressions(expr, current => {
    checkExpr(current, ctx);
  });
}

function checkExpr(expr: ExprAst, ctx: ValidationContext): void {
  switch (expr.kind) {
    case 'call':
      // The static answer must match the runtime allowlist exactly: `in` said
      // yes to every inherited member of Object.prototype.
      if (ctx.helpers && !hasHelper(ctx.helpers, expr.callee)) {
        report(
          ctx,
          `Unknown helper function: ${expr.callee}`,
          expr.location,
          'UNKNOWN_HELPER'
        );
      }
      break;

    case 'path': {
      if (!ctx.schema || !ctx.strict || expr.isGlobal) break;
      const firstSegment = expr.segments[0];
      if (
        firstSegment?.kind === 'key' &&
        ctx.schema.properties &&
        !Object.prototype.hasOwnProperty.call(
          ctx.schema.properties,
          firstSegment.key
        )
      ) {
        // Deliberately a warning even in strict mode: a schema describes the
        // data a caller promised, not the data it may pass.
        ctx.warnings.push(
          createDiagnostic(
            'warning',
            `Property '${firstSegment.key}' not found in schema`,
            expr.location,
            'UNKNOWN_PROPERTY'
          )
        );
      }
      break;
    }

    case 'literal':
    case 'unary':
    case 'binary':
    case 'ternary':
    case 'wildcard':
    case 'array':
    case 'member':
    case 'function':
      // Nothing to check at this node; walkExpressions covers the children.
      break;

    default: {
      // Exhaustiveness guard: a new ExprAst kind fails to compile here.
      const _never: never = expr;
      return _never;
    }
  }
}
