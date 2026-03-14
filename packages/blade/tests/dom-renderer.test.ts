/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { createDomRenderer } from '../src/renderer/index.js';
import type {
  CompiledTemplate,
  RootNode,
  TemplateNode,
  ComponentDefinition,
  ExprAst,
  SourceLocation,
} from '../src/ast/types.js';
import type { RenderOptions } from '../src/renderer/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

const mockLocation: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

function createMockTemplate(
  children: TemplateNode[] = [],
  components: Map<string, ComponentDefinition> = new Map()
): CompiledTemplate {
  const root: RootNode = {
    kind: 'root',
    children,
    components,
    metadata: {
      globalsUsed: new Set(),
      pathsAccessed: new Set(),
      helpersUsed: new Set(),
      componentsUsed: new Set(),
    },
    location: mockLocation,
  };

  return { root, diagnostics: [] };
}

function literal(value: string | number | boolean | null): ExprAst {
  const type =
    value === null
      ? 'nil'
      : typeof value === 'string'
        ? 'string'
        : typeof value === 'number'
          ? 'number'
          : 'boolean';
  return { kind: 'literal', type, value, location: mockLocation };
}

function path(...keys: string[]): ExprAst {
  return {
    kind: 'path',
    segments: keys.map(k => ({ kind: 'key' as const, key: k })),
    isGlobal: false,
    location: mockLocation,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('createDomRenderer', () => {
  describe('text rendering', () => {
    it('should render literal text as a text node', () => {
      const template = createMockTemplate([
        {
          kind: 'text',
          segments: [
            { kind: 'literal', text: 'Hello, World!', location: mockLocation },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.nodeType).toBe(Node.TEXT_NODE);
      expect(result.nodes[0]!.textContent).toBe('Hello, World!');
    });

    it('should render expression text with data interpolation', () => {
      const template = createMockTemplate([
        {
          kind: 'text',
          segments: [
            { kind: 'literal', text: 'Hello, ', location: mockLocation },
            { kind: 'expr', expr: path('name'), location: mockLocation },
            { kind: 'literal', text: '!', location: mockLocation },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({ name: 'Alice' });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.textContent).toBe('Hello, Alice!');
    });

    it('should not HTML-escape text in DOM nodes', () => {
      const template = createMockTemplate([
        {
          kind: 'text',
          segments: [
            { kind: 'expr', expr: path('content'), location: mockLocation },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({ content: '<script>alert("xss")</script>' });

      // DOM text nodes don't parse HTML - the literal text is safe
      expect(result.nodes[0]!.textContent).toBe(
        '<script>alert("xss")</script>'
      );
    });
  });

  describe('element rendering', () => {
    it('should render an element with tag and attributes', () => {
      const template = createMockTemplate([
        {
          kind: 'element',
          tag: 'div',
          attributes: [
            {
              kind: 'static',
              name: 'class',
              value: 'container',
              location: mockLocation,
            },
          ],
          children: [],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      expect(result.nodes).toHaveLength(1);
      const el = result.nodes[0] as Element;
      expect(el.tagName.toLowerCase()).toBe('div');
      expect(el.getAttribute('class')).toBe('container');
    });

    it('should render an element with expression attributes', () => {
      const template = createMockTemplate([
        {
          kind: 'element',
          tag: 'input',
          attributes: [
            {
              kind: 'expr',
              name: 'value',
              expr: path('inputValue'),
              location: mockLocation,
            },
          ],
          children: [],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({ inputValue: 'test-value' });

      const el = result.nodes[0] as Element;
      expect(el.getAttribute('value')).toBe('test-value');
    });

    it('should handle boolean attributes', () => {
      const template = createMockTemplate([
        {
          kind: 'element',
          tag: 'input',
          attributes: [
            {
              kind: 'expr',
              name: 'disabled',
              expr: literal(true),
              location: mockLocation,
            },
            {
              kind: 'expr',
              name: 'readonly',
              expr: literal(false),
              location: mockLocation,
            },
          ],
          children: [],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      const el = result.nodes[0] as Element;
      expect(el.hasAttribute('disabled')).toBe(true);
      expect(el.hasAttribute('readonly')).toBe(false);
    });

    it('should render nested elements', () => {
      const template = createMockTemplate([
        {
          kind: 'element',
          tag: 'div',
          attributes: [],
          children: [
            {
              kind: 'element',
              tag: 'span',
              attributes: [],
              children: [
                {
                  kind: 'text',
                  segments: [
                    {
                      kind: 'literal',
                      text: 'nested',
                      location: mockLocation,
                    },
                  ],
                  location: mockLocation,
                },
              ],
              location: mockLocation,
            },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      const div = result.nodes[0] as Element;
      expect(div.tagName.toLowerCase()).toBe('div');
      expect(div.children).toHaveLength(1);
      expect(div.children[0]!.tagName.toLowerCase()).toBe('span');
      expect(div.children[0]!.textContent).toBe('nested');
    });
  });

  describe('conditional rendering', () => {
    it('should render the truthy branch when condition is true', () => {
      const template = createMockTemplate([
        {
          kind: 'if',
          branches: [
            {
              condition: path('show'),
              body: [
                {
                  kind: 'text',
                  segments: [
                    { kind: 'literal', text: 'visible', location: mockLocation },
                  ],
                  location: mockLocation,
                },
              ],
              location: mockLocation,
            },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);

      const shown = render({ show: true });
      expect(shown.nodes).toHaveLength(1);
      expect(shown.nodes[0]!.textContent).toBe('visible');

      const hidden = render({ show: false });
      expect(hidden.nodes).toHaveLength(0);
    });

    it('should render the else branch when no conditions match', () => {
      const template = createMockTemplate([
        {
          kind: 'if',
          branches: [
            {
              condition: path('show'),
              body: [
                {
                  kind: 'text',
                  segments: [
                    {
                      kind: 'literal',
                      text: 'true-branch',
                      location: mockLocation,
                    },
                  ],
                  location: mockLocation,
                },
              ],
              location: mockLocation,
            },
          ],
          elseBranch: [
            {
              kind: 'text',
              segments: [
                {
                  kind: 'literal',
                  text: 'else-branch',
                  location: mockLocation,
                },
              ],
              location: mockLocation,
            },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({ show: false });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.textContent).toBe('else-branch');
    });
  });

  describe('loop rendering', () => {
    it('should render for-of loops', () => {
      const template = createMockTemplate([
        {
          kind: 'for',
          itemsExpr: path('items'),
          itemVar: 'item',
          iterationType: 'of' as const,
          body: [
            {
              kind: 'element',
              tag: 'li',
              attributes: [],
              children: [
                {
                  kind: 'text',
                  segments: [
                    { kind: 'expr', expr: path('item'), location: mockLocation },
                  ],
                  location: mockLocation,
                },
              ],
              location: mockLocation,
            },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({ items: ['A', 'B', 'C'] });

      expect(result.nodes).toHaveLength(3);
      expect((result.nodes[0] as Element).textContent).toBe('A');
      expect((result.nodes[1] as Element).textContent).toBe('B');
      expect((result.nodes[2] as Element).textContent).toBe('C');
    });
  });

  describe('component rendering', () => {
    it('should render components with props', () => {
      const components = new Map<string, ComponentDefinition>();
      components.set('Greeting', {
        name: 'Greeting',
        props: [{ name: 'name', required: true, location: mockLocation }],
        body: [
          {
            kind: 'element',
            tag: 'span',
            attributes: [],
            children: [
              {
                kind: 'text',
                segments: [
                  { kind: 'literal', text: 'Hi, ', location: mockLocation },
                  { kind: 'expr', expr: path('name'), location: mockLocation },
                ],
                location: mockLocation,
              },
            ],
            location: mockLocation,
          },
        ],
        location: mockLocation,
      });

      const template = createMockTemplate(
        [
          {
            kind: 'component',
            name: 'Greeting',
            props: [
              { name: 'name', value: literal('World'), location: mockLocation },
            ],
            children: [],
            propPathMapping: new Map(),
            location: mockLocation,
          },
        ],
        components
      );

      const render = createDomRenderer(template);
      const result = render({});

      expect(result.nodes).toHaveLength(1);
      expect((result.nodes[0] as Element).textContent).toBe('Hi, World');
    });
  });

  describe('comment rendering', () => {
    it('should not render comments by default', () => {
      const template = createMockTemplate([
        {
          kind: 'comment',
          style: 'html' as const,
          text: 'A comment',
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      expect(result.nodes).toHaveLength(0);
    });

    it('should render HTML comments when includeComments is true', () => {
      const template = createMockTemplate([
        {
          kind: 'comment',
          style: 'html' as const,
          text: 'A comment',
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({}, { config: { includeComments: true } });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.nodeType).toBe(Node.COMMENT_NODE);
      expect(result.nodes[0]!.textContent).toBe('A comment');
    });
  });

  describe('metadata', () => {
    it('should include render metadata', () => {
      const template = createMockTemplate([
        {
          kind: 'text',
          segments: [
            { kind: 'literal', text: 'test', location: mockLocation },
          ],
          location: mockLocation,
        },
      ]);

      const render = createDomRenderer(template);
      const result = render({});

      expect(result.metadata).toBeDefined();
      expect(result.metadata.renderTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.iterationCount).toBe(0);
      expect(result.metadata.pathsAccessed).toBeInstanceOf(Set);
      expect(result.metadata.helpersUsed).toBeInstanceOf(Set);
    });
  });
});
