import { describe, it, expect } from 'vitest';
import { parseExpression } from '../src/parser/index.js';
import {
  classifyExpression,
  collectPaths,
  describeExpression,
  formatSourceOp,
  formatSourceOpValue,
  formatSourceValue,
  resolvePath,
  serializePath,
  buildSourceExpression,
  loopAliases,
} from '../src/source-tracking/index.js';
import type { ArrayWildcardNode, ExprAst, PathNode } from '../src/ast/types.js';

function expr(source: string) {
  const result = parseExpression(source);
  if (!result.value) {
    throw new Error(
      `failed to parse "${source}": ${result.errors.map(e => e.message).join(', ')}`
    );
  }
  return result.value;
}

describe('serializePath', () => {
  it('renders keys and indices in host notation', () => {
    const node = expr('$order.items[0].name') as PathNode;
    expect(serializePath(node.segments, node.isGlobal)).toBe(
      'order.items[0].name'
    );
  });

  it('renders wildcards as [*]', () => {
    // A path containing [*] parses to a wildcard node wrapping the path.
    const node = expr('$order.items[*].name') as ArrayWildcardNode;
    expect(serializePath(node.path.segments, node.path.isGlobal)).toBe(
      'order.items[*].name'
    );
  });

  it('prefixes globals with $.', () => {
    const node = expr('$.currency') as PathNode;
    expect(serializePath(node.segments, node.isGlobal)).toBe('$.currency');
  });
});

describe('collectPaths', () => {
  it('collects every path in evaluation order', () => {
    expect(collectPaths(expr('$subtotal + $tax'))).toEqual(['subtotal', 'tax']);
  });

  it('de-duplicates repeated paths', () => {
    expect(collectPaths(expr('$a + $b + $a'))).toEqual(['a', 'b']);
  });

  it('descends into calls, ternaries and arrays', () => {
    expect(collectPaths(expr('$flag ? $a : $b'))).toEqual(['flag', 'a', 'b']);
    expect(collectPaths(expr('sum($items[*].price)'))).toEqual([
      'items[*].price',
    ]);
    expect(collectPaths(expr('[$a, $b]'))).toEqual(['a', 'b']);
  });

  it('ignores literals', () => {
    expect(collectPaths(expr('1 + 2'))).toEqual([]);
  });
});

describe('classifyExpression', () => {
  it('uses the outermost format helper', () => {
    expect(
      classifyExpression(expr('formatCurrency(sum($lines[*].amount))'))
    ).toEqual({ category: 'format', detail: 'currency' });
  });

  it('reports aggregate when no outer format helper wraps it', () => {
    expect(classifyExpression(expr('sum($lines[*].amount)'))).toEqual({
      category: 'aggregate',
    });
  });

  it('reports system helpers', () => {
    expect(classifyExpression(expr('now()'))).toEqual({
      category: 'system',
      detail: 'clock',
    });
  });

  it('reports arithmetic as calculated', () => {
    expect(
      classifyExpression(expr('($current - $previous) / $previous'))
    ).toEqual({ category: 'calculated' });
  });

  it('reports a bare path as none', () => {
    expect(classifyExpression(expr('$order.total'))).toEqual({
      category: 'none',
    });
  });

  it('does not treat a comparison as calculated', () => {
    expect(classifyExpression(expr('$count > 0')).category).toBe('none');
  });

  it('honours a caller-supplied op for a custom helper', () => {
    expect(
      classifyExpression(expr('vwap($lines[*].price)'), {
        vwap: { category: 'aggregate', detail: 'vwap' },
      })
    ).toEqual({ category: 'aggregate', detail: 'vwap' });
  });
});

describe('describeExpression', () => {
  it('humanises nested helper calls', () => {
    expect(
      describeExpression(expr('formatCurrency(sum($order.lines[*].amount))'))
    ).toBe('format currency of sum of order.lines[*].amount');
  });

  it('renders arithmetic infix', () => {
    expect(describeExpression(expr('$subtotal + $tax'))).toBe('subtotal + tax');
  });

  it('keeps brackets around nested operations', () => {
    expect(
      describeExpression(expr('sum($lines[*].amount) * (1 + $taxRate)'))
    ).toBe('sum of lines[*].amount * (1 + taxRate)');
  });

  it('brackets operations once a call takes several arguments', () => {
    expect(describeExpression(expr('max($a + $b, $c)'))).toBe(
      'max of (a + b), c'
    );
  });

  it('resolves paths through aliases so notes agree with rd-source', () => {
    const aliases = new Map([['amount', ['invoice.lines[*].amount']]]);
    expect(describeExpression(expr('formatCurrency($amount)'), aliases)).toBe(
      'format currency of invoice.lines[*].amount'
    );
  });
});

describe('resolvePath', () => {
  it('returns the path unchanged when there are no aliases', () => {
    expect(resolvePath('subtotal', undefined)).toEqual(['subtotal']);
  });

  it('substitutes the leading segment from the alias map', () => {
    const aliases = new Map([['subtotal', ['order.subtotal']]]);
    expect(resolvePath('subtotal', aliases)).toEqual(['order.subtotal']);
  });

  it('keeps trailing segments when rewriting', () => {
    const aliases = new Map([['cust', ['order.customer']]]);
    expect(resolvePath('cust.name', aliases)).toEqual(['order.customer.name']);
  });

  it('fans out when a prop was fed by several paths', () => {
    const aliases = new Map([['total', ['order.subtotal', 'order.tax']]]);
    expect(resolvePath('total', aliases)).toEqual([
      'order.subtotal',
      'order.tax',
    ]);
  });

  it('leaves unaliased local names alone', () => {
    const aliases = new Map([['other', ['order.x']]]);
    expect(resolvePath('local.value', aliases)).toEqual(['local.value']);
  });
});

describe('wire format', () => {
  it('joins expressions with ";" and paths with ","', () => {
    const exprs = [
      buildSourceExpression(expr('$order.subtotal')),
      buildSourceExpression(expr('$order.tax')),
      buildSourceExpression(expr('$order.subtotal + $order.tax')),
    ];
    expect(formatSourceValue(exprs)).toBe(
      'order.subtotal;order.tax;order.subtotal,order.tax'
    );
    expect(formatSourceOpValue(exprs)).toBe('none;none;calculated');
  });

  it('renders an op with its detail', () => {
    expect(formatSourceOp({ category: 'format', detail: 'currency' })).toBe(
      'format:currency'
    );
    expect(formatSourceOp({ category: 'aggregate' })).toBe('aggregate');
  });
});

describe('loopAliases', () => {
  it('binds the item variable to the array pattern by default', () => {
    const aliases = loopAliases(expr('invoice.lines'), 'line', 'of');
    expect(aliases?.get('line')).toEqual(['invoice.lines[*]']);
  });

  it('binds the item variable to a concrete index when one is given', () => {
    const aliases = loopAliases(
      expr('invoice.lines'),
      'line',
      'of',
      undefined,
      7
    );
    expect(aliases?.get('line')).toEqual(['invoice.lines[7]']);
  });

  it('accepts index 0 - a falsy index is still an index', () => {
    const aliases = loopAliases(expr('rows'), 'r', 'of', undefined, 0);
    expect(aliases?.get('r')).toEqual(['rows[0]']);
  });

  it('composes an index onto an already-indexed caller alias', () => {
    const outer = loopAliases(
      expr('invoice.lines'),
      'line',
      'of',
      undefined,
      2
    );
    const inner = loopAliases(expr('line.taxes'), 'tax', 'of', outer, 1);
    expect(inner?.get('tax')).toEqual(['invoice.lines[2].taxes[1]']);
  });

  it('ignores the index for key iteration - the variable is a key', () => {
    const aliases = loopAliases(expr('totals'), 'k', 'in', undefined, 3);
    expect(aliases?.get('k')).toEqual(['totals']);
  });

  it('leaves a computed iterable unaliased', () => {
    const aliases = loopAliases(expr('reverse(rows)'), 'r', 'of', undefined, 1);
    expect(aliases).toBeUndefined();
  });
});

describe('function expressions', () => {
  // `FunctionExpr` joined `ExprAst` when `@let` arrows became callable, so every
  // structural walk here has to descend into a function body. Falling through to
  // `default` made a `@let` function contribute no paths, no op and no note.
  function arrow(body: string): ExprAst {
    return {
      kind: 'function',
      params: ['a'],
      body: expr(body),
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    };
  }

  it('collects the paths its body reads', () => {
    expect(collectPaths(arrow('$a * $rate'))).toEqual(['a', 'rate']);
  });

  it('classifies the arithmetic in its body', () => {
    expect(classifyExpression(arrow('$a * $rate')).category).toBe('calculated');
  });

  it('describes itself as the function it is', () => {
    expect(describeExpression(arrow('$a'))).toBe('(a) => a');
  });
});
