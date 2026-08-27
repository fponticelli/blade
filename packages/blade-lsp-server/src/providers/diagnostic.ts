/**
 * Diagnostic Provider for Blade Language Server
 *
 * Everything the server publishes for a document is built here: parse errors,
 * the lint rules the settings have always advertised, `@props` checks against
 * the schema, and sample-file validation.
 *
 * Two things were wrong beyond the missing rules. The server hand-rolled a
 * *fifth* parse-error conversion of its own, which emitted
 * `start.character = column - 1` but `end.character = column + 10` - an
 * unintended off-by-one that made every error range eleven characters wide -
 * while `parseErrorToDiagnostic` here computed it correctly and was never
 * called. And schema semantics were implemented twice: this file walked the
 * schema by hand, skipped absent properties outright (so a sample *missing* a
 * required field validated clean), and compared `typeof 42` against
 * `"integer"`, so every integer field reported a false type mismatch. There is
 * now one implementation of what a schema means - `ProjectSchema.validate`,
 * compiled by Ajv in the project layer - and this file consumes it.
 */

import type { ParseError } from '@bladets/template';
import type {
  BladeDocument,
  DiagnosticCode,
  LspConfig,
  DiagnosticSeverity,
  HelperDefinition,
  ScopeVariable,
} from '../types.js';
import type { ProjectLspContext } from '../project-context.js';
import type { SampleFile } from '@bladets/template/node';
import type { SchemaValidationError } from '@bladets/template/node';
import type { PropDeclaration, SourceLocation } from '@bladets/template';
import { parseTemplate } from '@bladets/template';
import { getSchemaPropertyInfo } from '@bladets/template/node';
import { collectFreeVariables } from '@bladets/template/node';
import { helperMetadata } from '@bladets/template';
import { indexJsonPaths, locateJsonPath } from '../json-source.js';
import { positionAt } from '../line-index.js';
import { createLineIndex } from '../line-index.js';

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

/** Everything a document's diagnostics may consult beyond the document. */
export interface DiagnosticOptions {
  /** The project the document belongs to, when it belongs to one. */
  readonly projectContext?: ProjectLspContext | null;
  /** Helper definitions loaded from `completion.helpersDefinitionPath`. */
  readonly helpers?: readonly HelperDefinition[];
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
    code: 'PARSE_ERROR',
    message: error.message,
  };
}

/**
 * Estimate the length of the error span for better highlighting
 */
function estimateErrorLength(error: ParseError): number {
  // Default length for error highlighting
  const defaultLength = 10;

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
 * Every diagnostic for a document.
 *
 * The single entry point the server publishes from, so that a rule cannot be
 * implemented, exported, tested and then left uncalled - which is what happened
 * to this function, `validateSamples` and `generatePropsValidationDiagnostics`
 * alike.
 */
export function generateDiagnostics(
  doc: BladeDocument,
  config: LspConfig,
  options: DiagnosticOptions = {}
): LspDiagnostic[] {
  if (!config.diagnostics.enabled) return [];

  if (doc.oversized) {
    return [
      {
        range: zeroRange(),
        severity: LspDiagnosticSeverityEnum.Information,
        source: 'blade',
        code: 'FILE_TOO_LARGE',
        message:
          `This file is ${doc.content.length} bytes, above the ` +
          `blade.lsp.performance.maxFileSize limit of ${config.performance.maxFileSize}. ` +
          `Language features are disabled for it.`,
      },
    ];
  }

  const diagnostics: LspDiagnostic[] = [];

  for (const error of doc.errors) {
    diagnostics.push(parseErrorToDiagnostic(error));
  }

  diagnostics.push(...unusedVariableDiagnostics(doc, config));
  diagnostics.push(...deepNestingDiagnostics(doc, config));
  diagnostics.push(
    ...generateDeprecatedHelperDiagnostics(doc, config, options.helpers)
  );
  diagnostics.push(
    ...generatePropsValidationDiagnostics(doc, options.projectContext)
  );
  diagnostics.push(
    ...potentiallyUndefinedDiagnostics(doc, config, options.projectContext)
  );

  return diagnostics;
}

/**
 * Variables declared and never read.
 *
 * `isVariableUsed` used to return `true` unconditionally "to avoid false
 * positives", which made `blade.lsp.diagnostics.unusedVariables` a setting with
 * nothing behind it. The scope analyser now walks every expression in the
 * document, including component definition bodies, so the answer is real.
 */
function unusedVariableDiagnostics(
  doc: BladeDocument,
  config: LspConfig
): LspDiagnostic[] {
  const severity = config.diagnostics.unusedVariables;
  if (severity === 'off') return [];

  const diagnostics: LspDiagnostic[] = [];
  const reported = new Set<string>();

  for (const variable of doc.scope.declarations) {
    if (doc.scope.usedVariables.has(variable.name)) continue;

    const key = `${variable.name}:${variable.location.start.offset}`;
    if (reported.has(key)) continue;
    reported.add(key);

    diagnostics.push({
      range: rangeOf(variable.location),
      severity: severityFromString(severity),
      source: 'blade',
      code: 'UNUSED_VARIABLE',
      message: `${describeKind(variable)} '${variable.name}' is never used.`,
    });
  }

  return diagnostics;
}

function describeKind(variable: ScopeVariable): string {
  switch (variable.kind) {
    case 'prop':
      return 'Prop';
    case 'for-item':
      return 'Loop item';
    case 'for-index':
      return 'Loop index';
    case 'for-key':
      return 'Loop key';
    case 'global':
      return 'Global';
    case 'data':
      return 'Data variable';
    case 'let':
      return 'Variable';
  }
}

/**
 * Control flow nested deeper than `deepNestingThreshold`.
 *
 * Only the shallowest offending node of each chain is reported: warning once
 * per level below it would bury the one place worth restructuring.
 */
function deepNestingDiagnostics(
  doc: BladeDocument,
  config: LspConfig
): LspDiagnostic[] {
  const severity = config.diagnostics.deepNesting;
  if (severity === 'off') return [];

  const threshold = config.diagnostics.deepNestingThreshold;
  return doc.scope.nestingSites
    .filter(site => site.depth === threshold + 1)
    .map(site => ({
      range: rangeOf(site.location),
      severity: severityFromString(severity),
      source: 'blade',
      code: 'DEEP_NESTING' as const,
      message: `Nesting is ${site.depth} levels deep, above the configured maximum of ${threshold}.`,
    }));
}

/**
 * Names an expression reads that nothing can provide.
 *
 * Only reported when the project has a schema: without one there is no
 * statement of what the data contains, and every read of it would be flagged.
 */
function potentiallyUndefinedDiagnostics(
  doc: BladeDocument,
  config: LspConfig,
  projectContext: ProjectLspContext | null | undefined
): LspDiagnostic[] {
  const severity = config.diagnostics.potentiallyUndefined;
  const schema = projectContext?.schema;
  if (severity === 'off' || !schema) return [];

  const known = new Set<string>(Object.keys(helperMetadata));
  for (const property of schema.properties) {
    if (!property.path.includes('.')) known.add(property.path);
  }

  const diagnostics: LspDiagnostic[] = [];
  const report = (free: Map<string, SourceLocation>): void => {
    for (const [name, location] of free) {
      if (known.has(name)) continue;
      diagnostics.push({
        range: rangeOf(location),
        severity: severityFromString(severity),
        source: 'blade',
        code: 'POTENTIALLY_UNDEFINED',
        message: `'${name}' is not declared by @props and not a property of schema.json.`,
      });
    }
  };

  report(collectFreeVariables(doc.ast ?? []));
  for (const [, definition] of doc.components) {
    report(
      collectFreeVariables(
        definition.body,
        definition.props.map(prop => prop.name)
      )
    );
  }

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
 * Check if a helper is deprecated.
 *
 * @param helperName - The helper being called
 * @param helpers - Definitions loaded from `completion.helpersDefinitionPath`
 */
export function isHelperDeprecated(
  helperName: string,
  helpers: readonly HelperDefinition[] | undefined
): { deprecated: boolean; replacement?: string } {
  const definition = helpers?.find(helper => helper.name === helperName);
  if (!definition?.deprecated) return { deprecated: false };
  return { deprecated: true, replacement: definition.deprecatedMessage };
}

/**
 * Calls to helpers a helpers-definition file marks deprecated.
 */
export function generateDeprecatedHelperDiagnostics(
  doc: BladeDocument,
  config: LspConfig,
  helpers: readonly HelperDefinition[] | undefined
): LspDiagnostic[] {
  const severity = config.diagnostics.deprecatedHelpers;
  if (severity === 'off' || !helpers || helpers.length === 0) return [];

  const diagnostics: LspDiagnostic[] = [];
  for (const call of doc.scope.helperCalls) {
    const status = isHelperDeprecated(call.helperName, helpers);
    if (!status.deprecated) continue;
    diagnostics.push({
      range: rangeOf(call.location),
      severity: severityFromString(severity),
      source: 'blade',
      code: 'DEPRECATED_HELPER',
      message: status.replacement
        ? `'${call.helperName}' is deprecated. ${status.replacement}`
        : `'${call.helperName}' is deprecated.`,
    });
  }
  return diagnostics;
}

/**
 * Sample validation result
 */
export interface SampleValidationResult {
  /** Sample file that was validated */
  sampleFile: SampleFile;
  /** Validation errors found */
  errors: readonly SampleValidationError[];
}

/**
 * A single validation error in a sample file.
 *
 * The schema's own error type: one notion of what a schema violation is, in one
 * path notation, produced by one validator.
 */
export type SampleValidationError = SchemaValidationError;

/**
 * Validates sample files against the project schema.
 *
 * @param projectContext - The project context with schema and samples
 * @returns Array of validation results for each sample file
 */
export function validateSamples(
  projectContext: ProjectLspContext
): SampleValidationResult[] {
  const schema = projectContext.schema;
  if (!schema || !projectContext.samples) {
    return [];
  }

  return projectContext.samples.samples.map(sample => ({
    sampleFile: sample,
    errors: schema.validate(sample.data),
  }));
}

/**
 * Gets project-level diagnostics including sample validation.
 *
 * Each diagnostic points at the value the schema rejected. They all used to be
 * emitted at line 0, character 0.
 *
 * @param projectContext - The project context
 * @returns Diagnostics by sample file path
 */
export function getProjectDiagnostics(
  projectContext: ProjectLspContext
): Map<string, LspDiagnostic[]> {
  const diagnosticsByFile = new Map<string, LspDiagnostic[]>();

  for (const result of validateSamples(projectContext)) {
    if (result.errors.length === 0) {
      continue;
    }

    const source = projectContext.sampleSources.get(result.sampleFile.filePath);
    const spans = source ? indexJsonPaths(source) : undefined;
    const lines = source ? createLineIndex(source) : undefined;

    const diagnostics: LspDiagnostic[] = result.errors.map(error => {
      const span = spans ? locateJsonPath(spans, error.path) : undefined;
      const range =
        span && lines
          ? {
              start: positionAt(lines, span.start),
              end: positionAt(lines, span.end),
            }
          : zeroRange();

      return {
        range,
        severity: LspDiagnosticSeverityEnum.Warning,
        source: 'blade',
        code: 'INVALID_SAMPLE' as const,
        message: `${error.path}: ${error.message}`,
      };
    });

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
  return validateDeclaredProps(parseTemplate(content).props, projectContext);
}

/**
 * Validates already-parsed `@props` declarations against the project schema.
 *
 * @param declarations - Declarations from the template AST
 * @param projectContext - Project context with schema
 * @returns Array of validation errors
 */
export function validateDeclaredProps(
  declarations: readonly PropDeclaration[],
  projectContext: ProjectLspContext
): PropsValidationError[] {
  const errors: PropsValidationError[] = [];

  if (!projectContext.schema) {
    return errors;
  }

  for (const prop of declarations) {
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
  projectContext?: ProjectLspContext | null
): LspDiagnostic[] {
  if (!projectContext) {
    return [];
  }

  return validateDeclaredProps(doc.props, projectContext).map(error => ({
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
    code: 'UNKNOWN_PROP' as const,
    message: error.message,
  }));
}

function rangeOf(location: SourceLocation): LspDiagnostic['range'] {
  return {
    start: {
      line: location.start.line - 1,
      character: location.start.column - 1,
    },
    end: { line: location.end.line - 1, character: location.end.column - 1 },
  };
}

function zeroRange(): LspDiagnostic['range'] {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}
