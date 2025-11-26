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
