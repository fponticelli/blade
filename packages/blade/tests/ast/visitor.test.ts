import { describe, it, expect } from 'vitest';
import {
  node,
  seg,
  expr,
  attr,
  match,
  comp,
  syntheticLoc,
} from '../../src/ast/builders.js';
import {
  childrenOf,
  walkNodes,
  subExpressionsOf,
  walkExpressions,
  expressionsOf,
  attributeExpressions,
} from '../../src/ast/visitor.js';
import type {
  ComponentNode,
  ExprAst,
  PathNode,
  TemplateNode,
} from '../../src/ast/types.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * The location every node in this file is built at.
 *
 * These trees are assembled by hand to exercise the walker's shape rules, so
 * none of them has source text behind it. `syntheticLoc()` is the one way to
 * say that, and saying it is the point: a builder no longer invents a location
 * when a caller forgets one, so "this node came from nowhere" has to be
 * written down.
 */
const L = syntheticLoc();

/** Names of every component reachable from the given roots. */
function componentNames(nodes: readonly TemplateNode[]): string[] {
  const found: string[] = [];
  walkNodes(nodes, n => {
    if (n.kind === 'component') found.push(n.name);
  });
  return found;
}

/** Serialised names of every path expression reachable from an expression. */
function pathNames(root: ExprAst): string[] {
  const names: string[] = [];
  walkExpressions(root, e => {
    if (e.kind === 'path') {
      names.push(e.segments.map(s => JSON.stringify(s)).join(''));
    }
  });
  return names;
}

/** A path expression from dotted source, e.g. `a.b`. */
function p(source: string): PathNode {
  return expr.pathFrom(source, L);
}

// -----------------------------------------------------------------------------
// childrenOf
// -----------------------------------------------------------------------------

describe('childrenOf', () => {
  it('returns element children', () => {
    const child = node.textLiteral('hi', L);
    const el = node.element({ tag: 'div', children: [child], location: L });
    expect(childrenOf(el)).toEqual([child]);
  });

  it('returns no children for leaf kinds', () => {
    expect(childrenOf(node.textLiteral('x', L))).toEqual([]);
    expect(
      childrenOf(node.comment({ style: 'html', text: 'c', location: L }))
    ).toEqual([]);
    expect(childrenOf(node.doctype({ value: 'html', location: L }))).toEqual(
      []
    );
    expect(
      childrenOf(
        node.letNode({ name: 'x', value: expr.literal(1, L), location: L })
      )
    ).toEqual([]);
    expect(
      childrenOf(
        node.props({
          props: [comp.prop({ name: 'label', required: true, location: L })],
          location: L,
        })
      )
    ).toEqual([]);
  });

  it('returns every if branch body and the else branch', () => {
    const a = node.textLiteral('a', L);
    const b = node.textLiteral('b', L);
    const c = node.textLiteral('c', L);
    const ifNode = node.ifNode({
      branches: [
        { condition: p('one'), body: [a], location: L },
        { condition: p('two'), body: [b], location: L },
      ],
      elseBranch: [c],
      location: L,
    });
    expect(childrenOf(ifNode)).toEqual([a, b, c]);
  });

  it('returns an if node body with no else branch', () => {
    const a = node.textLiteral('a', L);
    const ifNode = node.ifNode({
      branches: [{ condition: p('one'), body: [a], location: L }],
      location: L,
    });
    expect(childrenOf(ifNode)).toEqual([a]);
  });

  it('returns the for loop body', () => {
    const body = node.textLiteral('row', L);
    const loop = node.forLoop({
      itemVar: 'item',
      itemsExpr: p('items'),
      body: [body],
      location: L,
    });
    expect(childrenOf(loop)).toEqual([body]);
  });

  it('returns every match case body and the default case', () => {
    const a = node.textLiteral('a', L);
    const b = node.textLiteral('b', L);
    const d = node.textLiteral('d', L);
    const m = node.match({
      value: p('status'),
      cases: [
        match.literal(['paid'], [a], L),
        match.expression(expr.call('startsWith', [p('_')], L), [b], L),
      ],
      defaultCase: [d],
      location: L,
    });
    expect(childrenOf(m)).toEqual([a, b, d]);
  });

  it('returns component slot children', () => {
    const child = node.textLiteral('slotted', L);
    const component = node.component({
      name: 'Card',
      children: [child],
      location: L,
    });
    expect(childrenOf(component)).toEqual([child]);
  });

  it('returns fragment children', () => {
    const child = node.textLiteral('frag', L);
    expect(childrenOf(node.fragment([child], L))).toEqual([child]);
  });

  it('returns slot fallback content', () => {
    const fallback = node.textLiteral('default footer', L);
    expect(
      childrenOf(
        node.slot({ name: 'footer', fallback: [fallback], location: L })
      )
    ).toEqual([fallback]);
  });

  it('returns nothing for a slot without fallback', () => {
    expect(childrenOf(node.slot({ location: L }))).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// walkNodes
// -----------------------------------------------------------------------------

describe('walkNodes', () => {
  it('visits nodes pre-order', () => {
    const tree = node.element({
      tag: 'section',
      children: [
        node.element({
          tag: 'h1',
          children: [node.textLiteral('title', L)],
          location: L,
        }),
        node.textLiteral('tail', L),
      ],
      location: L,
    });
    const seen: string[] = [];
    walkNodes([tree], n => {
      seen.push(n.kind === 'element' ? n.tag : n.kind);
    });
    expect(seen).toEqual(['section', 'h1', 'text', 'text']);
  });

  it('reports the parent of each node', () => {
    const inner = node.textLiteral('x', L);
    const outer = node.element({ tag: 'div', children: [inner], location: L });
    const pairs: Array<[string, string | undefined]> = [];
    walkNodes([outer], (n, parent) => {
      pairs.push([n.kind, parent?.kind]);
    });
    expect(pairs).toEqual([
      ['element', undefined],
      ['text', 'element'],
    ]);
  });

  it('skips a subtree when the visitor returns false', () => {
    const tree = node.element({
      tag: 'div',
      children: [
        node.element({
          tag: 'skipme',
          children: [node.textLiteral('hidden', L)],
          location: L,
        }),
        node.textLiteral('kept', L),
      ],
      location: L,
    });
    const seen: string[] = [];
    walkNodes([tree], n => {
      if (n.kind === 'element' && n.tag === 'skipme') return false;
      seen.push(n.kind === 'element' ? n.tag : n.kind);
      return undefined;
    });
    expect(seen).toEqual(['div', 'text']);
  });

  it('does not skip when the visitor returns undefined', () => {
    const tree = node.element({
      tag: 'div',
      children: [node.textLiteral('kept', L)],
      location: L,
    });
    const seen: string[] = [];
    walkNodes([tree], () => {
      seen.push('visit');
    });
    expect(seen).toEqual(['visit', 'visit']);
  });

  it('handles an empty root list', () => {
    const seen: string[] = [];
    walkNodes([], n => {
      seen.push(n.kind);
    });
    expect(seen).toEqual([]);
  });

  // This is the concrete regression shared by all six hand-rolled walkers:
  // project/ and lsp/ walkers descended into element/if/for/match children but
  // not into fragments or slot fallbacks, so a component referenced only there
  // was never resolved, never prop-checked and got no definition location.
  it('finds a component inside a fragment and inside a slot fallback', () => {
    const tree = node.element({
      tag: 'div',
      children: [
        node.fragment(
          [
            node.component({
              name: 'InsideFragment',
              props: [node.componentProp('x', p('a.b'), L)],
              location: L,
            }),
          ],
          L
        ),
        node.slot({
          name: 'footer',
          fallback: [
            node.component({ name: 'InsideSlotFallback', location: L }),
          ],
          location: L,
        }),
      ],
      location: L,
    });

    expect(componentNames([tree])).toEqual([
      'InsideFragment',
      'InsideSlotFallback',
    ]);
  });

  it('finds components nested in every container kind at once', () => {
    const tree: TemplateNode[] = [
      node.ifNode({
        branches: [
          {
            condition: p('c'),
            body: [node.component({ name: 'InIf', location: L })],
            location: L,
          },
        ],
        elseBranch: [node.component({ name: 'InElse', location: L })],
        location: L,
      }),
      node.forLoop({
        itemVar: 'i',
        itemsExpr: p('items'),
        body: [node.component({ name: 'InFor', location: L })],
        location: L,
      }),
      node.match({
        value: p('s'),
        cases: [
          match.literal(
            ['a'],
            [node.component({ name: 'InCase', location: L })],
            L
          ),
        ],
        defaultCase: [node.component({ name: 'InDefault', location: L })],
        location: L,
      }),
      node.component({
        name: 'Outer',
        children: [node.component({ name: 'InComponentSlot', location: L })],
        location: L,
      }),
      node.fragment([node.component({ name: 'InFragment', location: L })], L),
      node.slot({
        fallback: [node.component({ name: 'InSlotFallback', location: L })],
        location: L,
      }),
    ];

    expect(componentNames(tree)).toEqual([
      'InIf',
      'InElse',
      'InFor',
      'InCase',
      'InDefault',
      'Outer',
      'InComponentSlot',
      'InFragment',
      'InSlotFallback',
    ]);
  });

  it('narrows the visited node type without casting', () => {
    const tree = [node.component({ name: 'Card', location: L })];
    let name = '';
    walkNodes(tree, n => {
      if (n.kind === 'component') {
        // `n` must be a ComponentNode here; this assignment is the type test.
        const component: ComponentNode = n;
        name = component.name;
      }
    });
    expect(name).toBe('Card');
  });
});

// -----------------------------------------------------------------------------
// subExpressionsOf / walkExpressions
// -----------------------------------------------------------------------------

describe('subExpressionsOf', () => {
  it('returns nothing for leaves', () => {
    expect(subExpressionsOf(expr.literal(1, L))).toEqual([]);
    expect(subExpressionsOf(p('a.b'))).toEqual([]);
  });

  it('returns the operand of a unary expression', () => {
    const operand = p('flag');
    expect(subExpressionsOf(expr.unary('!', operand, L))).toEqual([operand]);
  });

  it('returns both sides of a binary expression', () => {
    const left = p('a');
    const right = p('b');
    expect(subExpressionsOf(expr.binary('+', left, right, L))).toEqual([
      left,
      right,
    ]);
  });

  it('returns all three parts of a ternary expression', () => {
    const c = p('c');
    const t = p('t');
    const f = p('f');
    expect(subExpressionsOf(expr.ternary(c, t, f, L))).toEqual([c, t, f]);
  });

  it('returns call arguments', () => {
    const a = p('a');
    const b = expr.literal(2, L);
    expect(subExpressionsOf(expr.call('sum', [a, b], L))).toEqual([a, b]);
  });

  it('returns the inner path of a wildcard', () => {
    const wildcard = expr.wildcard(p('items'), L);
    expect(subExpressionsOf(wildcard)).toEqual([wildcard.path]);
  });

  // The bug: compiler/index.ts's visitExpr omitted 'array' entirely, so
  // `${[a.x, b.y]}` produced an EMPTY pathsAccessed set.
  it('returns array literal elements', () => {
    const a = p('a.x');
    const b = p('b.y');
    expect(subExpressionsOf(expr.array([a, b], L))).toEqual([a, b]);
  });

  // The bug: 'member' was omitted too, so `foo().bar` lost `foo`.
  it('returns the object of a member access', () => {
    const object = expr.call('foo', [], L);
    const member = expr.member(object, [], false, L);
    expect(subExpressionsOf(member)).toEqual([object]);
  });

  it('returns the body of a function expression', () => {
    const body = p('amount');
    const fn = expr.fn(['amount'], body, L);
    expect(subExpressionsOf(fn)).toEqual([body]);
  });
});

describe('walkExpressions', () => {
  it('visits the root and every descendant pre-order', () => {
    const tree = expr.binary('+', p('a'), expr.call('f', [p('b')], L), L);
    const kinds: string[] = [];
    walkExpressions(tree, e => {
      kinds.push(e.kind);
    });
    expect(kinds).toEqual(['binary', 'path', 'call', 'path']);
  });

  it('skips a subtree when the visitor returns false', () => {
    const tree = expr.binary(
      '+',
      expr.call('f', [p('hidden')], L),
      p('kept'),
      L
    );
    const kinds: string[] = [];
    walkExpressions(tree, e => {
      if (e.kind === 'call') return false;
      kinds.push(e.kind);
      return undefined;
    });
    expect(kinds).toEqual(['binary', 'path']);
  });

  it('reaches paths inside an array literal', () => {
    // `${[a.x, b.y]}` - the case that yielded an empty path set before.
    const tree = expr.array([p('a.x'), p('b.y')], L);
    expect(pathNames(tree)).toHaveLength(2);
  });

  it('reaches paths inside a member access object', () => {
    const tree = expr.member(expr.call('f', [p('a.x')], L), [], false, L);
    expect(pathNames(tree)).toHaveLength(1);
  });

  it('walks a function expression body', () => {
    const fn = expr.fn(['x'], expr.binary('*', p('x'), p('r'), L), L);
    const kinds: string[] = [];
    walkExpressions(fn, e => {
      kinds.push(e.kind);
    });
    expect(kinds).toEqual(['binary', 'path', 'path']);
  });
});

// -----------------------------------------------------------------------------
// expressionsOf
// -----------------------------------------------------------------------------

describe('expressionsOf', () => {
  it('returns text interpolation expressions and skips literal segments', () => {
    const e = p('total');
    const text = node.text([seg.literal('Total: ', L), seg.expr(e, L)], L);
    expect(expressionsOf(text)).toEqual([e]);
  });

  it('returns expression attribute values', () => {
    const e = p('disabled');
    const el = node.element({
      tag: 'button',
      attributes: [attr.static('class', 'x', L), attr.expr('disabled', e, L)],
      location: L,
    });
    expect(expressionsOf(el)).toEqual([e]);
  });

  it('returns the expression segments of a mixed attribute', () => {
    const e = p('order.status');
    const el = node.element({
      tag: 'div',
      attributes: [
        attr.mixed(
          'class',
          [attr.staticValue('status-', L), attr.exprValue(e, L)],
          L
        ),
      ],
      location: L,
    });
    expect(expressionsOf(el)).toEqual([e]);
  });

  it('does not descend into element children', () => {
    const childExpr = p('inner');
    const el = node.element({
      tag: 'div',
      children: [node.text([seg.expr(childExpr, L)], L)],
      location: L,
    });
    expect(expressionsOf(el)).toEqual([]);
  });

  it('returns every if branch condition', () => {
    const a = p('a');
    const b = p('b');
    const ifNode = node.ifNode({
      branches: [
        { condition: a, body: [], location: L },
        { condition: b, body: [], location: L },
      ],
      elseBranch: [],
      location: L,
    });
    expect(expressionsOf(ifNode)).toEqual([a, b]);
  });

  it('returns the loop iterable', () => {
    const items = p('items');
    const loop = node.forLoop({
      itemVar: 'i',
      itemsExpr: items,
      body: [],
      location: L,
    });
    expect(expressionsOf(loop)).toEqual([items]);
  });

  it('returns the match subject and every expression case condition', () => {
    const subject = p('status');
    const condition = expr.call('startsWith', [p('_')], L);
    const m = node.match({
      value: subject,
      cases: [
        match.literal(['paid'], [], L),
        match.expression(condition, [], L),
      ],
      location: L,
    });
    expect(expressionsOf(m)).toEqual([subject, condition]);
  });

  it('returns component prop values', () => {
    const a = p('order.subtotal');
    const b = expr.literal(0.08, L);
    const component = node.component({
      name: 'Price',
      props: [
        node.componentProp('subtotal', a, L),
        node.componentProp('tax', b, L),
      ],
      location: L,
    });
    expect(expressionsOf(component)).toEqual([a, b]);
  });

  it('returns a let value, including a function expression', () => {
    const value = expr.literal(0.08, L);
    expect(
      expressionsOf(node.letNode({ name: 'taxRate', value, location: L }))
    ).toEqual([value]);

    const fn = expr.fn(['x'], p('x'), L);
    expect(
      expressionsOf(node.letNode({ name: 'f', value: fn, location: L }))
    ).toEqual([fn]);
  });

  it('returns nothing for structural and leaf nodes', () => {
    expect(expressionsOf(node.fragment([], L))).toEqual([]);
    expect(expressionsOf(node.slot({ name: 'a', location: L }))).toEqual([]);
    expect(
      expressionsOf(node.comment({ style: 'line', text: 'x', location: L }))
    ).toEqual([]);
    expect(expressionsOf(node.doctype({ value: 'html', location: L }))).toEqual(
      []
    );
    expect(expressionsOf(node.textLiteral('static', L))).toEqual([]);
  });

  it('composes with walkNodes and walkExpressions to reach every path', () => {
    const tree: TemplateNode[] = [
      node.fragment(
        [
          node.component({
            name: 'Card',
            props: [
              node.componentProp(
                'items',
                expr.array([p('a.x'), p('b.y')], L),
                L
              ),
            ],
            location: L,
          }),
        ],
        L
      ),
    ];
    const paths: string[] = [];
    walkNodes(tree, n => {
      for (const e of expressionsOf(n)) {
        walkExpressions(e, sub => {
          if (sub.kind === 'path') paths.push(sub.segments.length.toString());
        });
      }
    });
    expect(paths).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// attributeExpressions
// -----------------------------------------------------------------------------

describe('attributeExpressions', () => {
  it('returns nothing for a static attribute', () => {
    expect(attributeExpressions(attr.static('class', 'x', L))).toEqual([]);
  });

  it('returns the value of an expression attribute', () => {
    const e = p('disabled');
    expect(attributeExpressions(attr.expr('disabled', e, L))).toEqual([e]);
  });

  // An `on:` binding is a separate node kind, and the walkers used to stop at
  // the discriminant: a handler expression counted towards no metadata and was
  // checked by no pass, so `on:click=${missingHelper()}` compiled clean.
  it('returns the handler of an event binding', () => {
    const e = expr.call('submit', [], L);
    expect(attributeExpressions(attr.event('on:click', 'click', e, L))).toEqual(
      [e]
    );
  });

  it('returns only the expression segments of a mixed attribute, in order', () => {
    const first = p('a');
    const second = p('b');
    const mixed = attr.mixed(
      'class',
      [
        attr.staticValue('one-', L),
        attr.exprValue(first, L),
        attr.staticValue('-two-', L),
        attr.exprValue(second, L),
      ],
      L
    );
    expect(attributeExpressions(mixed)).toEqual([first, second]);
  });

  it('returns nothing for a mixed attribute with no expression segments', () => {
    const mixed = attr.mixed('class', [attr.staticValue('only', L)], L);
    expect(attributeExpressions(mixed)).toEqual([]);
  });
});
