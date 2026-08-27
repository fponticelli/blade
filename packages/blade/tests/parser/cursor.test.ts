/**
 * Cursor and shared delimiter scanners.
 *
 * The cursor exists because line and column used to be maintained by one method
 * and the offset moved by nine others; the scanners exist because the same
 * six-line balanced-delimiter loop was written nine times and no copy knew what
 * a string literal was.
 */

import { describe, it, expect } from 'vitest';
import { Cursor, scanBalanced, scanValue } from '../../src/parser/cursor.js';

function cursorAt(source: string, offset: number): Cursor {
  const cursor = new Cursor(source);
  cursor.advanceBy(offset);
  return cursor;
}

describe('Cursor', () => {
  it('starts at line 1, column 1, offset 0', () => {
    expect(new Cursor('abc').position).toEqual({
      line: 1,
      column: 1,
      offset: 0,
    });
  });

  it('tracks line and column through newlines', () => {
    const cursor = new Cursor('ab\ncd');
    cursor.advanceBy(3);
    expect(cursor.position).toEqual({ line: 2, column: 1, offset: 3 });
    cursor.advance();
    expect(cursor.position).toEqual({ line: 2, column: 2, offset: 4 });
  });

  it('keeps line and column consistent when advancing in bulk', () => {
    const source = 'one\ntwo\nthree';
    const stepwise = new Cursor(source);
    for (let i = 0; i < source.length; i += 1) stepwise.advance();

    const bulk = new Cursor(source);
    bulk.advanceBy(source.length);

    expect(bulk.position).toEqual(stepwise.position);
  });

  it('restores line, column and offset together on seek', () => {
    const cursor = new Cursor('a\nbcd');
    const mark = cursorAt('a\nbcd', 2).position;
    cursor.advanceBy(5);
    cursor.seek(mark);
    expect(cursor.position).toEqual({ line: 2, column: 1, offset: 2 });
  });

  it('refuses to seek outside the source', () => {
    const cursor = new Cursor('abc');
    expect(() => cursor.seek({ line: 1, column: 1, offset: -1 })).toThrow(
      RangeError
    );
    expect(() => cursor.seek({ line: 1, column: 5, offset: 4 })).toThrow(
      RangeError
    );
    expect(() => cursor.seek({ line: 1, column: 4, offset: 3 })).not.toThrow();
  });

  it('does not move past the end', () => {
    const cursor = new Cursor('ab');
    cursor.advanceBy(10);
    expect(cursor.offset).toBe(2);
    expect(cursor.advance()).toBe('\0');
    expect(cursor.offset).toBe(2);
  });

  it('peeks before and after the head without moving', () => {
    const cursor = cursorAt('abc', 1);
    expect(cursor.peek(-1)).toBe('a');
    expect(cursor.peek()).toBe('b');
    expect(cursor.peek(1)).toBe('c');
    expect(cursor.peek(2)).toBe('\0');
    expect(cursor.offset).toBe(1);
  });

  it('matches a keyword only at a word boundary', () => {
    expect(new Cursor('else { }').matchKeyword('else')).toBe(true);
    expect(new Cursor('elsewhere').matchKeyword('else')).toBe(false);
    expect(new Cursor('letters').matchKeyword('let')).toBe(false);
    expect(new Cursor('let x').matchKeyword('let')).toBe(true);
    expect(new Cursor('true,').matchKeyword('true')).toBe(true);
    expect(new Cursor('true_1').matchKeyword('true')).toBe(false);
  });

  it('leaves the head where it was when a keyword does not match', () => {
    const cursor = new Cursor('elsewhere');
    cursor.matchKeyword('else');
    expect(cursor.offset).toBe(0);
  });
});

describe('scanBalanced', () => {
  it('stops at the matching delimiter and consumes it', () => {
    const cursor = cursorAt('(a + b) tail', 1);
    const scan = scanBalanced(cursor, '(', ')');
    expect(scan.source).toBe('a + b');
    expect(scan.unterminated).toBe(false);
    expect(cursor.peek()).toBe(' ');
  });

  it('counts nested pairs', () => {
    const cursor = cursorAt('{f({x})} tail', 1);
    expect(scanBalanced(cursor, '{', '}').source).toBe('f({x})');
  });

  it('ignores delimiters inside a string literal', () => {
    const cursor = cursorAt('{concat("}", $a)} tail', 1);
    const scan = scanBalanced(cursor, '{', '}');
    expect(scan.source).toBe('concat("}", $a)');
    expect(cursor.peek()).toBe(' ');
  });

  it('ignores an escaped quote inside a string literal', () => {
    const cursor = cursorAt('{"a\\"}" }', 1);
    expect(scanBalanced(cursor, '{', '}').source).toBe('"a\\"}" ');
  });

  it('reports an unterminated region rather than pretending', () => {
    const cursor = cursorAt('{a + b', 1);
    const scan = scanBalanced(cursor, '{', '}');
    expect(scan).toMatchObject({ source: 'a + b', unterminated: true });
    expect(cursor.isAtEnd()).toBe(true);
  });

  it('reports an absolute span for the region it scanned', () => {
    const source = 'x\n${ $a }';
    const cursor = cursorAt(source, 4);
    const scan = scanBalanced(cursor, '{', '}');
    expect(scan.start).toEqual({ line: 2, column: 3, offset: 4 });
    expect(source.slice(scan.start.offset, scan.end.offset)).toBe(scan.source);
  });
});

describe('scanValue', () => {
  it('stops at a terminator and leaves the head on it', () => {
    const cursor = new Cursor('1 + 2; rest');
    const scan = scanValue(cursor, ';\n');
    expect(scan.source).toBe('1 + 2');
    expect(cursor.peek()).toBe(';');
  });

  it('ignores a terminator inside a string literal', () => {
    const cursor = new Cursor('"a;b"; rest');
    expect(scanValue(cursor, ';\n').source).toBe('"a;b"');
  });

  it('ignores a terminator inside brackets', () => {
    const cursor = new Cursor('default(x, []), next');
    expect(scanValue(cursor, ',)').source).toBe('default(x, [])');
  });

  it('stops at a closing bracket that is not its own', () => {
    const cursor = new Cursor('a) rest');
    expect(scanValue(cursor, ',)').source).toBe('a');
  });

  it('reports reaching the end without a terminator', () => {
    const cursor = new Cursor('1 + 2');
    expect(scanValue(cursor, ';').unterminated).toBe(true);
  });
});
