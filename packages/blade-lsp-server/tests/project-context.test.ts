/**
 * Project contexts: how they are loaded, cached, bounded and dropped.
 *
 * The cache this replaces was a module-level `Map` in `server.ts` that was
 * written once per root and never deleted from - not on close, not on a
 * workspace-folder change, not on a file change - and that cached successes
 * only, so a miss re-ran the whole recursive filesystem walk on every request.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  initializeProjectContext,
  ProjectContextCache,
} from '../src/project-context.js';
import type { ProjectLspContext } from '../src/project-context.js';
import { parseHelperDefinitions } from '../src/service.js';
import { findProjectRoot } from '@bladets/template/node';
import { createMemoryFileSystem } from '@bladets/template/node';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixtures = PROJECT_FIXTURES_ROOT;

function fakeContext(root: string): ProjectLspContext {
  return {
    projectRoot: root,
    components: new Map(),
    schema: null,
    samples: null,
    sampleSources: new Map(),
    diagnostics: [],
    lastUpdated: 0,
  };
}

describe('initializeProjectContext', () => {
  it('loads components, schema and sample sources', async () => {
    const context = await initializeProjectContext(
      resolve(fixtures, 'with-strict-schema')
    );

    expect(context).not.toBeNull();
    expect(context!.schema).not.toBeNull();
    expect(context!.samples!.samples).toHaveLength(3);
    // The raw text is kept so a diagnostic can point at the offending value.
    expect(context!.sampleSources.size).toBe(3);
  });

  it('returns null for a directory that is not a project', async () => {
    expect(
      await initializeProjectContext(resolve(fixtures, 'no-entry'))
    ).toBeNull();
    expect(
      await initializeProjectContext(resolve(fixtures, 'does-not-exist'))
    ).toBeNull();
  });

  it('reports a schema.json that cannot be used, instead of going quiet', async () => {
    const io = createMemoryFileSystem(
      {
        '/p/index.blade': '<div>x</div>',
        '/p/schema.json': '{ "type": "object", }',
      },
      '/p'
    );
    const context = await initializeProjectContext('/p', { io });

    expect(context!.schema).toBeNull();
    expect(context!.diagnostics.map(d => d.code)).toEqual(['INVALID_SCHEMA']);
  });
});

describe('ProjectContextCache', () => {
  it('loads a root once, even for concurrent requests', async () => {
    let loads = 0;
    const cache = new ProjectContextCache({
      load: async root => {
        loads++;
        return fakeContext(root);
      },
    });

    const [a, b] = await Promise.all([cache.get('/p'), cache.get('/p')]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
  });

  it('remembers a miss', async () => {
    let loads = 0;
    const cache = new ProjectContextCache({
      load: async () => {
        loads++;
        return null;
      },
    });

    expect(await cache.get('/p')).toBeNull();
    expect(await cache.get('/p')).toBeNull();
    expect(loads).toBe(1);
  });

  it('turns a loader failure into a miss rather than a rejection', async () => {
    const cache = new ProjectContextCache({
      load: async () => {
        throw new Error('disk gone');
      },
    });
    await expect(cache.get('/p')).resolves.toBeNull();
  });

  it('evicts the roots a changed file belongs to, and only those', async () => {
    const cache = new ProjectContextCache({
      load: async root => fakeContext(root),
    });
    await cache.get('/a');
    await cache.get('/b');

    expect(cache.invalidateForPath('/a/samples/x.json')).toEqual(['/a']);
    expect(cache.has('/a')).toBe(false);
    expect(cache.has('/b')).toBe(true);
  });

  it('does not evict a root whose name is merely a prefix', async () => {
    const cache = new ProjectContextCache({
      load: async root => fakeContext(root),
    });
    await cache.get('/project');
    cache.invalidateForPath('/project-other/schema.json');
    expect(cache.has('/project')).toBe(true);
  });

  it('bounds itself', async () => {
    const cache = new ProjectContextCache({
      maxEntries: 2,
      load: async root => fakeContext(root),
    });
    await cache.get('/a');
    await cache.get('/b');
    await cache.get('/c');

    expect(cache.size).toBe(2);
    expect(cache.has('/a')).toBe(false);
  });

  it('keeps only the roots it is told to', async () => {
    const cache = new ProjectContextCache({
      load: async root => fakeContext(root),
    });
    await cache.get('/a');
    await cache.get('/b');

    cache.retain(['/b']);
    expect(cache.has('/a')).toBe(false);
    expect(cache.has('/b')).toBe(true);
  });
});

describe('findProjectRoot', () => {
  const io = createMemoryFileSystem(
    {
      '/w/proj/index.blade': '',
      '/w/proj/components/card.blade': '',
      '/w/proj/components/nested/deep.blade': '',
      '/w/proj/inner/index.blade': '',
      '/w/proj/inner/thing.blade': '',
      '/w/loose/orphan.blade': '',
    },
    '/w'
  );

  it('finds the nearest ancestor holding the entry file', async () => {
    expect(await findProjectRoot('/w/proj/components/nested', { io })).toBe(
      '/w/proj'
    );
  });

  it("treats the entry file's own directory as its project", async () => {
    expect(await findProjectRoot('/w/proj', { io })).toBe('/w/proj');
  });

  it('stops at a nested project of its own', async () => {
    expect(await findProjectRoot('/w/proj/inner', { io })).toBe(
      '/w/proj/inner'
    );
  });

  it('returns null when nothing above the file is a project', async () => {
    expect(await findProjectRoot('/w/loose', { io })).toBeNull();
  });

  it('does not walk above the workspace folder', async () => {
    expect(
      await findProjectRoot('/w/proj/components', {
        io,
        stopAt: '/w/proj/components',
      })
    ).toBeNull();
    expect(
      await findProjectRoot('/w/proj/components', { io, stopAt: '/w' })
    ).toBe('/w/proj');
  });

  it('returns null for a directory outside the workspace folder', async () => {
    expect(
      await findProjectRoot('/elsewhere', { io, stopAt: '/w' })
    ).toBeNull();
  });

  it('honours a different entry file name', async () => {
    const other = createMemoryFileSystem({ '/x/main.blade': '' }, '/x');
    expect(
      await findProjectRoot('/x', { io: other, entry: 'main.blade' })
    ).toBe('/x');
    expect(await findProjectRoot('/x', { io: other })).toBeNull();
  });
});

describe('parseHelperDefinitions', () => {
  it('reads a bare array', () => {
    const helpers = parseHelperDefinitions(
      '[{"name":"a","signature":"a(): string"}]'
    );
    expect(helpers).toEqual([
      {
        name: 'a',
        signature: 'a(): string',
        description: undefined,
        deprecated: false,
        deprecatedMessage: undefined,
        sourceFile: undefined,
      },
    ]);
  });

  it('reads a { helpers: [...] } wrapper', () => {
    expect(
      parseHelperDefinitions('{"helpers":[{"name":"b"}]}').map(h => h.name)
    ).toEqual(['b']);
  });

  it('defaults a missing signature to the name', () => {
    expect(parseHelperDefinitions('[{"name":"b"}]')[0]!.signature).toBe('b');
  });

  it('ignores entries that are not helper definitions', () => {
    expect(parseHelperDefinitions('[1, null, {"nope": true}]')).toEqual([]);
  });

  it('returns nothing for a file that is not JSON', () => {
    expect(parseHelperDefinitions('nonsense')).toEqual([]);
  });
});
