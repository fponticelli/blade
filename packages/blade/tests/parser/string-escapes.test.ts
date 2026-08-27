import { describe, it, expect } from 'vitest';
import { decodeStringEscapes } from '../../src/parser/string-escapes.js';

describe('decodeStringEscapes', () => {
  it('decodes the simple escapes', () => {
    const result = decodeStringEscapes('a\\nb\\tc\\rd\\0e');
    expect(result.value).toBe('a\nb\tc\rd\0e');
    expect(result.errors).toEqual([]);
  });

  it('decodes escaped quotes and backslashes', () => {
    const result = decodeStringEscapes('say \\"hi\\" and \\\'bye\\\' \\\\');
    expect(result.value).toBe('say "hi" and \'bye\' \\');
    expect(result.errors).toEqual([]);
  });

  it('decodes the remaining C-style escapes', () => {
    const result = decodeStringEscapes('\\b\\f\\v');
    expect(result.value).toBe('\b\f\v');
    expect(result.errors).toEqual([]);
  });

  it('decodes \\xXX', () => {
    const result = decodeStringEscapes('\\x41\\x7A');
    expect(result.value).toBe('Az');
    expect(result.errors).toEqual([]);
  });

  it('decodes \\uXXXX including surrogate pairs', () => {
    const result = decodeStringEscapes('\\u00e9 \\ud83d\\ude00');
    expect(result.value).toBe('é 😀');
    expect(result.errors).toEqual([]);
  });

  it('decodes \\u{...} code points', () => {
    const result = decodeStringEscapes('\\u{1F600}');
    expect(result.value).toBe('😀');
    expect(result.errors).toEqual([]);
  });

  it('leaves ordinary characters untouched', () => {
    const result = decodeStringEscapes('plain text 123');
    expect(result.value).toBe('plain text 123');
    expect(result.errors).toEqual([]);
  });

  it('reports an unknown escape and preserves both characters', () => {
    const result = decodeStringEscapes('a\\qb');
    expect(result.value).toBe('a\\qb');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('\\q');
    expect(result.errors[0]?.offset).toBe(1);
    expect(result.errors[0]?.column).toBe(2);
  });

  it('reports a trailing backslash', () => {
    const result = decodeStringEscapes('abc\\');
    expect(result.value).toBe('abc\\');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/unterminated/i);
  });

  it('reports malformed hex escapes and preserves the raw text', () => {
    const bad = decodeStringEscapes('\\xZZ');
    expect(bad.value).toBe('\\xZZ');
    expect(bad.errors).toHaveLength(1);

    const short = decodeStringEscapes('\\u12');
    expect(short.value).toBe('\\u12');
    expect(short.errors).toHaveLength(1);

    const empty = decodeStringEscapes('\\u{}');
    expect(empty.value).toBe('\\u{}');
    expect(empty.errors).toHaveLength(1);

    const tooBig = decodeStringEscapes('\\u{110000}');
    expect(tooBig.value).toBe('\\u{110000}');
    expect(tooBig.errors).toHaveLength(1);
  });

  it('reports positions relative to the supplied base position', () => {
    const result = decodeStringEscapes('a\\qb', {
      line: 4,
      column: 10,
      offset: 120,
    });
    expect(result.errors[0]).toMatchObject({
      line: 4,
      column: 11,
      offset: 121,
    });
  });

  it('tracks lines across literal newlines in the body', () => {
    const result = decodeStringEscapes('a\nb\\q');
    expect(result.errors[0]).toMatchObject({ line: 2, column: 2, offset: 3 });
  });

  it('never throws for arbitrary input', () => {
    const inputs = ['\\', '\\u', '\\u{', '\\x', '\\u{0', '\\\\\\', '\\u{ }'];
    for (const input of inputs) {
      expect(() => decodeStringEscapes(input)).not.toThrow();
    }
  });
});
