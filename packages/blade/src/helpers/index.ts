// Standard library helpers
// TODO: Implement helper functions

import type { HelperFunction, Scope } from '../evaluator/index.js';

// =============================================================================
// Formatting Helpers
// =============================================================================

export const formatCurrency: HelperFunction = (scope: Scope) => {
  return (value: unknown, currency?: unknown): string => {
    const curr = currency ?? (scope.globals['currency'] as string) ?? 'USD';
    const locale = (scope.globals['locale'] as string) ?? 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
    }).format(Number(value));
  };
};

export const formatNumber: HelperFunction = (scope: Scope) => {
  return (value: unknown, decimals?: unknown): string => {
    const locale = (scope.globals['locale'] as string) ?? 'en-US';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number(value));
  };
};

export const formatPercent: HelperFunction = (scope: Scope) => {
  return (value: unknown, decimals?: unknown): string => {
    const locale = (scope.globals['locale'] as string) ?? 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number(value));
  };
};

export const formatDate: HelperFunction = (_scope: Scope) => {
  return (date: unknown, _format?: string): string => {
    // TODO: Implement proper date formatting
    return new Date(date as string | number | Date).toISOString();
  };
};

// =============================================================================
// Aggregation Helpers
// =============================================================================

export const sum: HelperFunction = (_scope: Scope) => {
  return (values: unknown[]): number => {
    return values.reduce((acc: number, val) => acc + Number(val), 0);
  };
};

export const avg: HelperFunction = (_scope: Scope) => {
  return (values: unknown[]): number => {
    if (values.length === 0) return 0;
    const total = values.reduce((acc: number, val) => acc + Number(val), 0);
    return total / values.length;
  };
};

export const min: HelperFunction = (_scope: Scope) => {
  return (values: unknown[]): number => {
    return Math.min(...values.map(Number));
  };
};

export const max: HelperFunction = (_scope: Scope) => {
  return (values: unknown[]): number => {
    return Math.max(...values.map(Number));
  };
};

export const count: HelperFunction = (_scope: Scope) => {
  return (values: unknown[]): number => {
    return values.length;
  };
};

// =============================================================================
// String Helpers
// =============================================================================

export const upper: HelperFunction = (_scope: Scope) => {
  return (str: unknown): string => {
    return String(str).toUpperCase();
  };
};

export const lower: HelperFunction = (_scope: Scope) => {
  return (str: unknown): string => {
    return String(str).toLowerCase();
  };
};

export const trim: HelperFunction = (_scope: Scope) => {
  return (str: unknown): string => {
    return String(str).trim();
  };
};

export const substring: HelperFunction = (_scope: Scope) => {
  return (str: unknown, start: unknown, end?: unknown): string => {
    return String(str).substring(start, end);
  };
};

export const replace: HelperFunction = (_scope: Scope) => {
  return (str: unknown, search: unknown, replacement: unknown): string => {
    return String(str).replace(search, replacement);
  };
};

// =============================================================================
// Math Helpers
// =============================================================================

export const round: HelperFunction = (_scope: Scope) => {
  return (value: unknown, decimals?: unknown): number => {
    const factor = Math.pow(10, decimals ?? 0);
    return Math.round(Number(value) * factor) / factor;
  };
};

export const floor: HelperFunction = (_scope: Scope) => {
  return (value: unknown): number => {
    return Math.floor(Number(value));
  };
};

export const ceil: HelperFunction = (_scope: Scope) => {
  return (value: unknown): number => {
    return Math.ceil(Number(value));
  };
};

export const abs: HelperFunction = (_scope: Scope) => {
  return (value: unknown): number => {
    return Math.abs(Number(value));
  };
};

// =============================================================================
// Date/Time Helpers
// =============================================================================

export const now: HelperFunction = (_scope: Scope) => {
  return (): Date => {
    return new Date();
  };
};

export const addDays: HelperFunction = (_scope: Scope) => {
  return (date: unknown, days: number): Date => {
    const result = new Date(date as string | number | Date);
    result.setDate(result.getDate() + days);
    return result;
  };
};

// =============================================================================
// Array Helpers
// =============================================================================

export const join: HelperFunction = (_scope: Scope) => {
  return (array: unknown[], separator?: string): string => {
    return array.join(separator ?? ', ');
  };
};

export const first: HelperFunction = (_scope: Scope) => {
  return (array: unknown[]): unknown => {
    return array[0];
  };
};

export const last: HelperFunction = (_scope: Scope) => {
  return (array: unknown[]): unknown => {
    return array[array.length - 1];
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
