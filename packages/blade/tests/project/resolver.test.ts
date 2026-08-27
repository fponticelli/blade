import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import type { ComponentDefinition } from '../../src/ast/types.js';
import {
  collectComponentReferences,
  collectComponentUsages,
  createProjectContext,
  resolveComponent,
} from '../../src/project/resolver.js';
import { discoverComponents } from '../../src/project/discovery.js';
import { compileOrThrow } from '../../src/compiler/index.js';
import { parseTemplate } from '../../src/parser/index.js';
import * as ast from '../../src/ast/builders.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

/** The root of a template, without asking whether it validates. */
function rootOf(source: string) {
  const parsed = parseTemplate(source);
  expect(parsed.errors, source).toEqual([]);
  return ast.root.node({
    children: parsed.value,
    components: parsed.components,
    props: parsed.props,
    metadata: ast.root.metadata({
      globalsUsed: [],
      pathsAccessed: [],
      helpersUsed: [],
      componentsUsed: [],
    }),
    location: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: source.length },
    },
  });
}

describe('resolveComponent', () => {
  describe('project component resolution', () => {
    it('resolves component from discovered components', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext({
        rootPath: projectRoot,
        components,
      });

      const result = resolveComponent('Button', context);

      expect(result).toBeDefined();
      expect(result!.tagName).toBe('Button');
      expect(result!.filePath).toContain('button.blade');
    });

    it('returns undefined for unknown component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext({
        rootPath: projectRoot,
        components,
      });

      expect(resolveComponent('Unknown', context)).toBeUndefined();
    });
  });

  describe('template component shadowing', () => {
    it('template-passed component shadows project component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const components = await discoverComponents(projectRoot);

      const templateComponents = new Map<string, ComponentDefinition>();
      templateComponents.set('Button', {
        name: 'Button',
        props: [],
        body: [],
        location: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
      });

      const context = createProjectContext({
        rootPath: projectRoot,
        components,
        templateComponents,
      });

      // Template components are resolved by the template system, so the
      // project resolver deliberately declines to answer for them.
      expect(resolveComponent('Button', context)).toBeUndefined();
    });
  });

  describe('dot-notation resolution', () => {
    it('resolves nested component with dot-notation', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const components = await discoverComponents(projectRoot);
      const context = createProjectContext({
        rootPath: projectRoot,
        components,
      });

      const result = resolveComponent('Components.Form.Input', context);

      expect(result).toBeDefined();
      expect(result!.namespace).toEqual(['Components', 'Form']);
    });
  });
});

describe('createProjectContext', () => {
  it('creates context with discovered components', async () => {
    const projectRoot = resolve(fixturesPath, 'simple');
    const components = await discoverComponents(projectRoot);
    const context = createProjectContext({ rootPath: projectRoot, components });

    expect(context.config.rootPath).toBe(projectRoot);
    expect(context.config.entry).toBe('index.blade');
    expect(context.components.size).toBe(1);
    expect(context.warnings).toHaveLength(0);
    expect(context.errors).toHaveLength(0);
  });

  it('keeps the entry, schema and samples it is given', () => {
    // All three used to be hard-coded, with no parameter that could say
    // otherwise - which is what made schema-driven validation unreachable.
    const schema = { type: 'object' as const };
    const samples = new Map<string, unknown>([['default', { a: 1 }]]);

    const context = createProjectContext({
      rootPath: '/p',
      entry: 'main.blade',
      schema,
      samples,
      components: new Map(),
    });

    expect(context.config.entry).toBe('main.blade');
    expect(context.config.schema).toBe(schema);
    expect(context.config.samples).toBe(samples);
  });

  it('creates context with template components', () => {
    const templateComponents = new Map<string, ComponentDefinition>();

    const context = createProjectContext({
      rootPath: '/p',
      components: new Map(),
      templateComponents,
    });

    expect(context.templateComponents).toBe(templateComponents);
  });
});

describe('collectComponentUsages', () => {
  it('collects every usage of a name, in document order', () => {
    const usages = collectComponentUsages(
      rootOf('<div><Card title="a"/><Card title="b"/></div>')
    );

    expect(usages.get('Card')).toHaveLength(2);
    expect(usages.get('Card')![0]!.props[0]!.name).toBe('title');
  });

  it('descends into slot fallback content', () => {
    // The three hand-rolled walkers this replaces descended into children, if
    // branches, for bodies and match cases - and into neither a slot fallback
    // nor a fragment.
    const usages = collectComponentUsages(rootOf('<slot><Card/></slot>'));

    expect(Array.from(usages.keys())).toEqual(['Card']);
  });

  it('descends into every branch, loop body and match case', () => {
    const source = `@if(a) { <A/> } @else { <B/> }
@for(x of xs) { <C/> }
@match(m) { when 1 { <D/> } * { <E/> } }`;

    expect(Array.from(collectComponentUsages(rootOf(source)).keys())).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('descends into the body of an inline <template:> definition', () => {
    const template = compileOrThrow(
      `<template:Outer>
  <Inner/>
</template:Outer>
<template:Inner><p>x</p></template:Inner>
<Outer/>`
    );

    expect(
      Array.from(collectComponentUsages(template.root).keys()).sort()
    ).toEqual(['Inner', 'Outer']);
  });

  it('collectComponentReferences is its key set', () => {
    const root = rootOf('<div><Card/><Card/><Panel/></div>');

    expect(Array.from(collectComponentReferences(root))).toEqual([
      'Card',
      'Panel',
    ]);
  });
});
