import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  createDocument,
  findDefinition,
  findReferences,
  getComponentDefinition,
  initializeProjectContext,
} from '../src/index.js';
import { positionAt } from '../src/line-index.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

/** Definition/references at the `|` marker, which is removed from the source. */
function atMarker(marked: string) {
  const offset = marked.indexOf('|');
  expect(offset).toBeGreaterThan(-1);
  const content = marked.slice(0, offset) + marked.slice(offset + 1);
  const doc = createDocument('test://d.blade', content);
  return { doc, position: positionAt(doc.lines, offset) };
}

describe('Definition Provider', () => {
  describe('getComponentDefinition', () => {
    it('returns definition for existing component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const definition = getComponentDefinition('Button', context!);

      expect(definition).not.toBeNull();
      expect(definition!.uri).toContain('button.blade');
      expect(definition!.range.start.line).toBe(0);
    });

    it('returns null for non-existent component', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      const definition = getComponentDefinition('NonExistent', context!);

      expect(definition).toBeNull();
    });

    it('returns definition for nested component', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      // The nested fixture has components/form/input.blade -> Components.Form.Input
      const definition = getComponentDefinition(
        'Components.Form.Input',
        context!
      );

      expect(definition).not.toBeNull();
      expect(definition!.uri).toContain('form');
      expect(definition!.uri).toContain('input.blade');
    });

    it('handles dot-notation component names', async () => {
      const projectRoot = resolve(fixturesPath, 'nested');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();

      // Check that the component map has the dot-notation name
      const componentNames = Array.from(context!.components.keys());
      expect(componentNames.some(name => name.includes('.'))).toBe(true);
    });
  });

  describe('Project context integration', () => {
    it('initializes context with schema', async () => {
      const projectRoot = resolve(fixturesPath, 'with-schema');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).not.toBeNull();
      expect(context!.schema!.properties.length).toBeGreaterThan(0);
    });

    it('initializes context without schema', async () => {
      const projectRoot = resolve(fixturesPath, 'simple');
      const context = await initializeProjectContext(projectRoot);

      expect(context).not.toBeNull();
      expect(context!.schema).toBeNull();
    });

    it('returns null for invalid project root', async () => {
      const projectRoot = resolve(fixturesPath, 'does-not-exist');
      const context = await initializeProjectContext(projectRoot);

      expect(context).toBeNull();
    });

    it('returns null for directory without index.blade', async () => {
      const projectRoot = resolve(fixturesPath, 'no-entry');
      const context = await initializeProjectContext(projectRoot);

      expect(context).toBeNull();
    });
  });

  describe('findDefinition', () => {
    it('resolves a variable to the declaration in force at the cursor', () => {
      // A `@for` item shadows a prop of the same name; the old lookup scanned
      // every scope entry in the document and returned whichever it met first.
      const { doc, position } = atMarker(
        '@props(item)\n@for(item of items) {\n  <li>$it|em</li>\n}\n'
      );
      const location = findDefinition(doc, position);
      expect(location?.range.start.line).toBe(1);
    });

    it('resolves a component tag to its definition in the same file', () => {
      const { doc, position } = atMarker(
        '<template:Card>\n<div>x</div>\n</template:Card>\n<Ca|rd />\n'
      );
      expect(findDefinition(doc, position)?.range.start.line).toBe(0);
    });

    it('returns null in prose', () => {
      const { doc, position } = atMarker('<p>hello wo|rld</p>');
      expect(findDefinition(doc, position)).toBeNull();
    });
  });

  describe('findReferences', () => {
    it('finds every read of a variable, with and without the sigil', () => {
      // The regular expression this replaces was built from a word that may
      // itself start with `$`, producing `\\$$item\\b` - an end anchor in the
      // middle of the pattern, which matches nothing.
      const { doc, position } = atMarker(
        '@for(item of items) {\n  <li>$it|em</li>\n  <li>${item.name}</li>\n}\n'
      );
      const references = findReferences(doc, position);
      expect(references.map(r => r.range.start.line).sort()).toEqual([0, 1, 2]);
    });

    it('reports the name, not the whole path', () => {
      const { doc, position } = atMarker(
        '@props(user)\n<p>${us|er.address.city}</p>\n'
      );
      const use = findReferences(doc, position).find(
        r => r.range.start.line === 1
      );
      expect(use!.range.end.character - use!.range.start.character).toBe(4);
    });

    it('finds component usages', () => {
      const { doc, position } = atMarker(
        '<template:Card>\n<i>x</i>\n</template:Card>\n<Ca|rd />\n<Card />\n'
      );
      const references = findReferences(doc, position);
      expect(references.length).toBeGreaterThanOrEqual(3);
    });

    it('returns nothing for a position with no word', () => {
      const { doc, position } = atMarker('<p> | </p>');
      expect(findReferences(doc, position)).toEqual([]);
    });
  });
});
