/**
 * Project Context for Blade LSP
 *
 * Provides project-aware features like component discovery and schema-driven completions.
 */

import type { ComponentInfo } from '../ast/types.js';
import type { ProjectSchema, SchemaPropertyInfo } from '../project/schema.js';
import type { ProjectSamples, SampleValue } from '../project/samples.js';
import { discoverComponents } from '../project/discovery.js';
import { loadProjectSchema, getSchemaCompletions } from '../project/schema.js';
import {
  loadProjectSamples,
  getSampleValues,
  formatSampleHint,
} from '../project/samples.js';

/**
 * Project context for LSP operations
 */
export interface ProjectLspContext {
  /** Project root directory path */
  projectRoot: string;
  /** Discovered components in the project */
  components: Map<string, ComponentInfo>;
  /** Loaded schema (null if no schema.json) */
  schema: ProjectSchema | null;
  /** Loaded samples (null if no samples/ directory) */
  samples: ProjectSamples | null;
  /** Last time the context was updated */
  lastUpdated: number;
}

/**
 * Initializes the project context for LSP features.
 *
 * @param projectRoot - Path to the project root directory
 * @returns Initialized project context or null if not a valid project
 */
export async function initializeProjectContext(
  projectRoot: string
): Promise<ProjectLspContext | null> {
  try {
    // Discover components (returns Map<string, ComponentInfo>)
    const components = await discoverComponents(projectRoot);

    // Load schema if available
    const schema = await loadProjectSchema(projectRoot);

    // Load samples if available
    const samples = await loadProjectSamples(projectRoot);

    return {
      projectRoot,
      components,
      schema,
      samples,
      lastUpdated: Date.now(),
    };
  } catch {
    // Not a valid project or discovery failed
    return null;
  }
}

/**
 * Gets schema-based completions for a variable path.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user" or "$user.address")
 * @returns Array of schema property completions
 */
export function getProjectSchemaCompletions(
  context: ProjectLspContext,
  path: string
): SchemaPropertyInfo[] {
  if (!context.schema) {
    return [];
  }
  return getSchemaCompletions(context.schema, path);
}

/**
 * Gets component information by name.
 *
 * @param context - The project context
 * @param componentName - Component name (e.g., "Button" or "Form.Input")
 * @returns Component info or undefined if not found
 */
export function getProjectComponent(
  context: ProjectLspContext,
  componentName: string
): ComponentInfo | undefined {
  return context.components.get(componentName);
}

/**
 * Gets all available components in the project.
 *
 * @param context - The project context
 * @returns Array of component names
 */
export function getAllProjectComponents(context: ProjectLspContext): string[] {
  return Array.from(context.components.keys());
}

/**
 * Checks if the project context needs to be refreshed.
 *
 * @param context - The project context
 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
 * @returns True if context should be refreshed
 */
export function shouldRefreshContext(
  context: ProjectLspContext,
  maxAgeMs = 5 * 60 * 1000
): boolean {
  return Date.now() - context.lastUpdated > maxAgeMs;
}

/**
 * Refreshes the project context.
 *
 * @param context - The existing project context
 * @returns Updated project context or null if refresh failed
 */
export async function refreshProjectContext(
  context: ProjectLspContext
): Promise<ProjectLspContext | null> {
  return initializeProjectContext(context.projectRoot);
}

/**
 * Gets sample values for a variable path.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user.name")
 * @returns Array of sample values from all sample files
 */
export function getProjectSampleValues(
  context: ProjectLspContext,
  path: string
): SampleValue[] {
  if (!context.samples) {
    return [];
  }
  return getSampleValues(context.samples, path);
}

/**
 * Gets formatted sample hint for hover display.
 *
 * @param context - The project context
 * @param path - Variable path (e.g., "$user.name")
 * @returns Formatted hint string or empty string if no samples
 */
export function getProjectSampleHint(
  context: ProjectLspContext,
  path: string
): string {
  const values = getProjectSampleValues(context, path);
  return formatSampleHint(values);
}
