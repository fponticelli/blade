import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  debounce,
  escapeHtml,
  getNonce,
  hashProjectPath,
} from '../src/preview/utils.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('getNonce', () => {
  it('is not derived from Math.random', () => {
    // The nonce is the only thing standing between markup rendered from an
    // arbitrary workspace template and script execution in a webview holding
    // `acquireVsCodeApi()`. It used to be 32 characters drawn with
    // `Math.random()`, which in V8 is a seeded xorshift128+ - predictable from
    // a handful of prior outputs.
    const spy = vi.spyOn(Math, 'random');
    getNonce();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('carries at least 128 bits and never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(getNonce());
    expect(seen.size).toBe(500);
    for (const nonce of seen) {
      expect(Buffer.from(nonce, 'base64').byteLength).toBeGreaterThanOrEqual(
        16
      );
    }
  });

  it('contains nothing that could close the attribute it sits in', () => {
    for (let i = 0; i < 200; i++) {
      expect(getNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });
});

describe('debounce', () => {
  it('runs once for a burst', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel clears a pending call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('hashProjectPath', () => {
  it('is stable and distinguishes projects', () => {
    expect(hashProjectPath('/a/b')).toBe(hashProjectPath('/a/b'));
    expect(hashProjectPath('/a/b')).not.toBe(hashProjectPath('/a/c'));
  });
});

describe('escapeHtml', () => {
  it('neutralises everything that can leave an attribute or a text node', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;'
    );
  });
});
