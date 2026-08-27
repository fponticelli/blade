/**
 * Line index: the one offset/position conversion.
 *
 * Three implementations of this used to exist, each splitting the whole
 * document on every call.
 */

import { describe, it, expect } from 'vitest';
import {
  createLineIndex,
  offsetAt,
  positionAt,
  lineEnd,
  lineStartAt,
} from '../src/line-index.js';

const TEXT = 'first line\nsecond\n\nfourth line\n';

describe('LineIndex', () => {
  it('indexes the start of every line', () => {
    const index = createLineIndex(TEXT);
    expect(Array.from(index.starts)).toEqual([0, 11, 18, 19, 31]);
  });

  it('round-trips every offset through position and back', () => {
    const index = createLineIndex(TEXT);
    for (let offset = 0; offset <= TEXT.length; offset++) {
      const position = positionAt(index, offset);
      expect(offsetAt(index, position.line, position.character)).toBe(offset);
    }
  });

  it('agrees with a naive split for every offset', () => {
    const index = createLineIndex(TEXT);
    for (let offset = 0; offset <= TEXT.length; offset++) {
      const before = TEXT.slice(0, offset).split('\n');
      expect(positionAt(index, offset)).toEqual({
        line: before.length - 1,
        character: (before[before.length - 1] ?? '').length,
      });
    }
  });

  it('clamps a character past the end of its line', () => {
    const index = createLineIndex(TEXT);
    // Line 1 is "second"; character 99 clamps to its end, not into line 2.
    expect(offsetAt(index, 1, 99)).toBe(17);
  });

  it('clamps a line past the end of the document', () => {
    const index = createLineIndex(TEXT);
    expect(offsetAt(index, 99, 0)).toBe(TEXT.length);
    expect(positionAt(index, 9999)).toEqual({ line: 4, character: 0 });
    expect(positionAt(index, -5)).toEqual({ line: 0, character: 0 });
  });

  it('keeps a carriage return out of the line content', () => {
    const index = createLineIndex('a\r\nb');
    expect(lineEnd(index, 0)).toBe(1);
    expect(offsetAt(index, 0, 5)).toBe(1);
  });

  it('handles an empty document', () => {
    const index = createLineIndex('');
    expect(positionAt(index, 0)).toEqual({ line: 0, character: 0 });
    expect(offsetAt(index, 0, 0)).toBe(0);
  });

  it('finds the start of the line containing an offset', () => {
    const index = createLineIndex(TEXT);
    expect(lineStartAt(index, 0)).toBe(0);
    expect(lineStartAt(index, 14)).toBe(11);
    expect(lineStartAt(index, TEXT.length)).toBe(31);
  });
});
