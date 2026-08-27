// Hand-written types for `api-surface.mjs`.
//
// The tool is JavaScript because it is a build script that must run from a bare
// `node` with nothing compiled, but `tests/api-surface.test.ts` imports it and
// the test suite is typechecked under the same strictness as `src`.

/** One published entry point of a package. */
export interface EntrySpec {
  /** Heading in the report, and the `.api.md` basename. */
  readonly label: string;
  /** Entry module, relative to the repository root. */
  readonly entry: string;
}

/** One workspace package whose surface is pinned. */
export interface PackageSpec {
  /** npm name, for reporting. */
  readonly pkg: string;
  /** Package directory, relative to the repository root. */
  readonly dir: string;
  readonly entries: readonly EntrySpec[];
}

/** Every package this repository publishes a pinned API surface for. */
export declare const PACKAGES: readonly PackageSpec[];

/**
 * One package's spec, by npm name. Throws when the name is not listed.
 *
 * Each package's own suite checks only its own surface, so a change in a
 * sibling cannot be masked by a cached run in a package turbo believes is
 * untouched.
 */
export declare function packageSpec(name: string): PackageSpec;

/**
 * Renders every entry's surface.
 *
 * @returns Absolute `.api.md` path -> file contents.
 */
export declare function buildApiReports(
  packages?: readonly PackageSpec[]
): Map<string, string>;

/**
 * Compares the generated reports against what is checked in.
 *
 * @returns One message per drifted entry; empty when in sync.
 */
export declare function checkApiReports(
  packages?: readonly PackageSpec[]
): string[];

/**
 * Writes every report to disk.
 *
 * @returns The paths written, relative to the repository root.
 */
export declare function writeApiReports(
  packages?: readonly PackageSpec[]
): string[];
