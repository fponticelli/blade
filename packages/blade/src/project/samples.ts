/**
 * Sample Data Loading for Blade Projects
 *
 * Loads and processes sample JSON files from the samples/ directory
 * for LSP hover hints with example values.
 */

import { join, basename, extname } from 'path';
import type { Diagnostic } from '../ast/types.js';
import { createDiagnostic } from '../validation/index.js';
import { nodeFileSystem } from './fs.js';
import type { FileSystem } from './fs.js';

/**
 * Loaded sample data
 */
export interface ProjectSamples {
  /** Sample files loaded from samples/ directory */
  samples: SampleFile[];
  /** Flattened value paths for quick lookup */
  values: Map<string, SampleValue[]>;
}

/**
 * A single sample file
 */
export interface SampleFile {
  /** File name without extension */
  name: string;
  /** Full file path */
  filePath: string;
  /** Parsed JSON data */
  data: unknown;
}

/**
 * A sample value at a specific path
 */
export interface SampleValue {
  /** Which sample file this value came from */
  sampleName: string;
  /** The value at this path */
  value: unknown;
  /** String representation for display */
  displayValue: string;
}

const SAMPLES_DIR = 'samples';
const JSON_EXTENSION = '.json';

/** A sample load attempt: what was loaded, and what could not be. */
export interface LoadedSamples {
  /** Null when the project ships no readable samples. */
  readonly samples: ProjectSamples | null;
  /**
   * One per sample file that could not be parsed. A malformed sample used to
   * be skipped in silence, so a payload with a trailing comma simply stopped
   * appearing in hovers with nothing said about it.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Loads sample files from a project's samples/ directory.
 *
 * @param projectRoot - Path to the project root directory
 * @param io - Filesystem to read through
 * @returns Loaded samples or null if samples/ doesn't exist
 */
export async function loadProjectSamples(
  projectRoot: string,
  io: FileSystem = nodeFileSystem
): Promise<ProjectSamples | null> {
  return (await loadProjectSamplesResult(projectRoot, io)).samples;
}

/**
 * Loads sample files, reporting the ones that could not be read.
 *
 * @param projectRoot - Path to the project root directory
 * @param io - Filesystem to read through
 * @returns The samples and any diagnostics about them
 */
export async function loadProjectSamplesResult(
  projectRoot: string,
  io: FileSystem = nodeFileSystem
): Promise<LoadedSamples> {
  const samplesPath = join(projectRoot, SAMPLES_DIR);
  const diagnostics: Diagnostic[] = [];

  let entries;
  try {
    entries = await io.readDirectory(samplesPath);
  } catch {
    // No samples/ directory. A project need not ship example data.
    return { samples: null, diagnostics };
  }

  const samples: SampleFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile || extname(entry.name) !== JSON_EXTENSION) {
      continue;
    }

    const filePath = join(samplesPath, entry.name);
    const name = basename(entry.name, JSON_EXTENSION);

    try {
      const content = await io.readFile(filePath);
      samples.push({ name, filePath, data: JSON.parse(content) });
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          'warning',
          `Sample '${entry.name}' could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
          {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
          'INVALID_SAMPLE'
        )
      );
    }
  }

  if (samples.length === 0) {
    return { samples: null, diagnostics };
  }

  return {
    samples: { samples, values: extractSampleValues(samples) },
    diagnostics,
  };
}

/**
 * Extracts flattened path → value mappings from all sample files.
 *
 * @param samples - Array of loaded sample files
 * @returns Map of paths to their values across all samples
 */
export function extractSampleValues(
  samples: SampleFile[]
): Map<string, SampleValue[]> {
  const values = new Map<string, SampleValue[]>();

  for (const sample of samples) {
    extractValuesFromObject(sample.data, '', sample.name, values);
  }

  return values;
}

/**
 * Recursively extracts values from an object.
 */
function extractValuesFromObject(
  obj: unknown,
  prefix: string,
  sampleName: string,
  values: Map<string, SampleValue[]>
): void {
  if (obj === null || obj === undefined) {
    return;
  }

  if (typeof obj !== 'object') {
    // Primitive value - add to map
    const entry: SampleValue = {
      sampleName,
      value: obj,
      displayValue: formatDisplayValue(obj),
    };

    const existing = values.get(prefix) || [];
    existing.push(entry);
    values.set(prefix, existing);
    return;
  }

  if (Array.isArray(obj)) {
    // Add the array itself
    const entry: SampleValue = {
      sampleName,
      value: obj,
      displayValue: `Array(${obj.length})`,
    };
    const existing = values.get(prefix) || [];
    existing.push(entry);
    values.set(prefix, existing);

    // Recurse into array items with [] notation
    // Only process the first item to avoid duplicate entries for each array element
    if (obj.length > 0) {
      const itemPath = prefix ? `${prefix}[]` : '[]';
      extractValuesFromObject(obj[0], itemPath, sampleName, values);
    }
    return;
  }

  // Object - add the object itself and recurse
  const objEntry: SampleValue = {
    sampleName,
    value: obj,
    displayValue: `Object(${Object.keys(obj as object).length} keys)`,
  };
  const existing = values.get(prefix) || [];
  existing.push(objEntry);
  values.set(prefix, existing);

  for (const [key, val] of Object.entries(obj as object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    extractValuesFromObject(val, path, sampleName, values);
  }
}

/**
 * Formats a value for display in hover hints.
 */
function formatDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 50) {
      return `"${value.substring(0, 47)}..."`;
    }
    return `"${value}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
}

/**
 * Gets sample values for a specific variable path.
 *
 * @param samples - The project samples
 * @param path - Variable path (e.g., "user.name" or "$user.name")
 * @returns Array of sample values or empty array if not found
 */
export function getSampleValues(
  samples: ProjectSamples,
  path: string
): SampleValue[] {
  // Remove leading $ if present
  const normalizedPath = path.startsWith('$') ? path.slice(1) : path;
  return samples.values.get(normalizedPath) || [];
}

/**
 * Formats sample values for hover display.
 *
 * @param values - Array of sample values
 * @returns Formatted string for hover display
 */
export function formatSampleHint(values: SampleValue[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return `Example: ${values[0]!.displayValue}`;
  }

  // Multiple samples - show each
  const lines = values.map(v => `  ${v.sampleName}: ${v.displayValue}`);
  return `Examples:\n${lines.join('\n')}`;
}
