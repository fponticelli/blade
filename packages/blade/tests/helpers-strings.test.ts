/**
 * String Helper Bound Tests
 *
 * `truncate` must never return more characters than it was asked for, and the
 * allocating helpers must not let a template turn one call into a
 * multi-megabyte string.
 */

import { describe, it, expect } from 'vitest';
import { MAX_HELPER_STRING_LENGTH } from '../src/helpers/index.js';
import { invokeHelper } from './helpers-support.js';

describe('truncate', () => {
  it('truncates with the default ellipsis', () => {
    expect(invokeHelper('truncate', ['Hello World', 8]).result).toBe(
      'Hello...'
    );
  });

  it('uses a custom suffix', () => {
    expect(invokeHelper('truncate', ['Hello World', 7, '>>']).result).toBe(
      'Hello>>'
    );
  });

  it('leaves short strings alone', () => {
    expect(invokeHelper('truncate', ['Hi', 10]).result).toBe('Hi');
  });

  it('never returns more characters than requested', () => {
    // The bug: slice(0, len - suffix.length) with a negative end counts back
    // from the end of the string, returning nearly all of it.
    expect(invokeHelper('truncate', ['abcdef', 2]).result).toBe('..');
  });

  it('returns an empty string for a length of 0', () => {
    expect(invokeHelper('truncate', ['abcdef', 0]).result).toBe('');
  });

  it('clamps a negative length to 0 with a warning', () => {
    const { result, warnings } = invokeHelper('truncate', ['abcdef', -5]);
    expect(result).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('truncate(length)');
  });

  it('holds result.length <= max(len, 0) over many inputs', () => {
    const strings = [
      '',
      'a',
      'ab',
      'abcdef',
      'Hello World',
      'x'.repeat(64),
      'unicode – dash and emoji ok',
    ];
    const lengths = [-5, -1, 0, 1, 2, 3, 5, 8, 11, 64, 200];
    const suffixes = [undefined, '', '.', '..', '...', '>>', '[more]'];

    for (const s of strings) {
      for (const len of lengths) {
        for (const suffix of suffixes) {
          const args = suffix === undefined ? [s, len] : [s, len, suffix];
          const result = invokeHelper('truncate', args).result as string;
          expect(typeof result).toBe('string');
          expect(result.length).toBeLessThanOrEqual(Math.max(len, 0));
          // Never longer than the input either.
          expect(result.length).toBeLessThanOrEqual(
            Math.max(s.length, (suffix ?? '...').length)
          );
        }
      }
    }
  });
});

describe('allocation bounds', () => {
  it('repeats within the budget', () => {
    expect(invokeHelper('repeat', ['ab', 3]).result).toBe('ababab');
    expect(invokeHelper('repeat', ['ab', 0]).result).toBe('');
  });

  it('clamps a repeat that would exceed the output budget', () => {
    const { result, warnings } = invokeHelper('repeat', ['x', 50_000_000]);
    expect((result as string).length).toBe(MAX_HELPER_STRING_LENGTH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('repeat');
    expect(warnings[0]).toContain(String(MAX_HELPER_STRING_LENGTH));
  });

  it('clamps a negative repeat count with a warning', () => {
    const { result, warnings } = invokeHelper('repeat', ['x', -1]);
    expect(result).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('repeat(count)');
  });

  it('clamps padStart past the output budget', () => {
    const { result, warnings } = invokeHelper('padStart', [
      'a',
      100_000_000,
      'b',
    ]);
    expect((result as string).length).toBe(MAX_HELPER_STRING_LENGTH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('padStart');
  });

  it('clamps padEnd past the output budget', () => {
    const { result, warnings } = invokeHelper('padEnd', [
      'a',
      100_000_000,
      'b',
    ]);
    expect((result as string).length).toBe(MAX_HELPER_STRING_LENGTH);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('padEnd');
  });

  it('pads normally within the budget', () => {
    expect(invokeHelper('padStart', ['42', 5, '0']).result).toBe('00042');
    expect(invokeHelper('padEnd', ['Hi', 5, '!']).result).toBe('Hi!!!');
  });

  it('clamps a negative pad length with a warning', () => {
    const { result, warnings } = invokeHelper('padStart', ['42', -3]);
    expect(result).toBe('42');
    expect(warnings).toHaveLength(1);
  });
});
