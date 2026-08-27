/**
 * Aggregate Helper Tests
 *
 * The five aggregates share one empty-input contract: `sum` and `count` have
 * an identity to return (0), `avg`, `min` and `max` do not and return null,
 * which the renderer prints as an empty cell.
 */

import { describe, it, expect } from 'vitest';
import { invokeHelper } from './helpers-support.js';

describe('empty-input contract', () => {
  it('sum returns its identity, 0', () => {
    expect(invokeHelper('sum', [[]]).result).toBe(0);
    expect(invokeHelper('sum', []).result).toBe(0);
  });

  it('count returns 0', () => {
    expect(invokeHelper('count', [[]]).result).toBe(0);
    expect(invokeHelper('count', []).result).toBe(0);
  });

  it('avg returns null', () => {
    expect(invokeHelper('avg', [[]]).result).toBeNull();
    expect(invokeHelper('avg', []).result).toBeNull();
  });

  it('min returns null rather than Infinity', () => {
    expect(invokeHelper('min', [[]]).result).toBeNull();
    expect(invokeHelper('min', []).result).toBeNull();
  });

  it('max returns null rather than -Infinity', () => {
    expect(invokeHelper('max', [[]]).result).toBeNull();
    expect(invokeHelper('max', []).result).toBeNull();
  });

  it('never renders "Infinity" into a document', () => {
    for (const name of ['sum', 'avg', 'min', 'max', 'count'] as const) {
      const { result } = invokeHelper(name, [[]]);
      expect(String(result ?? '')).not.toContain('Infinity');
    }
  });
});

describe('populated input', () => {
  it('sums spread and array arguments alike', () => {
    expect(invokeHelper('sum', [1, 2, 3]).result).toBe(6);
    expect(invokeHelper('sum', [[1, 2, 3]]).result).toBe(6);
  });

  it('averages', () => {
    expect(invokeHelper('avg', [[1, 2, 3]]).result).toBe(2);
    expect(invokeHelper('avg', [2, 4]).result).toBe(3);
  });

  it('finds the minimum', () => {
    expect(invokeHelper('min', [3, 1, 2]).result).toBe(1);
    expect(invokeHelper('min', [[3, 1, 2]]).result).toBe(1);
    expect(invokeHelper('min', [[-5]]).result).toBe(-5);
  });

  it('finds the maximum', () => {
    expect(invokeHelper('max', [3, 1, 2]).result).toBe(3);
    expect(invokeHelper('max', [[3, 1, 2]]).result).toBe(3);
  });

  it('counts', () => {
    expect(invokeHelper('count', [1, 2, 3]).result).toBe(3);
    expect(invokeHelper('count', [[1, 2, 3]]).result).toBe(3);
  });

  it('coerces non-numeric members with a warning', () => {
    const { result, warnings } = invokeHelper('min', [[3, 'x', 2]]);
    expect(result).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('min(');
    expect(warnings[0]).toContain('"x"');
  });

  it('treats a null column value as 0, matching sum', () => {
    expect(invokeHelper('min', [[3, null, 2]]).result).toBe(0);
    expect(invokeHelper('sum', [[3, null, 2]]).result).toBe(5);
  });
});

describe('large inputs', () => {
  const LARGE = 200_000;

  it('min handles a 200k-element array without overflowing the stack', () => {
    const values = new Array<number>(LARGE);
    for (let i = 0; i < LARGE; i++) values[i] = i + 1;
    expect(invokeHelper('min', [values]).result).toBe(1);
  });

  it('max handles a 200k-element array without overflowing the stack', () => {
    const values = new Array<number>(LARGE);
    for (let i = 0; i < LARGE; i++) values[i] = i + 1;
    expect(invokeHelper('max', [values]).result).toBe(LARGE);
  });

  it('sum, avg and count handle a 200k-element array', () => {
    const values = new Array<number>(LARGE);
    for (let i = 0; i < LARGE; i++) values[i] = 1;
    expect(invokeHelper('sum', [values]).result).toBe(LARGE);
    expect(invokeHelper('avg', [values]).result).toBe(1);
    expect(invokeHelper('count', [values]).result).toBe(LARGE);
  });
});
