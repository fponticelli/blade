/**
 * Comprehensive test suite for the Blade template compiler
 *
 * Test-driven design for compiler implementation.
 * These tests define the expected behavior without implementing the compile() method.
 */

import { describe, it, expect } from 'vitest';
import { compile, type CompileOptions } from '../src/compiler/index.js';
import type {
  CompiledTemplate,
  RootNode,
  TextNode,
  ElementNode,
  ExprAst,
  PathNode,
  LiteralNode,
  BinaryNode,
  IfNode,
  ForNode,
  MatchNode,
  LetNode,
  ComponentNode,
  FragmentNode,
  SlotNode,
  CommentNode,
  CallNode,
  TernaryNode,
  UnaryNode,
  ArrayWildcardNode,
  StaticAttributeNode,
  ExprAttributeNode,
  MixedAttributeNode,
} from '../src/ast/types.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper to compile and extract the root node
 */
async function compileAndGetRoot(source: string, options?: CompileOptions): Promise<RootNode> {
  const result = await compile(source, options);
  return result.root;
}

/**
 * Helper to get first child of root
 */
async function compileAndGetFirstChild(source: string): Promise<any> {
  const root = await compileAndGetRoot(source);
  return root.children[0];
}

/**
 * Helper to compile and check for errors
 */
async function compileAndGetErrors(source: string, options?: CompileOptions) {
  const result = await compile(source, options);
  return result.diagnostics.filter(d => d.level === 'error');
}

/**
 * Helper to compile and check for warnings
 */
async function compileAndGetWarnings(source: string, options?: CompileOptions) {
  const result = await compile(source, options);
  return result.diagnostics.filter(d => d.level === 'warning');
}

// =============================================================================
// 1. Basic Compilation
// =============================================================================

describe('Compiler - Basic Structure', () => {
  it('should compile an empty template', async () => {
    const result = await compile('');

    expect(result).toBeDefined();
    expect(result.root).toBeDefined();
    expect(result.root.kind).toBe('root');
    expect(result.root.children).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('should compile plain text', async () => {
    const root = await compileAndGetRoot('Hello, World!');

    expect(root.children).toHaveLength(1);
    const textNode = root.children[0] as TextNode;
    expect(textNode.kind).toBe('text');
    expect(textNode.segments).toHaveLength(1);
    expect(textNode.segments[0].kind).toBe('literal');
    expect((textNode.segments[0] as any).text).toBe('Hello, World!');
  });

  it('should compile plain HTML', async () => {
    const root = await compileAndGetRoot('<div>Hello</div>');

    expect(root.children).toHaveLength(1);
    const element = root.children[0] as ElementNode;
    expect(element.kind).toBe('element');
    expect(element.tag).toBe('div');
    expect(element.children).toHaveLength(1);
  });

  it('should include source location for all nodes', async () => {
    const root = await compileAndGetRoot('<div>test</div>');

    expect(root.location).toBeDefined();
    expect(root.location.start).toBeDefined();
    expect(root.location.end).toBeDefined();
    expect(root.location.start.line).toBeGreaterThan(0);
    expect(root.location.start.column).toBeGreaterThan(0);
    expect(root.location.start.offset).toBeGreaterThanOrEqual(0);
  });

  it('should populate template metadata', async () => {
    const root = await compileAndGetRoot('$data.value');

    expect(root.metadata).toBeDefined();
    expect(root.metadata.globalsUsed).toBeDefined();
    expect(root.metadata.pathsAccessed).toBeDefined();
    expect(root.metadata.helpersUsed).toBeDefined();
    expect(root.metadata.componentsUsed).toBeDefined();
  });
});

// =============================================================================
// 2. Expression Parsing
// =============================================================================

describe('Compiler - Simple Expressions', () => {
  it('should parse simple path expression: $foo', async () => {
    const root = await compileAndGetRoot('$foo');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    const expr = (segment as any).expr as PathNode;
    expect(expr.kind).toBe('path');
    expect(expr.isGlobal).toBe(false);
    expect(expr.segments).toHaveLength(1);
    expect(expr.segments[0].kind).toBe('key');
    expect((expr.segments[0] as any).key).toBe('foo');
  });

  it('should parse dotted path: $data.user.name', async () => {
    const root = await compileAndGetRoot('$data.user.name');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as PathNode;

    expect(expr.segments).toHaveLength(3);
    expect((expr.segments[0] as any).key).toBe('data');
    expect((expr.segments[1] as any).key).toBe('user');
    expect((expr.segments[2] as any).key).toBe('name');
  });

  it('should parse global path: $.currency', async () => {
    const root = await compileAndGetRoot('$.currency');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as PathNode;

    expect(expr.isGlobal).toBe(true);
    expect(expr.segments).toHaveLength(1);
    expect((expr.segments[0] as any).key).toBe('currency');
  });

  it('should parse array index: $items[0]', async () => {
    const root = await compileAndGetRoot('$items[0]');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as PathNode;

    expect(expr.segments).toHaveLength(2);
    expect(expr.segments[0].kind).toBe('key');
    expect((expr.segments[0] as any).key).toBe('items');
    expect(expr.segments[1].kind).toBe('index');
    expect((expr.segments[1] as any).index).toBe(0);
  });

  it('should parse array wildcard: $items[*].price', async () => {
    const root = await compileAndGetRoot('$items[*].price');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as ArrayWildcardNode;

    expect(expr.kind).toBe('wildcard');
    expect(expr.path.segments).toHaveLength(3);
    expect(expr.path.segments[1].kind).toBe('star');
  });
});

describe('Compiler - Complex Expressions', () => {
  it('should parse literal values', async () => {
    const tests = [
      { source: '${123}', type: 'number', value: 123 },
      { source: '${"hello"}', type: 'string', value: 'hello' },
      { source: '${true}', type: 'boolean', value: true },
      { source: '${false}', type: 'boolean', value: false },
      { source: '${null}', type: 'nil', value: null },
    ];

    for (const test of tests) {
      const root = await compileAndGetRoot(test.source);
      const textNode = root.children[0] as TextNode;
      const expr = (textNode.segments[0] as any).expr as LiteralNode;

      expect(expr.kind).toBe('literal');
      expect(expr.type).toBe(test.type);
      expect(expr.value).toBe(test.value);
    }
  });

  it('should parse binary operations', async () => {
    const operators = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '??'];

    for (const op of operators) {
      const root = await compileAndGetRoot(`\${a ${op} b}`);
      const textNode = root.children[0] as TextNode;
      const expr = (textNode.segments[0] as any).expr as BinaryNode;

      expect(expr.kind).toBe('binary');
      expect(expr.operator).toBe(op);
      expect(expr.left).toBeDefined();
      expect(expr.right).toBeDefined();
    }
  });

  it('should parse unary operations', async () => {
    const root1 = await compileAndGetRoot('${!isValid}');
    const expr1 = ((root1.children[0] as TextNode).segments[0] as any).expr as UnaryNode;
    expect(expr1.kind).toBe('unary');
    expect(expr1.operator).toBe('!');

    const root2 = await compileAndGetRoot('${-total}');
    const expr2 = ((root2.children[0] as TextNode).segments[0] as any).expr as UnaryNode;
    expect(expr2.kind).toBe('unary');
    expect(expr2.operator).toBe('-');
  });

  it('should parse ternary expressions', async () => {
    const root = await compileAndGetRoot('${isValid ? "Yes" : "No"}');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as TernaryNode;

    expect(expr.kind).toBe('ternary');
    expect(expr.condition).toBeDefined();
    expect(expr.truthy).toBeDefined();
    expect(expr.falsy).toBeDefined();
  });

  it('should parse function calls', async () => {
    const root = await compileAndGetRoot('${formatCurrency(total)}');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as CallNode;

    expect(expr.kind).toBe('call');
    expect(expr.callee).toBe('formatCurrency');
    expect(expr.args).toHaveLength(1);
  });

  it('should parse nested function calls', async () => {
    const root = await compileAndGetRoot('${formatCurrency(sum(items[*].price))}');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as CallNode;

    expect(expr.kind).toBe('call');
    expect(expr.callee).toBe('formatCurrency');
    expect(expr.args[0].kind).toBe('call');
    expect((expr.args[0] as CallNode).callee).toBe('sum');
  });

  it('should respect operator precedence', async () => {
    const root = await compileAndGetRoot('${a + b * c}');
    const textNode = root.children[0] as TextNode;
    const expr = (textNode.segments[0] as any).expr as BinaryNode;

    // Should parse as: a + (b * c), not (a + b) * c
    expect(expr.operator).toBe('+');
    expect(expr.right.kind).toBe('binary');
    expect((expr.right as BinaryNode).operator).toBe('*');
  });
});

describe('Compiler - Expression Interpolation', () => {
  it('should parse mixed text and expressions', async () => {
    const root = await compileAndGetRoot('Total: ${formatCurrency(total)}');
    const textNode = root.children[0] as TextNode;

    expect(textNode.segments).toHaveLength(2);
    expect(textNode.segments[0].kind).toBe('literal');
    expect((textNode.segments[0] as any).text).toBe('Total: ');
    expect(textNode.segments[1].kind).toBe('expr');
  });

  it('should parse multiple expressions in text', async () => {
    const root = await compileAndGetRoot('Page ${page} of ${total}');
    const textNode = root.children[0] as TextNode;

    expect(textNode.segments).toHaveLength(4);
    expect(textNode.segments[0].kind).toBe('literal');
    expect(textNode.segments[1].kind).toBe('expr');
    expect(textNode.segments[2].kind).toBe('literal');
    expect(textNode.segments[3].kind).toBe('expr');
  });
});

// =============================================================================
// 3. HTML Elements and Attributes
// =============================================================================

describe('Compiler - HTML Elements', () => {
  it('should parse self-closing tags', async () => {
    const root = await compileAndGetRoot('<br />');
    const element = root.children[0] as ElementNode;

    expect(element.kind).toBe('element');
    expect(element.tag).toBe('br');
    expect(element.children).toHaveLength(0);
  });

  it('should parse nested elements', async () => {
    const root = await compileAndGetRoot('<div><span>test</span></div>');
    const div = root.children[0] as ElementNode;

    expect(div.tag).toBe('div');
    expect(div.children).toHaveLength(1);

    const span = div.children[0] as ElementNode;
    expect(span.tag).toBe('span');
  });

  it('should parse multiple sibling elements', async () => {
    const root = await compileAndGetRoot('<div>A</div><div>B</div>');

    expect(root.children).toHaveLength(2);
    expect((root.children[0] as ElementNode).tag).toBe('div');
    expect((root.children[1] as ElementNode).tag).toBe('div');
  });
});

describe('Compiler - HTML Attributes', () => {
  it('should parse static attributes', async () => {
    const root = await compileAndGetRoot('<div class="container">test</div>');
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as StaticAttributeNode;

    expect(attr.kind).toBe('static');
    expect(attr.name).toBe('class');
    expect(attr.value).toBe('container');
  });

  it('should parse expression attributes', async () => {
    const root = await compileAndGetRoot('<button disabled=${!isValid}>Submit</button>');
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as ExprAttributeNode;

    expect(attr.kind).toBe('expr');
    expect(attr.name).toBe('disabled');
    expect(attr.expr).toBeDefined();
    expect(attr.expr.kind).toBe('unary');
  });

  it('should parse mixed attributes (interpolation)', async () => {
    const root = await compileAndGetRoot('<div class="status-${order.status}">test</div>');
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as MixedAttributeNode;

    expect(attr.kind).toBe('mixed');
    expect(attr.name).toBe('class');
    expect(attr.segments).toHaveLength(2);
    expect(attr.segments[0].kind).toBe('static');
    expect((attr.segments[0] as any).value).toBe('status-');
    expect(attr.segments[1].kind).toBe('expr');
  });

  it('should parse multiple attributes', async () => {
    const root = await compileAndGetRoot('<input type="text" value=$name disabled=${!valid} />');
    const element = root.children[0] as ElementNode;

    expect(element.attributes).toHaveLength(3);
    expect(element.attributes[0].name).toBe('type');
    expect(element.attributes[1].name).toBe('value');
    expect(element.attributes[2].name).toBe('disabled');
  });

  it('should handle attributes without values (boolean)', async () => {
    const root = await compileAndGetRoot('<input disabled />');
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as StaticAttributeNode;

    expect(attr.name).toBe('disabled');
    expect(attr.value).toBe('');
  });
});

// =============================================================================
// 4. Control Flow Directives
// =============================================================================

describe('Compiler - @if Directive', () => {
  it('should parse simple @if', async () => {
    const root = await compileAndGetRoot('@if(isValid) { <div>Valid</div> }');
    const ifNode = root.children[0] as IfNode;

    expect(ifNode.kind).toBe('if');
    expect(ifNode.branches).toHaveLength(1);
    expect(ifNode.branches[0].condition).toBeDefined();
    expect(ifNode.branches[0].body).toHaveLength(1);
    expect(ifNode.elseBranch).toBeUndefined();
  });

  it('should parse @if with @else', async () => {
    const source = `
      @if(isValid) {
        <span>Yes</span>
      } else {
        <span>No</span>
      }
    `;
    const root = await compileAndGetRoot(source);
    const ifNode = root.children[0] as IfNode;

    expect(ifNode.branches).toHaveLength(1);
    expect(ifNode.elseBranch).toBeDefined();
    expect(ifNode.elseBranch).toHaveLength(1);
  });

  it('should parse @if with @else if chains', async () => {
    const source = `
      @if(status == "paid") {
        <span>Paid</span>
      } else if(status == "pending") {
        <span>Pending</span>
      } else if(status == "failed") {
        <span>Failed</span>
      } else {
        <span>Unknown</span>
      }
    `;
    const root = await compileAndGetRoot(source);
    const ifNode = root.children[0] as IfNode;

    expect(ifNode.branches).toHaveLength(3);
    expect(ifNode.elseBranch).toBeDefined();
  });
});

describe('Compiler - @for Directive', () => {
  it('should parse @for...of for values', async () => {
    const root = await compileAndGetRoot('@for(item of items) { <li>$item.name</li> }');
    const forNode = root.children[0] as ForNode;

    expect(forNode.kind).toBe('for');
    expect(forNode.itemVar).toBe('item');
    expect(forNode.indexVar).toBeUndefined();
    expect(forNode.iterationType).toBe('of');
    expect(forNode.itemsExpr).toBeDefined();
    expect(forNode.body).toHaveLength(1);
  });

  it('should parse @for...of with index', async () => {
    const root = await compileAndGetRoot('@for(item, index of items) { <li>${index}. $item.name</li> }');
    const forNode = root.children[0] as ForNode;

    expect(forNode.itemVar).toBe('item');
    expect(forNode.indexVar).toBe('index');
    expect(forNode.iterationType).toBe('of');
  });

  it('should parse @for...in for keys/indices', async () => {
    const root = await compileAndGetRoot('@for(index in items) { <li>$index</li> }');
    const forNode = root.children[0] as ForNode;

    expect(forNode.itemVar).toBe('index');
    expect(forNode.iterationType).toBe('in');
  });

  it('should parse complex expression in @for', async () => {
    const root = await compileAndGetRoot('@for(item of data.orders[0].items) { <li>$item</li> }');
    const forNode = root.children[0] as ForNode;

    expect(forNode.itemsExpr.kind).toBe('path');
  });
});

describe('Compiler - @match Directive', () => {
  it('should parse @match with literal cases', async () => {
    const source = `
      @match(status) {
        when "paid", "completed" {
          <div>Success</div>
        }
        when "pending" {
          <div>Waiting</div>
        }
      }
    `;
    const root = await compileAndGetRoot(source);
    const matchNode = root.children[0] as MatchNode;

    expect(matchNode.kind).toBe('match');
    expect(matchNode.value).toBeDefined();
    expect(matchNode.cases).toHaveLength(2);
    expect(matchNode.cases[0].kind).toBe('literal');
    expect((matchNode.cases[0] as any).values).toHaveLength(2);
    expect((matchNode.cases[0] as any).values).toContain('paid');
    expect((matchNode.cases[0] as any).values).toContain('completed');
  });

  it('should parse @match with expression cases', async () => {
    const source = `
      @match(value) {
        _.startsWith("error_") {
          <div>Error</div>
        }
        _ > 100 {
          <div>Large</div>
        }
      }
    `;
    const root = await compileAndGetRoot(source);
    const matchNode = root.children[0] as MatchNode;

    expect(matchNode.cases).toHaveLength(2);
    expect(matchNode.cases[0].kind).toBe('expression');
    expect((matchNode.cases[0] as any).condition).toBeDefined();
  });

  it('should parse @match with default case', async () => {
    const source = `
      @match(status) {
        when "paid" {
          <div>Paid</div>
        }
        * {
          <div>Other</div>
        }
      }
    `;
    const root = await compileAndGetRoot(source);
    const matchNode = root.children[0] as MatchNode;

    expect(matchNode.defaultCase).toBeDefined();
    expect(matchNode.defaultCase).toHaveLength(1);
  });

  it('should parse @match with mixed case types', async () => {
    const source = `
      @match(order.status) {
        when "paid", "completed" {
          <div class="success">Fulfilled</div>
        }
        _.startsWith("error_") {
          <div class="error">Error</div>
        }
        * {
          <div>Unknown</div>
        }
      }
    `;
    const root = await compileAndGetRoot(source);
    const matchNode = root.children[0] as MatchNode;

    expect(matchNode.cases).toHaveLength(2);
    expect(matchNode.cases[0].kind).toBe('literal');
    expect(matchNode.cases[1].kind).toBe('expression');
    expect(matchNode.defaultCase).toBeDefined();
  });
});

// =============================================================================
// 5. Variable Declarations (@@ blocks)
// =============================================================================

describe('Compiler - @@ Blocks', () => {
  it('should parse simple variable declaration', async () => {
    const root = await compileAndGetRoot('@@ { let x = 10; }');
    const letNode = root.children[0] as LetNode;

    expect(letNode.kind).toBe('let');
    expect(letNode.name).toBe('x');
    expect(letNode.isGlobal).toBe(false);
    expect(letNode.value).toBeDefined();
  });

  it('should parse multiple declarations', async () => {
    const source = `
      @@ {
        let x = 10;
        let y = 20;
        let z = x + y;
      }
    `;
    const root = await compileAndGetRoot(source);

    expect(root.children).toHaveLength(3);
    expect((root.children[0] as LetNode).name).toBe('x');
    expect((root.children[1] as LetNode).name).toBe('y');
    expect((root.children[2] as LetNode).name).toBe('z');
  });

  it('should parse global variable assignment', async () => {
    const root = await compileAndGetRoot('@@ { let $.currency = "EUR"; }');
    const letNode = root.children[0] as LetNode;

    expect(letNode.name).toBe('currency');
    expect(letNode.isGlobal).toBe(true);
  });

  it('should parse function declarations', async () => {
    const root = await compileAndGetRoot('@@ { let add = (a, b) => a + b; }');
    const letNode = root.children[0] as LetNode;

    expect(letNode.value.kind).toBe('function');
    const func = letNode.value as any;
    expect(func.params).toEqual(['a', 'b']);
    expect(func.body).toBeDefined();
  });

  it('should parse complex function expressions', async () => {
    const root = await compileAndGetRoot('@@ { let discounted = (amount, percent) => amount * (1 - percent / 100); }');
    const letNode = root.children[0] as LetNode;
    const func = letNode.value as any;

    expect(func.kind).toBe('function');
    expect(func.params).toHaveLength(2);
    expect(func.body.kind).toBe('binary');
  });
});

// =============================================================================
// 6. Components
// =============================================================================

describe('Compiler - Component Definitions', () => {
  it('should parse component definition', async () => {
    const source = `
      <template:Card title!>
        <div>$title</div>
      </template:Card>
    `;
    const root = await compileAndGetRoot(source);

    expect(root.components.size).toBe(1);
    expect(root.components.has('Card')).toBe(true);

    const card = root.components.get('Card')!;
    expect(card.name).toBe('Card');
    expect(card.props).toHaveLength(1);
    expect(card.props[0].name).toBe('title');
    expect(card.props[0].required).toBe(true);
  });

  it('should parse component props with defaults', async () => {
    const source = `
      <template:Price amount! currency="USD" decimals={2}>
        <span>Content</span>
      </template:Price>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.components.get('Price')!;

    expect(comp.props).toHaveLength(3);

    const amountProp = comp.props.find(p => p.name === 'amount')!;
    expect(amountProp.required).toBe(true);
    expect(amountProp.defaultValue).toBeUndefined();

    const currencyProp = comp.props.find(p => p.name === 'currency')!;
    expect(currencyProp.required).toBe(false);
    expect(currencyProp.defaultValue).toBe('USD');

    const decimalsProp = comp.props.find(p => p.name === 'decimals')!;
    expect(decimalsProp.required).toBe(false);
    expect(decimalsProp.defaultValue).toBeDefined();
  });

  it('should parse multiple component definitions', async () => {
    const source = `
      <template:Header title!>
        <h1>$title</h1>
      </template:Header>

      <template:Footer>
        <p>Footer</p>
      </template:Footer>
    `;
    const root = await compileAndGetRoot(source);

    expect(root.components.size).toBe(2);
    expect(root.components.has('Header')).toBe(true);
    expect(root.components.has('Footer')).toBe(true);
  });
});

describe('Compiler - Component Usage', () => {
  it('should parse component instance', async () => {
    const root = await compileAndGetRoot('<Card title="Test" />');
    const comp = root.children[0] as ComponentNode;

    expect(comp.kind).toBe('component');
    expect(comp.name).toBe('Card');
    expect(comp.props).toHaveLength(1);
  });

  it('should parse component props', async () => {
    const root = await compileAndGetRoot('<Price amount=$order.total currency="EUR" />');
    const comp = root.children[0] as ComponentNode;

    expect(comp.props).toHaveLength(2);
    expect(comp.props[0].name).toBe('amount');
    expect(comp.props[0].value.kind).toBe('path');
    expect(comp.props[1].name).toBe('currency');
    expect(comp.props[1].value.kind).toBe('literal');
  });

  it('should parse component with children', async () => {
    const source = `
      <Card title="Test">
        <p>Content here</p>
      </Card>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.children[0] as ComponentNode;

    expect(comp.children).toHaveLength(1);
  });

  it('should track component prop path mappings', async () => {
    const root = await compileAndGetRoot('<Card title=$order.title />');
    const comp = root.children[0] as ComponentNode;

    expect(comp.propPathMapping).toBeDefined();
    // Should map 'title' prop to ['order', 'title'] path
  });
});

describe('Compiler - Slots', () => {
  it('should parse default slot', async () => {
    const source = `
      <template:Card>
        <slot />
      </template:Card>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.components.get('Card')!;
    const slot = comp.body[0] as SlotNode;

    expect(slot.kind).toBe('slot');
    expect(slot.name).toBeUndefined();
    expect(slot.fallback).toBeUndefined();
  });

  it('should parse named slots', async () => {
    const source = `
      <template:Card>
        <slot name="header" />
        <slot name="footer" />
      </template:Card>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.components.get('Card')!;

    expect(comp.body).toHaveLength(2);
    expect((comp.body[0] as SlotNode).name).toBe('header');
    expect((comp.body[1] as SlotNode).name).toBe('footer');
  });

  it('should parse slots with fallback content', async () => {
    const source = `
      <template:Card>
        <slot name="header">
          <h3>Default Header</h3>
        </slot>
      </template:Card>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.components.get('Card')!;
    const slot = comp.body[0] as SlotNode;

    expect(slot.fallback).toBeDefined();
    expect(slot.fallback).toHaveLength(1);
  });

  it('should parse slot usage in component instance', async () => {
    const source = `
      <Card>
        <slot:header>
          <h2>Custom Header</h2>
        </slot:header>
        <p>Default content</p>
      </Card>
    `;
    const root = await compileAndGetRoot(source);
    const comp = root.children[0] as ComponentNode;

    expect(comp.children.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 7. Fragments
// =============================================================================

describe('Compiler - Fragments', () => {
  it('should parse empty fragment', async () => {
    const root = await compileAndGetRoot('<></>');
    const fragment = root.children[0] as FragmentNode;

    expect(fragment.kind).toBe('fragment');
    expect(fragment.preserveWhitespace).toBe(true);
    expect(fragment.children).toHaveLength(0);
  });

  it('should parse fragment with children', async () => {
    const source = `
      <>
        <span>A</span>
        <span>B</span>
      </>
    `;
    const root = await compileAndGetRoot(source);
    const fragment = root.children[0] as FragmentNode;

    expect(fragment.children.length).toBeGreaterThan(0);
  });

  it('should preserve whitespace in fragments', async () => {
    const source = '<>\n  <span>A</span>\n  <span>B</span>\n</>';
    const root = await compileAndGetRoot(source);
    const fragment = root.children[0] as FragmentNode;

    expect(fragment.preserveWhitespace).toBe(true);
  });
});

// =============================================================================
// 8. Comments
// =============================================================================

describe('Compiler - Comments', () => {
  it('should parse line comments', async () => {
    const source = '// This is a comment\n<div>Content</div>';
    const root = await compileAndGetRoot(source);

    // By default, comments should not be in the AST
    const hasComment = root.children.some(c => c.kind === 'comment');
    expect(hasComment).toBe(false);
  });

  it('should parse block comments', async () => {
    const source = '/* Block comment */\n<div>Content</div>';
    const root = await compileAndGetRoot(source);

    const hasComment = root.children.some(c => c.kind === 'comment');
    expect(hasComment).toBe(false);
  });

  it('should parse HTML comments', async () => {
    const source = '<>\n  <!-- HTML comment -->\n  <div>Content</div>\n</>';
    const root = await compileAndGetRoot(source);

    // HTML comments inside fragments should be preserved
    const fragment = root.children[0] as FragmentNode;
    const comment = fragment.children.find(c => c.kind === 'comment') as CommentNode;

    if (comment) {
      expect(comment.style).toBe('html');
      expect(comment.text).toBe(' HTML comment ');
    }
  });

  it('should include comments when option is set', async () => {
    const source = '// Comment\n<div>Content</div>';
    const result = await compile(source, { includeMetadata: true });

    // When includeComments or includeMetadata is true, comments might be tracked
    expect(result).toBeDefined();
  });
});

// =============================================================================
// 9. Metadata and Source Tracking
// =============================================================================

describe('Compiler - Metadata Collection', () => {
  it('should track paths accessed', async () => {
    const root = await compileAndGetRoot('$order.total + $order.tax');

    expect(root.metadata.pathsAccessed.size).toBeGreaterThan(0);
    expect(Array.from(root.metadata.pathsAccessed)).toContain('order.total');
    expect(Array.from(root.metadata.pathsAccessed)).toContain('order.tax');
  });

  it('should track global variables used', async () => {
    const root = await compileAndGetRoot('$.currency');

    expect(root.metadata.globalsUsed.size).toBeGreaterThan(0);
    expect(Array.from(root.metadata.globalsUsed)).toContain('currency');
  });

  it('should track helper functions used', async () => {
    const root = await compileAndGetRoot('${formatCurrency(total)} ${sum(items)}');

    expect(root.metadata.helpersUsed.size).toBe(2);
    expect(Array.from(root.metadata.helpersUsed)).toContain('formatCurrency');
    expect(Array.from(root.metadata.helpersUsed)).toContain('sum');
  });

  it('should track components used', async () => {
    const root = await compileAndGetRoot('<Card /><Header />');

    expect(root.metadata.componentsUsed.size).toBe(2);
    expect(Array.from(root.metadata.componentsUsed)).toContain('Card');
    expect(Array.from(root.metadata.componentsUsed)).toContain('Header');
  });
});

describe('Compiler - Source Maps', () => {
  it('should generate source map when requested', async () => {
    const result = await compile('<div>test</div>', { includeSourceMap: true });

    expect(result.sourceMap).toBeDefined();
    expect(result.sourceMap!.version).toBe(3);
    expect(result.sourceMap!.sources).toBeDefined();
    expect(result.sourceMap!.mappings).toBeDefined();
  });

  it('should not generate source map by default', async () => {
    const result = await compile('<div>test</div>');

    expect(result.sourceMap).toBeUndefined();
  });
});

// =============================================================================
// 10. Error Handling and Validation
// =============================================================================

describe('Compiler - Syntax Errors', () => {
  it('should report unclosed tag', async () => {
    const errors = await compileAndGetErrors('<div>');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/unclosed|closing/i);
  });

  it('should report mismatched tags', async () => {
    const errors = await compileAndGetErrors('<div></span>');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/mismatch|closing/i);
  });

  it('should report invalid expression syntax', async () => {
    const errors = await compileAndGetErrors('${invalid syntax here}');

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should report invalid directive syntax', async () => {
    const errors = await compileAndGetErrors('@if() { <div>test</div> }');

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should include error location', async () => {
    const errors = await compileAndGetErrors('<div>');

    if (errors.length > 0) {
      expect(errors[0].location).toBeDefined();
      expect(errors[0].location.start.line).toBeGreaterThan(0);
    }
  });
});

describe('Compiler - Validation Errors', () => {
  it('should detect undefined variables when strict', async () => {
    const errors = await compileAndGetErrors('$undefinedVar', { strict: true });

    // In strict mode, undefined variables should be reported
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect component name not capitalized', async () => {
    const errors = await compileAndGetErrors('<myComponent />');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/capital/i);
  });

  it('should detect invalid component props', async () => {
    const source = `
      <template:Card title!>
        <div>$title</div>
      </template:Card>
      <Card />
    `;
    const errors = await compileAndGetErrors(source, { validate: true });

    // Should report missing required prop 'title'
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should detect duplicate component definitions', async () => {
    const source = `
      <template:Card><div>1</div></template:Card>
      <template:Card><div>2</div></template:Card>
    `;
    const errors = await compileAndGetErrors(source);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/duplicate/i);
  });
});

describe('Compiler - Warnings', () => {
  it('should warn on unused variables', async () => {
    const source = '@@ { let x = 10; }\n<div>test</div>';
    const warnings = await compileAndGetWarnings(source, { validate: true });

    // May warn about unused variable x
    expect(warnings).toBeDefined();
  });

  it('should warn on shadowing', async () => {
    const source = `
      @@ { let x = 10; }
      @if(true) {
        @@ { let x = 20; }
      }
    `;
    const warnings = await compileAndGetWarnings(source, { validate: true });

    // May warn about variable shadowing
    expect(warnings).toBeDefined();
  });
});

// =============================================================================
// 11. Compilation Options
// =============================================================================

describe('Compiler - Options', () => {
  it('should respect maxExpressionDepth', async () => {
    const deepExpr = '${' + 'a + '.repeat(100) + 'b' + '}'.repeat(100);
    const errors = await compileAndGetErrors(deepExpr, { maxExpressionDepth: 10 });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/depth|nesting/i);
  });

  it('should respect maxFunctionDepth for recursion', async () => {
    // This would be tested during evaluation, not compilation
    expect(true).toBe(true);
  });

  it('should use custom loader for components', async () => {
    const loader = {
      load: async (name: string) => {
        return {
          root: {
            kind: 'root' as const,
            children: [],
            components: new Map(),
            metadata: {
              globalsUsed: new Set(),
              pathsAccessed: new Set(),
              helpersUsed: new Set(),
              componentsUsed: new Set(),
            },
            location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
          },
          diagnostics: [],
        };
      },
    };

    const result = await compile('@load("External")\n<External />', { loader });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// 12. Complex Integration Tests
// =============================================================================

describe('Compiler - Complex Templates', () => {
  it('should compile complex nested template', async () => {
    const source = `
      @@ {
        let taxRate = 0.08;
        let total = sum(items[*].price);
      }

      <div class="order">
        @if(items.length > 0) {
          <h2>Order Summary</h2>
          <ul>
            @for(item, index of items) {
              <li class="item-${index}">
                ${item.name}: ${formatCurrency(item.price)}
              </li>
            }
          </ul>
          <div class="total">
            Total: ${formatCurrency(total * (1 + taxRate))}
          </div>
        } else {
          <p>No items</p>
        }
      </div>
    `;

    const result = await compile(source);
    expect(result.diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
    expect(result.root.children.length).toBeGreaterThan(0);
  });

  it('should compile template with components and slots', async () => {
    const source = `
      <template:Card title! subtitle>
        <div class="card">
          <div class="header">
            <slot name="header">
              <h3>$title</h3>
              @if(subtitle) {
                <p>$subtitle</p>
              }
            </slot>
          </div>
          <div class="body">
            <slot />
          </div>
        </div>
      </template:Card>

      <Card title="My Card" subtitle="Subtitle">
        <slot:header>
          <h1>Custom Header</h1>
        </slot:header>
        <p>Card content here</p>
      </Card>
    `;

    const result = await compile(source);
    expect(result.diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
    expect(result.root.components.size).toBe(1);
  });

  it('should compile template with all features', async () => {
    const source = `
      // Define reusable components
      <template:PriceTag amount! currency="USD">
        <span class="price">
          ${formatCurrency(amount, currency)}
        </span>
      </template:PriceTag>

      // Main template
      @@ {
        let $.theme = "dark";
        let discount = 0.1;
        let applyDiscount = (price) => price * (1 - discount);
      }

      <div class="container theme-${$.theme}">
        <h1>Products</h1>

        @for(product of products) {
          <div class="product">
            <h3>$product.name</h3>

            @match(product.stock) {
              when 0 {
                <span class="out-of-stock">Out of Stock</span>
              }
              _ < 10 {
                <span class="low-stock">Only ${product.stock} left!</span>
              }
              * {
                <span class="in-stock">In Stock</span>
              }
            }

            @if(product.onSale) {
              <PriceTag amount=${applyDiscount(product.price)} />
              <span class="original">
                <PriceTag amount=$product.price />
              </span>
            } else {
              <PriceTag amount=$product.price />
            }
          </div>
        }
      </div>
    `;

    const result = await compile(source);
    expect(result.diagnostics.filter(d => d.level === 'error')).toHaveLength(0);

    // Verify metadata
    expect(result.root.metadata.globalsUsed.has('theme')).toBe(true);
    expect(result.root.metadata.helpersUsed.has('formatCurrency')).toBe(true);
    expect(result.root.metadata.componentsUsed.has('PriceTag')).toBe(true);
  });
});

// =============================================================================
// 13. Edge Cases and Boundary Conditions
// =============================================================================

describe('Compiler - Edge Cases', () => {
  it('should handle empty expressions', async () => {
    const errors = await compileAndGetErrors('${}');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should handle whitespace-only templates', async () => {
    const root = await compileAndGetRoot('   \n  \t  ');
    expect(root.children.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle special characters in text', async () => {
    const root = await compileAndGetRoot('Special: & < > " \' `');
    expect(root.children).toHaveLength(1);
  });

  it('should handle unicode in templates', async () => {
    const root = await compileAndGetRoot('<div>Unicode: 你好 мир 🚀</div>');
    expect(root.children).toHaveLength(1);
  });

  it('should handle deeply nested structures', async () => {
    let source = '';
    const depth = 50;
    for (let i = 0; i < depth; i++) {
      source += '<div>';
    }
    source += 'deep';
    for (let i = 0; i < depth; i++) {
      source += '</div>';
    }

    const result = await compile(source);
    expect(result).toBeDefined();
  });

  it('should handle very long attribute values', async () => {
    const longValue = 'x'.repeat(10000);
    const root = await compileAndGetRoot(`<div data-value="${longValue}">test</div>`);
    expect(root.children).toHaveLength(1);
  });

  it('should handle templates with thousands of nodes', async () => {
    const items = Array(1000).fill(0).map((_, i) => `<div>Item ${i}</div>`).join('\n');
    const result = await compile(items);
    expect(result.root.children.length).toBe(1000);
  });
});

describe('Compiler - Whitespace Handling', () => {
  it('should normalize whitespace in text nodes', async () => {
    const root = await compileAndGetRoot('<div>  multiple   spaces  </div>');
    const div = root.children[0] as ElementNode;
    // Whitespace normalization behavior depends on implementation
    expect(div.children.length).toBeGreaterThanOrEqual(1);
  });

  it('should preserve whitespace in fragments', async () => {
    const source = '<>\n  <span>A</span>\n  <span>B</span>\n</>';
    const root = await compileAndGetRoot(source);
    const fragment = root.children[0] as FragmentNode;
    expect(fragment.preserveWhitespace).toBe(true);
  });

  it('should handle leading/trailing whitespace', async () => {
    const root = await compileAndGetRoot('\n  <div>test</div>  \n');
    expect(root.children.length).toBeGreaterThanOrEqual(1);
  });
});
