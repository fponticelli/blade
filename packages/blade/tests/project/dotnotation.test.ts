import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { compileProject } from '../../src/project/compile.js';
import { parseTemplate } from '../../src/parser/index.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixturesPath = PROJECT_FIXTURES_ROOT;

describe('Dot-notation component names', () => {
  describe('parser support', () => {
    it('parses component with dot-notation name', async () => {
      // A parser test: whether the tag NAME is understood. Whether the
      // component exists is a separate question, answered by the validator
      // against a registry these fixtures deliberately do not supply.
      const source = '<Components.Form.Input name="email" />';
      const result = parseTemplate(source);

      expect(result.errors).toHaveLength(0);
      expect(result.value).toHaveLength(1);

      const component = result.value[0];
      expect(component).toMatchObject({
        kind: 'component',
        name: 'Components.Form.Input',
      });
    });

    it('parses component with dot-notation and children', async () => {
      const source = `<Components.Card>
  <span>Hello</span>
</Components.Card>`;
      const result = parseTemplate(source);

      expect(result.errors).toHaveLength(0);
      expect(result.value).toHaveLength(1);

      const component = result.value[0];
      expect(component).toMatchObject({
        kind: 'component',
        name: 'Components.Card',
      });
    });

    it('parses nested components with dot-notation', async () => {
      const source = `<Layout.Main>
  <Components.Form.Input name="email" />
  <Components.Form.Button label="Submit" />
</Layout.Main>`;
      const result = parseTemplate(source);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('project compilation', () => {
    it('resolves dot-notation components from project', async () => {
      // Update nested fixture to use dot-notation
      const projectRoot = resolve(fixturesPath, 'nested');
      const result = await compileProject(projectRoot);

      // Components should be discovered
      expect(result.context.components.has('Components.Form.Input')).toBe(true);
    });
  });
});
