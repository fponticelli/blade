/**
 * Formatter Helper Tests
 *
 * Covers the coercions that feed Intl - currency codes, locales and fraction
 * digits - and the formatter cache that keeps ICU locale resolution off the
 * per-call path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_INTL_CACHE_ENTRIES,
  dateTimeFormatter,
  intlCacheStats,
  numberFormatter,
  resetIntlCaches,
} from '../src/helpers/index.js';
import { invokeHelper } from './helpers-support.js';

beforeEach(() => {
  resetIntlCaches();
});

describe('formatCurrency currency coercion', () => {
  it('formats a valid code', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1234.56]);
    expect(result).toBe('$1,234.56');
    expect(warnings).toEqual([]);
  });

  it('uppercases a lowercase code without warning', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1, 'eur']);
    expect(result).toBe('€1.00');
    expect(warnings).toEqual([]);
  });

  it('rejects a two-letter uppercase code instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1, 'EU']);
    expect(result).toBe('$1.00');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formatCurrency(currency)');
    expect(warnings[0]).toContain('"EU"');
    expect(warnings[0]).toContain('USD');
  });

  it('rejects a five-letter code instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1, 'ABCDE']);
    expect(result).toBe('$1.00');
    expect(warnings).toHaveLength(1);
  });

  it('rejects a non-ASCII-letter code instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1, 'U$D']);
    expect(result).toBe('$1.00');
    expect(warnings).toHaveLength(1);
  });

  it('rejects an invalid $.currency global instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1], {
      currency: 'EU',
    });
    expect(result).toBe('$1.00');
    expect(warnings).toHaveLength(1);
  });

  it('reads a valid $.currency global', () => {
    const { result, warnings } = invokeHelper('formatCurrency', [1], {
      currency: 'GBP',
    });
    expect(result).toBe('£1.00');
    expect(warnings).toEqual([]);
  });
});

describe('fraction digit coercion', () => {
  it('formats with the requested digits', () => {
    const { result } = invokeHelper('formatNumber', [1234.567, 2]);
    expect(result).toBe('1,234.57');
  });

  it('clamps a fraction digit count above 20 instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1, 500]);
    expect(typeof result).toBe('string');
    expect(result).toBe(
      numberFormatter('en-US', {
        minimumFractionDigits: 20,
        maximumFractionDigits: 20,
      }).format(1)
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formatNumber(decimals)');
    expect(warnings[0]).toContain('500');
  });

  it('clamps a negative fraction digit count instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1, -1]);
    expect(result).toBe('1');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formatNumber(decimals)');
  });

  it('truncates a fractional digit count with a warning', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1, 2.7]);
    expect(result).toBe('1.00');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('whole number');
  });

  it('clamps formatPercent digits instead of throwing', () => {
    const { result, warnings } = invokeHelper('formatPercent', [0.5, 500]);
    expect(typeof result).toBe('string');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('formatPercent(decimals)');
  });

  it('formats percent with the requested digits', () => {
    const { result } = invokeHelper('formatPercent', [0.1234, 1]);
    expect(result).toBe('12.3%');
  });
});

describe('locale coercion', () => {
  it('honours a script-subtag locale', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1234.5, 2], {
      locale: 'de-DE',
    });
    expect(result).toBe('1.234,50');
    expect(warnings).toEqual([]);
  });

  it('accepts a locale with a script subtag', () => {
    const { warnings } = invokeHelper('formatNumber', [1234.5, 2], {
      locale: 'zh-Hans-CN',
    });
    expect(warnings).toEqual([]);
  });

  it('accepts a three-letter language tag', () => {
    const { warnings } = invokeHelper('formatNumber', [1, 0], {
      locale: 'fil',
    });
    expect(warnings).toEqual([]);
  });

  it('accepts a variant subtag', () => {
    const { warnings } = invokeHelper('formatNumber', [1, 0], {
      locale: 'de-CH-1996',
    });
    expect(warnings).toEqual([]);
  });

  it('accepts an extension subtag', () => {
    const { warnings } = invokeHelper('formatNumber', [1, 0], {
      locale: 'en-US-u-ca-gregory',
    });
    expect(warnings).toEqual([]);
  });

  it('canonicalises a lowercase region', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1234.5, 2], {
      locale: 'de-de',
    });
    expect(result).toBe('1.234,50');
    expect(warnings).toEqual([]);
  });

  it('warns and falls back to en-US for a genuinely invalid tag', () => {
    const { result, warnings } = invokeHelper('formatNumber', [1234.5, 2], {
      locale: 'not a locale',
    });
    expect(result).toBe('1,234.50');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('locale');
    expect(warnings[0]).toContain('en-US');
  });

  it('caches the canonical form so validation is paid once', () => {
    invokeHelper('formatNumber', [1, 0], { locale: 'de-de' });
    const afterFirst = intlCacheStats().locales;
    invokeHelper('formatNumber', [2, 0], { locale: 'de-de' });
    expect(intlCacheStats().locales).toBe(afterFirst);
  });
});

describe('Intl formatter cache', () => {
  it('returns the identical NumberFormat for the same options', () => {
    const a = numberFormatter('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    const b = numberFormatter('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    expect(a).toBe(b);
  });

  it('returns different instances for different options', () => {
    const a = numberFormatter('en-US', { style: 'currency', currency: 'USD' });
    const b = numberFormatter('en-US', { style: 'currency', currency: 'EUR' });
    expect(a).not.toBe(b);
  });

  it('returns the identical DateTimeFormat for the same options', () => {
    const a = dateTimeFormatter('en-US', 'long', 'UTC');
    const b = dateTimeFormatter('en-US', 'long', 'UTC');
    expect(a).toBe(b);
    expect(dateTimeFormatter('en-US', 'short', 'UTC')).not.toBe(a);
    expect(dateTimeFormatter('en-US', 'long', 'Asia/Tokyo')).not.toBe(a);
  });

  it('reuses one formatter across many helper calls', () => {
    for (let i = 0; i < 100; i++) {
      invokeHelper('formatCurrency', [i]);
    }
    expect(intlCacheStats().numberFormats).toBe(1);
  });

  it('evicts the least recently used entry past the cap', () => {
    const first = numberFormatter('en-US', {
      style: 'currency',
      currency: currencyCode(0),
    });
    for (let i = 1; i < MAX_INTL_CACHE_ENTRIES; i++) {
      numberFormatter('en-US', {
        style: 'currency',
        currency: currencyCode(i),
      });
    }
    expect(intlCacheStats().numberFormats).toBe(MAX_INTL_CACHE_ENTRIES);
    // Still resident: nothing has been evicted yet.
    expect(
      numberFormatter('en-US', { style: 'currency', currency: currencyCode(0) })
    ).toBe(first);

    // One more distinct key forces an eviction, and the cap holds.
    numberFormatter('en-US', {
      style: 'currency',
      currency: currencyCode(MAX_INTL_CACHE_ENTRIES),
    });
    expect(intlCacheStats().numberFormats).toBe(MAX_INTL_CACHE_ENTRIES);
  });

  it('evicts the oldest entry, not the most recently used one', () => {
    const oldest = numberFormatter('en-US', {
      style: 'currency',
      currency: currencyCode(0),
    });
    for (let i = 1; i < MAX_INTL_CACHE_ENTRIES; i++) {
      numberFormatter('en-US', {
        style: 'currency',
        currency: currencyCode(i),
      });
    }
    // Touch the oldest so it becomes the most recently used.
    numberFormatter('en-US', { style: 'currency', currency: currencyCode(0) });
    // Insert a new key: entry 1, now the oldest, is the one evicted.
    numberFormatter('en-US', {
      style: 'currency',
      currency: currencyCode(MAX_INTL_CACHE_ENTRIES),
    });
    expect(
      numberFormatter('en-US', { style: 'currency', currency: currencyCode(0) })
    ).toBe(oldest);
    expect(intlCacheStats().numberFormats).toBe(MAX_INTL_CACHE_ENTRIES);
  });

  it('cannot be grown without bound by a hostile locale', () => {
    for (let i = 0; i < MAX_INTL_CACHE_ENTRIES * 3; i++) {
      invokeHelper('formatNumber', [1, 0], { locale: `de-DE-x-${i}` });
    }
    expect(intlCacheStats().numberFormats).toBeLessThanOrEqual(
      MAX_INTL_CACHE_ENTRIES
    );
    expect(intlCacheStats().locales).toBeLessThanOrEqual(
      MAX_INTL_CACHE_ENTRIES
    );
  });
});

/** Distinct well-formed (if unassigned) ISO 4217-shaped codes for cache keys. */
function currencyCode(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return (
    'Q' +
    letters[Math.floor(index / letters.length) % letters.length] +
    letters[index % letters.length]
  );
}
