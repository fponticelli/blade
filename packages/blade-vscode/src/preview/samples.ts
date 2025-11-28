/**
 * Sample file discovery and loading
 * Feature: 007-vscode-preview-mode
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SampleFile, SampleInfo } from './types';

/**
 * Discover all JSON sample files in a project's samples/ folder.
 *
 * @param projectRoot - Path to the project root
 * @returns Array of sample file names
 */
export function discoverSamples(projectRoot: string): string[] {
  const samplesDir = path.join(projectRoot, 'samples');

  if (!fs.existsSync(samplesDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(samplesDir);
    return files
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * Load and parse a sample JSON file.
 *
 * @param projectRoot - Path to the project root
 * @param sampleName - Name of the sample file (e.g., "summer-sale.json")
 * @returns Loaded sample file with parsed data or error info
 */
export function loadSample(projectRoot: string, sampleName: string): SampleFile {
  const samplePath = path.join(projectRoot, 'samples', sampleName);

  if (!fs.existsSync(samplePath)) {
    return {
      name: sampleName,
      path: samplePath,
      data: null,
      isValid: false,
      error: `Sample file not found: ${samplePath}`,
    };
  }

  try {
    const content = fs.readFileSync(samplePath, 'utf-8');
    const data = JSON.parse(content);
    return {
      name: sampleName,
      path: samplePath,
      data,
      isValid: true,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      name: sampleName,
      path: samplePath,
      data: null,
      isValid: false,
      error: `Failed to parse JSON: ${message}`,
    };
  }
}

/**
 * Load all samples from a project and return their info.
 *
 * @param projectRoot - Path to the project root
 * @returns Array of sample info objects
 */
export function loadAllSamples(projectRoot: string): SampleInfo[] {
  const sampleNames = discoverSamples(projectRoot);

  return sampleNames.map((name) => {
    const sample = loadSample(projectRoot, name);
    return {
      name: sample.name,
      isValid: sample.isValid,
      error: sample.error ?? undefined,
    };
  });
}

/**
 * Get the default sample to select (first valid one, or first if none valid).
 *
 * @param samples - Array of sample info
 * @returns Name of default sample or null if no samples
 */
export function getDefaultSample(samples: SampleInfo[]): string | null {
  if (samples.length === 0) {
    return null;
  }

  // Prefer first valid sample
  const validSample = samples.find((s) => s.isValid);
  if (validSample) {
    return validSample.name;
  }

  // Fall back to first sample even if invalid
  return samples[0].name;
}

/**
 * Check if the samples/ folder exists for a project.
 *
 * @param projectRoot - Path to the project root
 * @returns True if samples folder exists
 */
export function hasSamplesFolder(projectRoot: string): boolean {
  const samplesDir = path.join(projectRoot, 'samples');
  return fs.existsSync(samplesDir);
}

/**
 * Parse @props from a component file to generate a sample skeleton.
 *
 * @param source - Template source code
 * @returns Object with prop names as keys and placeholder values
 */
export function parsePropsForSample(source: string): Record<string, unknown> {
  const propsMatch = source.match(/@props\s*\(([^)]+)\)/);
  if (!propsMatch) {
    return {};
  }

  const propsContent = propsMatch[1];
  const result: Record<string, unknown> = {};

  // Parse prop definitions: name, name?, name = default
  const propRegex = /(\w+)(\?)?(?:\s*=\s*([^,)]+))?/g;
  let match;

  while ((match = propRegex.exec(propsContent)) !== null) {
    const [, name, optional, defaultValue] = match;
    if (optional) {
      // Optional props can be null
      result[name] = null;
    } else if (defaultValue) {
      // Try to parse default value
      try {
        result[name] = JSON.parse(defaultValue.trim());
      } catch {
        result[name] = defaultValue.trim().replace(/^['"]|['"]$/g, '');
      }
    } else {
      // Required prop - use placeholder
      result[name] = `<${name}>`;
    }
  }

  return result;
}

/**
 * Generate a sample JSON file for a component.
 *
 * @param projectRoot - Path to the project root
 * @param componentName - Name of the component (without .blade extension)
 * @param props - Props to include in sample
 * @returns Path to created sample file
 */
export async function createComponentSample(
  projectRoot: string,
  componentName: string,
  props: Record<string, unknown>
): Promise<string> {
  const samplesDir = path.join(projectRoot, 'samples');

  // Create samples directory if it doesn't exist
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  const sampleName = `${componentName.toLowerCase()}-sample.json`;
  const samplePath = path.join(samplesDir, sampleName);

  const content = JSON.stringify(props, null, 2);
  fs.writeFileSync(samplePath, content, 'utf-8');

  return samplePath;
}
