/**
 * Helper Functions Tests
 *
 * Tests for all standard library helper functions.
 */

import { describe, it, expect } from 'vitest';
import { standardLibrary } from '../src/helpers/index.js';
import type { Scope } from '../src/evaluator/index.js';

// Helper to create a mock scope
function createScope(globals: Record<string, unknown> = {}): Scope {
  return {
    variables: {},
    globals,
    helpers: standardLibrary,
  };
}

// Helper to create a warning collector
function createWarningCollector(): { warnings: string[]; setWarning: (msg: string) => void } {
  const warnings: string[] = [];
  return {
    warnings,
    setWarning: (msg: string) => warnings.push(msg),
  };
}

// Helper to invoke a helper function
function invokeHelper(
  name: keyof typeof standardLibrary,
  args: unknown[],
  globals: Record<string, unknown> = {}
): { result: unknown; warnings: string[] } {
  const scope = createScope(globals);
  const { warnings, setWarning } = createWarningCollector();
  const helper = standardLibrary[name];
  const fn = helper(scope, setWarning);
  const result = fn(...args);
  return { result, warnings };
}

describe('Polymorphic Helpers', () => {
  describe('len', () => {
    it('returns length of array', () => {
      const { result } = invokeHelper('len', [[1, 2, 3]]);
      expect(result).toBe(3);
    });

    it('returns length of string', () => {
      const { result } = invokeHelper('len', ['hello']);
      expect(result).toBe(5);
    });

    it('returns 0 for null', () => {
      const { result } = invokeHelper('len', [null]);
      expect(result).toBe(0);
    });

    it('returns 0 for undefined', () => {
      const { result } = invokeHelper('len', [undefined]);
      expect(result).toBe(0);
    });

    it('converts non-array/string to string and returns length', () => {
      const { result, warnings } = invokeHelper('len', [42]);
      expect(result).toBe(2); // "42".length
      expect(warnings.length).toBe(1);
    });
  });

  describe('reverse', () => {
    it('reverses array', () => {
      const { result } = invokeHelper('reverse', [[1, 2, 3]]);
      expect(result).toEqual([3, 2, 1]);
    });

    it('reverses string', () => {
      const { result } = invokeHelper('reverse', ['hello']);
      expect(result).toBe('olleh');
    });

    it('returns empty array for null', () => {
      const { result } = invokeHelper('reverse', [null]);
      expect(result).toEqual([]);
    });
  });

  describe('indexOf', () => {
    it('finds index in array', () => {
      const { result } = invokeHelper('indexOf', [[10, 20, 30], 20]);
      expect(result).toBe(1);
    });

    it('returns -1 for missing element in array', () => {
      const { result } = invokeHelper('indexOf', [[10, 20, 30], 40]);
      expect(result).toBe(-1);
    });

    it('finds index in string', () => {
      const { result } = invokeHelper('indexOf', ['hello', 'l']);
      expect(result).toBe(2);
    });

    it('returns -1 for missing substring', () => {
      const { result } = invokeHelper('indexOf', ['hello', 'x']);
      expect(result).toBe(-1);
    });
  });
});

describe('Array Helpers', () => {
  describe('slice', () => {
    it('slices array with start and end', () => {
      const { result } = invokeHelper('slice', [[1, 2, 3, 4, 5], 1, 3]);
      expect(result).toEqual([2, 3]);
    });

    it('slices array with only start', () => {
      const { result } = invokeHelper('slice', [[1, 2, 3, 4, 5], 2]);
      expect(result).toEqual([3, 4, 5]);
    });

    it('returns empty array for null', () => {
      const { result } = invokeHelper('slice', [null, 0, 1]);
      expect(result).toEqual([]);
    });
  });

  describe('sort', () => {
    it('sorts numbers', () => {
      const { result } = invokeHelper('sort', [[3, 1, 4, 1, 5]]);
      expect(result).toEqual([1, 1, 3, 4, 5]);
    });

    it('sorts strings', () => {
      const { result } = invokeHelper('sort', [['c', 'a', 'b']]);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for null', () => {
      const { result } = invokeHelper('sort', [null]);
      expect(result).toEqual([]);
    });
  });

  describe('unique', () => {
    it('removes duplicates', () => {
      const { result } = invokeHelper('unique', [[1, 2, 2, 3, 3, 3]]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('works with strings', () => {
      const { result } = invokeHelper('unique', [['a', 'b', 'a', 'c']]);
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });

  describe('flatten', () => {
    it('flattens one level', () => {
      const { result } = invokeHelper('flatten', [[[1, 2], [3, 4]]]);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('only flattens one level', () => {
      const { result } = invokeHelper('flatten', [[[[1]], [2]]]);
      expect(result).toEqual([[1], 2]);
    });
  });

  describe('compact', () => {
    it('removes null and undefined', () => {
      const { result } = invokeHelper('compact', [[1, null, 2, undefined, 3]]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('keeps falsy values except null/undefined', () => {
      const { result } = invokeHelper('compact', [[0, '', false, null, undefined]]);
      expect(result).toEqual([0, '', false]);
    });
  });

  describe('pluck', () => {
    it('extracts property from objects', () => {
      const { result } = invokeHelper('pluck', [[{ name: 'A' }, { name: 'B' }], 'name']);
      expect(result).toEqual(['A', 'B']);
    });

    it('returns undefined for missing property', () => {
      const { result } = invokeHelper('pluck', [[{ name: 'A' }, { id: 1 }], 'name']);
      expect(result).toEqual(['A', undefined]);
    });
  });

  describe('includes', () => {
    it('returns true when value exists', () => {
      const { result } = invokeHelper('includes', [[1, 2, 3], 2]);
      expect(result).toBe(true);
    });

    it('returns false when value missing', () => {
      const { result } = invokeHelper('includes', [[1, 2, 3], 4]);
      expect(result).toBe(false);
    });
  });

  describe('concat', () => {
    it('combines multiple arrays', () => {
      const { result } = invokeHelper('concat', [[1, 2], [3, 4], [5]]);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles empty arrays', () => {
      const { result } = invokeHelper('concat', [[], [1, 2]]);
      expect(result).toEqual([1, 2]);
    });
  });

  describe('first', () => {
    it('returns first element', () => {
      const { result } = invokeHelper('first', [[1, 2, 3]]);
      expect(result).toBe(1);
    });

    it('returns undefined for empty array', () => {
      const { result } = invokeHelper('first', [[]]);
      expect(result).toBeUndefined();
    });
  });

  describe('last', () => {
    it('returns last element', () => {
      const { result } = invokeHelper('last', [[1, 2, 3]]);
      expect(result).toBe(3);
    });

    it('returns undefined for empty array', () => {
      const { result } = invokeHelper('last', [[]]);
      expect(result).toBeUndefined();
    });
  });
});

describe('String Helpers', () => {
  describe('uppercase/upper', () => {
    it('converts to uppercase', () => {
      const { result } = invokeHelper('uppercase', ['hello']);
      expect(result).toBe('HELLO');
    });

    it('upper is an alias', () => {
      const { result } = invokeHelper('upper', ['hello']);
      expect(result).toBe('HELLO');
    });
  });

  describe('lowercase/lower', () => {
    it('converts to lowercase', () => {
      const { result } = invokeHelper('lowercase', ['HELLO']);
      expect(result).toBe('hello');
    });

    it('lower is an alias', () => {
      const { result } = invokeHelper('lower', ['HELLO']);
      expect(result).toBe('hello');
    });
  });

  describe('capitalize', () => {
    it('capitalizes first character', () => {
      const { result } = invokeHelper('capitalize', ['hello']);
      expect(result).toBe('Hello');
    });

    it('handles empty string', () => {
      const { result } = invokeHelper('capitalize', ['']);
      expect(result).toBe('');
    });
  });

  describe('uncapitalize', () => {
    it('lowercases first character', () => {
      const { result } = invokeHelper('uncapitalize', ['Hello']);
      expect(result).toBe('hello');
    });
  });

  describe('titlecase', () => {
    it('capitalizes each word', () => {
      const { result } = invokeHelper('titlecase', ['hello world']);
      expect(result).toBe('Hello World');
    });

    it('handles multiple spaces', () => {
      const { result } = invokeHelper('titlecase', ['hello  world']);
      expect(result).toBe('Hello  World');
    });
  });

  describe('startsWith', () => {
    it('returns true for matching prefix', () => {
      const { result } = invokeHelper('startsWith', ['hello', 'he']);
      expect(result).toBe(true);
    });

    it('returns false for non-matching prefix', () => {
      const { result } = invokeHelper('startsWith', ['hello', 'lo']);
      expect(result).toBe(false);
    });
  });

  describe('endsWith', () => {
    it('returns true for matching suffix', () => {
      const { result } = invokeHelper('endsWith', ['hello', 'lo']);
      expect(result).toBe(true);
    });

    it('returns false for non-matching suffix', () => {
      const { result } = invokeHelper('endsWith', ['hello', 'he']);
      expect(result).toBe(false);
    });
  });

  describe('contains', () => {
    it('returns true when substring exists', () => {
      const { result } = invokeHelper('contains', ['hello', 'ell']);
      expect(result).toBe(true);
    });

    it('returns false when substring missing', () => {
      const { result } = invokeHelper('contains', ['hello', 'xyz']);
      expect(result).toBe(false);
    });
  });

  describe('padStart', () => {
    it('pads string to length', () => {
      const { result } = invokeHelper('padStart', ['42', 5, '0']);
      expect(result).toBe('00042');
    });

    it('uses space as default pad char', () => {
      const { result } = invokeHelper('padStart', ['hi', 5]);
      expect(result).toBe('   hi');
    });

    it('does not truncate if already long enough', () => {
      const { result } = invokeHelper('padStart', ['hello', 3, '0']);
      expect(result).toBe('hello');
    });
  });

  describe('padEnd', () => {
    it('pads string to length', () => {
      const { result } = invokeHelper('padEnd', ['Hi', 5, '!']);
      expect(result).toBe('Hi!!!');
    });
  });

  describe('split', () => {
    it('splits by delimiter', () => {
      const { result } = invokeHelper('split', ['a,b,c', ',']);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('handles empty string', () => {
      const { result } = invokeHelper('split', ['', ',']);
      expect(result).toEqual(['']);
    });
  });

  describe('charAt', () => {
    it('returns character at index', () => {
      const { result } = invokeHelper('charAt', ['hello', 1]);
      expect(result).toBe('e');
    });

    it('returns empty string for out of bounds', () => {
      const { result } = invokeHelper('charAt', ['hello', 10]);
      expect(result).toBe('');
    });
  });

  describe('repeat', () => {
    it('repeats string', () => {
      const { result } = invokeHelper('repeat', ['ab', 3]);
      expect(result).toBe('ababab');
    });

    it('returns empty for 0 count', () => {
      const { result } = invokeHelper('repeat', ['ab', 0]);
      expect(result).toBe('');
    });
  });

  describe('truncate', () => {
    it('truncates with default ellipsis', () => {
      const { result } = invokeHelper('truncate', ['Hello World', 8]);
      expect(result).toBe('Hello...');
    });

    it('uses custom suffix', () => {
      const { result } = invokeHelper('truncate', ['Hello World', 7, '>>']);
      expect(result).toBe('Hello>>');
    });

    it('does not truncate short strings', () => {
      const { result } = invokeHelper('truncate', ['Hi', 10]);
      expect(result).toBe('Hi');
    });
  });
});

describe('Date Helpers', () => {
  const testDate = new Date('2025-06-15T10:30:45.000Z');

  describe('addYears', () => {
    it('adds years', () => {
      const { result } = invokeHelper('addYears', [testDate, 1]) as { result: Date };
      expect(result.getFullYear()).toBe(2026);
    });
  });

  describe('addMonths', () => {
    it('adds months', () => {
      const { result } = invokeHelper('addMonths', [testDate, 3]) as { result: Date };
      expect(result.getMonth()).toBe(8); // September (0-indexed)
    });
  });

  describe('addWeeks', () => {
    it('adds weeks', () => {
      const { result } = invokeHelper('addWeeks', [testDate, 2]) as { result: Date };
      expect(result.getDate()).toBe(29);
    });
  });

  describe('addHours', () => {
    it('adds hours', () => {
      const { result } = invokeHelper('addHours', [testDate, 5]) as { result: Date };
      expect(result.getUTCHours()).toBe(15);
    });
  });

  describe('addMinutes', () => {
    it('adds minutes', () => {
      const { result } = invokeHelper('addMinutes', [testDate, 30]) as { result: Date };
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCHours()).toBe(11);
    });
  });

  describe('addSeconds', () => {
    it('adds seconds', () => {
      const { result } = invokeHelper('addSeconds', [testDate, 45]) as { result: Date };
      expect(result.getUTCSeconds()).toBe(30);
      expect(result.getUTCMinutes()).toBe(31);
    });
  });

  describe('year', () => {
    it('extracts year', () => {
      const { result } = invokeHelper('year', [testDate]);
      expect(result).toBe(2025);
    });
  });

  describe('month', () => {
    it('extracts month (1-indexed)', () => {
      const { result } = invokeHelper('month', [testDate]);
      expect(result).toBe(6); // June
    });
  });

  describe('day', () => {
    it('extracts day of month', () => {
      const { result } = invokeHelper('day', [testDate]);
      expect(result).toBe(15);
    });
  });

  describe('weekday', () => {
    it('extracts day of week', () => {
      const { result } = invokeHelper('weekday', [testDate]);
      expect(result).toBe(0); // Sunday
    });
  });

  describe('hour', () => {
    it('extracts hour', () => {
      const localDate = new Date(2025, 5, 15, 14, 30, 45);
      const { result } = invokeHelper('hour', [localDate]);
      expect(result).toBe(14);
    });
  });

  describe('minute', () => {
    it('extracts minute', () => {
      const localDate = new Date(2025, 5, 15, 14, 30, 45);
      const { result } = invokeHelper('minute', [localDate]);
      expect(result).toBe(30);
    });
  });

  describe('second', () => {
    it('extracts second', () => {
      const localDate = new Date(2025, 5, 15, 14, 30, 45);
      const { result } = invokeHelper('second', [localDate]);
      expect(result).toBe(45);
    });
  });

  describe('diffDays', () => {
    it('calculates difference in days', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-01-08');
      const { result } = invokeHelper('diffDays', [date1, date2]);
      expect(result).toBe(7);
    });

    it('returns negative for earlier second date', () => {
      const date1 = new Date('2025-01-08');
      const date2 = new Date('2025-01-01');
      const { result } = invokeHelper('diffDays', [date1, date2]);
      expect(result).toBe(-7);
    });
  });

  describe('isBefore', () => {
    it('returns true when first is before second', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-01-02');
      const { result } = invokeHelper('isBefore', [date1, date2]);
      expect(result).toBe(true);
    });

    it('returns false when first is after second', () => {
      const date1 = new Date('2025-01-02');
      const date2 = new Date('2025-01-01');
      const { result } = invokeHelper('isBefore', [date1, date2]);
      expect(result).toBe(false);
    });
  });

  describe('isAfter', () => {
    it('returns true when first is after second', () => {
      const date1 = new Date('2025-01-02');
      const date2 = new Date('2025-01-01');
      const { result } = invokeHelper('isAfter', [date1, date2]);
      expect(result).toBe(true);
    });
  });

  describe('parseDate', () => {
    it('parses date string', () => {
      const { result } = invokeHelper('parseDate', ['2025-11-26']) as { result: Date };
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(10); // November (0-indexed)
      expect(result.getUTCDate()).toBe(26);
    });

    it('returns epoch for invalid date with warning', () => {
      const { result, warnings } = invokeHelper('parseDate', ['not-a-date']) as { result: Date; warnings: string[] };
      expect(result.getTime()).toBe(0);
      expect(warnings.length).toBe(1);
    });
  });
});

describe('Number Helpers', () => {
  describe('sign', () => {
    it('returns -1 for negative', () => {
      const { result } = invokeHelper('sign', [-5]);
      expect(result).toBe(-1);
    });

    it('returns 0 for zero', () => {
      const { result } = invokeHelper('sign', [0]);
      expect(result).toBe(0);
    });

    it('returns 1 for positive', () => {
      const { result } = invokeHelper('sign', [5]);
      expect(result).toBe(1);
    });
  });

  describe('sqrt', () => {
    it('returns square root', () => {
      const { result } = invokeHelper('sqrt', [16]);
      expect(result).toBe(4);
    });

    it('returns NaN for negative', () => {
      const { result } = invokeHelper('sqrt', [-1]);
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  describe('pow', () => {
    it('returns power', () => {
      const { result } = invokeHelper('pow', [2, 8]);
      expect(result).toBe(256);
    });

    it('handles fractional exponents', () => {
      const { result } = invokeHelper('pow', [4, 0.5]);
      expect(result).toBe(2);
    });
  });

  describe('clamp', () => {
    it('clamps to max', () => {
      const { result } = invokeHelper('clamp', [150, 0, 100]);
      expect(result).toBe(100);
    });

    it('clamps to min', () => {
      const { result } = invokeHelper('clamp', [-50, 0, 100]);
      expect(result).toBe(0);
    });

    it('returns value if in range', () => {
      const { result } = invokeHelper('clamp', [50, 0, 100]);
      expect(result).toBe(50);
    });
  });

  describe('trunc', () => {
    it('truncates positive', () => {
      const { result } = invokeHelper('trunc', [3.9]);
      expect(result).toBe(3);
    });

    it('truncates negative', () => {
      const { result } = invokeHelper('trunc', [-3.9]);
      expect(result).toBe(-3);
    });
  });

  describe('random', () => {
    it('returns number between 0 and 1', () => {
      const { result } = invokeHelper('random', []) as { result: number };
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1);
    });
  });

  describe('randomInt', () => {
    it('returns integer in range', () => {
      const { result } = invokeHelper('randomInt', [1, 10]) as { result: number };
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('isNaN', () => {
    it('returns true for NaN', () => {
      const { result } = invokeHelper('isNaN', [NaN]);
      expect(result).toBe(true);
    });

    it('returns false for numbers', () => {
      const { result } = invokeHelper('isNaN', [5]);
      expect(result).toBe(false);
    });

    it('returns false for non-numbers', () => {
      const { result } = invokeHelper('isNaN', ['hello']);
      expect(result).toBe(false);
    });
  });

  describe('isFinite', () => {
    it('returns true for finite numbers', () => {
      const { result } = invokeHelper('isFinite', [5]);
      expect(result).toBe(true);
    });

    it('returns false for Infinity', () => {
      const { result } = invokeHelper('isFinite', [Infinity]);
      expect(result).toBe(false);
    });

    it('returns false for NaN', () => {
      const { result } = invokeHelper('isFinite', [NaN]);
      expect(result).toBe(false);
    });
  });

  describe('toNumber', () => {
    it('converts string to number', () => {
      const { result } = invokeHelper('toNumber', ['42']);
      expect(result).toBe(42);
    });

    it('returns 0 for non-numeric with warning', () => {
      const { result, warnings } = invokeHelper('toNumber', ['hello']);
      expect(result).toBe(0);
      expect(warnings.length).toBe(1);
    });
  });

  describe('toInt', () => {
    it('parses integer', () => {
      const { result } = invokeHelper('toInt', ['42']);
      expect(result).toBe(42);
    });

    it('parses with radix', () => {
      const { result } = invokeHelper('toInt', ['ff', 16]);
      expect(result).toBe(255);
    });

    it('parses binary', () => {
      const { result } = invokeHelper('toInt', ['1010', 2]);
      expect(result).toBe(10);
    });
  });
});

describe('Utility Helpers', () => {
  describe('default', () => {
    it('returns value if not null', () => {
      const { result } = invokeHelper('default', ['hello', 'default']);
      expect(result).toBe('hello');
    });

    it('returns default for null', () => {
      const { result } = invokeHelper('default', [null, 'default']);
      expect(result).toBe('default');
    });

    it('returns default for undefined', () => {
      const { result } = invokeHelper('default', [undefined, 'default']);
      expect(result).toBe('default');
    });

    it('keeps empty string', () => {
      const { result } = invokeHelper('default', ['', 'default']);
      expect(result).toBe('');
    });
  });

  describe('type', () => {
    it('returns "string" for strings', () => {
      const { result } = invokeHelper('type', ['hello']);
      expect(result).toBe('string');
    });

    it('returns "number" for numbers', () => {
      const { result } = invokeHelper('type', [42]);
      expect(result).toBe('number');
    });

    it('returns "boolean" for booleans', () => {
      const { result } = invokeHelper('type', [true]);
      expect(result).toBe('boolean');
    });

    it('returns "array" for arrays', () => {
      const { result } = invokeHelper('type', [[1, 2, 3]]);
      expect(result).toBe('array');
    });

    it('returns "object" for objects', () => {
      const { result } = invokeHelper('type', [{ x: 1 }]);
      expect(result).toBe('object');
    });

    it('returns "null" for null', () => {
      const { result } = invokeHelper('type', [null]);
      expect(result).toBe('null');
    });

    it('returns "undefined" for undefined', () => {
      const { result } = invokeHelper('type', [undefined]);
      expect(result).toBe('undefined');
    });
  });

  describe('isEmpty', () => {
    it('returns true for null', () => {
      const { result } = invokeHelper('isEmpty', [null]);
      expect(result).toBe(true);
    });

    it('returns true for undefined', () => {
      const { result } = invokeHelper('isEmpty', [undefined]);
      expect(result).toBe(true);
    });

    it('returns true for empty string', () => {
      const { result } = invokeHelper('isEmpty', ['']);
      expect(result).toBe(true);
    });

    it('returns true for empty array', () => {
      const { result } = invokeHelper('isEmpty', [[]]);
      expect(result).toBe(true);
    });

    it('returns false for non-empty values', () => {
      expect(invokeHelper('isEmpty', ['hi']).result).toBe(false);
      expect(invokeHelper('isEmpty', [[1]]).result).toBe(false);
      expect(invokeHelper('isEmpty', [0]).result).toBe(false);
    });
  });

  describe('isNull', () => {
    it('returns true only for null', () => {
      expect(invokeHelper('isNull', [null]).result).toBe(true);
      expect(invokeHelper('isNull', [undefined]).result).toBe(false);
      expect(invokeHelper('isNull', ['']).result).toBe(false);
    });
  });

  describe('isDefined', () => {
    it('returns true for defined values', () => {
      expect(invokeHelper('isDefined', ['']).result).toBe(true);
      expect(invokeHelper('isDefined', [0]).result).toBe(true);
      expect(invokeHelper('isDefined', [false]).result).toBe(true);
    });

    it('returns false for null and undefined', () => {
      expect(invokeHelper('isDefined', [null]).result).toBe(false);
      expect(invokeHelper('isDefined', [undefined]).result).toBe(false);
    });
  });

  describe('isArray', () => {
    it('returns true for arrays', () => {
      const { result } = invokeHelper('isArray', [[1, 2, 3]]);
      expect(result).toBe(true);
    });

    it('returns false for non-arrays', () => {
      expect(invokeHelper('isArray', ['hello']).result).toBe(false);
      expect(invokeHelper('isArray', [{ length: 3 }]).result).toBe(false);
    });
  });

  describe('isString', () => {
    it('returns true for strings', () => {
      const { result } = invokeHelper('isString', ['hello']);
      expect(result).toBe(true);
    });

    it('returns false for non-strings', () => {
      expect(invokeHelper('isString', [42]).result).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('returns true for numbers', () => {
      const { result } = invokeHelper('isNumber', [42]);
      expect(result).toBe(true);
    });

    it('returns false for NaN', () => {
      const { result } = invokeHelper('isNumber', [NaN]);
      expect(result).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(invokeHelper('isNumber', ['42']).result).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('returns true for booleans', () => {
      expect(invokeHelper('isBoolean', [true]).result).toBe(true);
      expect(invokeHelper('isBoolean', [false]).result).toBe(true);
    });

    it('returns false for non-booleans', () => {
      expect(invokeHelper('isBoolean', [1]).result).toBe(false);
      expect(invokeHelper('isBoolean', ['true']).result).toBe(false);
    });
  });

  describe('toString', () => {
    it('converts to string', () => {
      expect(invokeHelper('toString', [42]).result).toBe('42');
      expect(invokeHelper('toString', [true]).result).toBe('true');
    });

    it('returns empty string for null/undefined', () => {
      expect(invokeHelper('toString', [null]).result).toBe('');
      expect(invokeHelper('toString', [undefined]).result).toBe('');
    });
  });

  describe('fromJson', () => {
    it('parses JSON string', () => {
      const { result } = invokeHelper('fromJson', ['{"x": 1, "y": 2}']);
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it('returns null for invalid JSON with warning', () => {
      const { result, warnings } = invokeHelper('fromJson', ['invalid']);
      expect(result).toBeNull();
      expect(warnings.length).toBe(1);
    });
  });

  describe('toJson', () => {
    it('converts to JSON string', () => {
      const { result } = invokeHelper('toJson', [{ x: 1, y: 2 }]);
      expect(result).toBe('{"x":1,"y":2}');
    });

    it('handles arrays', () => {
      const { result } = invokeHelper('toJson', [[1, 2, 3]]);
      expect(result).toBe('[1,2,3]');
    });
  });
});
