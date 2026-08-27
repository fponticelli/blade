/**
 * A Blade project on disk, for tests that must exercise the real filesystem.
 *
 * Most of the preview is tested through the engine's in-memory filesystem, but
 * path containment is not a claim that can be made in memory: `resolveWithinRoot`
 * resolves symbolic links on both sides, and the whole point of the check is
 * what the operating system does with `..` and with links.
 */

import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

export interface Fixture {
  /** The project root, with every symbolic link already resolved. */
  readonly root: string;
  path(...segments: string[]): string;
  write(relativePath: string, content: string): string;
  dispose(): void;
}

/**
 * Materialises a project.
 *
 * @param files - Paths relative to the root, mapped to their contents
 * @returns The fixture, which the caller must dispose
 */
export function createFixture(files: Record<string, string>): Fixture {
  // Realpath immediately: on macOS `os.tmpdir()` is a symlink, and the engine
  // canonicalises the root it is given, so an un-resolved root here would make
  // every path comparison in the test disagree with the code under test for
  // reasons that have nothing to do with the code under test.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'blade-preview-')));

  const fixture: Fixture = {
    root: base,
    path: (...segments) => join(base, ...segments),
    write(relativePath, content) {
      const full = join(base, relativePath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, 'utf-8');
      return full;
    },
    dispose() {
      rmSync(base, { recursive: true, force: true });
    },
  };

  for (const [path, content] of Object.entries(files)) {
    fixture.write(path, content);
  }
  return fixture;
}
