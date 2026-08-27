import { describe, it, expect } from 'vitest';
import { ExpressionParser } from '../../src/parser/expression-parser.js';
import { parseExpression, parseTemplate } from '../../src/parser/index.js';
import { walkExpressions } from '../../src/ast/visitor.js';
import type {
  ArrayWildcardNode,
  BinaryNode,
  CallNode,
  ExprAst,
  LiteralNode,
  MemberAccessNode,
  PathNode,
  TernaryNode,
  UnaryNode,
} from '../../src/ast/types.js';

function parse(source: string) {
  return new ExpressionParser(source).parse();
}

function parseOk(source: string): ExprAst {
  const result = parse(source);
  expect(
    result.errors,
    `unexpected errors for ${JSON.stringify(source)}`
  ).toEqual([]);
  if (!result.value) throw new Error(`no value for ${source}`);
  return result.value;
}

function stripLocations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLocations);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'location') continue;
      out[key] = stripLocations(entry);
    }
    return out;
  }
  return value;
}

// ===========================================================================
// Finding 1 - the public API never throws
// ===========================================================================

describe('ExpressionParser - never throws', () => {
  it('returns errors for an unterminated string', () => {
    const result = parse('"abc');
    expect(result.value).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toMatch(/unterminated/i);
  });

  it('does not tokenize in the constructor', () => {
    expect(() => new ExpressionParser('"abc')).not.toThrow();
  });

  it('merges tokenizer errors into the parse result', () => {
    const result = parse('$a & $b');
    expect(result.errors.some(e => e.message.includes('&'))).toBe(true);
  });

  it('can be parsed twice with the same result', () => {
    const parser = new ExpressionParser('$a + 1');
    const first = parser.parse();
    const second = parser.parse();
    expect(second.errors).toEqual(first.errors);
    expect(stripLocations(second.value)).toEqual(stripLocations(first.value));
  });

  it('parseExpression() returns a null value instead of throwing', () => {
    const result = parseExpression('${"abc}');
    expect(result.value).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('parseTemplate() honours its {nodes, errors} contract', () => {
    expect(() => parseTemplate('${"abc}')).not.toThrow();
    const result = parseTemplate('${"abc}');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('ExpressionParser - fuzz', () => {
  const corpus = [
    '$order.items[*].price',
    '$user.name ?? "anonymous"',
    'sum($order.items[*].total) * 1.2',
    '$a ? $b.c : ($d || "x\\n")',
    'map($items, (item, index) => item.price + index)',
    '$.global.value == 42 && !$flag',
    '[1, 2, 3][0]',
    'format($date, "yyyy-MM-dd")',
    '$data["odd key"].value',
    '(($a + $b) * ($c - $d)) / $e',
  ];

  it('never throws for any prefix of a realistic expression', () => {
    for (const source of corpus) {
      for (let i = 0; i <= source.length; i++) {
        const slice = source.slice(0, i);
        expect(
          () => new ExpressionParser(slice).parse(),
          `threw for prefix ${JSON.stringify(slice)}`
        ).not.toThrow();
        expect(
          () => parseExpression(slice),
          `parseExpression threw for ${JSON.stringify(slice)}`
        ).not.toThrow();
      }
    }
  });

  it('never throws for random substrings and mutations', () => {
    let seed = 0x2f6e2b1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const noise = '${}()[]".\\\'&|?:,+-*/%<>=!~@#`\n\t ';
    for (let n = 0; n < 2000; n++) {
      const source = corpus[Math.floor(random() * corpus.length)] as string;
      const start = Math.floor(random() * source.length);
      const end = start + Math.floor(random() * (source.length - start));
      let slice = source.slice(start, end);
      const mutations = Math.floor(random() * 3);
      for (let m = 0; m < mutations; m++) {
        const at = Math.floor(random() * (slice.length + 1));
        const char = noise[Math.floor(random() * noise.length)] as string;
        slice = slice.slice(0, at) + char + slice.slice(at);
      }
      expect(
        () => new ExpressionParser(slice).parse(),
        `threw for ${JSON.stringify(slice)}`
      ).not.toThrow();
    }
  });
});

// ===========================================================================
// Finding 3 - caps must not reject valid input
// ===========================================================================

describe('ExpressionParser - limits', () => {
  it('parses a long chain of left-associative operators', () => {
    const source = Array.from({ length: 64 }, () => '1').join(' + ');
    const result = parse(source);
    expect(result.errors).toEqual([]);
    expect(result.value?.kind).toBe('binary');
  });

  it('parses an expression source longer than 1000 characters', () => {
    const source = '1 + '.repeat(300) + '1';
    const result = parse(source);
    expect(result.errors).toEqual([]);
    expect(result.value).not.toBeNull();
  });

  it('parses a chain of 200 member accesses', () => {
    const source = '$a' + '.b'.repeat(200);
    const result = parse(source);
    expect(result.errors).toEqual([]);
  });

  it('still guards genuine nesting depth, as an error not a throw', () => {
    const source = '('.repeat(200) + '1' + ')'.repeat(200);
    const result = parse(source);
    expect(result.value).toBeNull();
    expect(result.errors[0]?.message).toMatch(/depth/i);
  });

  it('honours a configured maxExpressionDepth', () => {
    const source = '((((1))))';
    const shallow = new ExpressionParser(source, {
      maxExpressionDepth: 2,
    }).parse();
    expect(shallow.value).toBeNull();
    expect(shallow.errors[0]?.message).toMatch(/depth/i);

    const deep = new ExpressionParser(source, {
      maxExpressionDepth: 32,
    }).parse();
    expect(deep.errors).toEqual([]);
  });
});

// ===========================================================================
// Finding 4 - data fields named after template keywords
// ===========================================================================

describe('ExpressionParser - keyword-named fields', () => {
  const keywords = ['if', 'else', 'for', 'of', 'match', 'when', 'let', 'props'];

  it('parses keyword-named properties', () => {
    for (const keyword of keywords) {
      const result = parse(`$data.${keyword}`);
      expect(result.errors, keyword).toEqual([]);
      expect((result.value as PathNode).segments[1]).toEqual({
        kind: 'key',
        key: keyword,
      });
    }
  });

  it('parses keyword-named roots', () => {
    for (const keyword of keywords) {
      const result = parse(`$${keyword}.value`);
      expect(result.errors, keyword).toEqual([]);
      expect((result.value as PathNode).segments[0]).toEqual({
        kind: 'key',
        key: keyword,
      });
    }
  });

  it('parses literal-named properties after a dot', () => {
    for (const keyword of ['true', 'false', 'null']) {
      const result = parse(`$data.${keyword}`);
      expect(result.errors, keyword).toEqual([]);
      expect((result.value as PathNode).segments[1]).toEqual({
        kind: 'key',
        key: keyword,
      });
    }
  });

  it('still parses the literals themselves', () => {
    expect((parseOk('true') as LiteralNode).value).toBe(true);
    expect((parseOk('false') as LiteralNode).value).toBe(false);
    expect((parseOk('null') as LiteralNode).value).toBeNull();
  });

  it('accepts string keys in brackets', () => {
    const path = parseOk('$data["odd key"]') as PathNode;
    expect(path.segments).toEqual([
      { kind: 'key', key: 'data' },
      { kind: 'key', key: 'odd key' },
    ]);
  });

  it('accepts string keys with escapes and unicode', () => {
    const path = parseOk('$data["a\\"b"]["ключ"]') as PathNode;
    expect(path.segments[1]).toEqual({ kind: 'key', key: 'a"b' });
    expect(path.segments[2]).toEqual({ kind: 'key', key: 'ключ' });
  });

  it('accepts string keys in member access on a call result', () => {
    const member = parseOk('first($items)["odd key"]') as MemberAccessNode;
    expect(member.kind).toBe('member');
    expect(member.path).toEqual([{ kind: 'key', key: 'odd key' }]);
  });

  it('still supports index and wildcard access', () => {
    const wildcard = parseOk('$items[*].name') as ArrayWildcardNode;
    expect(wildcard.kind).toBe('wildcard');
    const indexed = parseOk('$items[2]') as PathNode;
    expect(indexed.segments[1]).toEqual({ kind: 'index', index: 2 });
  });

  it('reports a bad bracket subscript as an error', () => {
    const result = parse('$items[true]');
    expect(result.value).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Finding 5 - real string escapes
// ===========================================================================

describe('ExpressionParser - string literals', () => {
  it('decodes escape sequences', () => {
    expect((parseOk('"a\\nb"') as LiteralNode).value).toBe('a\nb');
    expect((parseOk('"a\\tb"') as LiteralNode).value).toBe('a\tb');
    expect((parseOk('"a\\\\b"') as LiteralNode).value).toBe('a\\b');
    expect((parseOk('"a\\"b"') as LiteralNode).value).toBe('a"b');
    expect((parseOk("'a\\'b'") as LiteralNode).value).toBe("a'b");
    expect((parseOk('"\\u00e9"') as LiteralNode).value).toBe('é');
  });

  it('reports unknown escapes with a position inside the literal', () => {
    const result = parse('"a\\qb"');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.offset).toBe(2);
    expect(result.value).not.toBeNull();
  });
});

// ===========================================================================
// Findings 6, 7, 8 - locations
// ===========================================================================

describe('ExpressionParser - locations', () => {
  it('spans a binary node from its left operand to its right operand', () => {
    const source = '1 + 2 * 3';
    const root = parseOk(source) as BinaryNode;
    expect(root.operator).toBe('+');
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
    const right = root.right as BinaryNode;
    expect(
      source.slice(right.location.start.offset, right.location.end.offset)
    ).toBe('2 * 3');
  });

  it('spans a ternary from condition to falsy branch', () => {
    const source = '$a ? "y" : "n"';
    const root = parseOk(source) as TernaryNode;
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
  });

  it('spans a unary node from the operator to the operand', () => {
    const source = '!$flag';
    const root = parseOk(source) as UnaryNode;
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
  });

  it('spans a call from the callee to the closing paren', () => {
    const source = 'sum($a, $b)';
    const root = parseOk(source) as CallNode;
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
  });

  it('spans a path across all of its segments', () => {
    const source = '$order.items[0].name';
    const root = parseOk(source) as PathNode;
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
  });

  it('spans a member access to the last segment', () => {
    const source = 'first($items).name';
    const root = parseOk(source) as MemberAccessNode;
    expect(root.location.start.offset).toBe(0);
    expect(root.location.end.offset).toBe(source.length);
  });

  it('round-trips every expression node to its own source text', () => {
    const sources = [
      '1 + 2 * 3',
      '$a ? $b : $c',
      '!$flag && $other',
      'sum($order.items[*].price) * 1.2',
      '$order.items[0].name',
      '(a || b).length',
      '[1, 2, $x.y]',
      '-$value + 3',
      'format($date, "yyyy\\nMM")',
      'first($items)["odd key"]',
      '$a ?? $b ?? $c',
    ];

    for (const source of sources) {
      const root = parseOk(source);
      const check = (node: ExprAst): void => {
        const slice = source.slice(
          node.location.start.offset,
          node.location.end.offset
        );
        const reparsed = new ExpressionParser(slice).parse();
        expect(
          reparsed.errors,
          `slice ${JSON.stringify(slice)} of ${JSON.stringify(source)}`
        ).toEqual([]);
        expect(
          stripLocations(reparsed.value),
          `slice ${JSON.stringify(slice)} of ${JSON.stringify(source)}`
        ).toEqual(stripLocations(node));
      };
      walkExpressions(root, node => {
        check(node);
        // A wildcard and the path it wraps share their source range, so the
        // inner path re-parses to the wildcard - stop before it.
        if (node.kind === 'wildcard') return false;
        return undefined;
      });
    }
  });

  it('reports absolute locations when given a base position', () => {
    const template = '<div class={$a.b}>x</div>';
    const start = template.indexOf('$a.b');
    const parser = new ExpressionParser('$a.b', {
      basePosition: { line: 1, column: start + 1, offset: start },
    });
    const result = parser.parse();
    expect(result.errors).toEqual([]);
    const path = result.value as PathNode;
    expect(path.location.start).toEqual({
      line: 1,
      column: start + 1,
      offset: start,
    });
    expect(
      template.slice(path.location.start.offset, path.location.end.offset)
    ).toBe('$a.b');
  });

  it('reports absolute error positions when given a base position', () => {
    const parser = new ExpressionParser('$a ~ $b', {
      basePosition: { line: 7, column: 3, offset: 200 },
    });
    const result = parser.parse();
    expect(result.errors[0]?.line).toBe(7);
    expect(result.errors[0]?.offset).toBe(203);
  });

  it('rebases positions across lines in the sliced expression', () => {
    const parser = new ExpressionParser('$a +\n$b', {
      basePosition: { line: 4, column: 10, offset: 100 },
    });
    const result = parser.parse();
    expect(result.errors).toEqual([]);
    const root = result.value as BinaryNode;
    expect(root.location.end).toEqual({ line: 5, column: 3, offset: 107 });
  });
});

// ===========================================================================
// Regression - the expression grammar still works end to end
// ===========================================================================

describe('ExpressionParser - grammar regression', () => {
  it('parses arrow functions', () => {
    const result = parse('map($items, (item, i) => item.price + i)');
    expect(result.errors).toEqual([]);
  });

  it('parses global paths', () => {
    const path = parseOk('$.settings.locale') as PathNode;
    expect(path.isGlobal).toBe(true);
  });

  it('parses the match wildcard', () => {
    const path = parseOk('_') as PathNode;
    expect(path.segments).toEqual([{ kind: 'key', key: '_' }]);
  });

  it('parses array literals', () => {
    expect(parseOk('[1, "two", $three]').kind).toBe('array');
  });

  it('parses comparisons written with angle brackets', () => {
    expect((parseOk('$a < $b') as BinaryNode).operator).toBe('<');
    expect((parseOk('$a > $b') as BinaryNode).operator).toBe('>');
  });
});
