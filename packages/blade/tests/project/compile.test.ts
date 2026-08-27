import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  compileProject,
  compileProjectSources,
} from '../../src/project/compile.js';
import { readProjectSources } from '../../src/project/sources.js';
import { PathEscapeError } from '../../src/project/fs.js';
import {
  compileFiles,
  errorMessages,
  memoryProject,
  PROJECT_ROOT,
  sourcesOf,
} from './support/memory-project.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

describe('compileProject', () => {
  describe('simple project', () => {
    it('compiles project with index.blade entry', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = await compileProject(projectRoot);

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });

    it('discovers components in project', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const result = await compileProject(projectRoot);

      expect(result.context.components.has('Button')).toBe(true);
    });
  });

  describe('nested project', () => {
    it('compiles project and discovers nested components', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(true);
      expect(result.context.components.has('Button')).toBe(true);
      expect(result.context.components.has('Components.Form.Input')).toBe(true);
    });
  });

  describe('locally defined components', () => {
    it('does not report a component defined inline with <template:Name> as missing', async () => {
      const projectRoot = resolve(fixturesPath, 'inline-component');
      const result = await compileProject(projectRoot);

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('still reports a component that is neither on disk nor defined inline', async () => {
      const projectRoot = resolve(fixturesPath, 'missing-component');
      const result = await compileProject(projectRoot);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('Card');
    });
  });

  describe('error handling', () => {
    it('reports error for missing component', async () => {
      const projectRoot = resolve(fixturesPath, 'missing-component');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(false);

      const error = result.errors[0];
      expect(error?.message).toContain('Card');
      expect(error?.message).toContain('not found');
      expect(error?.code).toBe('UNKNOWN_COMPONENT');
    });

    it('reports a missing component exactly once', async () => {
      // The compiler reports an unresolved component too. Two errors for one
      // problem is a worse report than one.
      const result = await compileFiles({ 'index.blade': '<Card/>' });

      expect(result.errors).toHaveLength(1);
    });

    it('rejects for project without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');

      await expect(compileProject(projectRoot)).rejects.toThrow(/index\.blade/);
    });
  });

  describe('project options', () => {
    it('compiles a project whose entry is not index.blade', async () => {
      const result = await compileFiles(
        {
          'main.blade': '<div><Button label="Go"/></div>',
          'button.blade': '@props(label)\n<button>$label</button>',
        },
        { entry: 'main.blade' }
      );

      expect(errorMessages(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('reports the entry it actually compiled', async () => {
      // `config.entry` was hard-coded to 'index.blade' whatever the caller
      // asked for, and the one test that could have caught it passed the
      // default.
      const result = await compileFiles(
        { 'main.blade': '<p>hi</p>' },
        { entry: 'main.blade' }
      );

      expect(result.context.config.entry).toBe('main.blade');
    });
  });

  describe('project root containment', () => {
    it('refuses an entry that climbs out of the project root', async () => {
      const io = memoryProject({ 'index.blade': '<p>hi</p>' });

      await expect(
        compileProject(PROJECT_ROOT, { io, entry: '../../../etc/passwd' })
      ).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('refuses an entry given as a path rather than a file name', async () => {
      const io = memoryProject({
        'index.blade': '',
        'pages/main.blade': '<p>hi</p>',
      });

      await expect(
        compileProject(PROJECT_ROOT, { io, entry: 'pages/main.blade' })
      ).rejects.toThrow(/must be a file in the project root/);
    });
  });

  describe('validation across the whole project', () => {
    it('reports a component a non-entry file calls and cannot resolve', async () => {
      // Verified against the old implementation: only the entry file was
      // compiled and traversed, so `Buton` produced no diagnostic at all and
      // the project reported success.
      const result = await compileFiles({
        'index.blade': '<Card/>',
        'card.blade': '<div><Buton title="x"/></div>',
      });

      expect(result.success).toBe(false);
      const error = result.errors.find(e => e.message.includes('Buton'));
      expect(error).toBeDefined();
      expect(error?.file).toBe('card.blade');
    });

    it('reports a missing required prop at a call site inside a component', async () => {
      const result = await compileFiles({
        'index.blade': '<Card/>',
        'card.blade': '<div><Button/></div>',
        'button.blade': '@props(label)\n<button>$label</button>',
      });

      const error = result.errors.find(e =>
        e.message.includes('Missing required prop')
      );
      expect(error?.file).toBe('card.blade');
      expect(error?.message).toContain('button.blade');
    });

    it('reports a syntax error in a component body against that component', async () => {
      const result = await compileFiles({
        'index.blade': '<Card/>',
        'card.blade': '<div>${1 + }</div>',
      });

      expect(result.success).toBe(false);
      expect(result.errors.every(e => e.file === 'card.blade')).toBe(true);
    });

    it('resolves a component used only inside a slot fallback', async () => {
      // None of the three hand-rolled walkers descended into SlotNode.fallback,
      // so a component used only there was never resolved and never checked.
      const result = await compileFiles({
        'index.blade': '<Card/>',
        'card.blade': '<slot><Button label="Default"/></slot>',
        'button.blade': '@props(label)\n<button>$label</button>',
      });

      expect(errorMessages(result)).toEqual([]);
    });

    it('reports a component used only inside a slot fallback when it is missing', async () => {
      const result = await compileFiles({
        'index.blade': '<Card/>',
        'card.blade': '<slot><Buton/></slot>',
      });

      const error = result.errors.find(e => e.message.includes('Buton'));
      expect(error).toBeDefined();
      expect(error?.file).toBe('card.blade');
    });

    it('reports every usage of a missing component, not only the first', async () => {
      const result = await compileFiles({
        'index.blade': '<div><Card/><Card/></div>',
      });

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]!.location.start.line).toBe(1);
    });
  });

  describe('component reference cycles', () => {
    it('warns about a component that calls itself', async () => {
      const result = await compileFiles({
        'index.blade': '<Comment/>',
        'comment.blade': '<div><Comment/></div>',
      });

      const cycle = result.warnings.find(
        warning => warning.code === 'CIRCULAR_COMPONENT'
      );
      expect(cycle?.message).toContain('Comment -> Comment');
      // A warning, not an error: recursion terminates on the data.
      expect(result.success).toBe(true);
    });

    it('warns once about a cycle through two components', async () => {
      const result = await compileFiles({
        'index.blade': '<A/>',
        'a.blade': '<B/>',
        'b.blade': '<A/>',
      });

      const cycles = result.warnings.filter(
        warning => warning.code === 'CIRCULAR_COMPONENT'
      );
      expect(cycles).toHaveLength(1);
      expect(cycles[0]!.message).toContain('A -> B -> A');
    });

    it('says nothing about a graph with no cycle', async () => {
      const result = await compileFiles({
        'index.blade': '<A/>',
        'a.blade': '<B/>',
        'b.blade': '<p>leaf</p>',
      });

      expect(
        result.warnings.filter(w => w.code === 'CIRCULAR_COMPONENT')
      ).toEqual([]);
    });
  });

  describe('renderable template', () => {
    it('merges discovered components into the template it returns', async () => {
      const result = await compileFiles({
        'index.blade': '<Button label="Go"/>',
        'button.blade': '@props(label)\n<button>$label</button>',
      });

      expect(result.template).not.toBeNull();
      expect(result.template!.root.components.has('Button')).toBe(true);
    });

    it('returns no template when the project has an error', async () => {
      const result = await compileFiles({ 'index.blade': '<Card/>' });

      expect(result.template).toBeNull();
    });
  });

  describe('loading failures', () => {
    it('reports a component file it cannot read, and compiles the rest', async () => {
      const files = memoryProject({
        'index.blade': '<Card/>',
        'card.blade': '<div></div>',
      });
      const io = {
        readFile: (path: string) =>
          path.endsWith('card.blade')
            ? Promise.reject(new Error('EACCES: permission denied'))
            : files.readFile(path),
        readDirectory: files.readDirectory,
        realPath: files.realPath,
      };

      const result = await compileProject(PROJECT_ROOT, { io });

      const warning = result.warnings.find(w => w.code === 'PROJECT_LOAD');
      expect(warning?.message).toContain('EACCES');
      expect(warning?.file).toBe('card.blade');
    });

    it('says which directory the depth limit hid components below', async () => {
      const result = await compileFiles(
        {
          'index.blade': '<p>hi</p>',
          'a/b/deep.blade': '<div></div>',
        },
        { maxDepth: 1 }
      );

      const warning = result.warnings.find(w => w.code === 'PROJECT_LOAD');
      expect(warning?.message).toContain('deeper than the discovery limit');
    });
  });

  describe('schema and samples', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' }, count: { type: 'integer' } },
    });

    it('puts the schema and the samples on the project context', async () => {
      // Both were hard-coded to empty, unconditionally, because a synchronous
      // compile cannot await an asynchronous loader.
      const result = await compileFiles({
        'index.blade': '<p>$title</p>',
        'schema.json': schema,
        'samples/default.json': '{"title":"Hello","count":2}',
      });

      expect(result.context.config.schema).toMatchObject({ type: 'object' });
      expect(result.context.config.samples.get('default')).toEqual({
        title: 'Hello',
        count: 2,
      });
    });

    it('validates every sample against the schema', async () => {
      const result = await compileFiles({
        'index.blade': '<p>$title</p>',
        'schema.json': schema,
        'samples/broken.json': '{"count":1.5}',
      });

      const mismatches = result.warnings.filter(
        w => w.code === 'SAMPLE_SCHEMA_MISMATCH'
      );
      expect(mismatches.map(w => w.message)).toEqual([
        expect.stringContaining("Missing required property 'title'"),
        expect.stringContaining('must be integer'),
      ]);
      expect(mismatches[0]!.file).toBe('samples/broken.json');
      // A sample that does not match is worth saying, not worth failing over.
      expect(result.success).toBe(true);
    });

    it('reports a broken schema.json without blanking the template', async () => {
      const result = await compileFiles({
        'index.blade': '<p>$title</p>',
        'schema.json': '{ "type": "object", }',
      });

      expect(result.warnings.map(w => w.code)).toContain('INVALID_SCHEMA');
      expect(result.success).toBe(true);
      expect(result.template).not.toBeNull();
    });
  });

  describe('pure compilation', () => {
    it('compiles sources that were read separately', async () => {
      const sources = await sourcesOf({
        'index.blade': '<Button label="Go"/>',
        'button.blade': '@props(label)\n<button>$label</button>',
      });

      const result = compileProjectSources(sources);

      expect(errorMessages(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('gives the same answer twice for the same sources', async () => {
      const sources = await sourcesOf({
        'index.blade': '<Card/>',
        'card.blade': '<div></div>',
      });

      expect(compileProjectSources(sources).errors).toEqual(
        compileProjectSources(sources).errors
      );
    });

    it('reads a project without compiling it', async () => {
      const sources = await readProjectSources(PROJECT_ROOT, {
        io: memoryProject({
          'index.blade': '<Card/>',
          'card.blade': '<div></div>',
        }),
      });

      expect(sources.entry).toBe('index.blade');
      expect(sources.entrySource).toBe('<Card/>');
      expect(sources.components.get('Card')?.path).toBe('card.blade');
      expect(sources.components.get('Card')?.source).toBe('<div></div>');
    });
  });
});
