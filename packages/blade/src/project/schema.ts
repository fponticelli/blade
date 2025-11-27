/**
 * Schema Loading for Blade Projects
 *
 * Loads and processes schema.json files for LSP completions.
 * Schema provides type information for variables available to index.blade.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * JSON Schema property definition (simplified for LSP use)
 */
export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  enum?: (string | number | boolean)[];
  default?: unknown;
}

/**
 * Loaded project schema
 */
export interface ProjectSchema {
  /** Raw schema object */
  schema: JsonSchemaProperty;
  /** Flattened property paths for completions */
  properties: SchemaPropertyInfo[];
}

/**
 * Flattened schema property for completions
 */
export interface SchemaPropertyInfo {
  /** Dot-notation path (e.g., "user.name") */
  path: string;
  /** Property type */
  type: string;
  /** Optional description */
  description?: string;
  /** Whether this property has children */
  hasChildren: boolean;
  /** Child property names (for immediate completions) */
  childNames: string[];
}

/**
 * Loads and parses schema.json from a project directory.
 *
 * @param projectRoot - Path to the project root directory
 * @returns Loaded schema or null if not found/invalid
 */
export async function loadProjectSchema(
  projectRoot: string
): Promise<ProjectSchema | null> {
  const schemaPath = join(projectRoot, 'schema.json');

  try {
    const content = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(content) as JsonSchemaProperty;

    // Extract and flatten properties
    const properties = extractSchemaProperties(schema);

    return { schema, properties };
  } catch {
    // Schema file doesn't exist or is invalid - this is fine
    return null;
  }
}

/**
 * Extracts flattened property paths from a JSON Schema.
 *
 * @param schema - The JSON Schema object
 * @param prefix - Current path prefix (for recursion)
 * @returns Array of flattened property info
 */
export function extractSchemaProperties(
  schema: JsonSchemaProperty,
  prefix = ''
): SchemaPropertyInfo[] {
  const results: SchemaPropertyInfo[] = [];

  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const type = normalizeType(prop.type);
      const hasChildren = !!(prop.properties || prop.items?.properties);
      const childNames = getChildNames(prop);

      results.push({
        path,
        type,
        description: prop.description,
        hasChildren,
        childNames,
      });

      // Recurse into nested objects
      if (prop.properties) {
        results.push(...extractSchemaProperties(prop, path));
      }

      // Recurse into array items if they have properties
      if (prop.items?.properties) {
        // For arrays, we add item properties with [].path notation
        const itemProps = extractSchemaProperties(prop.items, `${path}[]`);
        results.push(...itemProps);
      }
    }
  }

  return results;
}

/**
 * Gets completions for a given variable path.
 *
 * @param schema - The project schema
 * @param path - Current path (e.g., "$user" or "$user.address")
 * @returns Array of completion suggestions
 */
export function getSchemaCompletions(
  schema: ProjectSchema,
  path: string
): SchemaPropertyInfo[] {
  // Remove leading $ if present
  const normalizedPath = path.startsWith('$') ? path.slice(1) : path;

  if (!normalizedPath) {
    // Return top-level properties
    return schema.properties.filter(p => !p.path.includes('.'));
  }

  // Find properties that are direct children of the given path
  const prefix = normalizedPath + '.';
  return schema.properties.filter(p => {
    if (!p.path.startsWith(prefix)) return false;
    // Only direct children (no further dots after prefix)
    const remainder = p.path.slice(prefix.length);
    return !remainder.includes('.');
  });
}

/**
 * Gets type information for a specific path.
 *
 * @param schema - The project schema
 * @param path - Variable path (e.g., "user.name")
 * @returns Property info or null if not found
 */
export function getSchemaPropertyInfo(
  schema: ProjectSchema,
  path: string
): SchemaPropertyInfo | null {
  // Remove leading $ if present
  const normalizedPath = path.startsWith('$') ? path.slice(1) : path;
  return schema.properties.find(p => p.path === normalizedPath) ?? null;
}

/**
 * Normalizes type to a string representation.
 */
function normalizeType(type: string | string[] | undefined): string {
  if (!type) return 'any';
  if (Array.isArray(type)) return type.join(' | ');
  return type;
}

/**
 * Gets immediate child property names.
 */
function getChildNames(prop: JsonSchemaProperty): string[] {
  if (prop.properties) {
    return Object.keys(prop.properties);
  }
  if (prop.items?.properties) {
    return Object.keys(prop.items.properties);
  }
  return [];
}
