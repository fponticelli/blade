/**
 * Comprehensive test suite for the Blade template compiler
 *
 * Test-driven design for compiler implementation.
 * These tests define the expected behavior without implementing the compile() method.
 */

import { describe, it, expect } from 'vitest';
import { compile, type CompileOptions } from '../src/compiler/index.js';
import {
  isLiteralSegment,
  isExprSegment,
  isKeyPathItem,
  isIndexPathItem,
  isStaticAttrValue,
  isLiteralMatchCase,
  isExpressionMatchCase,
  isFunctionExpr,
} from '../src/compiler/helpers.js';
import type {
  RootNode,
  TextNode,
  ElementNode,
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
async function compileAndGetRoot(
  source: string,
  options?: CompileOptions
): Promise<RootNode> {
  const result = await compile(source, options);
  return result.root;
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
    const segment = textNode.segments[0];
    expect(segment.kind).toBe('literal');
    if (isLiteralSegment(segment)) {
      expect(segment.text).toBe('Hello, World!');
    }
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
    if (isExprSegment(segment)) {
      const expr = segment.expr as PathNode;
      expect(expr.kind).toBe('path');
      expect(expr.isGlobal).toBe(false);
      expect(expr.segments).toHaveLength(1);
      const pathItem = expr.segments[0];
      expect(pathItem.kind).toBe('key');
      if (isKeyPathItem(pathItem)) {
        expect(pathItem.key).toBe('foo');
      }
    }
  });

  it('should parse dotted path: $data.user.name', async () => {
    const root = await compileAndGetRoot('$data.user.name');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as PathNode;
      expect(expr.segments).toHaveLength(3);
      const seg0 = expr.segments[0];
      const seg1 = expr.segments[1];
      const seg2 = expr.segments[2];
      if (isKeyPathItem(seg0) && isKeyPathItem(seg1) && isKeyPathItem(seg2)) {
        expect(seg0.key).toBe('data');
        expect(seg1.key).toBe('user');
        expect(seg2.key).toBe('name');
      }
    }
  });

  it('should parse global path: $.currency', async () => {
    const root = await compileAndGetRoot('$.currency');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as PathNode;
      expect(expr.isGlobal).toBe(true);
      expect(expr.segments).toHaveLength(1);
      const pathItem = expr.segments[0];
      if (isKeyPathItem(pathItem)) {
        expect(pathItem.key).toBe('currency');
      }
    }
  });

  it('should parse array index: $items[0]', async () => {
    const root = await compileAndGetRoot('$items[0]');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as PathNode;
      expect(expr.segments).toHaveLength(2);
      const seg0 = expr.segments[0];
      const seg1 = expr.segments[1];
      expect(seg0.kind).toBe('key');
      expect(seg1.kind).toBe('index');
      if (isKeyPathItem(seg0)) {
        expect(seg0.key).toBe('items');
      }
      if (isIndexPathItem(seg1)) {
        expect(seg1.index).toBe(0);
      }
    }
  });

  it('should parse array wildcard: $items[*].price', async () => {
    const root = await compileAndGetRoot('$items[*].price');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as ArrayWildcardNode;
      expect(expr.kind).toBe('wildcard');
      expect(expr.path.segments).toHaveLength(3);
      expect(expr.path.segments[1].kind).toBe('star');
    }
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
      const segment = textNode.segments[0];

      expect(segment.kind).toBe('expr');
      if (isExprSegment(segment)) {
        const expr = segment.expr as LiteralNode;
        expect(expr.kind).toBe('literal');
        expect(expr.type).toBe(test.type);
        expect(expr.value).toBe(test.value);
      }
    }
  });

  it('should parse binary operations', async () => {
    const operators = [
      '+',
      '-',
      '*',
      '/',
      '%',
      '==',
      '!=',
      '<',
      '>',
      '<=',
      '>=',
      '&&',
      '||',
      '??',
    ];

    for (const op of operators) {
      const root = await compileAndGetRoot(`\${a ${op} b}`);
      const textNode = root.children[0] as TextNode;
      const segment = textNode.segments[0];

      expect(segment.kind).toBe('expr');
      if (isExprSegment(segment)) {
        const expr = segment.expr as BinaryNode;
        expect(expr.kind).toBe('binary');
        expect(expr.operator).toBe(op);
        expect(expr.left).toBeDefined();
        expect(expr.right).toBeDefined();
      }
    }
  });

  it('should parse unary operations', async () => {
    const root1 = await compileAndGetRoot('${!isValid}');
    const textNode1 = root1.children[0] as TextNode;
    const segment1 = textNode1.segments[0];
    expect(segment1.kind).toBe('expr');
    if (isExprSegment(segment1)) {
      const expr1 = segment1.expr as UnaryNode;
      expect(expr1.kind).toBe('unary');
      expect(expr1.operator).toBe('!');
    }

    const root2 = await compileAndGetRoot('${-total}');
    const textNode2 = root2.children[0] as TextNode;
    const segment2 = textNode2.segments[0];
    expect(segment2.kind).toBe('expr');
    if (isExprSegment(segment2)) {
      const expr2 = segment2.expr as UnaryNode;
      expect(expr2.kind).toBe('unary');
      expect(expr2.operator).toBe('-');
    }
  });

  it('should parse ternary expressions', async () => {
    const root = await compileAndGetRoot('${isValid ? "Yes" : "No"}');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as TernaryNode;
      expect(expr.kind).toBe('ternary');
      expect(expr.condition).toBeDefined();
      expect(expr.truthy).toBeDefined();
      expect(expr.falsy).toBeDefined();
    }
  });

  it('should parse function calls', async () => {
    const root = await compileAndGetRoot('${formatCurrency(total)}');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as CallNode;
      expect(expr.kind).toBe('call');
      expect(expr.callee).toBe('formatCurrency');
      expect(expr.args).toHaveLength(1);
    }
  });

  it('should parse nested function calls', async () => {
    const root = await compileAndGetRoot(
      '${formatCurrency(sum(items[*].price))}'
    );
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as CallNode;
      expect(expr.kind).toBe('call');
      expect(expr.callee).toBe('formatCurrency');
      expect(expr.args[0].kind).toBe('call');
      expect((expr.args[0] as CallNode).callee).toBe('sum');
    }
  });

  it('should respect operator precedence', async () => {
    const root = await compileAndGetRoot('${a + b * c}');
    const textNode = root.children[0] as TextNode;
    const segment = textNode.segments[0];

    expect(segment.kind).toBe('expr');
    if (isExprSegment(segment)) {
      const expr = segment.expr as BinaryNode;
      // Should parse as: a + (b * c), not (a + b) * c
      expect(expr.operator).toBe('+');
      expect(expr.right.kind).toBe('binary');
      expect((expr.right as BinaryNode).operator).toBe('*');
    }
  });
});

describe('Compiler - Expression Interpolation', () => {
  it('should parse mixed text and expressions', async () => {
    const root = await compileAndGetRoot('Total: ${formatCurrency(total)}');
    const textNode = root.children[0] as TextNode;

    expect(textNode.segments).toHaveLength(2);
    const seg0 = textNode.segments[0];
    expect(seg0.kind).toBe('literal');
    if (isLiteralSegment(seg0)) {
      expect(seg0.text).toBe('Total: ');
    }
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
    const root = await compileAndGetRoot(
      '<button disabled=${!isValid}>Submit</button>'
    );
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as ExprAttributeNode;

    expect(attr.kind).toBe('expr');
    expect(attr.name).toBe('disabled');
    expect(attr.expr).toBeDefined();
    expect(attr.expr.kind).toBe('unary');
  });

  it('should parse mixed attributes (interpolation)', async () => {
    const root = await compileAndGetRoot(
      '<div class="status-${order.status}">test</div>'
    );
    const element = root.children[0] as ElementNode;
    const attr = element.attributes[0] as MixedAttributeNode;

    expect(attr.kind).toBe('mixed');
    expect(attr.name).toBe('class');
    expect(attr.segments).toHaveLength(2);
    const seg0 = attr.segments[0];
    expect(seg0.kind).toBe('static');
    if (isStaticAttrValue(seg0)) {
      expect(seg0.value).toBe('status-');
    }
    expect(attr.segments[1].kind).toBe('expr');
  });

  it('should parse multiple attributes', async () => {
    const root = await compileAndGetRoot(
      '<input type="text" value=$name disabled=${!valid} />'
    );
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
    const root = await compileAndGetRoot(
      '@for(item of items) { <li>$item.name</li> }'
    );
    const forNode = root.children[0] as ForNode;

    expect(forNode.kind).toBe('for');
    expect(forNode.itemVar).toBe('item');
    expect(forNode.indexVar).toBeUndefined();
    expect(forNode.iterationType).toBe('of');
    expect(forNode.itemsExpr).toBeDefined();
    expect(forNode.body).toHaveLength(1);
  });

  it('should parse @for...of with index', async () => {
    const root = await compileAndGetRoot(
      '@for(item, index of items) { <li>${index}. $item.name</li> }'
    );
    const forNode = root.children[0] as ForNode;

    expect(forNode.itemVar).toBe('item');
    expect(forNode.indexVar).toBe('index');
    expect(forNode.iterationType).toBe('of');
  });

  it('should parse @for...in for keys/indices', async () => {
    const root = await compileAndGetRoot(
      '@for(index in items) { <li>$index</li> }'
    );
    const forNode = root.children[0] as ForNode;

    expect(forNode.itemVar).toBe('index');
    expect(forNode.iterationType).toBe('in');
  });

  it('should parse complex expression in @for', async () => {
    const root = await compileAndGetRoot(
      '@for(item of data.orders[0].items) { <li>$item</li> }'
    );
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
    const case0 = matchNode.cases[0];
    expect(case0.kind).toBe('literal');
    if (isLiteralMatchCase(case0)) {
      expect(case0.values).toHaveLength(2);
      expect(case0.values).toContain('paid');
      expect(case0.values).toContain('completed');
    }
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
    const case0 = matchNode.cases[0];
    expect(case0.kind).toBe('expression');
    if (isExpressionMatchCase(case0)) {
      expect(case0.condition).toBeDefined();
    }
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
    if (isFunctionExpr(letNode.value)) {
      expect(letNode.value.params).toEqual(['a', 'b']);
      expect(letNode.value.body).toBeDefined();
    }
  });

  it('should parse complex function expressions', async () => {
    const root = await compileAndGetRoot(
      '@@ { let discounted = (amount, percent) => amount * (1 - percent / 100); }'
    );
    const letNode = root.children[0] as LetNode;

    expect(letNode.value.kind).toBe('function');
    if (isFunctionExpr(letNode.value)) {
      expect(letNode.value.params).toHaveLength(2);
      expect(letNode.value.body.kind).toBe('binary');
    }
  });
});

// =============================================================================
// 6. Components
// =============================================================================
