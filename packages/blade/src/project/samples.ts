/**
 * Sample Data Loading for Blade Projects
 *
 * Loads and processes sample JSON files from the samples/ directory
 * for LSP hover hints with example values.
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename, extname } from 'path';

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

/**
 * Loads sample files from a project's samples/ directory.
 *
 * @param projectRoot - Path to the project root directory
 * @returns Loaded samples or null if samples/ doesn't exist
 */
export async function loadProjectSamples(
  projectRoot: string
): Promise<ProjectSamples | null> {
  const samplesPath = join(projectRoot, SAMPLES_DIR);

  try {
    const entries = await readdir(samplesPath, { withFileTypes: true });
    const samples: SampleFile[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name) !== JSON_EXTENSION) {
        continue;
      }

      const filePath = join(samplesPath, entry.name);
      const name = basename(entry.name, JSON_EXTENSION);

      try {
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        samples.push({ name, filePath, data });
      } catch {
        // Invalid JSON - skip this file
        continue;
      }
    }

    if (samples.length === 0) {
      return null;
    }

    // Extract values for all paths
    const values = extractSampleValues(samples);

    return { samples, values };
  } catch {
    // samples/ directory doesn't exist
    return null;
  }
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
