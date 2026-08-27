/**
 * Sample data for the preview.
 *
 * Discovery, reading and JSON parsing are the engine's `loadProjectSamplesResult`
 * - the same code that decides what a project's samples are when it is compiled
 * or served by the language server. What is left here is the part that is
 * specific to a webview: deciding whether a name that arrived over a message
 * channel may be turned into a path at all.
 */

import { join } from 'path';
import { parseTemplate } from '@bladets/template';
import {
  loadProjectSamplesResult,
  resolveWithinRoot,
} from '@bladets/template/node';
import type { FileSystem } from '@bladets/template/node';

/**
 * The characters a sample name may contain.
 *
 * No separator, no `..`, no drive letter, no NUL - so a name that passes cannot
 * denote anything but a file directly inside `samples/`, on any platform. The
 * containment check below is still performed; this is the cheap, total refusal
 * in front of it.
 */
const SAMPLE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** The directory a project keeps its samples in, as the engine defines it. */
const SAMPLES_DIRECTORY = 'samples';

const JSON_EXTENSION = '.json';

/** What a project offers the sample selector. */
export interface SampleListing {
  /** Readable sample names, without `.json`, sorted. */
  readonly names: readonly string[];
  /** Parsed data by name. */
  readonly data: ReadonlyMap<string, unknown>;
  /** One per sample that could not be read - a malformed JSON payload. */
  readonly notices: readonly string[];
}

/**
 * Whether a name may be turned into a path inside `samples/`.
 *
 * @param name - A sample name, without extension
 * @returns True when the name denotes a file directly inside `samples/`
 */
export function isValidSampleName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  // `.` and `..` match the pattern and are directory references, not names.
  if (/^\.+$/.test(name)) return false;
  return SAMPLE_NAME_PATTERN.test(name);
}

/**
 * Lists the samples a project ships.
 *
 * @param projectRoot - The project root
 * @param io - Filesystem to read through
 * @returns The readable samples and any complaint about the rest
 */
export async function listSamples(
  projectRoot: string,
  io: FileSystem
): Promise<SampleListing> {
  const loaded = await loadProjectSamplesResult(projectRoot, io);
  const data = new Map<string, unknown>();

  for (const sample of loaded.samples?.samples ?? []) {
    // A sample whose own name could not be used as a path is not offered: the
    // selector's values come back as `selectSample` messages.
    if (!isValidSampleName(sample.name)) continue;
    data.set(sample.name, sample.data);
  }

  return {
    names: [...data.keys()].sort((a, b) => a.localeCompare(b)),
    data,
    notices: loaded.diagnostics.map(diagnostic => diagnostic.message),
  };
}

/**
 * Picks the sample to show.
 *
 * @param listing - What the project offers
 * @param preferred - A remembered or requested name
 * @returns `preferred` when the project actually has it, else the first sample
 */
export function selectSample(
  listing: SampleListing,
  preferred: string | null
): string | null {
  if (preferred !== null && listing.data.has(preferred)) return preferred;
  return listing.names[0] ?? null;
}

/**
 * Resolves the path a sample would be written to, refusing to leave the project.
 *
 * The write side of the same trust boundary as {@link isValidSampleName}: the
 * name is checked lexically, then resolved through symbolic links on both sides
 * and proved to be inside the root. `createComponentSample` used to build this
 * filename from a string the webview supplied.
 *
 * @param projectRoot - The project root
 * @param name - Sample name, without extension
 * @param io - Filesystem to resolve through
 * @returns The absolute path, inside the project
 * @throws {PathEscapeError} When the name resolves outside the project root
 * @throws Error When the name is not a legal sample name
 */
export async function resolveSamplePath(
  projectRoot: string,
  name: string,
  io: FileSystem
): Promise<string> {
  if (!isValidSampleName(name)) {
    throw new Error(
      `Not a legal sample name: ${JSON.stringify(name)}.\n` +
        `  A sample name may contain letters, digits, '.', '_' and '-'.`
    );
  }

  return resolveWithinRoot(
    projectRoot,
    join(SAMPLES_DIRECTORY, name + JSON_EXTENSION),
    io
  );
}

/** The directory samples live in, absolute. */
export function samplesDirectory(projectRoot: string): string {
  return join(projectRoot, SAMPLES_DIRECTORY);
}

/**
 * The sample name a component's skeleton is written under.
 *
 * @param componentName - A component tag name, possibly namespaced
 * @returns A sample name, without extension
 */
export function sampleNameFor(componentName: string): string {
  return `${componentName.toLowerCase()}-sample`;
}

/**
 * A sample skeleton for a component's declared props.
 *
 * Uses the template parser rather than a regular expression: `@props` is a
 * directive of the language, and a regex over `\(([^)]+)\)` cannot see a
 * default value that itself contains a parenthesis or a comma.
 *
 * @param source - Template source code
 * @returns Prop names mapped to their default, or a placeholder when required
 */
export function propsSkeleton(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const declaration of parseTemplate(source).props) {
    if (declaration.required) {
      // No default and not optional: the sample needs a real value.
      result[declaration.name] = `<${declaration.name}>`;
      continue;
    }

    const defaultValue = declaration.defaultValue;
    result[declaration.name] =
      defaultValue && defaultValue.kind === 'literal'
        ? (defaultValue.value ?? null)
        : null;
  }

  return result;
}

/**
 * The bytes of a sample file.
 *
 * @param props - The skeleton to serialise
 * @returns Pretty-printed JSON, newline-terminated
 */
export function sampleContent(props: Record<string, unknown>): string {
  return JSON.stringify(props, null, 2) + '\n';
}
