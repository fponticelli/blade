// Standard library helpers
// Comprehensive helper functions for Blade templates

import type {
  HelperFunction,
  HelperLimits,
  Scope,
} from '../evaluator/index.js';
import { HelperError } from '../evaluator/index.js';

/** Sink for a coercion diagnostic raised while a helper runs. */
type Warn = (msg: string) => void;

// =============================================================================
// Resource Limits
// =============================================================================

/**
 * Upper bound, in UTF-16 code units, on the string a single helper may produce
 * when the caller names no budget of its own.
 *
 * `repeat`, `padStart` and `padEnd` turn a small template into an arbitrarily
 * large allocation - `repeat("x", 50000000)` is one call and 50 MB - and above
 * ~2^29 characters the platform throws a `RangeError` that escapes the render
 * with no template location. One megabyte is far past any legitimate document
 * use and far below the point where a single render can hurt the host.
 *
 * The render supplies the real budget: `ResourceLimits.maxHelperStringLength`
 * reaches every helper as {@link HelperLimits.maxStringLength}. This constant
 * is only the fallback for a helper invoked outside a render - in a test, or by
 * a host calling one directly.
 */
export const MAX_HELPER_STRING_LENGTH = 1_000_000;

/**
 * The output budget in force for the current call.
 */
function helperStringLimit(limits: HelperLimits | undefined): number {
  return limits?.maxStringLength ?? MAX_HELPER_STRING_LENGTH;
}

/**
 * Clamps a requested output length to the helper string budget.
 *
 * @returns The length to actually produce, never above the budget.
 */
function clampOutputLength(
  requested: number,
  where: string,
  setWarning: Warn,
  limits: HelperLimits | undefined
): number {
  const limit = helperStringLimit(limits);
  if (requested > limit) {
    setWarning(
      `${where}: would produce ${requested} characters, over the ${limit}-character helper output limit; truncating to ${limit}`
    );
    return limit;
  }
  return requested;
}

// =============================================================================
// Intl Formatter Cache
// =============================================================================

/**
 * Maximum number of distinct formatters (and canonical locales) kept alive.
 *
 * A document uses a handful of locale/currency combinations, but `$.locale` and
 * the `currency` argument are data, so an unbounded cache is an unbounded
 * allocation controlled by whoever supplies the data. Least-recently-used
 * eviction keeps the working set resident and the footprint fixed.
 */
export const MAX_INTL_CACHE_ENTRIES = 128;

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const canonicalLocaleCache = new Map<string, string>();

/**
 * Reads `key` from an LRU map, building the value on a miss.
 *
 * `Map` iterates in insertion order, so re-inserting on a hit moves an entry to
 * the young end and the first key is always the least recently used.
 */
function lruGet<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) {
    // Refresh recency, then hand back the shared instance.
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  return lruSet(cache, key, create());
}

/** Inserts into an LRU map, evicting the least recently used entry if full. */
/**
 * Builds an `Intl` formatter, so no platform rejection can escape unlabelled.
 *
 * Everything that reaches a constructor here has already been coerced and
 * range-checked against what `Intl` accepts - `expectCurrency` admits exactly
 * three ASCII letters, `FRACTION_DIGITS` clamps to 0..20, `expectLocale`
 * canonicalises through `Intl.getCanonicalLocales` and falls back to `en-US`,
 * and `scopeTimeZone` validates a zone by construction - so on a conforming
 * engine this guard never fires. It is here for what the coercions cannot
 * cover: an engine whose accepted ranges differ from the specification's, or an
 * ICU-less build that rejects a locale the grammar allows.
 *
 * The bare `RangeError: Invalid currency code` those produce names no helper,
 * no argument and no template position. A {@link HelperError} names the
 * construction and keeps the platform error as `cause`, and the evaluator
 * attaches the location of the call - so the failure arrives as a located
 * `RenderError` rather than as a mystery from inside the platform.
 */
function constructIntl<T>(what: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    throw new HelperError(
      `${what}: the platform rejected these formatter options - ${
        error instanceof Error ? error.message : String(error)
      }`,
      error
    );
  }
}

function lruSet<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_INTL_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  return value;
}

/**
 * Returns a shared `Intl.NumberFormat` for the given options.
 *
 * Constructing one costs ~14 us of ICU locale resolution against ~0.2 us to
 * reuse it, which on a thousand-row table is the difference between 0.9 ms and
 * 14 ms of render time. Formatter instances are immutable, so sharing them
 * across renders and concurrent requests is safe.
 */
export function numberFormatter(
  locale: string,
  options: Intl.NumberFormatOptions
): Intl.NumberFormat {
  const key = `${locale}|${options.style ?? ''}|${options.currency ?? ''}|${
    options.minimumFractionDigits ?? ''
  }|${options.maximumFractionDigits ?? ''}`;
  return lruGet(numberFormatCache, key, () =>
    constructIntl(
      `Intl.NumberFormat(${locale}, ${JSON.stringify(options)})`,
      () => new Intl.NumberFormat(locale, options)
    )
  );
}

/** The date presentations `formatDate` and the component extractors need. */
export type DateFormatStyle = 'default' | 'short' | 'long' | 'parts';

const DATE_FORMAT_OPTIONS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> =
  {
    default: { year: 'numeric', month: 'short', day: 'numeric' },
    short: { year: '2-digit', month: 'numeric', day: 'numeric' },
    long: {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    },
    // Used only to read calendar components in a specific zone, never to
    // present a date, so the field set is fixed and the locale is always en-US.
    parts: {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    },
  };

/**
 * Returns a shared `Intl.DateTimeFormat` for a style and time zone.
 *
 * `timeZone` left undefined means "the host zone", which the platform resolves
 * when the formatter is constructed - so a process that changes `TZ` after the
 * fact must call {@link resetIntlCaches}.
 */
export function dateTimeFormatter(
  locale: string,
  style: DateFormatStyle,
  timeZone?: string
): Intl.DateTimeFormat {
  const key = `${locale}|${style}|${timeZone ?? ''}`;
  return lruGet(dateTimeFormatCache, key, () => {
    const options = { ...DATE_FORMAT_OPTIONS[style] };
    if (timeZone !== undefined) {
      options.timeZone = timeZone;
    }
    return constructIntl(
      `Intl.DateTimeFormat(${locale}, ${style}, ${timeZone ?? 'host zone'})`,
      () => new Intl.DateTimeFormat(locale, options)
    );
  });
}

/**
 * Drops every cached formatter and canonical locale.
 *
 * Only needed when the process time zone changes underneath a cached formatter,
 * which in practice means tests.
 */
export function resetIntlCaches(): void {
  numberFormatCache.clear();
  dateTimeFormatCache.clear();
  canonicalLocaleCache.clear();
}

/** Current occupancy of the formatter caches, for tests and diagnostics. */
export function intlCacheStats(): {
  numberFormats: number;
  dateTimeFormats: number;
  locales: number;
} {
  return {
    numberFormats: numberFormatCache.size,
    dateTimeFormats: dateTimeFormatCache.size,
    locales: canonicalLocaleCache.size,
  };
}

// =============================================================================
// Type Coercion Utilities
// =============================================================================

/**
 * Renders a value for a warning message: short, unambiguous and safe.
 *
 * Warnings name the offending value, so the reader can tell `"1,234"` from
 * `1234` and `null` from `"null"` without guessing.
 */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? 'an invalid Date'
      : `Date(${value.toISOString()})`;
  }
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'object') return 'an object';
  return String(value);
}

/**
 * The shape a number has to have for the API it is about to be handed to.
 *
 * Every coercion that feeds a platform API which throws out of range carries
 * one, so a call site cannot forget: `Intl` rejects fraction digits outside
 * 0..20, `String.prototype.repeat` rejects negative counts, `parseInt` returns
 * NaN outside radix 2..36.
 */
interface NumberRange {
  /** Smallest accepted value; smaller values are clamped up. */
  readonly min?: number;
  /** Largest accepted value; larger values are clamped down. */
  readonly max?: number;
  /** Whether fractional values must be truncated towards zero. */
  readonly integer?: boolean;
}

/** Fraction digit counts `Intl.NumberFormat` accepts on every engine. */
const FRACTION_DIGITS: NumberRange = { min: 0, max: 20, integer: true };
/** Decimal places `Math.pow(10, n)` keeps finite, in both directions. */
const ROUND_DIGITS: NumberRange = { min: -20, max: 20, integer: true };
/** Non-negative whole counts and lengths for the string helpers. */
const NON_NEGATIVE_INTEGER: NumberRange = { min: 0, integer: true };
/** Radixes `parseInt` understands. */
const RADIX: NumberRange = { min: 2, max: 36, integer: true };

/**
 * Coerces a value to a number, optionally constraining it to a range.
 *
 * @param where - Helper and argument the value came from, e.g. `sum(values)`.
 * @param range - Shape the caller's API requires; violations warn and clamp.
 */
function expectNumber(
  value: unknown,
  setWarning: Warn,
  where: string,
  range?: NumberRange
): number {
  let num: number;
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false
  ) {
    num = 0;
  } else if (value === true) {
    num = 1;
  } else {
    num = Number(value);
    if (Number.isNaN(num)) {
      setWarning(
        `${where}: expected a number, got ${describeValue(value)}; using 0`
      );
      num = 0;
    }
  }

  // -0 is zero, and every consumer here presents it: `Intl` honours the sign,
  // so a total that arrives as -0 printed as "-$0.00". Normalising once, at the
  // one coercion every numeric helper goes through, keeps that out of the
  // output without any helper having to remember it.
  if (Object.is(num, -0)) {
    num = 0;
  }

  if (range === undefined) {
    return num;
  }
  return constrainNumber(num, range, where, setWarning);
}

/** Applies a {@link NumberRange}, warning once for each violated constraint. */
function constrainNumber(
  num: number,
  range: NumberRange,
  where: string,
  setWarning: Warn
): number {
  let result = num;
  if (range.integer === true && !Number.isInteger(result)) {
    const truncated = Number.isFinite(result) ? Math.trunc(result) : 0;
    setWarning(
      `${where}: expected a whole number, got ${result}; using ${truncated}`
    );
    result = truncated;
  }
  if (range.min !== undefined && result < range.min) {
    setWarning(
      `${where}: ${describeRange(range)}, got ${num}; using ${range.min}`
    );
    return range.min;
  }
  if (range.max !== undefined && result > range.max) {
    setWarning(
      `${where}: ${describeRange(range)}, got ${num}; using ${range.max}`
    );
    return range.max;
  }
  return result;
}

/** Human-readable form of a range, for warnings. */
function describeRange(range: NumberRange): string {
  if (range.min !== undefined && range.max !== undefined) {
    return `expected a number between ${range.min} and ${range.max}`;
  }
  if (range.min !== undefined) {
    return `expected a number of at least ${range.min}`;
  }
  return `expected a number of at most ${range.max}`;
}

/**
 * Coerces a value to a string.
 *
 * Null and undefined become the empty string, mirroring how the renderer prints
 * them; every other value has a total `String` conversion, so this never warns.
 */
function expectString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  return String(value);
}

/**
 * Canonicalises a BCP-47 language tag, falling back to `en-US`.
 *
 * `Intl.getCanonicalLocales` is the normative grammar - it accepts script
 * subtags (`zh-Hans-CN`), three-letter languages (`fil`), variants
 * (`de-CH-1996`), extensions (`en-US-u-ca-gregory`) and case-insensitive
 * regions (`en-us`), and throws precisely on tags that are genuinely malformed.
 * A hand-written regex admits a fraction of that and silently formats the rest
 * in `en-US`, which prints `1,234.50` where `1.234,50` was meant.
 */
function expectLocale(value: unknown, setWarning: Warn, where: string): string {
  const tag = expectString(value);
  const cached = canonicalLocaleCache.get(tag);
  if (cached !== undefined) {
    // Refresh recency: the cache is bounded and fed by data.
    canonicalLocaleCache.delete(tag);
    canonicalLocaleCache.set(tag, cached);
    return cached;
  }
  try {
    // Only well-formed tags are cached, so a broken one warns on every render
    // rather than being silently absorbed by the first call that saw it.
    return lruSet(
      canonicalLocaleCache,
      tag,
      Intl.getCanonicalLocales(tag)[0] ?? 'en-US'
    );
  } catch {
    setWarning(
      `${where}: expected a BCP-47 locale tag such as "de-DE", got ${describeValue(value)}; using "en-US"`
    );
    return 'en-US';
  }
}

/** Locale in force for a helper, from `$.locale`. */
function scopeLocale(scope: Scope, setWarning: Warn, helper: string): string {
  const configured = scope.globals['locale'];
  if (configured === null || configured === undefined || configured === '') {
    return 'en-US';
  }
  return expectLocale(configured, setWarning, `${helper}($.locale)`);
}

/** Exactly three ASCII letters - the whole of the ISO 4217 code space. */
const currencyRegex = /^[A-Za-z]{3}$/;

/**
 * Coerces a value to an ISO 4217 currency code.
 *
 * Anything else is rejected here rather than inside `Intl.NumberFormat`, which
 * throws `RangeError: Invalid currency code` and aborts the whole render with
 * an error that carries no template location.
 */
function expectCurrency(
  value: unknown,
  setWarning: Warn,
  where: string
): string {
  const currency = expectString(value);
  if (!currencyRegex.test(currency)) {
    setWarning(
      `${where}: expected a 3-letter ISO 4217 currency code such as "USD", got ${describeValue(value)}; using "USD"`
    );
    return 'USD';
  }
  return currency.toUpperCase();
}

/**
 * Validates `$.timezone`, returning undefined when none is configured.
 *
 * An unknown zone makes `Intl.DateTimeFormat` throw, so it is checked once and
 * the answer cached with the formatter it produces.
 */
function scopeTimeZone(
  scope: Scope,
  setWarning: Warn,
  helper: string
): string | undefined {
  const configured = scope.globals['timezone'];
  if (configured === null || configured === undefined || configured === '') {
    return undefined;
  }
  const timeZone = expectString(configured);
  try {
    // Construction is the only complete validation, and it is cached. This is
    // the one place a failed `Intl` construction is deliberately absorbed
    // rather than raised: the construction IS the question being asked, and the
    // zone is the only thing that varies - the locale is the constant `en-US` -
    // so a rejection here can only mean the zone was not one the host knows.
    dateTimeFormatter('en-US', 'parts', timeZone);
    return timeZone;
  } catch {
    setWarning(
      `${helper}($.timezone): expected an IANA time zone name such as "Europe/Rome", got ${describeValue(configured)}; using the host time zone`
    );
    return undefined;
  }
}

/**
 * Dates parsed from a date-only form, which name a calendar day rather than an
 * instant.
 *
 * `2024-01-15` parses as UTC midnight per ECMA-262; reading or formatting that
 * in a negative-offset host zone yields January 14th. Flagging the value lets
 * every date helper work in UTC for it, so an invoice date prints the day it
 * says on every host. Keyed weakly by identity so nothing is retained and the
 * public shape of a date value stays `Date`.
 */
const dateOnlyValues = new WeakSet<Date>();

/** ISO 8601 calendar date with no time-of-day. */
const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Marks `date` as a calendar date and returns it. */
function markDateOnly(date: Date): Date {
  dateOnlyValues.add(date);
  return date;
}

/** Whether `date` names a calendar day rather than an instant. */
function isDateOnly(date: Date): boolean {
  return dateOnlyValues.has(date);
}

/**
 * Coerces a value to a Date, or null when there is no date to speak of.
 *
 * Null is the sentinel for "no date": the renderer prints it as the empty
 * string, the same way it prints a missing field. The previous epoch sentinel
 * printed "Dec 31, 1969" - and because `new Date(null)` *is* the epoch, a null
 * field reached it without ever failing a check.
 */
function expectDate(
  value: unknown,
  setWarning: Warn,
  where: string
): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      setWarning(
        `${where}: expected a valid date, got an invalid Date; rendering as empty`
      );
      return null;
    }
    return value;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') {
      return null;
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      setWarning(
        `${where}: expected a date, got ${describeValue(value)}; rendering as empty`
      );
      return null;
    }
    return dateOnlyRegex.test(text) ? markDateOnly(parsed) : parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setWarning(
        `${where}: expected a timestamp in milliseconds, got ${describeValue(value)}; rendering as empty`
      );
      return null;
    }
    return parsed;
  }

  setWarning(
    `${where}: expected a date, got ${describeValue(value)}; rendering as empty`
  );
  return null;
}

/**
 * Copies a date, preserving whether it names a calendar day.
 *
 * Every date helper derives its result from an input, and a derived calendar
 * date is still a calendar date.
 */
function deriveDate(source: Date, result: Date): Date {
  return isDateOnly(source) ? markDateOnly(result) : result;
}

function expectArrayRaw(
  value: unknown,
  setWarning: Warn,
  where: string
): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  setWarning(
    `${where}: expected an array, got ${describeValue(value)}; treating it as a single-element array`
  );
  return [value];
}

function expectArray<T>(
  value: unknown,
  expectItem: (item: unknown, setWarning: Warn, where: string) => T,
  setWarning: Warn,
  where: string
): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flat().map(item => expectItem(item, setWarning, where));
  }
  setWarning(
    `${where}: expected an array, got ${describeValue(value)}; treating it as a single-element array`
  );
  return [expectItem(value, setWarning, where)];
}

// =============================================================================
// Formatting Helpers
// =============================================================================

export const formatCurrency: HelperFunction = (
  scope: Scope,
  setWarning: Warn
) => {
  return (value: unknown, currency?: unknown): string => {
    const val = expectNumber(value, setWarning, 'formatCurrency(value)');
    const configured = currency ?? scope.globals['currency'] ?? 'USD';
    const curr = expectCurrency(
      configured,
      setWarning,
      'formatCurrency(currency)'
    );
    const locale = scopeLocale(scope, setWarning, 'formatCurrency');
    return numberFormatter(locale, {
      style: 'currency',
      currency: curr,
    }).format(val);
  };
};

export const formatNumber: HelperFunction = (
  scope: Scope,
  setWarning: Warn
) => {
  return (value: unknown, decimals?: unknown): string => {
    const val = expectNumber(value, setWarning, 'formatNumber(value)');
    const dec = expectNumber(
      decimals,
      setWarning,
      'formatNumber(decimals)',
      FRACTION_DIGITS
    );
    const locale = scopeLocale(scope, setWarning, 'formatNumber');
    return numberFormatter(locale, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(val);
  };
};

export const formatPercent: HelperFunction = (
  scope: Scope,
  setWarning: Warn
) => {
  return (value: unknown, decimals?: unknown): string => {
    const val = expectNumber(value, setWarning, 'formatPercent(value)');
    const dec = expectNumber(
      decimals,
      setWarning,
      'formatPercent(decimals)',
      FRACTION_DIGITS
    );
    const locale = scopeLocale(scope, setWarning, 'formatPercent');
    return numberFormatter(locale, {
      style: 'percent',
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(val);
  };
};

export const formatDate: HelperFunction = (scope: Scope, setWarning: Warn) => {
  return (date: unknown, format?: unknown): string => {
    const dt = expectDate(date, setWarning, 'formatDate(date)');
    if (dt === null) {
      return '';
    }
    const locale = scopeLocale(scope, setWarning, 'formatDate');
    const style: DateFormatStyle =
      format === 'short' ? 'short' : format === 'long' ? 'long' : 'default';
    // A calendar date is printed in UTC, where it was parsed, so it names the
    // same day on every host. An instant follows $.timezone, then the host.
    const timeZone = isDateOnly(dt)
      ? 'UTC'
      : scopeTimeZone(scope, setWarning, 'formatDate');
    return dateTimeFormatter(locale, style, timeZone).format(dt);
  };
};

// =============================================================================
// Aggregation Helpers
// =============================================================================

/**
 * Flattens and coerces aggregate arguments.
 *
 * The aggregates are variadic and also accept a single array, so `sum(1, 2)`
 * and `sum(values)` arrive the same way.
 */
function numericArgs(args: unknown[], setWarning: Warn, where: string) {
  return expectArray(args, expectNumber, setWarning, where);
}

/**
 * Empty-input contract, shared by all five aggregates:
 *
 * - `sum` returns 0 and `count` returns 0: both have an identity element.
 * - `avg`, `min` and `max` return null: there is no honest number to return,
 *   and the renderer prints null as an empty string, so an empty column renders
 *   empty rather than `Infinity` or a fabricated 0.
 */
export const sum: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...args: unknown[]): number => {
    const vals = numericArgs(args, setWarning, 'sum(values)');
    let total = 0;
    for (const val of vals) {
      total += val;
    }
    return total;
  };
};

export const avg: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...args: unknown[]): number | null => {
    const vals = numericArgs(args, setWarning, 'avg(values)');
    if (vals.length === 0) {
      return null;
    }
    let total = 0;
    for (const val of vals) {
      total += val;
    }
    return total / vals.length;
  };
};

export const min: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...args: unknown[]): number | null => {
    const vals = numericArgs(args, setWarning, 'min(values)');
    if (vals.length === 0) {
      return null;
    }
    // A linear scan rather than Math.min(...vals): the spread passes every
    // element as a separate argument and blows the stack past ~125k elements.
    let smallest = Number.POSITIVE_INFINITY;
    for (const val of vals) {
      if (val < smallest) smallest = val;
    }
    return smallest;
  };
};

export const max: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...args: unknown[]): number | null => {
    const vals = numericArgs(args, setWarning, 'max(values)');
    if (vals.length === 0) {
      return null;
    }
    let largest = Number.NEGATIVE_INFINITY;
    for (const val of vals) {
      if (val > largest) largest = val;
    }
    return largest;
  };
};

export const count: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...args: unknown[]): number => {
    return expectArray(
      args,
      (item: unknown) => item,
      setWarning,
      'count(values)'
    ).length;
  };
};

// =============================================================================
// Polymorphic Helpers (work on arrays AND strings)
// =============================================================================

export const len: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    if (value === null || value === undefined) {
      return 0;
    }
    if (Array.isArray(value)) {
      return value.length;
    }
    if (typeof value === 'string') {
      return value.length;
    }
    setWarning(
      `len(value): expected an array or string, got ${describeValue(value)}; measuring its text form`
    );
    return expectString(value).length;
  };
};

export const reverse: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): unknown[] | string => {
    if (value === null || value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      return [...value].reverse();
    }
    if (typeof value === 'string') {
      return value.split('').reverse().join('');
    }
    setWarning(
      `reverse(value): expected an array or string, got ${describeValue(value)}; using an empty array`
    );
    return [];
  };
};

export const indexOf: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown, search: unknown): number => {
    if (value === null || value === undefined) {
      return -1;
    }
    if (Array.isArray(value)) {
      return value.indexOf(search);
    }
    if (typeof value === 'string') {
      return value.indexOf(expectString(search));
    }
    setWarning(
      `indexOf(value): expected an array or string, got ${describeValue(value)}; using -1`
    );
    return -1;
  };
};

// =============================================================================
// Array Helpers
// =============================================================================

export const join: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown, separator?: unknown): string => {
    const arr = expectArray(
      array,
      item => expectString(item),
      setWarning,
      'join(array)'
    );
    const sep = separator !== undefined ? expectString(separator) : ', ';
    return arr.join(sep);
  };
};

export const first: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown => {
    return expectArrayRaw(array, setWarning, 'first(array)')[0];
  };
};

export const last: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown => {
    const arr = expectArrayRaw(array, setWarning, 'last(array)');
    return arr[arr.length - 1];
  };
};

export const slice: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown, start: unknown, end?: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning, 'slice(array)');
    const startIdx = expectNumber(start, setWarning, 'slice(start)');
    const endIdx =
      end !== undefined
        ? expectNumber(end, setWarning, 'slice(end)')
        : undefined;
    return arr.slice(startIdx, endIdx);
  };
};

export const sort: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning, 'sort(array)');
    return [...arr].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
      }
      return expectString(a).localeCompare(expectString(b));
    });
  };
};

export const unique: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown[] => {
    return [...new Set(expectArrayRaw(array, setWarning, 'unique(array)'))];
  };
};

export const flatten: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown[] => {
    return expectArrayRaw(array, setWarning, 'flatten(array)').flat(1);
  };
};

export const compact: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown): unknown[] => {
    return expectArrayRaw(array, setWarning, 'compact(array)').filter(
      item => item !== null && item !== undefined
    );
  };
};

export const pluck: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown, key: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning, 'pluck(array)');
    const keyStr = expectString(key);
    return arr.map(item => {
      if (item && typeof item === 'object' && keyStr in item) {
        return (item as Record<string, unknown>)[keyStr];
      }
      return undefined;
    });
  };
};

export const includes: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (array: unknown, value: unknown): boolean => {
    return expectArrayRaw(array, setWarning, 'includes(array)').includes(value);
  };
};

export const concat: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (...arrays: unknown[]): unknown[] => {
    const result: unknown[] = [];
    for (const arr of arrays) {
      for (const item of expectArrayRaw(arr, setWarning, 'concat(arrays)')) {
        result.push(item);
      }
    }
    return result;
  };
};

// =============================================================================
// String Helpers
// =============================================================================

export const upper: HelperFunction = () => {
  return (str: unknown): string => {
    return expectString(str).toLocaleUpperCase();
  };
};

export const lower: HelperFunction = () => {
  return (str: unknown): string => {
    return expectString(str).toLocaleLowerCase();
  };
};

// Aliases for upper/lower
export const uppercase: HelperFunction = upper;
export const lowercase: HelperFunction = lower;

export const trim: HelperFunction = () => {
  return (str: unknown): string => {
    return expectString(str).trim();
  };
};

export const substring: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (str: unknown, start: unknown, end?: unknown): string => {
    const s = expectString(str);
    const startIdx = expectNumber(start, setWarning, 'substring(start)');
    const endIdx =
      end !== undefined
        ? expectNumber(end, setWarning, 'substring(end)')
        : s.length;
    return s.substring(startIdx, endIdx);
  };
};

export const replace: HelperFunction = () => {
  return (str: unknown, search: unknown, replacement: unknown): string => {
    return expectString(str)
      .split(expectString(search))
      .join(expectString(replacement));
  };
};

export const capitalize: HelperFunction = () => {
  return (str: unknown): string => {
    const s = expectString(str);
    if (s.length === 0) return s;
    return s.charAt(0).toLocaleUpperCase() + s.slice(1);
  };
};

export const uncapitalize: HelperFunction = () => {
  return (str: unknown): string => {
    const s = expectString(str);
    if (s.length === 0) return s;
    return s.charAt(0).toLocaleLowerCase() + s.slice(1);
  };
};

export const titlecase: HelperFunction = () => {
  return (str: unknown): string => {
    return expectString(str).replace(/\b\w/g, char => char.toLocaleUpperCase());
  };
};

export const startsWith: HelperFunction = () => {
  return (str: unknown, prefix: unknown): boolean => {
    return expectString(str).startsWith(expectString(prefix));
  };
};

export const endsWith: HelperFunction = () => {
  return (str: unknown, suffix: unknown): boolean => {
    return expectString(str).endsWith(expectString(suffix));
  };
};

export const contains: HelperFunction = () => {
  return (str: unknown, substring: unknown): boolean => {
    return expectString(str).includes(expectString(substring));
  };
};

export const padStart: HelperFunction = (
  _scope: Scope,
  setWarning: Warn,
  limits?: HelperLimits
) => {
  return (str: unknown, length: unknown, char?: unknown): string => {
    const s = expectString(str);
    const len = clampOutputLength(
      expectNumber(
        length,
        setWarning,
        'padStart(length)',
        NON_NEGATIVE_INTEGER
      ),
      'padStart(length)',
      setWarning,
      limits
    );
    const c = char !== undefined ? expectString(char) : ' ';
    return s.padStart(len, c);
  };
};

export const padEnd: HelperFunction = (
  _scope: Scope,
  setWarning: Warn,
  limits?: HelperLimits
) => {
  return (str: unknown, length: unknown, char?: unknown): string => {
    const s = expectString(str);
    const len = clampOutputLength(
      expectNumber(length, setWarning, 'padEnd(length)', NON_NEGATIVE_INTEGER),
      'padEnd(length)',
      setWarning,
      limits
    );
    const c = char !== undefined ? expectString(char) : ' ';
    return s.padEnd(len, c);
  };
};

export const split: HelperFunction = () => {
  return (str: unknown, delimiter: unknown): string[] => {
    return expectString(str).split(expectString(delimiter));
  };
};

export const charAt: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (str: unknown, index: unknown): string => {
    const s = expectString(str);
    return s.charAt(expectNumber(index, setWarning, 'charAt(index)'));
  };
};

export const repeat: HelperFunction = (
  _scope: Scope,
  setWarning: Warn,
  limits?: HelperLimits
) => {
  return (str: unknown, count: unknown): string => {
    const s = expectString(str);
    const requested = expectNumber(
      count,
      setWarning,
      'repeat(count)',
      NON_NEGATIVE_INTEGER
    );
    if (s.length === 0 || requested === 0) {
      return '';
    }
    const produced = clampOutputLength(
      s.length * requested,
      'repeat(str, count)',
      setWarning,
      limits
    );
    return s.repeat(Math.floor(produced / s.length));
  };
};

export const truncate: HelperFunction = (
  _scope: Scope,
  setWarning: Warn,
  limits?: HelperLimits
) => {
  return (str: unknown, length: unknown, suffix?: unknown): string => {
    const s = expectString(str);
    const len = clampOutputLength(
      expectNumber(
        length,
        setWarning,
        'truncate(length)',
        NON_NEGATIVE_INTEGER
      ),
      'truncate(length)',
      setWarning,
      limits
    );
    const suf = suffix !== undefined ? expectString(suffix) : '...';
    if (s.length <= len) return s;
    // Postcondition: result.length <= len, unconditionally. A negative second
    // argument to slice counts back from the end of the string, which is how
    // truncate used to return more characters than it was given.
    if (len <= suf.length) return suf.slice(0, len);
    return s.slice(0, len - suf.length) + suf;
  };
};

// =============================================================================
// Math Helpers
// =============================================================================

export const round: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown, decimals?: unknown): number => {
    const val = expectNumber(value, setWarning, 'round(value)');
    const dec = expectNumber(
      decimals ?? 0,
      setWarning,
      'round(decimals)',
      ROUND_DIGITS
    );
    const factor = Math.pow(10, dec);
    return Math.round(val * factor) / factor;
  };
};

export const floor: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.floor(expectNumber(value, setWarning, 'floor(value)'));
  };
};

export const ceil: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.ceil(expectNumber(value, setWarning, 'ceil(value)'));
  };
};

export const abs: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.abs(expectNumber(value, setWarning, 'abs(value)'));
  };
};

export const sign: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.sign(expectNumber(value, setWarning, 'sign(value)'));
  };
};

export const sqrt: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.sqrt(expectNumber(value, setWarning, 'sqrt(value)'));
  };
};

export const pow: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (base: unknown, exponent: unknown): number => {
    const b = expectNumber(base, setWarning, 'pow(base)');
    const e = expectNumber(exponent, setWarning, 'pow(exponent)');
    return Math.pow(b, e);
  };
};

export const clamp: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown, minVal: unknown, maxVal: unknown): number => {
    const val = expectNumber(value, setWarning, 'clamp(value)');
    const lower = expectNumber(minVal, setWarning, 'clamp(min)');
    const upper = expectNumber(maxVal, setWarning, 'clamp(max)');
    return Math.min(Math.max(val, lower), upper);
  };
};

export const trunc: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return Math.trunc(expectNumber(value, setWarning, 'trunc(value)'));
  };
};

export const random: HelperFunction = () => {
  return (): number => {
    return Math.random();
  };
};

export const randomInt: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (minVal: unknown, maxVal: unknown): number => {
    const lower = expectNumber(minVal, setWarning, 'randomInt(min)');
    const upper = expectNumber(maxVal, setWarning, 'randomInt(max)');
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
  };
};

export const isNaNHelper: HelperFunction = () => {
  return (value: unknown): boolean => {
    return typeof value === 'number' && Number.isNaN(value);
  };
};

export const isFiniteHelper: HelperFunction = () => {
  return (value: unknown): boolean => {
    return typeof value === 'number' && Number.isFinite(value);
  };
};

export const toNumber: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (value: unknown): number => {
    return expectNumber(value, setWarning, 'toNumber(value)');
  };
};

export const toInt: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (str: unknown, radix?: unknown): number => {
    const s = expectString(str);
    const r =
      radix !== undefined
        ? expectNumber(radix, setWarning, 'toInt(radix)', RADIX)
        : 10;
    const result = parseInt(s, r);
    if (Number.isNaN(result)) {
      setWarning(
        `toInt(str): expected a base-${r} integer, got ${describeValue(str)}; using 0`
      );
      return 0;
    }
    return result;
  };
};

// =============================================================================
// Date/Time Helpers
// =============================================================================

export const now: HelperFunction = (scope: Scope, setWarning: Warn) => {
  return (): Date => {
    const configured = scope.globals['now'];
    if (configured === null || configured === undefined) {
      return new Date();
    }
    return expectDate(configured, setWarning, 'now($.now)') ?? new Date();
  };
};

/**
 * Builds a date helper that derives a new date from an input date.
 *
 * All eight `add*` helpers differ only in which field they move, and all eight
 * have to return null for a missing input and keep a calendar date on the
 * calendar - so the shared part lives here.
 *
 * @param apply - Mutates `result`, which is already a copy of the input.
 */
function dateArithmetic(
  helper: string,
  unit: string,
  apply: (result: Date, amount: number, dateOnly: boolean) => void
): HelperFunction {
  return (_scope: Scope, setWarning: Warn) => {
    return (date: unknown, amount: unknown): Date | null => {
      const dt = expectDate(date, setWarning, `${helper}(date)`);
      if (dt === null) {
        return null;
      }
      const n = expectNumber(amount, setWarning, `${helper}(${unit})`);
      const result = new Date(dt.getTime());
      apply(result, n, isDateOnly(dt));
      return deriveDate(dt, result);
    };
  };
}

export const addDays: HelperFunction = dateArithmetic(
  'addDays',
  'days',
  (result, days, dateOnly) => {
    // A calendar date lives at UTC midnight; moving it by local days would let
    // a DST transition carry it onto a different UTC day.
    if (dateOnly) {
      result.setUTCDate(result.getUTCDate() + days);
    } else {
      result.setDate(result.getDate() + days);
    }
  }
);

export const addWeeks: HelperFunction = dateArithmetic(
  'addWeeks',
  'weeks',
  (result, weeks, dateOnly) => {
    if (dateOnly) {
      result.setUTCDate(result.getUTCDate() + weeks * 7);
    } else {
      result.setDate(result.getDate() + weeks * 7);
    }
  }
);

export const addMonths: HelperFunction = dateArithmetic(
  'addMonths',
  'months',
  (result, months, dateOnly) => {
    if (dateOnly) {
      result.setUTCMonth(result.getUTCMonth() + months);
    } else {
      result.setMonth(result.getMonth() + months);
    }
  }
);

export const addYears: HelperFunction = dateArithmetic(
  'addYears',
  'years',
  (result, years, dateOnly) => {
    if (dateOnly) {
      result.setUTCFullYear(result.getUTCFullYear() + years);
    } else {
      result.setFullYear(result.getFullYear() + years);
    }
  }
);

export const addHours: HelperFunction = dateArithmetic(
  'addHours',
  'hours',
  (result, hours) => {
    result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  }
);

export const addMinutes: HelperFunction = dateArithmetic(
  'addMinutes',
  'minutes',
  (result, minutes) => {
    result.setTime(result.getTime() + minutes * 60 * 1000);
  }
);

export const addSeconds: HelperFunction = dateArithmetic(
  'addSeconds',
  'seconds',
  (result, seconds) => {
    result.setTime(result.getTime() + seconds * 1000);
  }
);

/** Calendar fields of an instant, read in one specific zone. */
interface DateComponents {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Reads the calendar fields of a date in a given zone.
 *
 * The host zone and UTC have native accessors; any other zone has to go through
 * `Intl`, which is the only API that knows the offset rules. The formatter is
 * cached, so the Intl path costs a `formatToParts` call rather than a locale
 * resolution.
 */
function dateComponents(
  date: Date,
  timeZone: string | undefined
): DateComponents {
  if (timeZone === undefined) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
  if (timeZone === 'UTC') {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }

  const parts = dateTimeFormatter('en-US', 'parts', timeZone).formatToParts(
    date
  );
  const components: DateComponents = {
    year: 0,
    month: 0,
    day: 0,
    weekday: 0,
    hour: 0,
    minute: 0,
    second: 0,
  };
  for (const part of parts) {
    switch (part.type) {
      case 'year':
        components.year = Number(part.value);
        break;
      case 'month':
        components.month = Number(part.value);
        break;
      case 'day':
        components.day = Number(part.value);
        break;
      case 'weekday':
        components.weekday = WEEKDAY_INDEX[part.value] ?? 0;
        break;
      case 'hour':
        components.hour = Number(part.value) % 24;
        break;
      case 'minute':
        components.minute = Number(part.value);
        break;
      case 'second':
        components.second = Number(part.value);
        break;
      default:
        break;
    }
  }
  return components;
}

/**
 * Builds a helper that extracts one calendar field.
 *
 * Returns null for a missing date - the renderer prints that as empty, where a
 * fabricated 0 or 1970 would print as data.
 */
function dateComponent(
  helper: string,
  read: (components: DateComponents) => number
): HelperFunction {
  return (scope: Scope, setWarning: Warn) => {
    return (date: unknown): number | null => {
      const dt = expectDate(date, setWarning, `${helper}(date)`);
      if (dt === null) {
        return null;
      }
      const timeZone = isDateOnly(dt)
        ? 'UTC'
        : scopeTimeZone(scope, setWarning, helper);
      return read(dateComponents(dt, timeZone));
    };
  };
}

export const year: HelperFunction = dateComponent('year', c => c.year);
export const month: HelperFunction = dateComponent('month', c => c.month);
export const day: HelperFunction = dateComponent('day', c => c.day);
export const weekday: HelperFunction = dateComponent('weekday', c => c.weekday);
export const hour: HelperFunction = dateComponent('hour', c => c.hour);
export const minute: HelperFunction = dateComponent('minute', c => c.minute);
export const second: HelperFunction = dateComponent('second', c => c.second);

export const diffDays: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (date1: unknown, date2: unknown): number | null => {
    const d1 = expectDate(date1, setWarning, 'diffDays(date1)');
    const d2 = expectDate(date2, setWarning, 'diffDays(date2)');
    if (d1 === null || d2 === null) {
      return null;
    }
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };
};

export const isBefore: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (date1: unknown, date2: unknown): boolean | null => {
    const d1 = expectDate(date1, setWarning, 'isBefore(date1)');
    const d2 = expectDate(date2, setWarning, 'isBefore(date2)');
    if (d1 === null || d2 === null) {
      return null;
    }
    return d1.getTime() < d2.getTime();
  };
};

export const isAfter: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (date1: unknown, date2: unknown): boolean | null => {
    const d1 = expectDate(date1, setWarning, 'isAfter(date1)');
    const d2 = expectDate(date2, setWarning, 'isAfter(date2)');
    if (d1 === null || d2 === null) {
      return null;
    }
    return d1.getTime() > d2.getTime();
  };
};

export const parseDate: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (str: unknown, _format?: unknown): Date | null => {
    // Note: format parameter is for future implementation
    // Currently uses native Date parsing
    return expectDate(str, setWarning, 'parseDate(str)');
  };
};

// =============================================================================
// Utility Helpers
// =============================================================================

export const defaultHelper: HelperFunction = () => {
  return (value: unknown, defaultValue: unknown): unknown => {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    return value;
  };
};

export const typeHelper: HelperFunction = () => {
  return (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };
};

export const isEmpty: HelperFunction = () => {
  return (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  };
};

export const isNull: HelperFunction = () => {
  return (value: unknown): boolean => {
    return value === null;
  };
};

export const isDefined: HelperFunction = () => {
  return (value: unknown): boolean => {
    return value !== null && value !== undefined;
  };
};

export const isArray: HelperFunction = () => {
  return (value: unknown): boolean => {
    return Array.isArray(value);
  };
};

export const isString: HelperFunction = () => {
  return (value: unknown): boolean => {
    return typeof value === 'string';
  };
};

export const isNumber: HelperFunction = () => {
  return (value: unknown): boolean => {
    return typeof value === 'number' && !Number.isNaN(value);
  };
};

export const isBoolean: HelperFunction = () => {
  return (value: unknown): boolean => {
    return typeof value === 'boolean';
  };
};

export const toStringHelper: HelperFunction = () => {
  return (value: unknown): string => {
    return expectString(value);
  };
};

export const fromJson: HelperFunction = (_scope: Scope, setWarning: Warn) => {
  return (str: unknown): unknown => {
    const s = expectString(str);
    try {
      return JSON.parse(s);
    } catch {
      setWarning(
        `fromJson(str): expected JSON, got ${describeValue(str)}; using null`
      );
      return null;
    }
  };
};

export const toJson: HelperFunction = () => {
  return (value: unknown): string => {
    return JSON.stringify(value);
  };
};

// =============================================================================
// Standard Library Export
// =============================================================================

export const standardLibrary = {
  // Formatting
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,

  // Aggregation
  sum,
  avg,
  min,
  max,
  count,

  // Polymorphic (array + string)
  len,
  reverse,
  indexOf,

  // Array
  join,
  first,
  last,
  slice,
  sort,
  unique,
  flatten,
  compact,
  pluck,
  includes,
  concat,

  // String
  upper,
  lower,
  uppercase,
  lowercase,
  trim,
  substring,
  replace,
  capitalize,
  uncapitalize,
  titlecase,
  startsWith,
  endsWith,
  contains,
  padStart,
  padEnd,
  split,
  charAt,
  repeat,
  truncate,

  // Math
  round,
  floor,
  ceil,
  abs,
  sign,
  sqrt,
  pow,
  clamp,
  trunc,
  random,
  randomInt,
  isNaN: isNaNHelper,
  isFinite: isFiniteHelper,
  toNumber,
  toInt,

  // Date
  now,
  addDays,
  addYears,
  addMonths,
  addWeeks,
  addHours,
  addMinutes,
  addSeconds,
  year,
  month,
  day,
  weekday,
  hour,
  minute,
  second,
  diffDays,
  isBefore,
  isAfter,
  parseDate,

  // Utility
  default: defaultHelper,
  type: typeHelper,
  isEmpty,
  isNull,
  isDefined,
  isArray,
  isString,
  isNumber,
  isBoolean,
  toString: toStringHelper,
  fromJson,
  toJson,
};
