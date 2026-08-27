/**
 * Untrusted data must not be able to reach an `Intl` constructor in a state
 * that throws.
 *
 * Every argument of every formatting helper is data: the value, the currency
 * code, the fraction-digit count, `$.locale` and `$.timezone` all come from
 * whoever supplied the payload. `Intl` answers a bad one with a `RangeError`
 * that names no helper, no argument and no template position, and that error
 * used to abort the whole render.
 *
 * Two things are asserted here, and they are different claims:
 *
 *   (a) the coercions make it IMPOSSIBLE to reach a constructor in a throwing
 *       state - the adversarial matrix below is the evidence;
 *   (b) if the platform rejects a construction anyway - an engine whose
 *       accepted ranges differ from the specification's, an ICU-less build -
 *       the failure comes out as an engine error naming the helper, with the
 *       platform error as its `cause`, and the renderer turns that into a
 *       LOCATED `RenderError`. A bare `RangeError` never escapes.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  standardLibrary,
  resetIntlCaches,
  numberFormatter,
  dateTimeFormatter,
} from '../src/helpers/index.js';
import { HelperError } from '../src/evaluator/index.js';
import type { HelperFunction, Scope } from '../src/evaluator/index.js';
import { compileOrThrow } from '../src/compiler/index.js';
import { render, RenderError } from '../src/renderer/index.js';

// -----------------------------------------------------------------------------
// Harness
// -----------------------------------------------------------------------------

function scopeOf(globals: Record<string, unknown>): Scope {
  return {
    data: {},
    locals: Object.create(null) as Record<string, unknown>,
    globals,
  } as unknown as Scope;
}

/** Calls a helper, collecting its warnings. */
function call(
  name: keyof typeof standardLibrary,
  globals: Record<string, unknown>,
  args: unknown[]
): { result: unknown; warnings: string[] } {
  const warnings: string[] = [];
  const helper = standardLibrary[name] as HelperFunction;
  const fn = helper(scopeOf(globals), message => warnings.push(message));
  if (typeof fn !== 'function') throw new Error(`${name} is not curried`);
  return { result: (fn as (...a: unknown[]) => unknown)(...args), warnings };
}

afterEach(() => {
  // The formatter cache holds instances built with the real Intl; a test that
  // replaced Intl must not leave its stubs, or a later cache hit resurrects one.
  resetIntlCaches();
});

// -----------------------------------------------------------------------------
// (a) No coerced value reaches a constructor in a throwing state
// -----------------------------------------------------------------------------

describe('currency codes of every length and character class', () => {
  // ISO 4217 is exactly three ASCII letters. Everything else has to be caught
  // before Intl sees it: `Intl.NumberFormat` throws `RangeError: Invalid
  // currency code` for all of them.
  const rejected: unknown[] = [
    '',
    'U',
    'US',
    'USDX',
    'USDOLLAR',
    '123',
    '12A',
    'US$',
    'US-',
    'US ',
    ' US',
    'U S',
    'US\n',
    '€€€',
    'ÀÉÎ',
    'ЕВР',
    '日本円',
    'us d',
    0,
    Infinity,
    true,
    false,
    {},
    [],
    new Date(0),
  ];

  for (const currency of rejected) {
    it(`falls back to USD for ${JSON.stringify(String(currency))}`, () => {
      const { result, warnings } = call('formatCurrency', { currency }, [1]);
      expect(typeof result).toBe('string');
      expect(result as string).toContain('1.00');
      expect(warnings.join('\n')).toContain('ISO 4217');
    });
  }

  // Accepted because they are WELL-FORMED, not because they are real: the
  // engine keeps no ISO 4217 registry, and neither does Intl - `ZZZ` formats as
  // `ZZZ 1.00`. `['USD']` is accepted because `String(['USD'])` is `'USD'`, and
  // `NaN` because `String(NaN)` is three ASCII letters. Neither can throw, which
  // is the property under test.
  const accepted: unknown[] = [
    'USD',
    'usd',
    'eUr',
    'JPY',
    'GBP',
    'ZZZ',
    'XXX',
    'AAA',
    ['USD'],
    NaN,
  ];
  for (const currency of accepted) {
    it(`accepts the well-formed code ${String(currency)}`, () => {
      const { result, warnings } = call('formatCurrency', { currency }, [1]);
      expect(typeof result).toBe('string');
      expect(warnings).toEqual([]);
    });
  }

  // A missing `$.currency` is not a bad one: there is nothing to complain
  // about, so this is the one path to USD that must stay silent.
  it.each([null, undefined])(
    'defaults to USD without warning when $.currency is %s',
    currency => {
      const { result, warnings } = call('formatCurrency', { currency }, [1]);
      expect(result).toBe('$1.00');
      expect(warnings).toEqual([]);
    }
  );

  it('takes the argument over $.currency, and still validates it', () => {
    const { result, warnings } = call('formatCurrency', { currency: 'EUR' }, [
      1,
      'NOPE',
    ]);
    expect(result as string).toContain('1.00');
    expect(warnings.join('\n')).toContain('ISO 4217');
  });
});

describe('fraction digits at and beyond both bounds', () => {
  // Intl accepts 0..20 on every engine; anything outside is a RangeError, and
  // a fractional count is a RangeError too.
  const cases: Array<[unknown, boolean]> = [
    [0, false],
    [20, false],
    [1, false],
    [-1, true],
    [-0.5, true],
    [21, true],
    [100, true],
    [1e21, true],
    [-1e21, true],
    [Number.MAX_SAFE_INTEGER, true],
    [Number.MIN_SAFE_INTEGER, true],
    [2.5, true],
    [NaN, true],
    [Infinity, true],
    [-Infinity, true],
    [Number.MAX_VALUE, true],
    ['x', true],
    [{}, true],
    [[], false],
    [null, false],
    [undefined, false],
    [true, false],
    ['3', false],
  ];

  for (const [decimals, warns] of cases) {
    it(`formats with decimals=${JSON.stringify(String(decimals))}`, () => {
      const number = call('formatNumber', {}, [1234.5, decimals]);
      const percent = call('formatPercent', {}, [0.5, decimals]);
      expect(typeof number.result).toBe('string');
      expect(typeof percent.result).toBe('string');
      expect(number.warnings.length > 0).toBe(warns);
      expect(percent.warnings.length > 0).toBe(warns);
    });
  }

  it('clamps to the top of the range rather than failing', () => {
    const { result } = call('formatNumber', {}, [1, 999]);
    expect((result as string).split('.')[1]).toHaveLength(20);
  });

  it('clamps to the bottom of the range rather than failing', () => {
    const { result } = call('formatNumber', {}, [1.5, -999]);
    expect(result).toBe('2');
  });
});

describe('non-finite and signed-zero values', () => {
  const values: unknown[] = [
    NaN,
    Infinity,
    -Infinity,
    -0,
    0,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    // Overflow to Infinity, written as an expression: the literal form is a
    // lint error, and the value is the point.
    Number('1e309'),
    -Number('1e309'),
    '1e400',
    '-1e400',
    'not a number',
    null,
    undefined,
    {},
    [],
    [[1]],
    true,
    new Date(0),
  ];

  for (const value of values) {
    it(`formats ${JSON.stringify(String(value))} in every numeric helper`, () => {
      expect(() => call('formatNumber', {}, [value, 2])).not.toThrow();
      expect(() =>
        call('formatCurrency', { currency: 'EUR' }, [value])
      ).not.toThrow();
      expect(() => call('formatPercent', {}, [value, 2])).not.toThrow();
    });
  }

  it('keeps -0 from printing as a negative zero currency', () => {
    const { result } = call('formatCurrency', { currency: 'USD' }, [-0]);
    expect(result).toBe('$0.00');
  });
});

describe('locales and time zones from data', () => {
  const locales: unknown[] = [
    '',
    'en_US',
    'x',
    '-',
    '--',
    'en-',
    'i-klingon',
    'en@euro',
    '*',
    'a'.repeat(300),
    'en-US-u-nu-!!!',
    null,
    undefined,
    42,
    true,
    {},
    [],
  ];

  for (const locale of locales) {
    it(`survives $.locale = ${JSON.stringify(String(locale))}`, () => {
      expect(() =>
        call('formatCurrency', { locale, currency: 'USD' }, [1])
      ).not.toThrow();
      expect(() => call('formatNumber', { locale }, [1, 2])).not.toThrow();
      expect(() =>
        call('formatDate', { locale }, [new Date(0), 'long'])
      ).not.toThrow();
    });
  }

  const zones: unknown[] = [
    '',
    ' ',
    'Not/AZone',
    'utc',
    'GMT+5',
    'Europe/Rome',
    'UTC',
    null,
    undefined,
    42,
    true,
    {},
    [],
  ];

  for (const timezone of zones) {
    it(`survives $.timezone = ${JSON.stringify(String(timezone))}`, () => {
      expect(() =>
        call('formatDate', { timezone }, [new Date(0), 'long'])
      ).not.toThrow();
      expect(() => call('year', { timezone }, [new Date(0)])).not.toThrow();
      expect(() => call('weekday', { timezone }, [new Date(0)])).not.toThrow();
      expect(() =>
        call('addDays', { timezone }, [new Date(0), 1])
      ).not.toThrow();
    });
  }

  it('accepts well-formed but unusual canonical locales', () => {
    for (const locale of [
      'zh-Hans-CN',
      'de-CH-1996',
      'en-US-u-ca-gregory',
      'ja-JP-u-ca-japanese',
      'fil',
      'EN-us',
    ]) {
      const { warnings } = call('formatNumber', { locale }, [1234.5, 2]);
      expect(warnings).toEqual([]);
    }
  });
});

// -----------------------------------------------------------------------------
// (b) A residual platform rejection becomes a located engine error
// -----------------------------------------------------------------------------

/** Runs `body` with `Intl[name]` replaced by a constructor that throws. */
function withBrokenIntl<K extends 'NumberFormat' | 'DateTimeFormat'>(
  name: K,
  body: () => void
): void {
  const original = Intl[name];
  resetIntlCaches();
  // A stand-in for an engine whose accepted range differs from the one the
  // coercions enforce - the only way a construction can still fail.
  Object.defineProperty(Intl, name, {
    configurable: true,
    writable: true,
    value: function BrokenIntl(): never {
      throw new RangeError('simulated engine rejection');
    },
  });
  try {
    body();
  } finally {
    Object.defineProperty(Intl, name, {
      configurable: true,
      writable: true,
      value: original,
    });
    resetIntlCaches();
  }
}

describe('a residual Intl rejection never escapes as a platform error', () => {
  it('converts a NumberFormat RangeError into a HelperError naming the site', () => {
    withBrokenIntl('NumberFormat', () => {
      let thrown: unknown;
      try {
        numberFormatter('en-US', { style: 'currency', currency: 'USD' });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(HelperError);
      expect(thrown).not.toBeInstanceOf(RangeError);
      const error = thrown as HelperError;
      expect(error.message).toContain('Intl.NumberFormat');
      expect(error.message).toContain('en-US');
      expect(error.message).toContain('simulated engine rejection');
      expect(error.cause).toBeInstanceOf(RangeError);
    });
  });

  it('converts a DateTimeFormat RangeError the same way', () => {
    withBrokenIntl('DateTimeFormat', () => {
      let thrown: unknown;
      try {
        dateTimeFormatter('en-US', 'long', 'UTC');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(HelperError);
      expect((thrown as HelperError).message).toContain('Intl.DateTimeFormat');
      expect((thrown as HelperError).cause).toBeInstanceOf(RangeError);
    });
  });

  it('reaches the render as a RenderError carrying the template location', () => {
    const template = compileOrThrow(
      '<p>ok</p>\n<p>Total: ${formatCurrency(total)}</p>'
    );
    withBrokenIntl('NumberFormat', () => {
      let thrown: unknown;
      try {
        render(template, { total: 5 }, { helpers: standardLibrary });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(RenderError);
      const error = thrown as RenderError;
      // The second line, not 1:1: a diagnostic that points at the top of the
      // file is what this whole exercise is about.
      expect(error.location.start.line).toBe(2);
      expect(error.location.start.offset).toBeGreaterThan(0);
      expect(error.message).toContain('formatCurrency');
      expect(error.message).toContain('simulated engine rejection');
    });
  });
});

describe('any helper failure is located, not just Intl', () => {
  it('names the helper and the node when a host helper throws', () => {
    const boom: HelperFunction = () => () => {
      throw new TypeError('host helper exploded');
    };
    const template = compileOrThrow('<div>\n  <span>${boom()}</span>\n</div>');
    let thrown: unknown;
    try {
      render(template, {}, { helpers: { boom } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RenderError);
    const error = thrown as RenderError;
    expect(error.message).toContain('boom');
    expect(error.message).toContain('host helper exploded');
    expect(error.location.start.line).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// The rest of the range-checked platform calls
// -----------------------------------------------------------------------------

/**
 * `Intl` is not the only platform API in the standard library that answers a
 * bad number with a `RangeError`. Every one of them sits behind a
 * {@link NumberRange} for the same reason, and the same claim has to hold: no
 * value from data reaches one in a state that throws.
 */
describe('other platform APIs that throw out of range', () => {
  const hostile: unknown[] = [
    -1,
    -1e21,
    Number('1e309'),
    -Number('1e309'),
    NaN,
    2 ** 53,
    2.5,
    -0,
    null,
    undefined,
    'x',
    {},
    [],
    true,
  ];

  for (const n of hostile) {
    it(`survives ${JSON.stringify(String(n))} as a count or length`, () => {
      // String.prototype.repeat: RangeError below 0 and above ~2^29.
      expect(() => call('repeat', {}, ['ab', n])).not.toThrow();
      // padStart/padEnd: RangeError on a negative target length.
      expect(() => call('padStart', {}, ['x', n, '-'])).not.toThrow();
      expect(() => call('padEnd', {}, ['x', n, '-'])).not.toThrow();
      // Math.pow(10, digits) overflows to Infinity outside ~+/-308.
      expect(() => call('round', {}, [1.23456, n])).not.toThrow();
      // parseInt: only radixes 2..36 mean anything.
      expect(() => call('toInt', {}, ['42', n])).not.toThrow();
      // slice/substring/truncate/charAt take positions from data too.
      expect(() => call('slice', {}, ['abcdef', n])).not.toThrow();
      expect(() => call('substring', {}, ['abcdef', n, n])).not.toThrow();
      expect(() => call('truncate', {}, ['abcdef', n])).not.toThrow();
      expect(() => call('charAt', {}, ['abcdef', n])).not.toThrow();
    });
  }

  it('caps an unbounded repeat at the helper output budget', () => {
    const { result, warnings } = call('repeat', {}, ['x', 50_000_000]);
    expect((result as string).length).toBeLessThanOrEqual(1_000_000);
    expect(warnings.join('\n')).toContain('limit');
  });

  it('caps an unbounded pad at the helper output budget', () => {
    const { result, warnings } = call('padStart', {}, ['x', 50_000_000, '-']);
    expect((result as string).length).toBeLessThanOrEqual(1_000_000);
    expect(warnings.join('\n')).toContain('limit');
  });
});
