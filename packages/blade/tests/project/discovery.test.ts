import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  DEFAULT_EXCLUDED_DIRECTORIES,
  discoverComponents,
} from '../../src/project/discovery.js';
import type { SkippedDirectory } from '../../src/project/discovery.js';
import { createMemoryFileSystem } from '../../src/project/fs.js';
import type { DirectoryEntry, FileSystem } from '../../src/project/fs.js';
import { memoryProject, PROJECT_ROOT } from './support/memory-project.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

/** A filesystem that records which directories were listed. */
function countingFileSystem(io: FileSystem): {
  io: FileSystem;
  listed: string[];
} {
  const listed: string[] = [];
  return {
    listed,
    io: {
      readFile: path => io.readFile(path),
      readDirectory: (path): Promise<readonly DirectoryEntry[]> => {
        listed.push(path);
        return io.readDirectory(path);
      },
      realPath: path => io.realPath(path),
    },
  };
}

describe('discoverComponents', () => {
  describe('flat project structure', () => {
    it('discovers components in simple project', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);

      expect(components.size).toBe(1);
      expect(components.has('Button')).toBe(true);

      const button = components.get('Button')!;
      expect(button.tagName).toBe('Button');
      expect(button.filePath).toContain('button.blade');
      expect(button.namespace).toEqual([]);
      expect(button.props).toBeUndefined(); // Discovery does not read files
    });

    it('excludes index.blade from discovered components', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);

      expect(components.has('Index')).toBe(false);
    });

    it('excludes the configured entry file instead of index.blade', async () => {
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'main.blade': '<Button/>',
          'button.blade': '<button></button>',
        }),
        entry: 'main.blade',
      });

      expect(Array.from(components.keys())).toEqual(['Button']);
    });
  });

  describe('nested folder structure', () => {
    it('discovers components with dot-notation namespacing', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = await discoverComponents(projectRoot);

      expect(components.has('Button')).toBe(true);
      expect(components.has('Components.Form.Input')).toBe(true);
    });

    it('sets correct namespace for nested components', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = await discoverComponents(projectRoot);

      const input = components.get('Components.Form.Input')!;
      expect(input.namespace).toEqual(['Components', 'Form']);
      expect(input.tagName).toBe('Components.Form.Input');
    });
  });

  describe('error handling', () => {
    it('rejects for folder without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');

      await expect(discoverComponents(projectRoot)).rejects.toThrow(
        /index\.blade/
      );
    });

    it('rejects for non-existent folder', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');

      await expect(discoverComponents(projectRoot)).rejects.toThrow(
        /does not exist/
      );
    });
  });

  describe('hidden files', () => {
    it('skips hidden files and folders', async () => {
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '',
          '.hidden.blade': '',
          '.secret/card.blade': '',
        }),
      });

      expect(Array.from(components.keys())).toEqual([]);
    });
  });

  describe('naming conventions', () => {
    it('converts kebab-case filenames to PascalCase', async () => {
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '',
          'form-input.blade': '',
          'nested-folder/date_picker.blade': '',
        }),
      });

      expect(Array.from(components.keys()).sort()).toEqual([
        'FormInput',
        'NestedFolder.DatePicker',
      ]);
    });
  });

  describe('bounded walk', () => {
    it('never descends into a dependency tree or a build output', async () => {
      const files: Record<string, string> = { 'index.blade': '' };
      for (const directory of DEFAULT_EXCLUDED_DIRECTORIES) {
        files[`${directory}/pkg/widget.blade`] = '<div></div>';
      }
      files['card.blade'] = '<div></div>';

      const counting = countingFileSystem(memoryProject(files));
      const components = await discoverComponents(PROJECT_ROOT, {
        io: counting.io,
      });

      // The point is not only that nothing was found in them - it is that they
      // were never read. A node_modules tree holds 50,000-200,000 files, and
      // the walk used to block the language server's event loop for all of it.
      expect(Array.from(components.keys())).toEqual(['Card']);
      for (const directory of DEFAULT_EXCLUDED_DIRECTORIES) {
        expect(counting.listed).not.toContain(`${PROJECT_ROOT}/${directory}`);
      }
    });

    it('takes additional excluded directories from the caller', async () => {
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '',
          'generated/widget.blade': '',
          'kept/widget.blade': '',
        }),
        exclude: ['generated'],
      });

      expect(Array.from(components.keys())).toEqual(['Kept.Widget']);
    });

    it('stops at the depth limit and says which directory it stopped at', async () => {
      const skipped: SkippedDirectory[] = [];
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '',
          'a/shallow.blade': '',
          'a/b/deep.blade': '',
        }),
        maxDepth: 1,
        onSkipped: item => skipped.push(item),
      });

      expect(Array.from(components.keys())).toEqual(['A.Shallow']);
      expect(skipped).toEqual([
        { path: `${PROJECT_ROOT}/a/b`, reason: 'depth' },
      ]);
    });

    it('treats a subdirectory with its own entry file as a separate project', async () => {
      const skipped: SkippedDirectory[] = [];
      const components = await discoverComponents(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '',
          'inner/index.blade': '',
          'inner/widget.blade': '',
        }),
        onSkipped: item => skipped.push(item),
      });

      expect(Array.from(components.keys())).toEqual([]);
      expect(skipped).toEqual([
        { path: `${PROJECT_ROOT}/inner`, reason: 'project-boundary' },
      ]);
    });

    it('reads each directory exactly once', async () => {
      // The previous walk paid a `statSync` per subdirectory purely to ask
      // whether it contained an index.blade, then read it again to scan it.
      const counting = countingFileSystem(
        memoryProject({
          'index.blade': '',
          'a/one.blade': '',
          'a/b/two.blade': '',
        })
      );

      await discoverComponents(PROJECT_ROOT, { io: counting.io });

      expect(counting.listed).toEqual([
        PROJECT_ROOT,
        `${PROJECT_ROOT}/a`,
        `${PROJECT_ROOT}/a/b`,
      ]);
    });

    it('is genuinely asynchronous, so the walk can interleave', async () => {
      const io = createMemoryFileSystem({ 'index.blade': '' }, PROJECT_ROOT);
      const pending = discoverComponents(PROJECT_ROOT, { io });

      expect(pending).toBeInstanceOf(Promise);
      await pending;
    });
  });
});
