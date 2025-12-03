// @bladets/tempo - Evaluator tests
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateSafe,
  valueToString,
  defaultErrorHandler,
} from '../src/evaluator.js';
import type { Scope, ExprAst, SourceLocation } from '@bladets/template';

// Helper to create a dummy source location
const dummyLocation: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 10 },
};

describe('evaluator', () => {
  describe('valueToString', () => {
    it('should convert strings directly', () => {
      expect(valueToString('hello')).toBe('hello');
    });

    it('should convert numbers to strings', () => {
      expect(valueToString(42)).toBe('42');
      expect(valueToString(3.14)).toBe('3.14');
    });

    it('should convert booleans to strings', () => {
      expect(valueToString(true)).toBe('true');
      expect(valueToString(false)).toBe('false');
    });

    it('should return empty string for null', () => {
      expect(valueToString(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(valueToString(undefined)).toBe('');
    });

    it('should convert objects using String()', () => {
      expect(valueToString({ a: 1 })).toBe('[object Object]');
    });

    it('should convert arrays using String()', () => {
      expect(valueToString([1, 2, 3])).toBe('1,2,3');
    });
  });

  describe('evaluateSafe', () => {
    const baseScope: Scope = {
      locals: {},
      data: { name: 'World', count: 42 },
      globals: { siteName: 'Test Site' },
    };

    it('should evaluate literal expressions', () => {
      const literalExpr: ExprAst = {
        kind: 'literal',
        type: 'string',
        value: 'hello',
        location: dummyLocation,
      };
      const result = evaluateSafe(
        literalExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe('hello');
    });

    it('should evaluate number literals', () => {
      const literalExpr: ExprAst = {
        kind: 'literal',
        type: 'number',
        value: 42,
        location: dummyLocation,
      };
      const result = evaluateSafe(
        literalExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe(42);
    });

    it('should evaluate path expressions', () => {
      const pathExpr: ExprAst = {
        kind: 'path',
        segments: [{ kind: 'key', key: 'name' }],
        isGlobal: false,
        location: dummyLocation,
      };
      const result = evaluateSafe(
        pathExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe('World');
    });

    it('should evaluate global path expressions', () => {
      const globalExpr: ExprAst = {
        kind: 'path',
        segments: [{ kind: 'key', key: 'siteName' }],
        isGlobal: true,
        location: dummyLocation,
      };
      const result = evaluateSafe(
        globalExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe('Test Site');
    });

    it('should evaluate binary addition', () => {
      const addExpr: ExprAst = {
        kind: 'binary',
        operator: '+',
        left: {
          kind: 'literal',
          type: 'number',
          value: 1,
          location: dummyLocation,
        },
        right: {
          kind: 'literal',
          type: 'number',
          value: 2,
          location: dummyLocation,
        },
        location: dummyLocation,
      };
      const result = evaluateSafe(
        addExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe(3);
    });

    it('should evaluate ternary expressions', () => {
      const ternaryExpr: ExprAst = {
        kind: 'ternary',
        condition: {
          kind: 'literal',
          type: 'boolean',
          value: true,
          location: dummyLocation,
        },
        truthy: {
          kind: 'literal',
          type: 'string',
          value: 'yes',
          location: dummyLocation,
        },
        falsy: {
          kind: 'literal',
          type: 'string',
          value: 'no',
          location: dummyLocation,
        },
        location: dummyLocation,
      };
      const result = evaluateSafe(
        ternaryExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe('yes');
    });

    it('should handle errors gracefully and return empty string', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const badExpr: ExprAst = {
        kind: 'call',
        callee: 'nonexistent',
        args: [],
        location: dummyLocation,
      };
      const result = evaluateSafe(
        badExpr,
        baseScope.data,
        baseScope,
        {},
        defaultErrorHandler
      );
      expect(result).toBe('');

      warnSpy.mockRestore();
    });

    it('should call helper functions', () => {
      const callExpr: ExprAst = {
        kind: 'call',
        callee: 'double',
        args: [
          {
            kind: 'literal',
            type: 'number',
            value: 5,
            location: dummyLocation,
          },
        ],
        location: dummyLocation,
      };
      // HelperFunction is curried: (scope, setWarning) => (...args) => result
      const helpers = {
        double: () => (n: number) => n * 2,
      };
      const result = evaluateSafe(
        callExpr,
        baseScope.data,
        baseScope,
        helpers,
        defaultErrorHandler
      );
      expect(result).toBe(10);
    });
  });
});
