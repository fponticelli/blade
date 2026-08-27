/**
 * A whole Blade project as an inline string map.
 *
 * Every scenario in `tests/project/` used to materialise a directory under
 * the shared project fixtures, because the project loader imported `fs` at
 * module scope and exposed no seam. It does now, so a project is a literal.
 */

import { createMemoryFileSystem } from '../../../src/project/fs.js';
import type { FileSystem } from '../../../src/project/fs.js';
import { compileProject } from '../../../src/project/compile.js';
import { readProjectSources } from '../../../src/project/sources.js';
import type {
  ProjectLoadOptions,
  ProjectSources,
} from '../../../src/project/sources.js';
import type { ProjectResult } from '../../../src/ast/types.js';

/** Where an inline project lives. */
export const PROJECT_ROOT = '/project';

export function memoryProject(
  files: Readonly<Record<string, string>>
): FileSystem {
  return createMemoryFileSystem(files, PROJECT_ROOT);
}

/** Reads an inline project, exactly as the loader reads a directory. */
export function sourcesOf(
  files: Readonly<Record<string, string>>,
  options?: Omit<ProjectLoadOptions, 'io'>
): Promise<ProjectSources> {
  return readProjectSources(PROJECT_ROOT, {
    ...options,
    io: memoryProject(files),
  });
}

/** Compiles an inline project. */
export function compileFiles(
  files: Readonly<Record<string, string>>,
  options?: Omit<ProjectLoadOptions, 'io'>
): Promise<ProjectResult> {
  return compileProject(PROJECT_ROOT, { ...options, io: memoryProject(files) });
}

/** Error-level messages, for assertions that read as prose. */
export function errorMessages(result: ProjectResult): string[] {
  return result.errors.map(error => error.message);
}

/** Warning-level diagnostic codes. */
export function warningCodes(result: ProjectResult): (string | undefined)[] {
  return result.warnings.map(warning => warning.code);
}
