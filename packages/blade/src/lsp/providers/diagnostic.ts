/**
 * Diagnostic Provider for Blade Language Server
 * Converts parse errors and lint warnings to LSP Diagnostics
 */

import type { ParseError } from '../../parser/index.js';
import type {
  BladeDocument,
  DiagnosticCode,
  LspConfig,
  DiagnosticSeverity,
} from '../types.js';
import type { ProjectLspContext } from '../project-context.js';
import type { JsonSchemaProperty } from '../../project/schema.js';
import type { SampleFile } from '../../project/samples.js';
import { parseProps } from '../../parser/props-parser.js';
import { getSchemaPropertyInfo } from '../../project/schema.js';

/**
 * LSP Diagnostic severity levels (numeric values from LSP spec)
 */
export enum LspDiagnosticSeverityEnum {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * LSP Diagnostic structure
 */
export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: LspDiagnosticSeverityEnum;
  code?: DiagnosticCode;
  source: string;
  message: string;
  relatedInformation?: Array<{
    location: {
      uri: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
    message: string;
  }>;
}

/**
 * Convert a ParseError to LSP Diagnostic
 */
export function parseErrorToDiagnostic(error: ParseError): LspDiagnostic {
  // Convert 1-indexed line/column to 0-indexed for LSP
  const line = error.line - 1;
  const character = error.column - 1;

  return {
    range: {
      start: { line, character },
      end: { line, character: character + estimateErrorLength(error) },
    },
    severity: LspDiagnosticSeverityEnum.Error,
    source: 'blade',
    message: error.message,
  };
}

/**
 * Estimate the length of the error span for better highlighting
 */
function estimateErrorLength(error: ParseError): number {
  // Default length for error highlighting
  const defaultLength = 10;

  // Try to extract context from error message for better span estimation
  if (error.message.includes('unexpected')) {
    return defaultLength;
  }

  if (error.message.includes('expected')) {
    return 1; // Point to where something was expected
  }

  if (error.message.includes('unclosed')) {
    return defaultLength;
  }

  return defaultLength;
}

/**
 * Generate diagnostics for a Blade document
 */
export function generateDiagnostics(
  doc: BladeDocument,
  _config: LspConfig
): LspDiagnostic[] {
  const diagnostics: LspDiagnostic[] = [];

  // Add parse errors
  for (const error of doc.errors) {
    diagnostics.push(parseErrorToDiagnostic(error));
  }

  // Note: Lint diagnostics (unused variables, deep nesting, deprecated helpers)
  // require enhanced scope tracking beyond the basic DocumentScope structure.
  // These would be implemented when the scope analyzer is extended to track:
  // - usedVariables: Set of variable names that are actually referenced
  // - maxNestingDepth: Maximum nesting depth encountered
  // - helpersUsed: Set of helper function names called

  return diagnostics;
}

/**
 * Convert severity string to LspDiagnosticSeverityEnum
 */
export function severityFromString(
  severity: DiagnosticSeverity
): LspDiagnosticSeverityEnum {
  switch (severity) {
    case 'error':
      return LspDiagnosticSeverityEnum.Error;
    case 'warning':
      return LspDiagnosticSeverityEnum.Warning;
    case 'hint':
      return LspDiagnosticSeverityEnum.Hint;
    case 'off':
    default:
      return LspDiagnosticSeverityEnum.Warning;
  }
}

/**
 * Check if a helper is deprecated
 */
export function isHelperDeprecated(
  _helperName: string,
  _helpersConfig: unknown
): { deprecated: boolean; replacement?: string } {
  // This would check against a helpers configuration file
  // For now, return not deprecated
  return { deprecated: false };
}

/**
 * Generate diagnostics for deprecated helpers (placeholder)
 */
export function generateDeprecatedHelperDiagnostics(
  _doc: BladeDocument,
  config: LspConfig,
  _helpersConfig: unknown
): LspDiagnostic[] {
  const diagnostics: LspDiagnostic[] = [];

  if (config.diagnostics.deprecatedHelpers === 'off') {
    return diagnostics;
  }

  // Note: Would traverse doc.scope.helperCalls to check each helper
  // against helpersConfig for deprecation status.

  return diagnostics;
}

/**
 * Sample validation result
 */
export interface SampleValidationResult {
  /** Sample file that was validated */
  sampleFile: SampleFile;
  /** Validation errors found */
  errors: SampleValidationError[];
}

/**
 * A single validation error in a sample file
 */
export interface SampleValidationError {
  /** Path in the JSON where the error occurred */
  path: string;
  /** Error message */
  message: string;
  /** Expected type according to schema */
  expectedType?: string;
  /** Actual type found in sample */
  actualType?: string;
}

/**
 * Validates sample files against the project schema.
 *
 * @param projectContext - The project context with schema and samples
 * @returns Array of validation results for each sample file
 */
export function validateSamples(
  projectContext: ProjectLspContext
): SampleValidationResult[] {
  const results: SampleValidationResult[] = [];

  if (!projectContext.schema || !projectContext.samples) {
    return results;
  }

  const schema = projectContext.schema.schema;

  for (const sample of projectContext.samples.samples) {
    const errors = validateObjectAgainstSchema(sample.data, schema, '');
    results.push({ sampleFile: sample, errors });
  }

  return results;
}

/**
 * Validates a value against a JSON Schema property.
 */
function validateObjectAgainstSchema(
  value: unknown,
  schema: JsonSchemaProperty,
  path: string
): SampleValidationError[] {
  const errors: SampleValidationError[] = [];

  if (value === null || value === undefined) {
    // Allow null/undefined - schema doesn't require values
    return errors;
  }

  const actualType = getValueType(value);

  // Check type if specified
  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type)
      ? schema.type
      : [schema.type];

    if (!expectedTypes.includes(actualType) && !expectedTypes.includes('any')) {
      // Special case: 'object' type matches objects and arrays in JSON Schema
      if (!(expectedTypes.includes('object') && actualType === 'object')) {
        errors.push({
          path: path || '(root)',
          message: `Type mismatch: expected ${expectedTypes.join(' | ')}, got ${actualType}`,
          expectedType: expectedTypes.join(' | '),
          actualType,
        });
        return errors; // Don't recurse if type is wrong
      }
    }
  }

  // Validate object properties
  if (schema.properties && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${propName}` : propName;
      const propValue = obj[propName];

      // Recurse into property
      if (propValue !== undefined) {
        errors.push(
          ...validateObjectAgainstSchema(propValue, propSchema, propPath)
        );
      }
    }
  }

  // Validate array items
  if (schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemPath = `${path}[${i}]`;
      errors.push(
        ...validateObjectAgainstSchema(value[i], schema.items, itemPath)
      );
    }
  }

  // Validate enum values
  if (
    schema.enum &&
    !schema.enum.includes(value as string | number | boolean)
  ) {
    errors.push({
      path: path || '(root)',
      message: `Value "${String(value)}" is not one of allowed values: ${schema.enum.join(', ')}`,
    });
  }

  return errors;
}

/**
 * Gets the JSON type of a value.
 */
function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Gets project-level diagnostics including sample validation.
 *
 * @param projectContext - The project context
 * @returns Array of diagnostics for the project
 */
export function getProjectDiagnostics(
  projectContext: ProjectLspContext
): Map<string, LspDiagnostic[]> {
  const diagnosticsByFile = new Map<string, LspDiagnostic[]>();

  const validationResults = validateSamples(projectContext);

  for (const result of validationResults) {
    if (result.errors.length === 0) {
      continue;
    }

    const diagnostics: LspDiagnostic[] = result.errors.map(error => ({
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      severity: LspDiagnosticSeverityEnum.Warning,
      source: 'blade',
      message: `${error.path}: ${error.message}`,
    }));

    diagnosticsByFile.set(result.sampleFile.filePath, diagnostics);
  }

  return diagnosticsByFile;
}

/**
 * Props validation error
 */
export interface PropsValidationError {
  /** Prop name that failed validation */
  propName: string;
  /** Error message */
  message: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
}

/**
 * Validates @props directive against project schema.
 *
 * Checks that all props declared in @props() exist as properties in schema.json.
 *
 * @param content - Template file content
 * @param projectContext - Project context with schema
 * @returns Array of validation errors
 */
export function validatePropsAgainstSchema(
  content: string,
  projectContext: ProjectLspContext
): PropsValidationError[] {
  const errors: PropsValidationError[] = [];

  if (!projectContext.schema) {
    return errors;
  }

  // Parse @props directive
  const propsResult = parseProps(content);
  if (!propsResult.directive) {
    return errors;
  }

  // Validate each prop against schema
  for (const prop of propsResult.directive.props) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, prop.name);

    if (!schemaInfo) {
      errors.push({
        propName: prop.name,
        message: `Prop '${prop.name}' is not defined in schema.json`,
        line: prop.location.start.line,
        column: prop.location.start.column,
      });
    }
  }

  return errors;
}

/**
 * Generate @props validation diagnostics for a Blade document.
 *
 * @param doc - The Blade document to validate
 * @param projectContext - Optional project context for schema validation
 * @returns Array of LSP diagnostics for props validation errors
 */
export function generatePropsValidationDiagnostics(
  doc: BladeDocument,
  projectContext?: ProjectLspContext
): LspDiagnostic[] {
  if (!projectContext) {
    return [];
  }

  const propsErrors = validatePropsAgainstSchema(doc.content, projectContext);

  return propsErrors.map(error => ({
    range: {
      // Convert 1-indexed to 0-indexed for LSP
      start: { line: error.line - 1, character: error.column - 1 },
      end: {
        line: error.line - 1,
        character: error.column - 1 + error.propName.length,
      },
    },
    severity: LspDiagnosticSeverityEnum.Warning,
    source: 'blade',
    code: 'UNKNOWN_PROP',
    message: error.message,
  }));
}
