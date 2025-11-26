import { describe, it, expect } from 'vitest';
import {
  evaluate,
  EvaluationError,
  type Scope,
  type EvaluationContext,
  type HelperFunction,
  type EvaluatorConfig,
} from '../src/evaluator/index.js';
import type {
  ExprAst,
  LiteralNode,
  PathNode,
  UnaryNode,
  BinaryNode,
  TernaryNode,
  CallNode,
  ArrayWildcardNode,
  SourceLocation,
} from '../src/ast/types.js';

// =============================================================================
// Test Utilities
// =============================================================================

const dummyLocation: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

const defaultConfig: EvaluatorConfig = {
  maxFunctionDepth: 10,
  maxRecursionDepth: 50,
};

function createContext(
  scope: Partial<Scope> = {},
  helpers: Record<string, HelperFunction> = {}
): EvaluationContext {
  return {
    scope: {
      locals: scope.locals ?? {},
      data: scope.data ?? {},
      globals: scope.globals ?? {},
    },
    helpers,
    config: defaultConfig,
  };
}

function literal(value: string | number | boolean | null): LiteralNode {
  const type =
    value === null
      ? 'nil'
      : typeof value === 'string'
        ? 'string'
        : typeof value === 'number'
          ? 'number'
          : 'boolean';
  return { kind: 'literal', type, value, location: dummyLocation };
}

function path(segments: string[], isGlobal = false): PathNode {
  return {
    kind: 'path',
    segments: segments.map(s => ({ kind: 'key' as const, key: s })),
    isGlobal,
    location: dummyLocation,
  };
}

function indexPath(base: string, index: number, ...rest: string[]): PathNode {
  return {
    kind: 'path',
    segments: [
      { kind: 'key' as const, key: base },
      { kind: 'index' as const, index },
      ...rest.map(s => ({ kind: 'key' as const, key: s })),
    ],
    isGlobal: false,
    location: dummyLocation,
  };
}

function unary(operator: '!' | '-', operand: ExprAst): UnaryNode {
  return { kind: 'unary', operator, operand, location: dummyLocation };
}

function binary(
  operator: BinaryNode['operator'],
  left: ExprAst,
  right: ExprAst
): BinaryNode {
  return { kind: 'binary', operator, left, right, location: dummyLocation };
}

function ternary(
  condition: ExprAst,
  truthy: ExprAst,
  falsy: ExprAst
): TernaryNode {
  return { kind: 'ternary', condition, truthy, falsy, location: dummyLocation };
}

function call(callee: string, args: ExprAst[]): CallNode {
  return { kind: 'call', callee, args, location: dummyLocation };
}

function wildcard(segments: string[]): ArrayWildcardNode {
  const pathSegments = segments.flatMap(s =>
    s === '*' ? [{ kind: 'star' as const }] : [{ kind: 'key' as const, key: s }]
  );
  return {
    kind: 'wildcard',
    path: {
      kind: 'path',
      segments: pathSegments,
      isGlobal: false,
      location: dummyLocation,
    },
    location: dummyLocation,
  };
}

// =============================================================================
// Phase 3: User Story 1 - Evaluate Simple Data Access (P1) 🎯 MVP
// =============================================================================

describe('US1: Simple Data Access', () => {
  describe('T008: Literal evaluation', () => {
    it('evaluates string literals', () => {
      const ctx = createContext();
      expect(evaluate(literal('hello'), ctx)).toBe('hello');
    });

    it('evaluates number literals', () => {
      const ctx = createContext();
      expect(evaluate(literal(42), ctx)).toBe(42);
      expect(evaluate(literal(3.14), ctx)).toBe(3.14);
    });

    it('evaluates boolean literals', () => {
      const ctx = createContext();
      expect(evaluate(literal(true), ctx)).toBe(true);
      expect(evaluate(literal(false), ctx)).toBe(false);
    });

    it('evaluates null literals', () => {
      const ctx = createContext();
      expect(evaluate(literal(null), ctx)).toBe(null);
    });
  });

  describe('T009: Simple path access', () => {
    it('accesses nested data properties', () => {
      const ctx = createContext({
        data: { user: { name: 'Alice' } },
      });
      expect(evaluate(path(['user', 'name']), ctx)).toBe('Alice');
    });

    it('accesses order total', () => {
      const ctx = createContext({
        data: { order: { total: 99.99 } },
      });
      expect(evaluate(path(['order', 'total']), ctx)).toBe(99.99);
    });
  });

  describe('T010: Array index access', () => {
    it('accesses array elements by index', () => {
      const ctx = createContext({
        data: { items: [{ name: 'A' }, { name: 'B' }] },
      });
      expect(evaluate(indexPath('items', 0, 'name'), ctx)).toBe('A');
      expect(evaluate(indexPath('items', 1, 'name'), ctx)).toBe('B');
    });
  });

  describe('T011: Implicit optional chaining', () => {
    it('returns undefined for null intermediate values', () => {
      const ctx = createContext({
        data: { user: null },
      });
      expect(evaluate(path(['user', 'name']), ctx)).toBe(undefined);
    });

    it('returns undefined for missing paths', () => {
      const ctx = createContext({
        data: {},
      });
      expect(evaluate(path(['missing', 'path']), ctx)).toBe(undefined);
    });

    it('does not throw for undefined intermediate values', () => {
      const ctx = createContext({
        data: { user: undefined },
      });
      expect(() =>
        evaluate(path(['user', 'profile', 'name']), ctx)
      ).not.toThrow();
      expect(evaluate(path(['user', 'profile', 'name']), ctx)).toBe(undefined);
    });
  });
});

// =============================================================================
// Phase 4: User Story 2 - Arithmetic and Comparison Expressions (P2)
// =============================================================================

describe('US2: Arithmetic and Comparison', () => {
  describe('T016: Arithmetic operators', () => {
    it('evaluates addition', () => {
      const ctx = createContext({ locals: { a: 10, b: 3 } });
      expect(evaluate(binary('+', path(['a']), path(['b'])), ctx)).toBe(13);
    });

    it('evaluates subtraction', () => {
      const ctx = createContext({ locals: { a: 10, b: 3 } });
      expect(evaluate(binary('-', path(['a']), path(['b'])), ctx)).toBe(7);
    });

    it('evaluates multiplication', () => {
      const ctx = createContext({ locals: { a: 10, b: 3 } });
      expect(evaluate(binary('*', path(['a']), path(['b'])), ctx)).toBe(30);
    });

    it('evaluates division', () => {
      const ctx = createContext({ locals: { a: 10, b: 3 } });
      expect(evaluate(binary('/', path(['a']), path(['b'])), ctx)).toBeCloseTo(
        3.33,
        2
      );
    });

    it('evaluates modulo', () => {
      const ctx = createContext({ locals: { a: 10, b: 3 } });
      expect(evaluate(binary('%', path(['a']), path(['b'])), ctx)).toBe(1);
    });
  });

  describe('T017: Comparison operators', () => {
    it('evaluates greater than', () => {
      const ctx = createContext({ locals: { a: 10, b: 5 } });
      expect(evaluate(binary('>', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('evaluates equality', () => {
      const ctx = createContext({ locals: { a: 10, b: 10 } });
      expect(evaluate(binary('==', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('evaluates inequality', () => {
      const ctx = createContext({ locals: { a: 10, b: 5 } });
      expect(evaluate(binary('!=', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('evaluates less than', () => {
      const ctx = createContext({ locals: { a: 5, b: 10 } });
      expect(evaluate(binary('<', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('evaluates less than or equal', () => {
      const ctx = createContext({ locals: { a: 10, b: 10 } });
      expect(evaluate(binary('<=', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('evaluates greater than or equal', () => {
      const ctx = createContext({ locals: { a: 10, b: 10 } });
      expect(evaluate(binary('>=', path(['a']), path(['b'])), ctx)).toBe(true);
    });
  });

  describe('T018: Logical operators', () => {
    it('evaluates logical AND', () => {
      const ctx = createContext({ locals: { a: true, b: false } });
      expect(evaluate(binary('&&', path(['a']), path(['b'])), ctx)).toBe(false);
    });

    it('evaluates logical OR', () => {
      const ctx = createContext({ locals: { a: true, b: false } });
      expect(evaluate(binary('||', path(['a']), path(['b'])), ctx)).toBe(true);
    });

    it('short-circuits AND on falsy left', () => {
      const ctx = createContext({ locals: { a: false } });
      // If short-circuiting works, accessing missing.path won't throw
      expect(
        evaluate(binary('&&', path(['a']), path(['missing', 'path'])), ctx)
      ).toBe(false);
    });

    it('short-circuits OR on truthy left', () => {
      const ctx = createContext({ locals: { a: true } });
      expect(
        evaluate(binary('||', path(['a']), path(['missing', 'path'])), ctx)
      ).toBe(true);
    });
  });

  describe('T019: Unary operators', () => {
    it('evaluates logical NOT', () => {
      const ctx = createContext({ locals: { a: true } });
      expect(evaluate(unary('!', path(['a'])), ctx)).toBe(false);
      expect(evaluate(unary('!', literal(false)), ctx)).toBe(true);
    });

    it('evaluates numeric negation', () => {
      const ctx = createContext({ locals: { a: 5 } });
      expect(evaluate(unary('-', path(['a'])), ctx)).toBe(-5);
      expect(evaluate(unary('-', literal(10)), ctx)).toBe(-10);
    });
  });

  describe('T020: Type coercion', () => {
    it('coerces to string when adding string', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal('hello '), literal(42)), ctx)).toBe(
        'hello 42'
      );
      expect(evaluate(binary('+', literal(42), literal(' world')), ctx)).toBe(
        '42 world'
      );
    });

    it('coerces boolean to number in arithmetic', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal(5), literal(true)), ctx)).toBe(6);
    });

    it('coerces null to 0 in arithmetic', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal(5), literal(null)), ctx)).toBe(5);
    });
  });
});

// =============================================================================
// Phase 5: User Story 3 - Helper Function Calls (P3)
// =============================================================================

describe('US3: Helper Functions', () => {
  describe('T027: Helper currying with scope', () => {
    it('curries helper with scope access', () => {
      const formatCurrency: HelperFunction =
        (scope, _setWarning) => (value: unknown) => {
          const currency = scope.globals.currency ?? 'USD';
          return `${currency}${value}`;
        };
      const ctx = createContext(
        { globals: { currency: 'EUR' } },
        { formatCurrency }
      );
      expect(evaluate(call('formatCurrency', [literal(100)]), ctx)).toBe(
        'EUR100'
      );
    });
  });

  describe('T028: Helper with multiple arguments', () => {
    it('passes multiple arguments to helper', () => {
      const add: HelperFunction =
        (_scope, _setWarning) => (a: unknown, b: unknown) => {
          return (a as number) + (b as number);
        };
      const ctx = createContext({}, { add });
      expect(evaluate(call('add', [literal(10), literal(20)]), ctx)).toBe(30);
    });

    it('evaluates sum helper with array argument', () => {
      const sum: HelperFunction = (_scope, _setWarning) => (arr: unknown) => {
        if (!Array.isArray(arr)) return 0;
        return arr.reduce((a: number, b: number) => a + b, 0);
      };
      const ctx = createContext({ data: { numbers: [1, 2, 3] } }, { sum });
      // Test with wildcard to get array
      expect(evaluate(call('sum', [wildcard(['numbers', '*'])]), ctx)).toBe(6);
    });
  });

  describe('T029: Unknown helper error', () => {
    it('throws EvaluationError for unknown helper', () => {
      const ctx = createContext();
      expect(() => evaluate(call('unknownFn', [literal(5)]), ctx)).toThrow(
        EvaluationError
      );
      expect(() => evaluate(call('unknownFn', [literal(5)]), ctx)).toThrow(
        /unknownFn/
      );
    });
  });

  describe('T030: Helper error propagation', () => {
    it('propagates errors thrown by helpers', () => {
      const throwing: HelperFunction = (_scope, _setWarning) => () => {
        throw new Error('Helper error');
      };
      const ctx = createContext({}, { throwing });
      expect(() => evaluate(call('throwing', []), ctx)).toThrow('Helper error');
    });
  });
});

// =============================================================================
// Phase 6: User Story 4 - Array Wildcard Expressions (P4)
// =============================================================================

describe('US4: Array Wildcards', () => {
  describe('T036: Single wildcard extraction', () => {
    it('extracts property from all array elements', () => {
      const ctx = createContext({
        data: { items: [{ price: 10 }, { price: 20 }] },
      });
      expect(evaluate(wildcard(['items', '*', 'price']), ctx)).toEqual([
        10, 20,
      ]);
    });
  });

  describe('T037: Nested wildcard flattening', () => {
    it('flattens nested wildcards', () => {
      const ctx = createContext({
        data: {
          depts: [
            { employees: [{ salary: 50 }, { salary: 60 }] },
            { employees: [{ salary: 70 }] },
          ],
        },
      });
      expect(
        evaluate(wildcard(['depts', '*', 'employees', '*', 'salary']), ctx)
      ).toEqual([50, 60, 70]);
    });
  });

  describe('T038: Empty array wildcard', () => {
    it('returns empty array for empty source', () => {
      const ctx = createContext({
        data: { items: [] },
      });
      expect(evaluate(wildcard(['items', '*', 'price']), ctx)).toEqual([]);
    });
  });
});

// =============================================================================
// Phase 7: User Story 5 - Conditional and Nullish Expressions (P5)
// =============================================================================

describe('US5: Conditionals', () => {
  describe('T043: Ternary with truthy condition', () => {
    it('returns truthy branch when condition is true', () => {
      const ctx = createContext({ locals: { condition: true } });
      expect(
        evaluate(
          ternary(path(['condition']), literal('yes'), literal('no')),
          ctx
        )
      ).toBe('yes');
    });
  });

  describe('T044: Ternary with falsy condition', () => {
    it('returns falsy branch when condition is false', () => {
      const ctx = createContext({ locals: { condition: false } });
      expect(
        evaluate(
          ternary(path(['condition']), literal('yes'), literal('no')),
          ctx
        )
      ).toBe('no');
    });
  });

  describe('T045: Nullish coalescing with null/undefined', () => {
    it('returns right for null', () => {
      const ctx = createContext({ locals: { value: null } });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe('default');
    });

    it('returns right for undefined', () => {
      const ctx = createContext({ locals: {} });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe('default');
    });

    it('returns left for actual non-null value', () => {
      const ctx = createContext({ locals: { value: 'actual' } });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe('actual');
    });
  });

  describe('T046: Nullish coalescing with falsy non-null values', () => {
    it('returns left for 0 (nullish, not falsy)', () => {
      const ctx = createContext({ locals: { value: 0 } });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe(0);
    });

    it('returns left for empty string', () => {
      const ctx = createContext({ locals: { value: '' } });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe('');
    });

    it('returns left for false', () => {
      const ctx = createContext({ locals: { value: false } });
      expect(
        evaluate(binary('??', path(['value']), literal('default')), ctx)
      ).toBe(false);
    });
  });
});

// =============================================================================
// Phase 8: User Story 6 - Scope Hierarchy (P6)
// =============================================================================

describe('US6: Scope Hierarchy', () => {
  describe('T051: Locals precedence', () => {
    it('resolves from locals first', () => {
      const ctx = createContext({
        locals: { x: 1 },
        data: { x: 2 },
        globals: { x: 3 },
      });
      expect(evaluate(path(['x']), ctx)).toBe(1);
    });
  });

  describe('T052: Data fallback', () => {
    it('resolves from data when not in locals', () => {
      const ctx = createContext({
        locals: {},
        data: { x: 2 },
        globals: { x: 3 },
      });
      expect(evaluate(path(['x']), ctx)).toBe(2);
    });
  });

  describe('T053: Global prefix access', () => {
    it('accesses globals with $.prefix', () => {
      const ctx = createContext({
        locals: { x: 1 },
        data: { x: 2 },
        globals: { x: 3 },
      });
      expect(evaluate(path(['x'], true), ctx)).toBe(3);
    });
  });

  describe('T054: Missing variable', () => {
    it('returns undefined for missing variables', () => {
      const ctx = createContext({
        locals: {},
        data: {},
        globals: {},
      });
      expect(evaluate(path(['missing']), ctx)).toBe(undefined);
    });
  });
});

// =============================================================================
// Phase 9: Polish - Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('T058: Division by zero', () => {
    it('returns Infinity for positive/zero (per JS semantics)', () => {
      const ctx = createContext();
      expect(evaluate(binary('/', literal(5), literal(0)), ctx)).toBe(Infinity);
    });

    it('returns -Infinity for negative/zero', () => {
      const ctx = createContext();
      expect(evaluate(binary('/', literal(-5), literal(0)), ctx)).toBe(
        -Infinity
      );
    });

    it('returns NaN for 0/0', () => {
      const ctx = createContext();
      expect(evaluate(binary('/', literal(0), literal(0)), ctx)).toBeNaN();
    });
  });

  describe('T059: Array index out of bounds', () => {
    it('returns undefined for out of bounds index', () => {
      const ctx = createContext({
        data: { items: [{ name: 'A' }] },
      });
      expect(evaluate(indexPath('items', 10, 'name'), ctx)).toBe(undefined);
    });
  });

  describe('T060: Type coercion edge cases', () => {
    it('coerces true + 5 to 6', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal(true), literal(5)), ctx)).toBe(6);
    });

    it('coerces "5" + 3 to "53"', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal('5'), literal(3)), ctx)).toBe('53');
    });

    it('coerces 5 + null to 5', () => {
      const ctx = createContext();
      expect(evaluate(binary('+', literal(5), literal(null)), ctx)).toBe(5);
    });

    it('produces NaN for 5 + undefined', () => {
      const ctx = createContext({ locals: {} });
      // Access an undefined variable
      expect(
        evaluate(binary('+', literal(5), path(['missing'])), ctx)
      ).toBeNaN();
    });
  });
});
