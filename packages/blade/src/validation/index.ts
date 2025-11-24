// Validation module
// TODO: Implement template validation

import type { Diagnostic, SourceLocation } from '../ast/types.js';
import type { HelperRegistry } from '../evaluator/index.js';

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

export function validateTemplate(
  _source: string,
  _options?: ValidationOptions
): ValidationResult {
  // TODO: Implement validation
  throw new Error('Not implemented');
}

export function createDiagnostic(
  level: 'error' | 'warning',
  message: string,
  location: SourceLocation,
  code?: string
): Diagnostic {
  return { level, message, location, code };
}
