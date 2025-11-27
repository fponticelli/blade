/**
 * Props Handling for Blade Projects
 *
 * Parses @props directives from component files and infers props
 * from template content when no explicit @props directive exists.
 */

import type {
  PropDeclaration,
  Diagnostic,
  SourceLocation,
} from '../ast/types.js';
import { parseProps } from '../parser/props-parser.js';

export interface PropsWarning {
  message: string;
  line: number;
  column: number;
}

export interface ComponentPropsResult {
  props: PropDeclaration[];
  inferred: boolean;
  warnings: PropsWarning[];
}

/**
 * Parses or infers props from a component source file.
 *
 * @param source - The component source code
 * @returns The parsed/inferred props and any warnings
 */
export function parseComponentProps(source: string): ComponentPropsResult {
  // Try to parse @props directive
  const parseResult = parseProps(source);

  if (parseResult.directive) {
    // @props directive found and parsed successfully
    return {
      props: parseResult.directive.props as PropDeclaration[],
      inferred: false,
      warnings: parseResult.warnings.map(w => ({
        message: w.message,
        line: w.line,
        column: w.column,
      })),
    };
  }

  // Check if there were @props parse warnings (malformed @props)
  if (parseResult.warnings.length > 0) {
    // Malformed @props - fall back to inference with warnings
    const inferred = inferPropsFromSource(source);
    return {
      props: inferred,
      inferred: true,
      warnings: parseResult.warnings.map(w => ({
        message: w.message,
        line: w.line,
        column: w.column,
      })),
    };
  }

  // No @props directive at all - infer from template
  const inferred = inferPropsFromSource(source);
  return {
    props: inferred,
    inferred: true,
    warnings: [],
  };
}

/**
 * Infers props from template source by finding $variable references.
 *
 * @param source - The template source code
 * @returns Array of inferred prop declarations (all required)
 */
function inferPropsFromSource(source: string): PropDeclaration[] {
  const variablePattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const variables = new Set<string>();

  let match;
  while ((match = variablePattern.exec(source)) !== null) {
    const varName = match[1];
    if (varName) {
      variables.add(varName);
    }
  }

  // Convert to prop declarations (all inferred props are required)
  return Array.from(variables).map(name => ({
    name,
    required: true,
    defaultValue: undefined,
    location: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
  }));
}

/**
 * Creates a diagnostic for a missing required prop.
 *
 * @param propName - The name of the missing prop
 * @param componentName - The component name
 * @param usageLocation - Where the component is used
 * @param definedAt - Where the prop is defined (optional)
 * @returns A diagnostic with actionable information
 */
export function createMissingPropDiagnostic(
  propName: string,
  componentName: string,
  usageLocation: { start: { line: number; column: number } },
  definedAt?: { file: string; line: number }
): Diagnostic {
  let message = `Missing required prop '${propName}' for component '${componentName}'.`;
  message += `\n  Used at: line ${usageLocation.start.line}, column ${usageLocation.start.column}`;

  if (definedAt) {
    message += `\n  Defined at: ${definedAt.file}:${definedAt.line}`;
  }

  const location: SourceLocation = {
    start: {
      line: usageLocation.start.line,
      column: usageLocation.start.column,
      offset: 0,
    },
    end: {
      line: usageLocation.start.line,
      column: usageLocation.start.column,
      offset: 0,
    },
  };

  return {
    level: 'error',
    message,
    location,
  };
}
