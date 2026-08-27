import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  createMemoryFileSystem,
  nodeFileSystem,
  PathEscapeError,
  resolveWithinRoot,
} from '../../src/project/fs.js';

async function scratchProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'blade-fs-'));
  await mkdir(join(root, 'project'));
  await writeFile(join(root, 'project', 'index.blade'), '<div></div>');
  await writeFile(join(root, 'secret.txt'), 'not a template');
  return root;
}

describe('createMemoryFileSystem', () => {
  const io = createMemoryFileSystem(
    {
      'index.blade': '<Card/>',
      'components/form/input.blade': '<input/>',
    },
    '/project'
  );

  it('reads a file it was given', async () => {
    await expect(io.readFile('/project/index.blade')).resolves.toBe('<Card/>');
  });

  it('rejects for a file it was not given', async () => {
    await expect(io.readFile('/project/nope.blade')).rejects.toThrow(/ENOENT/);
  });

  it('implies the directories of the paths it holds', async () => {
    const entries = await io.readDirectory('/project');
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'index.blade', isDirectory: false, isFile: true },
        { name: 'components', isDirectory: true, isFile: false },
      ])
    );
  });

  it('rejects for a directory that holds nothing', async () => {
    await expect(io.readDirectory('/project/missing')).rejects.toThrow(
      /ENOENT/
    );
  });
});

describe('resolveWithinRoot', () => {
  it('resolves a path inside the root', async () => {
    const io = createMemoryFileSystem({ 'index.blade': '' }, '/project');
    await expect(
      resolveWithinRoot('/project', 'index.blade', io)
    ).resolves.toBe(resolve('/project/index.blade'));
  });

  it('refuses a path that climbs out of the root', async () => {
    const io = createMemoryFileSystem({ 'index.blade': '' }, '/project');
    await expect(
      resolveWithinRoot('/project', '../../../etc/passwd', io)
    ).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('refuses an absolute path outside the root', async () => {
    const io = createMemoryFileSystem({ 'index.blade': '' }, '/project');
    await expect(
      resolveWithinRoot('/project', '/etc/passwd', io)
    ).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('resolves symbolic links before comparing, so a link out is refused', async () => {
    const scratch = await scratchProject();
    const root = join(scratch, 'project');
    await symlink(join(scratch, 'secret.txt'), join(root, 'link.blade'));

    await expect(
      resolveWithinRoot(root, 'link.blade', nodeFileSystem)
    ).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('allows a path that does not exist yet, so a missing file reads as missing', async () => {
    const io = createMemoryFileSystem({ 'index.blade': '' }, '/project');
    await expect(
      resolveWithinRoot('/project', 'later.blade', io)
    ).resolves.toBe(resolve('/project/later.blade'));
  });
});
