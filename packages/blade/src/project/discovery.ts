/**
 * Component Discovery for Blade Projects
 *
 * Discovers components in a project directory by scanning for .blade files
 * and building a component registry with dot-notation namespacing.
 */

import { readdir, stat, access } from 'fs/promises';
import { join, basename } from 'path';
import type { ComponentInfo } from '../ast/types.js';
import { toPascalCase, isHiddenFile } from './utils.js';

const BLADE_EXTENSION = '.blade';
const ENTRY_FILE = 'index.blade';

/**
 * Discovers all components in a project directory.
 *
 * @param projectRoot - The root directory of the project (must contain index.blade)
 * @returns A map of component tag names to their info
 * @throws Error if projectRoot doesn't exist or doesn't contain index.blade
 */
export async function discoverComponents(
  projectRoot: string
): Promise<Map<string, ComponentInfo>> {
  // Verify project root exists
  try {
    await access(projectRoot);
  } catch {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }

  // Verify index.blade exists
  const entryPath = join(projectRoot, ENTRY_FILE);
  try {
    await access(entryPath);
  } catch {
    throw new Error(
      `Project root must contain ${ENTRY_FILE}.\n` +
        `  Expected at: ${entryPath}\n` +
        `  Tip: Create an index.blade file as the entry point for your project.`
    );
  }

  const components = new Map<string, ComponentInfo>();
  await scanDirectory(projectRoot, [], components);
  return components;
}

/**
 * Recursively scans a directory for .blade components.
 *
 * @param dir - Current directory to scan
 * @param namespace - Namespace segments for current depth (e.g., ['Components', 'Form'])
 * @param components - Map to populate with discovered components
 */
async function scanDirectory(
  dir: string,
  namespace: string[],
  components: Map<string, ComponentInfo>
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const name = entry.name;

    // Skip hidden files and folders
    if (isHiddenFile(name)) {
      continue;
    }

    const fullPath = join(dir, name);

    if (entry.isDirectory()) {
      // Check if this directory is a separate project (has its own index.blade)
      const hasIndexBlade = await hasFile(fullPath, ENTRY_FILE);

      if (hasIndexBlade) {
        // This is a separate project boundary, skip it
        continue;
      }

      // Recurse into subdirectory with updated namespace
      const folderName = toPascalCase(name);
      await scanDirectory(fullPath, [...namespace, folderName], components);
    } else if (entry.isFile() && name.endsWith(BLADE_EXTENSION)) {
      // Skip the entry file (index.blade) - it's not a component
      if (name === ENTRY_FILE) {
        continue;
      }

      // Convert filename to component name
      const baseName = basename(name, BLADE_EXTENSION);
      const componentName = toPascalCase(baseName);

      // Build full tag name with namespace
      const tagName =
        namespace.length > 0
          ? [...namespace, componentName].join('.')
          : componentName;

      const info: ComponentInfo = {
        tagName,
        filePath: fullPath,
        namespace: [...namespace],
        props: undefined, // Parsed lazily on demand
        propsInferred: false,
      };

      components.set(tagName, info);
    }
  }
}

/**
 * Checks if a directory contains a specific file.
 */
async function hasFile(dir: string, filename: string): Promise<boolean> {
  try {
    const filePath = join(dir, filename);
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
