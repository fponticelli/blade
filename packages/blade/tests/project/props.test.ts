import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { compileProject } from '../../src/project/compile.js';
import { discoverComponents } from '../../src/project/discovery.js';
import { parseComponentProps } from '../../src/project/props.js';
import {
  compileFiles,
  errorMessages,
  warningCodes,
} from './support/memory-project.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

describe('@props directive', () => {
  describe('parseComponentProps', () => {
    it('parses @props from component source', () => {
      const source = `@props(label, disabled = false)

<button disabled={$disabled}>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.props).toHaveLength(2);
      expect(result.props[0]).toMatchObject({ name: 'label', required: true });
      expect(result.props[1]).toMatchObject({
        name: 'disabled',
        required: false,
      });
      expect(result.inferred).toBe(false);
    });

    it('infers props when no @props directive', () => {
      const source = `<button disabled={$disabled}>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.props.map(p => p.name)).toEqual(['disabled', 'label']);
      expect(result.inferred).toBe(true);
    });

    it('never marks an inferred prop required', () => {
      // Inference cannot tell "the caller must pass this" from "this name is
      // referenced". Marking them required made a project fail to compile over
      // names the component binds itself.
      const result = parseComponentProps('<p>${greeting}</p>');

      expect(result.props).toHaveLength(1);
      expect(result.props[0]!.required).toBe(false);
    });

    it('does not infer a loop variable as a prop', () => {
      const source = `<ul>@for(item of items) { <li>${'${item.name}'}</li> }</ul>`;

      const result = parseComponentProps(source);

      expect(result.props.map(p => p.name)).toEqual(['items']);
    });

    it('does not infer from prose or from a comment', () => {
      // The regular expression this replaces matched `$` anywhere in the file,
      // including inside comments and in ordinary prose, and made every match
      // a required prop.
      const source = `<!-- $comment -->
<p>Pay $5 today</p>`;

      const result = parseComponentProps(source);

      expect(result.props).toEqual([]);
    });

    it('infers a prop that only a block expression reads', () => {
      // `${...}` was invisible to the regular expression, so a genuinely
      // required prop expressed that way was missed entirely.
      const result = parseComponentProps('<p>${first + last}</p>');

      expect(result.props.map(p => p.name)).toEqual(['first', 'last']);
    });

    it('locates an inferred prop at its first reference', () => {
      const result = parseComponentProps('<div>\n  <p>$title</p>\n</div>');

      expect(result.props[0]!.location.start.line).toBe(2);
    });

    it('returns warning for malformed @props', () => {
      const source = `@props(123invalid)

<button>{$label}</button>`;

      const result = parseComponentProps(source);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.message).toContain('Expected');
      // Falls back to inference
      expect(result.inferred).toBe(true);
    });
  });

  describe('component discovery with props', () => {
    it('parses props during discovery', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      const components = await discoverComponents(projectRoot);

      const button = components.get('Button')!;
      const buttonSource = await readFile(button.filePath, 'utf-8');
      const propsResult = parseComponentProps(buttonSource);

      expect(propsResult.props).toHaveLength(2);
      expect(propsResult.props[0]!.name).toBe('label');
      expect(propsResult.props[0]!.required).toBe(true);
      expect(propsResult.props[1]!.name).toBe('disabled');
      expect(propsResult.props[1]!.required).toBe(false);
    });

    it('fills in the props of every component on the project context', async () => {
      const result = await compileFiles({
        'index.blade': '<Button label="Go"/>',
        'button.blade': '@props(label)\n<button>$label</button>',
      });

      const button = result.context.components.get('Button')!;
      expect(button.propsInferred).toBe(false);
      expect(button.props?.map(p => p.name)).toEqual(['label']);
    });
  });

  describe('prop validation during compilation', () => {
    it('compiles successfully when all required props provided', async () => {
      const projectRoot = resolve(fixturesPath, 'with-props');
      const result = await compileProject(projectRoot);

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('reports error for missing required prop', async () => {
      const projectRoot = resolve(fixturesPath, 'missing-required-prop');
      const result = await compileProject(projectRoot);

      expect(result.success).toBe(false);

      const error = result.errors.find(e =>
        e.message.includes('Missing required prop')
      );
      expect(error).toBeDefined();
      expect(error?.message).toContain('label');
      expect(error?.message).toContain('Button');
      expect(error?.message).toContain('button.blade');
    });

    it('does not fail a build over a component that loops over its own data', async () => {
      // Verified against the old implementation: `item` and `items` were both
      // inferred as REQUIRED props, so every `<Card items={...}>` call site was
      // reported as missing `item` and the project did not compile.
      const result = await compileFiles({
        'index.blade': '<Card items=$rows/>',
        'card.blade': '<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      });

      expect(errorMessages(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('warns about a prop a component reads without declaring', async () => {
      const result = await compileFiles({
        'index.blade': '<Card items=$rows/>',
        'card.blade': '<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      });

      const undeclared = result.warnings.filter(
        warning => warning.code === 'UNDECLARED_PROP'
      );
      expect(undeclared).toHaveLength(1);
      expect(undeclared[0]!.message).toContain('$items');
      expect(undeclared[0]!.file).toBe('card.blade');
    });

    it('says nothing about props for a component that declares them', async () => {
      const result = await compileFiles({
        'index.blade': '<Card items=$rows/>',
        'card.blade':
          '@props(items)\n<ul>@for(item of items) { <li>${item.name}</li> }</ul>',
      });

      expect(warningCodes(result)).not.toContain('UNDECLARED_PROP');
    });
  });
});
