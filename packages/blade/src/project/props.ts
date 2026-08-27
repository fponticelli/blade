/**
 * Props Handling for Blade Projects
 *
 * Reads the `@props` directive of a component file, and - when it has none -
 * infers what the component reads from its caller.
 */

import type {
  PropDeclaration,
  PropsNode,
  SourceLocation,
  TemplateNode,
  Diagnostic,
} from '../ast/types.js';
import { parseTemplate } from '../parser/index.js';
import type { TemplateParseResult } from '../parser/index.js';
import { walkNodes } from '../ast/visitor.js';
import { collectFreeVariables } from './free-variables.js';
import { createDiagnostic } from '../validation/index.js';

export interface PropsWarning {
  message: string;
  line: number;
  column: number;
}

export interface ComponentPropsResult {
  props: PropDeclaration[];
  /** True when nothing was declared and the list was derived from usage. */
  inferred: boolean;
  warnings: PropsWarning[];
}

/** The `@props` node of a parsed template, if it declares one. */
function findPropsNode(nodes: readonly TemplateNode[]): PropsNode | undefined {
  let found: PropsNode | undefined;
  walkNodes(nodes, node => {
    if (found) return false;
    if (node.kind === 'props') {
      found = node;
      return false;
    }
    return undefined;
  });
  return found;
}

/**
 * Parses or infers props from a component source file.
 *
 * `@props` is an ordinary directive in the one template parser, so this reads
 * the declarations off the AST.
 *
 * @param source - The component source code
 * @returns The parsed/inferred props and any warnings
 */
export function parseComponentProps(source: string): ComponentPropsResult {
  return componentPropsFrom(parseTemplate(source));
}

/**
 * Parses or infers props from an already-parsed component.
 *
 * The project compiler parses each file once and needs both its props and its
 * body; re-parsing the same bytes to answer the second question is what this
 * exists to avoid.
 *
 * @param parsed - The parsed component
 * @returns The parsed/inferred props and any warnings
 */
export function componentPropsFrom(
  parsed: TemplateParseResult
): ComponentPropsResult {
  const propsNode = findPropsNode(parsed.value);

  if (!propsNode) {
    return {
      props: inferProps(parsed.value),
      inferred: true,
      warnings: [],
    };
  }

  // Only diagnostics from inside the directive itself are props warnings.
  const warnings = parsed.errors
    .filter(
      error =>
        error.offset >= propsNode.location.start.offset &&
        error.offset <= propsNode.location.end.offset
    )
    .map(error => ({
      message: error.message,
      line: error.line,
      column: error.column,
    }));

  if (warnings.length > 0 && propsNode.props.length === 0) {
    // Malformed @props: fall back to inference, but say why.
    return {
      props: inferProps(parsed.value),
      inferred: true,
      warnings,
    };
  }

  return {
    props: propsNode.props.map(declaration => ({ ...declaration })),
    inferred: false,
    warnings,
  };
}

/**
 * The props a component appears to expect, from what it reads.
 *
 * Inferred props are NEVER required. Inference cannot tell "the caller must
 * pass this" from "this name is referenced": the previous implementation
 * marked every match of `/\$\w+/` over the raw source as `required: true`, so
 * a component containing `@for($item of $items)` demanded an `item` attribute
 * at every call site and the whole project failed to compile over a loop
 * variable. A name that is read but not declared is worth a warning - see
 * {@link createUndeclaredPropDiagnostic} - and never a hard error.
 */
function inferProps(nodes: readonly TemplateNode[]): PropDeclaration[] {
  return Array.from(collectFreeVariables(nodes), ([name, location]) => ({
    name,
    required: false,
    defaultValue: undefined,
    location,
  }));
}

/**
 * Reports a prop a component reads without declaring.
 *
 * A warning, deliberately. The component works if its caller happens to pass
 * the value; what is missing is the declaration that would let the compiler
 * check that at the call site.
 *
 * @param propName - The undeclared name
 * @param componentName - The component that reads it
 * @param location - Where it is first read, inside the component
 */
export function createUndeclaredPropDiagnostic(
  propName: string,
  componentName: string,
  location: SourceLocation
): Diagnostic {
  return createDiagnostic(
    'warning',
    `Component '${componentName}' reads '$${propName}' but declares no props for it.\n` +
      `  Tip: add @props($${propName}) so call sites can be checked.`,
    location,
    'UNDECLARED_PROP'
  );
}
