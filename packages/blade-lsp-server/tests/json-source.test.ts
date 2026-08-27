/**
 * JSON source positions, so a sample diagnostic can point at the value the
 * schema rejected instead of at the first character of the file.
 */

import { describe, it, expect } from 'vitest';
import {
  indexJsonPaths,
  locateJsonPath,
  ROOT_PATH,
} from '../src/json-source.js';

const TEXT = `{
  "user": {
    "name": "Ada",
    "tags": ["a", "b"]
  },
  "count": 42,
  "flag": true,
  "nothing": null
}`;

function slice(path: string): string {
  const span = locateJsonPath(indexJsonPaths(TEXT), path);
  expect(span).toBeDefined();
  return TEXT.slice(span!.start, span!.end);
}

describe('indexJsonPaths', () => {
  it('spans the whole document at the root', () => {
    expect(slice(ROOT_PATH)).toBe(TEXT);
  });

  it('spans an object member', () => {
    expect(slice('user.name')).toBe('"Ada"');
    expect(slice('count')).toBe('42');
    expect(slice('flag')).toBe('true');
    expect(slice('nothing')).toBe('null');
  });

  it('spans an array and its elements', () => {
    expect(slice('user.tags')).toBe('["a", "b"]');
    expect(slice('user.tags[1]')).toBe('"b"');
  });

  it('spans a nested object', () => {
    expect(slice('user')).toBe(
      '{\n    "name": "Ada",\n    "tags": ["a", "b"]\n  }'
    );
  });

  it('indexes the key of a member as well as its value', () => {
    const spans = indexJsonPaths(TEXT);
    const key = spans.get('user.name#key');
    expect(key).toBeDefined();
    expect(TEXT.slice(key!.start, key!.end)).toBe('"name"');
  });

  it('falls back to the nearest ancestor for a path that is not there', () => {
    // "Missing required property" names a path that by definition is absent.
    expect(slice('user.email')).toBe(slice('user'));
    expect(slice('user.address.city')).toBe(slice('user'));
    expect(slice('absent')).toBe(TEXT);
  });

  it('handles escapes in keys and values', () => {
    const text = '{"a\\"b": "x\\ny", "c": 1}';
    const spans = indexJsonPaths(text);
    expect(spans.has('a"b')).toBe(true);
    expect(spans.has('c')).toBe(true);
  });

  it('handles empty containers', () => {
    const spans = indexJsonPaths('{"a": {}, "b": []}');
    expect(spans.get('a')).toEqual({ start: 6, end: 8 });
    expect(spans.get('b')).toEqual({ start: 15, end: 17 });
  });

  it('returns what it managed to read from malformed input', () => {
    // A partial index still points at real text; nothing throws.
    const spans = indexJsonPaths('{"a": 1, "b": ');
    expect(spans.has('a')).toBe(true);
  });

  it('returns nothing useful for input that is not JSON at all', () => {
    expect(indexJsonPaths('').size).toBe(0);
  });
});
