/**
 * The sample trust boundary.
 *
 * Everything here is about one question: what may a string that arrived from
 * the webview - or from workspaceState, which is a string a webview put there
 * in a previous session - be allowed to denote?
 */

import { describe, it, expect, afterEach } from 'vitest';
import { symlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PathEscapeError, nodeFileSystem } from '@bladets/template/node';
import {
  isValidSampleName,
  listSamples,
  propsSkeleton,
  resolveSamplePath,
  sampleContent,
  sampleNameFor,
  selectSample,
} from '../src/preview/samples.js';
import { createFixture } from './support/fixture.js';
import type { Fixture } from './support/fixture.js';

let fixture: Fixture | null = null;

afterEach(() => {
  fixture?.dispose();
  fixture = null;
});

describe('isValidSampleName', () => {
  it('accepts ordinary names', () => {
    for (const name of ['summer-sale', 'a', 'v1.2', 'my_sample', 'A-1_b.c']) {
      expect(isValidSampleName(name)).toBe(true);
    }
  });

  it('refuses anything that could denote another directory', () => {
    for (const name of [
      '',
      '..',
      '../secrets',
      '../../../../.ssh/config',
      'a/b',
      'a\\b',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      'a\0b',
      'a b',
      'x'.repeat(256),
    ]) {
      expect(isValidSampleName(name), name).toBe(false);
    }
  });
});

describe('resolveSamplePath', () => {
  it('resolves a legal name inside the project', async () => {
    fixture = createFixture({ 'index.blade': '<div></div>' });
    const resolved = await resolveSamplePath(
      fixture.root,
      'summer-sale',
      nodeFileSystem
    );
    expect(resolved).toBe(fixture.path('samples', 'summer-sale.json'));
  });

  it('refuses a traversal before it reaches the filesystem', async () => {
    fixture = createFixture({ 'index.blade': '<div></div>' });
    await expect(
      resolveSamplePath(fixture.root, '../../../../.ssh/config', nodeFileSystem)
    ).rejects.toThrow(/Not a legal sample name/);
  });

  it('refuses a symbolic link out of the project', async () => {
    fixture = createFixture({ 'index.blade': '<div></div>' });
    const outside = createFixture({ 'secret.json': '{"token":"hunter2"}' });
    try {
      mkdirSync(fixture.path('samples'), { recursive: true });
      symlinkSync(
        join(outside.root, 'secret.json'),
        fixture.path('samples', 'escape.json')
      );

      await expect(
        resolveSamplePath(fixture.root, 'escape', nodeFileSystem)
      ).rejects.toBeInstanceOf(PathEscapeError);
    } finally {
      outside.dispose();
    }
  });
});

describe('listSamples', () => {
  it('lists readable samples by name, without the extension', async () => {
    fixture = createFixture({
      'index.blade': '<div></div>',
      'samples/b.json': '{"n":2}',
      'samples/a.json': '{"n":1}',
      'samples/notes.txt': 'ignored',
    });

    const listing = await listSamples(fixture.root, nodeFileSystem);

    expect(listing.names).toEqual(['a', 'b']);
    expect(listing.data.get('a')).toEqual({ n: 1 });
    expect(listing.notices).toEqual([]);
  });

  it('reports a malformed sample instead of dropping it in silence', async () => {
    fixture = createFixture({
      'index.blade': '<div></div>',
      'samples/good.json': '{"n":1}',
      'samples/broken.json': '{ "n": 1, }',
    });

    const listing = await listSamples(fixture.root, nodeFileSystem);

    expect(listing.names).toEqual(['good']);
    expect(listing.notices).toHaveLength(1);
    expect(listing.notices[0]).toContain('broken.json');
  });

  it('is empty for a project with no samples folder', async () => {
    fixture = createFixture({ 'index.blade': '<div></div>' });
    const listing = await listSamples(fixture.root, nodeFileSystem);
    expect(listing.names).toEqual([]);
  });
});

describe('selectSample', () => {
  const listing = {
    names: ['a', 'b'],
    data: new Map<string, unknown>([
      ['a', 1],
      ['b', 2],
    ]),
    notices: [],
  };

  it('keeps a remembered sample the project still has', () => {
    expect(selectSample(listing, 'b')).toBe('b');
  });

  it('falls back when the remembered sample is gone', () => {
    expect(selectSample(listing, 'deleted')).toBe('a');
  });

  it('never returns a name the project did not offer', () => {
    // A poisoned workspaceState value survives restarts; this is what stops it
    // from ever reaching a path.
    expect(selectSample(listing, '../../../../.ssh/config')).toBe('a');
  });

  it('is null when there is nothing to select', () => {
    expect(
      selectSample({ names: [], data: new Map(), notices: [] }, 'a')
    ).toBeNull();
  });
});

describe('propsSkeleton', () => {
  it('reads @props through the parser, not a regular expression', () => {
    // A regex over `\(([^)]+)\)` stops at the first `)`, and one over `,` splits
    // inside a string. Both appear here.
    const source =
      '@props(title, subtitle = "a, b", size = max(1, 2), flag = true)\n<div></div>';

    expect(Object.keys(propsSkeleton(source))).toEqual([
      'title',
      'subtitle',
      'size',
      'flag',
    ]);
  });

  it('marks a required prop with a placeholder and keeps literal defaults', () => {
    const skeleton = propsSkeleton('@props(title, count = 3)\n<div></div>');
    expect(skeleton).toEqual({ title: '<title>', count: 3 });
  });

  it('is empty for a template with no props', () => {
    expect(propsSkeleton('<div>hello</div>')).toEqual({});
  });
});

describe('sampleNameFor / sampleContent', () => {
  it('names a sample after the component', () => {
    expect(sampleNameFor('MyWidget')).toBe('mywidget-sample');
    expect(isValidSampleName(sampleNameFor('Components.Form.Input'))).toBe(
      true
    );
  });

  it('writes pretty JSON', () => {
    expect(sampleContent({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
