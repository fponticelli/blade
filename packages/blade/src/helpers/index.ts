// Standard library helpers
// TODO: Implement helper functions

import type { HelperFunction, Scope } from '../evaluator/index.js';

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

// function expectBoolean(
//   value: unknown,
//   setWarning: (msg: string) => void
// ): boolean {
//   if (value === null || value === undefined) {
//     return false;
//   }
//   if (value === 'true' || value === 1 || value === '1' || value === 'yes') {
//     return true;
//   }
//   if (value === 'false' || value === 0 || value === '0' || value === 'no') {
//     return false;
//   }
//   if (typeof value !== 'boolean') {
//     setWarning(`Expected a boolean but got: ${value}`);
//     return false;
//   }
//   return value;
// }

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
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    setWarning(`Expected a valid date but got: ${value}`);
    return new Date(0);
  }
  return date;
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
    const arr = expectArray(array, (_item: unknown) => _item, setWarning);
    return arr[0];
  };
};

export const last: HelperFunction = (
  _scope: Scope,
  setWarning: (msg: string) => void
) => {
  return (array: unknown): unknown => {
    const arr = expectArray(array, (_item: unknown) => _item, setWarning);
    return arr[arr.length - 1];
  };
};

// =============================================================================
// Standard Library Export
// =============================================================================

export const standardLibrary = {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  sum,
  avg,
  min,
  max,
  count,
  upper,
  lower,
  trim,
  substring,
  replace,
  round,
  floor,
  ceil,
  abs,
  now,
  addDays,
  join,
  first,
  last,
};
