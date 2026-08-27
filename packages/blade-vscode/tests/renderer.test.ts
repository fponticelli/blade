/**
 * Rendering a compiled project.
 */

import { describe, it, expect } from 'vitest';
import {
  compileProjectSources,
  createMemoryFileSystem,
  readProjectSources,
} from '@bladets/template/node';
import type { ProjectResult } from '@bladets/template';
import { renderProject } from '../src/preview/renderer.js';

const ROOT = '/project';

async function projectOf(
  files: Record<string, string>
): Promise<ProjectResult> {
  return compileProjectSources(
    await readProjectSources(ROOT, {
      io: createMemoryFileSystem(files, ROOT),
    })
  );
}

describe('renderProject', () => {
  it('renders the entry template with sample data', async () => {
    const project = await projectOf({
      'index.blade': '<h1>${title}</h1>',
    });

    const render = renderProject(project, { title: 'Hello' });

    expect(render.errors).toEqual([]);
    expect(render.html).toContain('<h1>Hello</h1>');
  });

  it('renders a component that lives in another file', async () => {
    const project = await projectOf({
      'index.blade': '<Card title=$title/>',
      'card.blade': '@props(title)\n<div class="card">${title}</div>',
    });

    const render = renderProject(project, { title: 'Boxed' });

    expect(render.errors).toEqual([]);
    expect(render.html).toContain('class="card"');
    expect(render.html).toContain('Boxed');
  });

  it('renders a namespaced component', async () => {
    const project = await projectOf({
      'index.blade': '<Components.Form.Input name="email"/>',
      'components/form/input.blade': '@props(name)\n<input name="${name}">',
    });

    const render = renderProject(project, {});

    expect(render.errors).toEqual([]);
    expect(render.html).toContain('name="email"');
  });

  it('applies the standard library', async () => {
    const project = await projectOf({
      'index.blade': '<p>${upper(name)}</p>',
    });

    expect(renderProject(project, { name: 'ada' }).html).toContain('ADA');
  });

  it('escapes interpolated data', async () => {
    const project = await projectOf({ 'index.blade': '<p>${text}</p>' });

    const render = renderProject(project, {
      text: '<script>alert(1)</script>',
    });

    expect(render.html).not.toContain('<script>');
    expect(render.html).toContain('&lt;script&gt;');
  });

  it('reports the project errors instead of rendering', async () => {
    const project = await projectOf({ 'index.blade': '<Missing/>' });

    const render = renderProject(project, {});

    expect(render.html).toBeNull();
    expect(render.errors.length).toBeGreaterThan(0);
    expect(render.errors[0]!.message).toContain('Missing');
  });

  it('carries the project warnings through with a successful render', async () => {
    const project = await projectOf({
      'index.blade': '<div>${a}</div>',
      'schema.json':
        '{"type":"object","properties":{"a":{"type":"string"}},"required":["a"]}',
      'samples/bad.json': '{}',
    });

    const render = renderProject(project, {});

    expect(render.html).not.toBeNull();
    expect(
      render.warnings.some(warning => warning.code === 'SAMPLE_SCHEMA_MISMATCH')
    ).toBe(true);
  });
});
