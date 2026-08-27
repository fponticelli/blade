/**
 * Document freshness.
 *
 * The manager used to store new text immediately and re-parse 200 ms later, so
 * every provider read a scope that described the previous keystroke.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocumentManager, createDocument } from '../src/document.js';
import { DEFAULT_LSP_CONFIG } from '../src/types.js';
import type { BladeDocument, LspConfig } from '../src/types.js';
import { getVariablesAtOffset } from '../src/analyzer/scope.js';

function config(overrides: Partial<LspConfig['performance']> = {}): LspConfig {
  return {
    ...DEFAULT_LSP_CONFIG,
    performance: { ...DEFAULT_LSP_CONFIG.performance, ...overrides },
  };
}

const managers: DocumentManager[] = [];

function manager(
  cfg: LspConfig,
  onParsed?: (doc: BladeDocument) => void
): DocumentManager {
  const instance = new DocumentManager(cfg, onParsed);
  managers.push(instance);
  return instance;
}

afterEach(() => {
  while (managers.length > 0) managers.pop()?.dispose();
  vi.useRealTimers();
});

describe('DocumentManager freshness', () => {
  it('never returns text and scope from different versions', () => {
    const docs = manager(config({ debounceMs: 5000 }));
    docs.open('file:///a.blade', '@props(a)\n<div>$a</div>', 1);

    // A change the debouncer has not got to yet.
    docs.change(
      'file:///a.blade',
      '@props(a, b)\n@for(item of b) {\n<i>$item</i>\n}',
      2
    );

    const doc = docs.get('file:///a.blade');
    expect(doc?.version).toBe(2);
    expect(doc?.content).toContain('@for');
    // The scope describes the text we were just handed, not the previous one.
    const offset = doc!.content.indexOf('<i>');
    expect(getVariablesAtOffset(doc!.scope, offset).map(v => v.name)).toEqual([
      'a',
      'b',
      'item',
    ]);
  });

  it('reports the errors of the current text, not the previous one', () => {
    const docs = manager(config({ debounceMs: 5000 }));
    docs.open('file:///a.blade', '<div>ok</div>', 1);
    docs.change('file:///a.blade', '<div>${user.}</div>', 2);

    expect(docs.get('file:///a.blade')!.errors.length).toBeGreaterThan(0);
  });

  it('announces every parse exactly once', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const docs = manager(config({ debounceMs: 10 }), doc =>
      seen.push(doc.version)
    );

    docs.open('file:///a.blade', '<div>1</div>', 1);
    docs.change('file:///a.blade', '<div>2</div>', 2);
    docs.change('file:///a.blade', '<div>3</div>', 3);

    // Coalesced: only the last edit is parsed.
    vi.advanceTimersByTime(50);
    expect(seen).toEqual([1, 3]);

    // And the debounced parse does not fire again for an already-parsed edit.
    vi.advanceTimersByTime(50);
    expect(seen).toEqual([1, 3]);
  });

  it('does not announce twice when a request parses on demand first', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const docs = manager(config({ debounceMs: 10 }), doc =>
      seen.push(doc.version)
    );

    docs.open('file:///a.blade', '<div>1</div>', 1);
    docs.change('file:///a.blade', '<div>2</div>', 2);
    expect(docs.get('file:///a.blade')!.version).toBe(2);
    vi.advanceTimersByTime(50);

    expect(seen).toEqual([1, 2]);
  });

  it('ignores the change event the open itself produces', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const docs = manager(config({ debounceMs: 10 }), doc =>
      seen.push(doc.version)
    );

    docs.open('file:///a.blade', '<div>1</div>', 1);
    // TextDocuments reports a content change for the open too.
    docs.change('file:///a.blade', '<div>1</div>', 1);
    vi.advanceTimersByTime(50);

    expect(seen).toEqual([1]);
  });

  it('parses a change to a document that was never opened', () => {
    const docs = manager(config({ debounceMs: 5000 }));
    docs.change('file:///new.blade', '<div>$a</div>', 7);
    expect(docs.get('file:///new.blade')?.version).toBe(7);
  });

  it('forgets a closed document and cancels its pending parse', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const docs = manager(config({ debounceMs: 10 }), doc =>
      seen.push(doc.version)
    );

    docs.open('file:///a.blade', '<div>1</div>', 1);
    docs.change('file:///a.blade', '<div>2</div>', 2);
    docs.close('file:///a.blade');
    vi.advanceTimersByTime(50);

    expect(docs.get('file:///a.blade')).toBeUndefined();
    expect(seen).toEqual([1]);
  });
});

describe('maxFileSize', () => {
  it('does not parse a file above the limit', () => {
    const content = '<div>' + 'x'.repeat(200) + '</div>';
    const doc = createDocument('file:///big.blade', content, 1, {
      maxFileSize: 100,
    });

    expect(doc.oversized).toBe(true);
    expect(doc.ast).toBeNull();
    expect(doc.scope.segments).toEqual([]);
  });

  it('parses a file at or below the limit', () => {
    const doc = createDocument('file:///small.blade', '<div>x</div>', 1, {
      maxFileSize: 1000,
    });
    expect(doc.oversized).toBe(false);
    expect(doc.ast).not.toBeNull();
  });

  it('is enforced through the manager, and follows a config change', () => {
    const docs = manager(config({ debounceMs: 0, maxFileSize: 4 }));
    expect(docs.open('file:///a.blade', '<div>x</div>', 1).oversized).toBe(
      true
    );

    docs.updateConfig(config({ debounceMs: 0, maxFileSize: 1_000_000 }));
    expect(docs.open('file:///a.blade', '<div>x</div>', 2).oversized).toBe(
      false
    );
  });
});
