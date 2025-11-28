import { describe, it, expect } from 'vitest';
import {
  RenderError,
  ResourceLimitError,
  escapeHtml,
  createRenderContext,
  createLoopScope,
  createComponentScope,
  addToScope,
  createStringRenderer,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_RENDER_CONFIG,
  validateSourceTrackingPrefix,
  getSourceAttributeName,
} from '../src/renderer/index.js';
import type {
  CompiledTemplate,
  SourceLocation,
  RootNode,
  TemplateNode,
  TextNode,
  ElementNode,
  IfNode,
  ForNode,
  MatchNode,
  ComponentDefinition,
  ExprAst,
  SlotNode,
} from '../src/ast/types.js';
import type { RenderOptions, ResourceLimits } from '../src/renderer/index.js';

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

  return {
    root,
    diagnostics: [],
  };
}

// Helper to create a literal expression node
function literal(value: string | number | boolean | null): ExprAst {
  const type =
    typeof value === 'string'
      ? 'string'
      : typeof value === 'number'
        ? 'number'
        : typeof value === 'boolean'
          ? 'boolean'
          : 'nil';
  return {
    kind: 'literal',
    type,
    value,
    location: mockLocation,
  };
}

// Helper to create a path expression node
function path(...segments: string[]): ExprAst {
  return {
    kind: 'path',
    segments: segments.map(key => ({ kind: 'key' as const, key })),
    isGlobal: false,
    location: mockLocation,
  };
}

// Helper to create a binary expression node
function binary(left: ExprAst, op: string, right: ExprAst): ExprAst {
  return {
    kind: 'binary',
    operator: op as
      | '+'
      | '-'
      | '*'
      | '/'
      | '=='
      | '!='
      | '<'
      | '>'
      | '<='
      | '>='
      | '&&'
      | '||'
      | '??'
      | '%',
    left,
    right,
    location: mockLocation,
  };
}

// Helper to create a text node
function text(
  segments: Array<
    { kind: 'literal'; text: string } | { kind: 'expr'; expr: ExprAst }
  >
): TextNode {
  return {
    kind: 'text',
    segments: segments.map(s =>
      s.kind === 'literal'
        ? { kind: 'literal' as const, text: s.text, location: mockLocation }
        : { kind: 'expr' as const, expr: s.expr, location: mockLocation }
    ),
    location: mockLocation,
  };
}

// Helper to create an element node
function element(
  tag: string,
  attributes: ElementNode['attributes'] = [],
  children: TemplateNode[] = []
): ElementNode {
  return {
    kind: 'element',
    tag,
    attributes,
    children,
    location: mockLocation,
  };
}

// =============================================================================
// Phase 1: Setup Tests
// =============================================================================

describe('Renderer Setup', () => {
  describe('RenderError', () => {
    it('should create error with message, location, and code', () => {
      const error = new RenderError(
        'Test error message',
        mockLocation,
        'RENDER_FAILED'
      );

      expect(error.message).toBe('Test error message');
      expect(error.location).toEqual(mockLocation);
      expect(error.code).toBe('RENDER_FAILED');
      expect(error.name).toBe('RenderError');
      expect(error instanceof Error).toBe(true);
    });

    it('should create error with optional cause', () => {
      const cause = new Error('Original error');
      const error = new RenderError(
        'Wrapped error',
        mockLocation,
        'RENDER_FAILED',
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it('should support all error codes', () => {
      const codes = [
        'LOOP_NESTING_EXCEEDED',
        'ITERATION_LIMIT_EXCEEDED',
        'COMPONENT_DEPTH_EXCEEDED',
        'UNKNOWN_COMPONENT',
        'RENDER_FAILED',
      ] as const;

      for (const code of codes) {
        const error = new RenderError('Test', mockLocation, code);
        expect(error.code).toBe(code);
      }
    });
  });

  describe('ResourceLimitError', () => {
    it('should create error for loop nesting limit', () => {
      const error = new ResourceLimitError('loopNesting', 6, 5, mockLocation);

      expect(error.message).toBe('Loop nesting depth exceeded: 6 > 5');
      expect(error.code).toBe('LOOP_NESTING_EXCEEDED');
      expect(error.limitType).toBe('loopNesting');
      expect(error.current).toBe(6);
      expect(error.max).toBe(5);
      expect(error.name).toBe('ResourceLimitError');
      expect(error instanceof RenderError).toBe(true);
    });

    it('should create error for iteration limit', () => {
      const error = new ResourceLimitError(
        'iterations',
        10001,
        10000,
        mockLocation
      );

      expect(error.message).toBe('Iteration limit exceeded: 10001 > 10000');
      expect(error.code).toBe('ITERATION_LIMIT_EXCEEDED');
      expect(error.limitType).toBe('iterations');
    });

    it('should create error for component depth limit', () => {
      const error = new ResourceLimitError(
        'componentDepth',
        11,
        10,
        mockLocation
      );

      expect(error.message).toBe('Component nesting depth exceeded: 11 > 10');
      expect(error.code).toBe('COMPONENT_DEPTH_EXCEEDED');
      expect(error.limitType).toBe('componentDepth');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should escape all special characters together', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should not modify strings without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('DEFAULT_RESOURCE_LIMITS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RESOURCE_LIMITS.maxLoopNesting).toBe(5);
      expect(DEFAULT_RESOURCE_LIMITS.maxIterationsPerLoop).toBe(1000);
      expect(DEFAULT_RESOURCE_LIMITS.maxTotalIterations).toBe(10000);
      expect(DEFAULT_RESOURCE_LIMITS.maxComponentDepth).toBe(10);
    });
  });

  describe('DEFAULT_RENDER_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RENDER_CONFIG.htmlEscape).toBe(true);
      expect(DEFAULT_RENDER_CONFIG.includeComments).toBe(false);
      expect(DEFAULT_RENDER_CONFIG.includeSourceTracking).toBe(false);
      expect(DEFAULT_RENDER_CONFIG.preserveWhitespace).toBe(false);
      expect(DEFAULT_RENDER_CONFIG.sourceTrackingPrefix).toBe('rd-');
    });
  });
});

// =============================================================================
// Phase 2: Foundational Tests
// =============================================================================

describe('Render Context', () => {
  describe('createRenderContext', () => {
    it('should create context with default values', () => {
      const template = createMockTemplate();
      const data = { name: 'Alice' };

      const context = createRenderContext(template, data);

      expect(context.scope.data).toEqual(data);
      expect(context.scope.locals).toEqual({});
      expect(context.scope.globals).toEqual({});
      expect(context.currentLoopNesting).toBe(0);
      expect(context.totalIterations).toBe(0);
      expect(context.componentDepth).toBe(0);
      expect(context.pathsAccessed).toBeInstanceOf(Set);
      expect(context.helpersUsed).toBeInstanceOf(Set);
    });

    it('should apply custom globals', () => {
      const template = createMockTemplate();
      const context = createRenderContext(
        template,
        {},
        {
          globals: { currency: 'EUR' },
        }
      );

      expect(context.scope.globals).toEqual({ currency: 'EUR' });
    });

    it('should apply custom helpers', () => {
      const template = createMockTemplate();
      const myHelper = () => () => 'result';
      const context = createRenderContext(
        template,
        {},
        {
          helpers: { myHelper },
        }
      );

      expect(context.helpers.myHelper).toBe(myHelper);
    });

    it('should merge render config with defaults', () => {
      const template = createMockTemplate();
      const context = createRenderContext(
        template,
        {},
        {
          config: { includeComments: true },
        }
      );

      expect(context.renderConfig.includeComments).toBe(true);
      expect(context.renderConfig.htmlEscape).toBe(true); // Default preserved
    });

    it('should merge resource limits with defaults', () => {
      const template = createMockTemplate();
      const context = createRenderContext(
        template,
        {},
        {
          limits: { maxLoopNesting: 10 },
        }
      );

      expect(context.limits.maxLoopNesting).toBe(10);
      expect(context.limits.maxTotalIterations).toBe(10000); // Default preserved
    });
  });

  describe('createLoopScope', () => {
    it('should create child scope with item variable', () => {
      const parent = {
        locals: { existing: 'value' },
        data: { items: [1, 2, 3] },
        globals: { global: 'var' },
      };

      const child = createLoopScope(parent, 'item', 42);

      expect(child.locals.item).toBe(42);
      expect(child.locals.existing).toBe('value');
      expect(child.data).toBe(parent.data);
      expect(child.globals).toBe(parent.globals);
    });

    it('should create child scope with item and index variables', () => {
      const parent = {
        locals: {},
        data: {},
        globals: {},
      };

      const child = createLoopScope(parent, 'item', 'value', 'index', 5);

      expect(child.locals.item).toBe('value');
      expect(child.locals.index).toBe(5);
    });

    it('should not mutate parent scope', () => {
      const parent = {
        locals: { a: 1 },
        data: {},
        globals: {},
      };

      createLoopScope(parent, 'b', 2);

      expect(parent.locals).toEqual({ a: 1 });
    });
  });

  describe('createComponentScope', () => {
    it('should create isolated scope with props as data', () => {
      const props = { title: 'Hello', count: 42 };
      const globals = { currency: 'USD' };

      const scope = createComponentScope(props, globals);

      expect(scope.data).toBe(props);
      expect(scope.globals).toBe(globals);
      expect(scope.locals).toEqual({});
    });

    it('should not include parent scope variables', () => {
      const props = { title: 'Test' };
      const globals = {};

      const scope = createComponentScope(props, globals);

      // Only props should be accessible via data
      expect(scope.data).toEqual({ title: 'Test' });
    });
  });

  describe('addToScope', () => {
    it('should add local variable', () => {
      const scope = {
        locals: { a: 1 },
        data: {},
        globals: {},
      };

      const newScope = addToScope(scope, 'b', 2, false);

      expect(newScope.locals).toEqual({ a: 1, b: 2 });
      expect(newScope.globals).toEqual({});
    });

    it('should add global variable', () => {
      const scope = {
        locals: {},
        data: {},
        globals: { x: 1 },
      };

      const newScope = addToScope(scope, 'y', 2, true);

      expect(newScope.globals).toEqual({ x: 1, y: 2 });
      expect(newScope.locals).toEqual({});
    });

    it('should not mutate original scope', () => {
      const scope = {
        locals: { a: 1 },
        data: {},
        globals: { x: 1 },
      };

      addToScope(scope, 'b', 2, false);
      addToScope(scope, 'y', 2, true);

      expect(scope.locals).toEqual({ a: 1 });
      expect(scope.globals).toEqual({ x: 1 });
    });
  });
});

// =============================================================================
// User Story 1: Render Static and Dynamic Content
// =============================================================================

describe('User Story 1 - Basic Rendering', () => {
  describe('Text Rendering', () => {
    it('should render literal text', () => {
      const template = createMockTemplate([
        text([{ kind: 'literal', text: 'Hello, World!' }]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('Hello, World!');
    });

    it('should render expression in text', () => {
      const template = createMockTemplate([
        text([
          { kind: 'literal', text: 'Hello, ' },
          { kind: 'expr', expr: path('name') },
          { kind: 'literal', text: '!' },
        ]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ name: 'Alice' });

      expect(result.html).toBe('Hello, Alice!');
    });

    it('should render nested path expressions', () => {
      const template = createMockTemplate([
        text([{ kind: 'expr', expr: path('user', 'name') }]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ user: { name: 'Bob' } });

      expect(result.html).toBe('Bob');
    });

    it('should render arithmetic expressions', () => {
      const template = createMockTemplate([
        text([
          { kind: 'expr', expr: binary(path('price'), '*', path('quantity')) },
        ]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ price: 10, quantity: 3 });

      expect(result.html).toBe('30');
    });

    it('should HTML-escape expressions by default', () => {
      const template = createMockTemplate([
        text([{ kind: 'expr', expr: path('message') }]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ message: "<script>alert('xss')</script>" });

      expect(result.html).toBe(
        '&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;'
      );
    });

    it('should render undefined values as empty string', () => {
      const template = createMockTemplate([
        text([
          { kind: 'literal', text: 'Value: ' },
          { kind: 'expr', expr: path('missing') },
        ]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('Value: ');
    });

    it('should render null values as empty string', () => {
      const template = createMockTemplate([
        text([{ kind: 'expr', expr: path('value') }]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ value: null });

      expect(result.html).toBe('');
    });
  });

  describe('Element Rendering', () => {
    it('should render element with no attributes', () => {
      const template = createMockTemplate([
        element('div', [], [text([{ kind: 'literal', text: 'content' }])]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<div>content</div>');
    });

    it('should render element with static attribute', () => {
      const template = createMockTemplate([
        element(
          'a',
          [
            {
              kind: 'static',
              name: 'href',
              value: '/home',
              location: mockLocation,
            },
          ],
          [text([{ kind: 'literal', text: 'Home' }])]
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<a href="/home">Home</a>');
    });

    it('should render element with expression attribute', () => {
      const template = createMockTemplate([
        element(
          'div',
          [
            {
              kind: 'expr',
              name: 'class',
              expr: path('cls'),
              location: mockLocation,
            },
          ],
          [text([{ kind: 'literal', text: 'text' }])]
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ cls: 'highlight' });

      expect(result.html).toBe('<div class="highlight">text</div>');
    });

    it('should render element with mixed attribute', () => {
      const template = createMockTemplate([
        element(
          'div',
          [
            {
              kind: 'mixed',
              name: 'class',
              segments: [
                { kind: 'static', value: 'status-', location: mockLocation },
                { kind: 'expr', expr: path('status'), location: mockLocation },
              ],
              location: mockLocation,
            },
          ],
          []
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ status: 'active' });

      expect(result.html).toBe('<div class="status-active"></div>');
    });

    it('should handle boolean attribute true', () => {
      const template = createMockTemplate([
        element(
          'button',
          [
            {
              kind: 'expr',
              name: 'disabled',
              expr: path('isDisabled'),
              location: mockLocation,
            },
          ],
          [text([{ kind: 'literal', text: 'Click' }])]
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ isDisabled: true });

      expect(result.html).toBe('<button disabled>Click</button>');
    });

    it('should handle boolean attribute false', () => {
      const template = createMockTemplate([
        element(
          'button',
          [
            {
              kind: 'expr',
              name: 'disabled',
              expr: path('isDisabled'),
              location: mockLocation,
            },
          ],
          [text([{ kind: 'literal', text: 'Click' }])]
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({ isDisabled: false });

      expect(result.html).toBe('<button>Click</button>');
    });

    it('should omit null/undefined attribute values', () => {
      const template = createMockTemplate([
        element(
          'div',
          [
            {
              kind: 'expr',
              name: 'title',
              expr: path('tooltip'),
              location: mockLocation,
            },
          ],
          []
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<div></div>');
    });

    it('should render void elements as self-closing', () => {
      const template = createMockTemplate([element('br', [], [])]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<br/>');
    });

    it('should render img element as self-closing', () => {
      const template = createMockTemplate([
        element(
          'img',
          [
            {
              kind: 'static',
              name: 'src',
              value: '/image.png',
              location: mockLocation,
            },
            {
              kind: 'static',
              name: 'alt',
              value: 'An image',
              location: mockLocation,
            },
          ],
          []
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<img src="/image.png" alt="An image"/>');
    });

    it('should escape attribute values', () => {
      const template = createMockTemplate([
        element(
          'div',
          [
            {
              kind: 'static',
              name: 'title',
              value: 'Say "hello"',
              location: mockLocation,
            },
          ],
          []
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<div title="Say &quot;hello&quot;"></div>');
    });

    it('should render nested elements', () => {
      const template = createMockTemplate([
        element(
          'div',
          [],
          [
            element('h1', [], [text([{ kind: 'literal', text: 'Title' }])]),
            element('p', [], [text([{ kind: 'literal', text: 'Content' }])]),
          ]
        ),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.html).toBe('<div><h1>Title</h1><p>Content</p></div>');
    });
  });

  describe('Metadata Collection', () => {
    it('should return render metadata', () => {
      const template = createMockTemplate([
        text([{ kind: 'literal', text: 'Hello' }]),
      ]);

      const renderer = createStringRenderer(template);
      const result = renderer({});

      expect(result.metadata).toBeDefined();
      expect(result.metadata.renderTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.iterationCount).toBe(0);
      expect(result.metadata.pathsAccessed).toBeInstanceOf(Set);
      expect(result.metadata.helpersUsed).toBeInstanceOf(Set);
    });
  });
});

// =============================================================================
// User Story 2: Conditional Rendering
// =============================================================================

describe('User Story 2 - Conditional Rendering', () => {
  it('should render @if branch when condition is truthy', () => {
    const ifNode: IfNode = {
      kind: 'if',
      branches: [
        {
          condition: path('isLoggedIn'),
          body: [text([{ kind: 'literal', text: 'Welcome' }])],
          location: mockLocation,
        },
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([ifNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ isLoggedIn: true });

    expect(result.html).toBe('Welcome');
  });

  it('should not render @if branch when condition is falsy', () => {
    const ifNode: IfNode = {
      kind: 'if',
      branches: [
        {
          condition: path('isLoggedIn'),
          body: [text([{ kind: 'literal', text: 'Welcome' }])],
          location: mockLocation,
        },
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([ifNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ isLoggedIn: false });

    expect(result.html).toBe('');
  });

  it('should render @else branch when condition is falsy', () => {
    const ifNode: IfNode = {
      kind: 'if',
      branches: [
        {
          condition: path('isLoggedIn'),
          body: [text([{ kind: 'literal', text: 'Welcome' }])],
          location: mockLocation,
        },
      ],
      elseBranch: [text([{ kind: 'literal', text: 'Please login' }])],
      location: mockLocation,
    };

    const template = createMockTemplate([ifNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ isLoggedIn: false });

    expect(result.html).toBe('Please login');
  });

  it('should evaluate @else if branches in order', () => {
    const ifNode: IfNode = {
      kind: 'if',
      branches: [
        {
          condition: binary(path('count'), '>', literal(10)),
          body: [text([{ kind: 'literal', text: 'Many' }])],
          location: mockLocation,
        },
        {
          condition: binary(path('count'), '>', literal(0)),
          body: [text([{ kind: 'literal', text: 'Some' }])],
          location: mockLocation,
        },
      ],
      elseBranch: [text([{ kind: 'literal', text: 'None' }])],
      location: mockLocation,
    };

    const template = createMockTemplate([ifNode]);
    const renderer = createStringRenderer(template);

    expect(renderer({ count: 15 }).html).toBe('Many');
    expect(renderer({ count: 5 }).html).toBe('Some');
    expect(renderer({ count: 0 }).html).toBe('None');
  });
});

// =============================================================================
// User Story 3: Loop Rendering
// =============================================================================

describe('User Story 3 - Loop Rendering', () => {
  it('should render @for loop with array', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'item',
      itemsExpr: path('items'),
      iterationType: 'of',
      body: [
        element(
          'li',
          [],
          [text([{ kind: 'expr', expr: path('item', 'name') }])]
        ),
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ items: [{ name: 'A' }, { name: 'B' }] });

    expect(result.html).toBe('<li>A</li><li>B</li>');
  });

  it('should render @for loop with index', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'item',
      indexVar: 'index',
      itemsExpr: path('items'),
      iterationType: 'of',
      body: [
        element(
          'li',
          [],
          [
            text([
              { kind: 'expr', expr: path('index') },
              { kind: 'literal', text: ': ' },
              { kind: 'expr', expr: path('item') },
            ]),
          ]
        ),
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ items: ['X', 'Y'] });

    expect(result.html).toBe('<li>0: X</li><li>1: Y</li>');
  });

  it('should render @for in loop with object keys', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'key',
      itemsExpr: path('obj'),
      iterationType: 'in',
      body: [element('dt', [], [text([{ kind: 'expr', expr: path('key') }])])],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ obj: { a: 1, b: 2 } });

    expect(result.html).toBe('<dt>a</dt><dt>b</dt>');
  });

  it('should render empty for empty array', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'item',
      itemsExpr: path('items'),
      iterationType: 'of',
      body: [element('li', [], [text([{ kind: 'expr', expr: path('item') }])])],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ items: [] });

    expect(result.html).toBe('');
  });

  it('should track iteration count in metadata', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'item',
      itemsExpr: path('items'),
      iterationType: 'of',
      body: [text([{ kind: 'expr', expr: path('item') }])],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);
    const result = renderer({ items: [1, 2, 3, 4, 5] });

    expect(result.metadata.iterationCount).toBe(5);
  });

  it('should throw ResourceLimitError when iterations exceed limit', () => {
    const forNode: ForNode = {
      kind: 'for',
      itemVar: 'item',
      itemsExpr: path('items'),
      iterationType: 'of',
      body: [text([{ kind: 'literal', text: 'x' }])],
      location: mockLocation,
    };

    const template = createMockTemplate([forNode]);
    const renderer = createStringRenderer(template);

    expect(() =>
      renderer({ items: Array(101).fill(0) }, {
        limits: { maxIterationsPerLoop: 100 },
      } as RenderOptions & { limits?: Partial<ResourceLimits> })
    ).toThrow(ResourceLimitError);
  });
});

// =============================================================================
// User Story 4: Pattern Matching
// =============================================================================

describe('User Story 4 - Pattern Matching', () => {
  it('should match literal string value', () => {
    const matchNode: MatchNode = {
      kind: 'match',
      value: path('status'),
      cases: [
        {
          kind: 'literal',
          values: ['active'],
          body: [text([{ kind: 'literal', text: 'Active' }])],
          location: mockLocation,
        },
        {
          kind: 'literal',
          values: ['inactive'],
          body: [text([{ kind: 'literal', text: 'Inactive' }])],
          location: mockLocation,
        },
      ],
      defaultCase: [text([{ kind: 'literal', text: 'Unknown' }])],
      location: mockLocation,
    };

    const template = createMockTemplate([matchNode]);
    const renderer = createStringRenderer(template);

    expect(renderer({ status: 'active' }).html).toBe('Active');
    expect(renderer({ status: 'inactive' }).html).toBe('Inactive');
    expect(renderer({ status: 'other' }).html).toBe('Unknown');
  });

  it('should match multiple literal values', () => {
    const matchNode: MatchNode = {
      kind: 'match',
      value: path('code'),
      cases: [
        {
          kind: 'literal',
          values: [200, 201],
          body: [text([{ kind: 'literal', text: 'OK' }])],
          location: mockLocation,
        },
        {
          kind: 'literal',
          values: [404],
          body: [text([{ kind: 'literal', text: 'Not Found' }])],
          location: mockLocation,
        },
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([matchNode]);
    const renderer = createStringRenderer(template);

    expect(renderer({ code: 200 }).html).toBe('OK');
    expect(renderer({ code: 201 }).html).toBe('OK');
    expect(renderer({ code: 404 }).html).toBe('Not Found');
  });

  it('should match expression case with _ binding', () => {
    const matchNode: MatchNode = {
      kind: 'match',
      value: path('value'),
      cases: [
        {
          kind: 'expression',
          condition: binary(path('_', 'x'), '>', literal(10)),
          body: [text([{ kind: 'literal', text: 'Big' }])],
          location: mockLocation,
        },
      ],
      defaultCase: [text([{ kind: 'literal', text: 'Small' }])],
      location: mockLocation,
    };

    const template = createMockTemplate([matchNode]);
    const renderer = createStringRenderer(template);

    expect(renderer({ value: { x: 15 } }).html).toBe('Big');
    expect(renderer({ value: { x: 5 } }).html).toBe('Small');
  });

  it('should render empty for no match and no default', () => {
    const matchNode: MatchNode = {
      kind: 'match',
      value: path('status'),
      cases: [
        {
          kind: 'literal',
          values: ['active'],
          body: [text([{ kind: 'literal', text: 'Active' }])],
          location: mockLocation,
        },
      ],
      location: mockLocation,
    };

    const template = createMockTemplate([matchNode]);
    const renderer = createStringRenderer(template);

    expect(renderer({ status: 'other' }).html).toBe('');
  });
});

// =============================================================================
// User Story 5: Components
// =============================================================================

describe('User Story 5 - Component Rendering', () => {
  it('should render component with props', () => {
    const cardDef: ComponentDefinition = {
      name: 'Card',
      props: [{ name: 'title', required: true, location: mockLocation }],
      body: [
        element(
          'div',
          [
            {
              kind: 'static',
              name: 'class',
              value: 'card',
              location: mockLocation,
            },
          ],
          [element('h2', [], [text([{ kind: 'expr', expr: path('title') }])])]
        ),
      ],
      location: mockLocation,
    };

    const components = new Map([['Card', cardDef]]);

    const template = createMockTemplate(
      [
        {
          kind: 'component',
          name: 'Card',
          props: [
            { name: 'title', value: path('heading'), location: mockLocation },
          ],
          children: [],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      components
    );

    const renderer = createStringRenderer(template);
    const result = renderer({ heading: 'Hello' });

    expect(result.html).toBe('<div class="card"><h2>Hello</h2></div>');
  });

  it('should render component with default slot', () => {
    const cardDef: ComponentDefinition = {
      name: 'Card',
      props: [],
      body: [
        element(
          'div',
          [],
          [{ kind: 'slot', location: mockLocation } as SlotNode]
        ),
      ],
      location: mockLocation,
    };

    const components = new Map([['Card', cardDef]]);

    const template = createMockTemplate(
      [
        {
          kind: 'component',
          name: 'Card',
          props: [],
          children: [text([{ kind: 'literal', text: 'Slot content' }])],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      components
    );

    const renderer = createStringRenderer(template);
    const result = renderer({});

    expect(result.html).toBe('<div>Slot content</div>');
  });

  it('should render slot fallback when no content provided', () => {
    const cardDef: ComponentDefinition = {
      name: 'Card',
      props: [],
      body: [
        element(
          'div',
          [],
          [
            {
              kind: 'slot',
              fallback: [text([{ kind: 'literal', text: 'Default content' }])],
              location: mockLocation,
            } as SlotNode,
          ]
        ),
      ],
      location: mockLocation,
    };

    const components = new Map([['Card', cardDef]]);

    const template = createMockTemplate(
      [
        {
          kind: 'component',
          name: 'Card',
          props: [],
          children: [],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      components
    );

    const renderer = createStringRenderer(template);
    const result = renderer({});

    expect(result.html).toBe('<div>Default content</div>');
  });

  it('should enforce component isolation', () => {
    const cardDef: ComponentDefinition = {
      name: 'Card',
      props: [],
      body: [
        // Try to access parent's 'secret' variable - should be undefined
        text([{ kind: 'expr', expr: path('secret') }]),
      ],
      location: mockLocation,
    };

    const components = new Map([['Card', cardDef]]);

    const template = createMockTemplate(
      [
        {
          kind: 'component',
          name: 'Card',
          props: [],
          children: [],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      components
    );

    const renderer = createStringRenderer(template);
    // Parent has 'secret', but component shouldn't see it
    const result = renderer({ secret: 'hidden' });

    expect(result.html).toBe(''); // undefined renders as empty
  });

  it('should throw RenderError for unknown component', () => {
    const template = createMockTemplate([
      {
        kind: 'component',
        name: 'Unknown',
        props: [],
        children: [],
        propPathMapping: new Map(),
        location: mockLocation,
      },
    ]);

    const renderer = createStringRenderer(template);

    expect(() => renderer({})).toThrow(RenderError);
    expect(() => renderer({})).toThrow('Unknown component: Unknown');
  });

  it('should throw ResourceLimitError when component depth exceeded', () => {
    // Create a component that calls itself
    const recursiveDef: ComponentDefinition = {
      name: 'Recursive',
      props: [
        {
          name: 'depth',
          required: false,
          defaultValue: literal(0),
          location: mockLocation,
        },
      ],
      body: [
        {
          kind: 'component',
          name: 'Recursive',
          props: [],
          children: [],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      location: mockLocation,
    };

    const components = new Map([['Recursive', recursiveDef]]);

    const template = createMockTemplate(
      [
        {
          kind: 'component',
          name: 'Recursive',
          props: [],
          children: [],
          propPathMapping: new Map(),
          location: mockLocation,
        },
      ],
      components
    );

    const renderer = createStringRenderer(template);

    expect(() =>
      renderer({}, { limits: { maxComponentDepth: 3 } } as RenderOptions & {
        limits?: Partial<ResourceLimits>;
      })
    ).toThrow(ResourceLimitError);
  });
});

// =============================================================================
// User Story 6: Variable Declarations
// =============================================================================

describe('User Story 6 - Variable Declarations', () => {
  it('should render let declaration and use value', () => {
    const template = createMockTemplate([
      {
        kind: 'let',
        name: 'total',
        isGlobal: false,
        value: binary(path('price'), '*', path('qty')),
        location: mockLocation,
      },
      text([{ kind: 'expr', expr: path('total') }]),
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({ price: 10, qty: 3 });

    expect(result.html).toBe('30');
  });

  it('should support global declarations with $', () => {
    const template = createMockTemplate([
      {
        kind: 'let',
        name: 'currency',
        isGlobal: true,
        value: literal('EUR'),
        location: mockLocation,
      },
      text([
        {
          kind: 'expr',
          expr: {
            kind: 'path',
            segments: [{ kind: 'key', key: 'currency' }],
            isGlobal: true,
            location: mockLocation,
          },
        },
      ]),
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({});

    expect(result.html).toBe('EUR');
  });
});

// =============================================================================
// User Story 7 & 8: Configuration Tests
// =============================================================================

describe('Configuration Options', () => {
  it('should include HTML comments when enabled', () => {
    const template = createMockTemplate([
      {
        kind: 'comment',
        style: 'html',
        text: 'This is a comment',
        location: mockLocation,
      },
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({}, { config: { includeComments: true } });

    expect(result.html).toBe('<!--This is a comment-->');
  });

  it('should exclude HTML comments by default', () => {
    const template = createMockTemplate([
      {
        kind: 'comment',
        style: 'html',
        text: 'This is a comment',
        location: mockLocation,
      },
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({});

    expect(result.html).toBe('');
  });

  it('should skip non-HTML comments even when includeComments is true', () => {
    const template = createMockTemplate([
      {
        kind: 'comment',
        style: 'line',
        text: 'Line comment',
        location: mockLocation,
      },
      {
        kind: 'comment',
        style: 'block',
        text: 'Block comment',
        location: mockLocation,
      },
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({}, { config: { includeComments: true } });

    expect(result.html).toBe('');
  });

  it('should disable HTML escaping when configured', () => {
    const template = createMockTemplate([
      text([{ kind: 'expr', expr: path('html') }]),
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer(
      { html: '<b>bold</b>' },
      { config: { htmlEscape: false } }
    );

    expect(result.html).toBe('<b>bold</b>');
  });
});

// =============================================================================
// Fragment Rendering
// =============================================================================

describe('Fragment Rendering', () => {
  it('should render fragment children without wrapper', () => {
    const template = createMockTemplate([
      {
        kind: 'fragment',
        children: [
          element('span', [], [text([{ kind: 'literal', text: 'A' }])]),
          element('span', [], [text([{ kind: 'literal', text: 'B' }])]),
        ],
        preserveWhitespace: true,
        location: mockLocation,
      },
    ]);

    const renderer = createStringRenderer(template);
    const result = renderer({});

    expect(result.html).toBe('<span>A</span><span>B</span>');
  });
});

// =============================================================================
// Source Tracking Prefix Configuration
// =============================================================================

describe('Source Tracking Prefix', () => {
  describe('validateSourceTrackingPrefix', () => {
    it('should accept default prefix rd-', () => {
      expect(() => validateSourceTrackingPrefix('rd-')).not.toThrow();
    });

    it('should accept empty string', () => {
      expect(() => validateSourceTrackingPrefix('')).not.toThrow();
    });

    it('should accept data-* prefix', () => {
      expect(() => validateSourceTrackingPrefix('data-track-')).not.toThrow();
    });

    it('should accept underscore prefix', () => {
      expect(() => validateSourceTrackingPrefix('my_prefix_')).not.toThrow();
    });

    it('should accept prefix starting with underscore', () => {
      expect(() => validateSourceTrackingPrefix('_prefix')).not.toThrow();
    });

    it('should accept alphanumeric prefix', () => {
      expect(() => validateSourceTrackingPrefix('audit123')).not.toThrow();
    });

    it('should reject prefix starting with number', () => {
      expect(() => validateSourceTrackingPrefix('123-')).toThrow(
        /Invalid sourceTrackingPrefix/
      );
    });

    it('should reject prefix with @ symbol', () => {
      expect(() => validateSourceTrackingPrefix('my@prefix')).toThrow(
        /Invalid sourceTrackingPrefix/
      );
    });

    it('should reject prefix with space', () => {
      expect(() => validateSourceTrackingPrefix('has space')).toThrow(
        /Invalid sourceTrackingPrefix/
      );
    });

    it('should reject prefix starting with hyphen', () => {
      expect(() => validateSourceTrackingPrefix('-invalid')).toThrow(
        /Invalid sourceTrackingPrefix/
      );
    });

    it('should provide helpful error message', () => {
      expect(() => validateSourceTrackingPrefix('123bad')).toThrow(
        /Prefix must be empty or start with a letter\/underscore/
      );
    });
  });

  describe('getSourceAttributeName', () => {
    it('should generate attribute with default prefix', () => {
      expect(getSourceAttributeName('rd-', 'source')).toBe('rd-source');
      expect(getSourceAttributeName('rd-', 'source-op')).toBe('rd-source-op');
      expect(getSourceAttributeName('rd-', 'source-note')).toBe('rd-source-note');
    });

    it('should generate attribute with custom prefix', () => {
      expect(getSourceAttributeName('data-track-', 'source')).toBe(
        'data-track-source'
      );
      expect(getSourceAttributeName('data-track-', 'source-op')).toBe(
        'data-track-source-op'
      );
      expect(getSourceAttributeName('data-track-', 'source-note')).toBe(
        'data-track-source-note'
      );
    });

    it('should generate attribute with empty prefix', () => {
      expect(getSourceAttributeName('', 'source')).toBe('source');
      expect(getSourceAttributeName('', 'source-op')).toBe('source-op');
      expect(getSourceAttributeName('', 'source-note')).toBe('source-note');
    });

    it('should generate attribute with underscore prefix', () => {
      expect(getSourceAttributeName('audit_', 'source')).toBe('audit_source');
    });
  });

  describe('createRenderContext validation', () => {
    it('should accept valid custom prefix in config', () => {
      const template = createMockTemplate([]);
      expect(() =>
        createRenderContext(template, {}, {
          config: { sourceTrackingPrefix: 'data-custom-' },
        })
      ).not.toThrow();
    });

    it('should reject invalid prefix in config', () => {
      const template = createMockTemplate([]);
      expect(() =>
        createRenderContext(template, {}, {
          config: { sourceTrackingPrefix: '123-invalid' },
        })
      ).toThrow(/Invalid sourceTrackingPrefix/);
    });

    it('should use default prefix when not specified', () => {
      const template = createMockTemplate([]);
      const ctx = createRenderContext(template, {});
      expect(ctx.renderConfig.sourceTrackingPrefix).toBe('rd-');
    });

    it('should use custom prefix when specified', () => {
      const template = createMockTemplate([]);
      const ctx = createRenderContext(template, {}, {
        config: { sourceTrackingPrefix: 'blade-' },
      });
      expect(ctx.renderConfig.sourceTrackingPrefix).toBe('blade-');
    });

    it('should accept empty string prefix', () => {
      const template = createMockTemplate([]);
      const ctx = createRenderContext(template, {}, {
        config: { sourceTrackingPrefix: '' },
      });
      expect(ctx.renderConfig.sourceTrackingPrefix).toBe('');
    });
  });

  describe('createStringRenderer with custom prefix', () => {
    it('should accept valid prefix through renderer options', () => {
      const template = createMockTemplate([
        text([{ kind: 'literal', text: 'Hello' }]),
      ]);
      const renderer = createStringRenderer(template);

      expect(() =>
        renderer({}, { config: { sourceTrackingPrefix: 'audit-' } })
      ).not.toThrow();
    });

    it('should reject invalid prefix through renderer options', () => {
      const template = createMockTemplate([
        text([{ kind: 'literal', text: 'Hello' }]),
      ]);
      const renderer = createStringRenderer(template);

      expect(() =>
        renderer({}, { config: { sourceTrackingPrefix: '@invalid' } })
      ).toThrow(/Invalid sourceTrackingPrefix/);
    });

    it('should consistently use configured prefix across multiple renders', () => {
      const template = createMockTemplate([
        text([{ kind: 'literal', text: 'Test' }]),
      ]);
      const renderer = createStringRenderer(template);
      const options = { config: { sourceTrackingPrefix: 'custom-' } };

      // Multiple renders should all succeed with same config
      expect(() => renderer({}, options)).not.toThrow();
      expect(() => renderer({}, options)).not.toThrow();
      expect(() => renderer({}, options)).not.toThrow();
    });
  });
});
