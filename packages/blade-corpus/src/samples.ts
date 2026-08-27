// The shipped sample projects, as test input.
//
// `samples/` is the only end-to-end evidence that the language as documented is
// the language the compiler accepts, and it rotted: twelve of the thirteen
// files failed to compile with "Unknown directive: @props". An entire
// spec-plan-implement cycle had once been spent making ONE of them parse,
// without a regression test - so it broke again, and took the other twelve with
// it.
//
// The walk lives here, next to the corpus, because both packages' suites need
// it and a second copy of "find the samples" is exactly how the first
// divergence started.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, from this file's own location. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

/** Where the sample projects live. */
export const SAMPLES_ROOT = join(REPO_ROOT, 'samples');

/** One `.blade` file in a sample project. */
export interface SampleTemplate {
  /** `blog/Comment.blade` - the path as a reader would name it. */
  readonly name: string;
  /** Basename without the extension: the component name it is called by. */
  readonly componentName: string;
  readonly path: string;
  readonly source: string;
  /** True for the project's entry point. */
  readonly isEntry: boolean;
}

/** One `samples/*.json` payload a project ships as example data. */
export interface SamplePayload {
  /** File name without the extension. */
  readonly name: string;
  readonly path: string;
  readonly data: unknown;
}

/** One directory under `samples/` that has an `index.blade`. */
export interface SampleProject {
  /** Directory name: `blog`, `dashboard`, ... */
  readonly name: string;
  readonly dir: string;
  /** Every `.blade` file in the project, entry first. */
  readonly templates: readonly SampleTemplate[];
  /** Every payload under the project's own `samples/` directory. */
  readonly payloads: readonly SamplePayload[];
}

const ENTRY = 'index.blade';

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The `samples/*.json` payloads a project ships, by name. */
function loadPayloads(projectDir: string): SamplePayload[] {
  const dir = join(projectDir, 'samples');
  if (!isDirectory(dir)) return [];

  const payloads: SamplePayload[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const path = join(dir, file);
    // A payload that is not JSON is a broken sample, not a payload to skip:
    // letting the parse throw is how the suite finds out.
    payloads.push({
      name: file.slice(0, -'.json'.length),
      path,
      data: JSON.parse(readFileSync(path, 'utf-8')) as unknown,
    });
  }
  return payloads;
}

/** Every `.blade` file in a project directory, entry first. */
function loadTemplates(projectDir: string, projectName: string) {
  const templates: SampleTemplate[] = [];
  for (const file of readdirSync(projectDir).sort()) {
    if (!file.endsWith('.blade')) continue;
    const path = join(projectDir, file);
    if (!isFile(path)) continue;
    templates.push({
      name: `${projectName}/${file}`,
      componentName: file.slice(0, -'.blade'.length),
      path,
      source: readFileSync(path, 'utf-8'),
      isEntry: file === ENTRY,
    });
  }
  return templates.sort((a, b) => Number(b.isEntry) - Number(a.isEntry));
}

/**
 * Every sample project in the repository, in a stable order.
 *
 * @returns One entry per directory under `samples/` that has an `index.blade`
 */
export function loadSampleProjects(): SampleProject[] {
  const projects: SampleProject[] = [];
  for (const name of readdirSync(SAMPLES_ROOT).sort()) {
    const dir = join(SAMPLES_ROOT, name);
    if (!isDirectory(dir)) continue;
    if (!isFile(join(dir, ENTRY))) continue;
    projects.push({
      name,
      dir,
      templates: loadTemplates(dir, name),
      payloads: loadPayloads(dir),
    });
  }
  return projects;
}
