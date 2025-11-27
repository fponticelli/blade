// Standard library helpers
// Comprehensive helper functions for Blade templates

import type { HelperFunction, Scope } from '../evaluator/index.js';

// =============================================================================
// Type Coercion Utilities
// =============================================================================

function expectNumber(
  value: unknown,
  setWarning: (msg: string) => void
): number {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false
  ) {
    return 0;
  }
  if (value === true) {
    return 1;
  }

  const num = Number(value);
  if (isNaN(num)) {
    setWarning(`Expected a number but got: ${value}`);
    return 0;
  }
  return num;
}

function expectString(
  value: unknown,
  _setWarning: (msg: string) => void
): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
function expectLocale(
  value: unknown,
  setWarning: (msg: string) => void
): string {
  const locale = expectString(value, setWarning);
  if (!localeRegex.test(locale)) {
    setWarning(`Expected a locale string but got: ${value}`);
    return 'en-US';
  }
  return locale;
}

function expectCurrency(
  value: unknown,
  setWarning: (msg: string) => void
): string {
  const currency = expectString(value, setWarning);
  if (currency.length !== 3 && currency.toUpperCase() !== currency) {
    setWarning(`Expected a 3-letter currency code but got: ${value}`);
    return 'USD';
  }
  return currency.toUpperCase();
}

function expectDate(value: unknown, setWarning: (msg: string) => void): Date {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      setWarning(`Expected a valid date but got: ${value}`);
      return new Date(0);
    }
    return value;
  }
  const date = new Date(value as string | number);
  if (isNaN(date.getTime())) {
    setWarning(`Expected a valid date but got: ${value}`);
    return new Date(0);
  }
  return date;
}

function expectArrayRaw(
  value: unknown,
  setWarning: (msg: string) => void
): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  setWarning(`Expected an array but got: ${typeof value}`);
  return [value];
}

function expectArray<T>(
  value: unknown,
  expectItem: (item: unknown, setWarning: (msg: string) => void) => T,
  setWarning: (msg: string) => void
): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flat().map(item => expectItem(item, setWarning));
  }
  setWarning(`Expected an array but got: ${value}`);
  return [expectItem(value, setWarning)];
}

// =============================================================================
// Formatting Helpers
// =============================================================================

export const formatCurrency: HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, currency?: unknown): string => {
    const val = expectNumber(value, setWarning);
    const curr = expectCurrency(
      currency ?? (scope.globals['currency'] as string) ?? 'USD',
      setWarning
    );
    const locale = expectLocale(
      (scope.globals['locale'] as string) ?? 'en-US',
      setWarning
    );
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
    }).format(val);
  };
};

export const formatNumber: HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, decimals?: unknown): string => {
    const val = expectNumber(value, setWarning);
    const locale = expectLocale(
      (scope.globals['locale'] as string) ?? 'en-US',
      setWarning
    );
    const dec = expectNumber(decimals, setWarning);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(val);
  };
};

export const formatPercent: HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, decimals?: unknown): string => {
    const val = expectNumber(value, setWarning);
    const dec = expectNumber(decimals, setWarning);
    const locale = expectLocale(
      (scope.globals['locale'] as string) ?? 'en-US',
      setWarning
    );
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(val);
  };
};

export const formatDate: HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, format?: unknown): string => {
    const dt = expectDate(date, setWarning);
    const locale = expectLocale(
      (scope.globals['locale'] as string) ?? 'en-US',
      setWarning
    );

    const options: Intl.DateTimeFormatOptions = {};

    if (format === 'short') {
      options.year = '2-digit';
      options.month = 'numeric';
      options.day = 'numeric';
    } else if (format === 'long') {
      options.year = 'numeric';
      options.month = 'long';
      options.day = 'numeric';
      options.weekday = 'long';
    } else {
      // Default format
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    }

    return new Intl.DateTimeFormat(locale, options).format(dt);
  };
};

// =============================================================================
// Aggregation Helpers
// =============================================================================

export const sum: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...args: unknown[]): number => {
    const vals = expectArray(args, expectNumber, setWarning);
    return vals.reduce((acc: number, val: number) => acc + val, 0);
  };
};

export const avg: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...args: unknown[]): number => {
    const vals = expectArray(args, expectNumber, setWarning);
    if (vals.length === 0) {
      return 0;
    }
    const total = vals.reduce((acc: number, val: number) => acc + val, 0);
    return total / vals.length;
  };
};

export const min: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...args: unknown[]): number => {
    const vals = expectArray(args, expectNumber, setWarning);
    return Math.min(...vals);
  };
};

export const max: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...args: unknown[]): number => {
    const values = expectArray(args, expectNumber, setWarning);
    return Math.max(...values.map(Number));
  };
};

export const count: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...args: unknown[]): number => {
    const values = expectArray(args, (_item: unknown) => 0, setWarning);
    return values.length;
  };
};

// =============================================================================
// Polymorphic Helpers (work on arrays AND strings)
// =============================================================================

export const len: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
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
    setWarning(`len() expected array or string, got ${typeof value}`);
    return String(value).length;
  };
};

export const reverse: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
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
    setWarning(`reverse() expected array or string, got ${typeof value}`);
    return [];
  };
};

export const indexOf: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, search: unknown): number => {
    if (value === null || value === undefined) {
      return -1;
    }
    if (Array.isArray(value)) {
      return value.indexOf(search);
    }
    if (typeof value === 'string') {
      const searchStr = expectString(search, setWarning);
      return value.indexOf(searchStr);
    }
    setWarning(`indexOf() expected array or string, got ${typeof value}`);
    return -1;
  };
};

// =============================================================================
// Array Helpers
// =============================================================================

export const join: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown, separator?: unknown): string => {
    const arr = expectArray(array, expectString, setWarning);
    const sep =
      separator !== undefined ? expectString(separator, setWarning) : ', ';
    return arr.join(sep);
  };
};

export const first: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown => {
    const arr = expectArrayRaw(array, setWarning);
    return arr[0];
  };
};

export const last: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown => {
    const arr = expectArrayRaw(array, setWarning);
    return arr[arr.length - 1];
  };
};

export const slice: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown, start: unknown, end?: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    const startIdx = expectNumber(start, setWarning);
    const endIdx =
      end !== undefined ? expectNumber(end, setWarning) : undefined;
    return arr.slice(startIdx, endIdx);
  };
};

export const sort: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    return [...arr].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
      }
      return String(a).localeCompare(String(b));
    });
  };
};

export const unique: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    return [...new Set(arr)];
  };
};

export const flatten: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    return arr.flat(1);
  };
};

export const compact: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    return arr.filter(item => item !== null && item !== undefined);
  };
};

export const pluck: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown, key: unknown): unknown[] => {
    const arr = expectArrayRaw(array, setWarning);
    const keyStr = expectString(key, setWarning);
    return arr.map(item => {
      if (item && typeof item === 'object' && keyStr in item) {
        return (item as Record<string, unknown>)[keyStr];
      }
      return undefined;
    });
  };
};

export const includes: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown, value: unknown): boolean => {
    const arr = expectArrayRaw(array, setWarning);
    return arr.includes(value);
  };
};

export const concat: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (...arrays: unknown[]): unknown[] => {
    const result: unknown[] = [];
    for (const arr of arrays) {
      const items = expectArrayRaw(arr, setWarning);
      result.push(...items);
    }
    return result;
  };
};

// =============================================================================
// String Helpers
// =============================================================================

export const upper: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    return s.toLocaleUpperCase();
  };
};

export const lower: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    return s.toLocaleLowerCase();
  };
};

// Aliases for upper/lower
export const uppercase: HelperFunction = upper;
export const lowercase: HelperFunction = lower;

export const trim: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    return s.trim();
  };
};

export const substring: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, start: unknown, end?: unknown): string => {
    const s = expectString(str, setWarning);
    const startIdx = expectNumber(start, setWarning);
    const endIdx = end !== undefined ? expectNumber(end, setWarning) : s.length;
    return s.substring(startIdx, endIdx);
  };
};

export const replace: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, search: unknown, replacement: unknown): string => {
    const s = expectString(str, setWarning);
    const searchStr = expectString(search, setWarning);
    const replacementStr = expectString(replacement, setWarning);
    return s.split(searchStr).join(replacementStr);
  };
};

export const capitalize: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    if (s.length === 0) return s;
    return s.charAt(0).toLocaleUpperCase() + s.slice(1);
  };
};

export const uncapitalize: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    if (s.length === 0) return s;
    return s.charAt(0).toLocaleLowerCase() + s.slice(1);
  };
};

export const titlecase: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): string => {
    const s = expectString(str, setWarning);
    return s.replace(/\b\w/g, char => char.toLocaleUpperCase());
  };
};

export const startsWith: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, prefix: unknown): boolean => {
    const s = expectString(str, setWarning);
    const p = expectString(prefix, setWarning);
    return s.startsWith(p);
  };
};

export const endsWith: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, suffix: unknown): boolean => {
    const s = expectString(str, setWarning);
    const suf = expectString(suffix, setWarning);
    return s.endsWith(suf);
  };
};

export const contains: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, substring: unknown): boolean => {
    const s = expectString(str, setWarning);
    const sub = expectString(substring, setWarning);
    return s.includes(sub);
  };
};

export const padStart: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, length: unknown, char?: unknown): string => {
    const s = expectString(str, setWarning);
    const len = expectNumber(length, setWarning);
    const c = char !== undefined ? expectString(char, setWarning) : ' ';
    return s.padStart(len, c);
  };
};

export const padEnd: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, length: unknown, char?: unknown): string => {
    const s = expectString(str, setWarning);
    const len = expectNumber(length, setWarning);
    const c = char !== undefined ? expectString(char, setWarning) : ' ';
    return s.padEnd(len, c);
  };
};

export const split: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, delimiter: unknown): string[] => {
    const s = expectString(str, setWarning);
    const d = expectString(delimiter, setWarning);
    return s.split(d);
  };
};

export const charAt: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, index: unknown): string => {
    const s = expectString(str, setWarning);
    const idx = expectNumber(index, setWarning);
    return s.charAt(idx);
  };
};

export const repeat: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, count: unknown): string => {
    const s = expectString(str, setWarning);
    const c = expectNumber(count, setWarning);
    if (c < 0) {
      setWarning(`repeat() count must be non-negative, got ${c}`);
      return '';
    }
    return s.repeat(c);
  };
};

export const truncate: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, length: unknown, suffix?: unknown): string => {
    const s = expectString(str, setWarning);
    const len = expectNumber(length, setWarning);
    const suf = suffix !== undefined ? expectString(suffix, setWarning) : '...';
    if (s.length <= len) return s;
    return s.slice(0, len - suf.length) + suf;
  };
};

// =============================================================================
// Math Helpers
// =============================================================================

export const round: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, decimals?: unknown): number => {
    const val = expectNumber(value, setWarning);
    const dec = expectNumber(decimals ?? 0, setWarning);
    const factor = Math.pow(10, dec);
    return Math.round(val * factor) / factor;
  };
};

export const floor: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.floor(val);
  };
};

export const ceil: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.ceil(val);
  };
};

export const abs: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.abs(val);
  };
};

export const sign: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.sign(val);
  };
};

export const sqrt: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.sqrt(val);
  };
};

export const pow: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (base: unknown, exponent: unknown): number => {
    const b = expectNumber(base, setWarning);
    const e = expectNumber(exponent, setWarning);
    return Math.pow(b, e);
  };
};

export const clamp: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown, minVal: unknown, maxVal: unknown): number => {
    const val = expectNumber(value, setWarning);
    const min = expectNumber(minVal, setWarning);
    const max = expectNumber(maxVal, setWarning);
    return Math.min(Math.max(val, min), max);
  };
};

export const trunc: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    const val = expectNumber(value, setWarning);
    return Math.trunc(val);
  };
};

export const random: HelperFunction = () => {
  return (): number => {
    return Math.random();
  };
};

export const randomInt: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (minVal: unknown, maxVal: unknown): number => {
    const min = expectNumber(minVal, setWarning);
    const max = expectNumber(maxVal, setWarning);
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

export const toNumber: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): number => {
    return expectNumber(value, setWarning);
  };
};

export const toInt: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, radix?: unknown): number => {
    const s = expectString(str, setWarning);
    const r = radix !== undefined ? expectNumber(radix, setWarning) : 10;
    const result = parseInt(s, r);
    if (isNaN(result)) {
      setWarning(`toInt() could not parse: ${s}`);
      return 0;
    }
    return result;
  };
};

// =============================================================================
// Date/Time Helpers
// =============================================================================

export const now: HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (): Date => {
    return expectDate(scope.globals.now ?? new Date(), setWarning);
  };
};

export const addDays: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, days: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const d = expectNumber(days, setWarning);
    const result = new Date(dt);
    result.setDate(result.getDate() + d);
    return result;
  };
};

export const addYears: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, years: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const y = expectNumber(years, setWarning);
    const result = new Date(dt);
    result.setFullYear(result.getFullYear() + y);
    return result;
  };
};

export const addMonths: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, months: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const m = expectNumber(months, setWarning);
    const result = new Date(dt);
    result.setMonth(result.getMonth() + m);
    return result;
  };
};

export const addWeeks: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, weeks: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const w = expectNumber(weeks, setWarning);
    const result = new Date(dt);
    result.setDate(result.getDate() + w * 7);
    return result;
  };
};

export const addHours: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, hours: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const h = expectNumber(hours, setWarning);
    const result = new Date(dt);
    result.setTime(result.getTime() + h * 60 * 60 * 1000);
    return result;
  };
};

export const addMinutes: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, minutes: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const m = expectNumber(minutes, setWarning);
    const result = new Date(dt);
    result.setTime(result.getTime() + m * 60 * 1000);
    return result;
  };
};

export const addSeconds: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown, seconds: unknown): Date => {
    const dt = expectDate(date, setWarning);
    const s = expectNumber(seconds, setWarning);
    const result = new Date(dt);
    result.setTime(result.getTime() + s * 1000);
    return result;
  };
};

export const year: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getFullYear();
  };
};

export const month: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getMonth() + 1; // 1-indexed
  };
};

export const day: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getDate();
  };
};

export const weekday: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getDay();
  };
};

export const hour: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getHours();
  };
};

export const minute: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getMinutes();
  };
};

export const second: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date: unknown): number => {
    const dt = expectDate(date, setWarning);
    return dt.getSeconds();
  };
};

export const diffDays: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date1: unknown, date2: unknown): number => {
    const d1 = expectDate(date1, setWarning);
    const d2 = expectDate(date2, setWarning);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };
};

export const isBefore: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date1: unknown, date2: unknown): boolean => {
    const d1 = expectDate(date1, setWarning);
    const d2 = expectDate(date2, setWarning);
    return d1.getTime() < d2.getTime();
  };
};

export const isAfter: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (date1: unknown, date2: unknown): boolean => {
    const d1 = expectDate(date1, setWarning);
    const d2 = expectDate(date2, setWarning);
    return d1.getTime() > d2.getTime();
  };
};

export const parseDate: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown, _format?: unknown): Date => {
    // Note: format parameter is for future implementation
    // Currently uses native Date parsing
    const s = expectString(str, setWarning);
    return expectDate(s, setWarning);
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

export const toStringHelper: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (value: unknown): string => {
    return expectString(value, setWarning);
  };
};

export const fromJson: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (str: unknown): unknown => {
    const s = expectString(str, setWarning);
    try {
      return JSON.parse(s);
    } catch {
      setWarning(`fromJson() could not parse: ${s}`);
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
