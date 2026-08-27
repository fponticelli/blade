/**
 * Helper Function Metadata
 *
 * Provides metadata for LSP integration, documentation, and source tracking.
 */

import type { SourceOp } from '../source-tracking/index.js';
// Type-only: erased at emit, so the value-level import graph
// (source-tracking -> metadata) stays acyclic while the key set of
// `standardLibrary` still constrains this registry.
import type { standardLibrary } from './index.js';

export type HelperCategory =
  | 'array'
  | 'string'
  | 'date'
  | 'number'
  | 'utility'
  | 'format';

export interface HelperMetadata {
  name: string;
  signature: string;
  description: string;
  examples: string[];
  category: HelperCategory;
  polymorphic?: boolean;
  sinceVersion?: string;
  /**
   * How this helper is reported in `rd-source-op`.
   *
   * Only helpers that change the provenance story carry one: presenting a
   * value (`format`), collapsing many values into one (`aggregate`), reading
   * something outside the data (`system`), or deriving a new number
   * (`calculated`). Helpers that select, test, or reshape without changing
   * what the value *is* leave this unset and fall through to the structural
   * rules in `classifyExpression`.
   */
  sourceOp?: SourceOp;
  /**
   * What the helper's return value *is*, when it is not prose.
   *
   * `'json'` means the string it returns is already JSON text, i.e. JavaScript
   * source. Inside a `<script>` element that changes the correct escaper: JSON
   * run through a JavaScript *string* escaper comes out as an unusable pile of
   * backslashes, which is what pushed every consumer of
   * `<script>var d = ${toJson(x)}</script>` onto the raw `$!` sink and straight
   * into a `</script>` breakout. The renderer asks this question through
   * {@link producesJsonSource}.
   */
  outputKind?: 'json';
}

/**
 * Registry of all helper function metadata for LSP and documentation.
 *
 * The `satisfies` clause keeps this registry and `standardLibrary` in lockstep
 * by the compiler, in both directions: a helper added without metadata is a
 * missing-property error, and metadata for a helper that no longer exists is an
 * excess-property error. Nothing else enforces it - the consumers of the two
 * sets are disjoint, so a helper with no metadata would silently lose hover,
 * completion and its `rd-source-op` provenance classification.
 *
 * The declared type stays `Record<string, HelperMetadata>` because callers look
 * helpers up by a name parsed out of a template, which is a plain string.
 */
export const helperMetadata: Record<string, HelperMetadata> = {
  // Formatting helpers (existing)
  formatCurrency: {
    name: 'formatCurrency',
    signature: 'formatCurrency(value: number, currency?: string): string',
    description:
      'Formats a number as currency using $.currency and $.locale. An invalid currency code warns and falls back to USD',
    examples: [
      'formatCurrency(1234.56) → "$1,234.56"',
      'formatCurrency(1234.56, "EUR") → "€1,234.56"',
    ],
    category: 'format',
    sourceOp: { category: 'format', detail: 'currency' },
  },
  formatNumber: {
    name: 'formatNumber',
    signature: 'formatNumber(value: number, decimals?: number): string',
    description:
      'Formats a number with locale-aware formatting. decimals is clamped to 0-20',
    examples: ['formatNumber(1234.567, 2) → "1,234.57"'],
    category: 'format',
    sourceOp: { category: 'format', detail: 'number' },
  },
  formatPercent: {
    name: 'formatPercent',
    signature: 'formatPercent(value: number, decimals?: number): string',
    description:
      'Formats a number as a percentage. decimals is clamped to 0-20',
    examples: ['formatPercent(0.1234, 1) → "12.3%"'],
    category: 'format',
    sourceOp: { category: 'format', detail: 'percent' },
  },
  formatDate: {
    name: 'formatDate',
    signature:
      'formatDate(date: Date | string | null, format?: "short" | "long"): string',
    description:
      'Formats a date using $.locale and $.timezone. A date-only value (2025-11-26) always prints that calendar day, whatever the host zone; a missing or invalid date prints as an empty string',
    examples: [
      'formatDate(date, "short") → "11/26/25"',
      'formatDate(date, "long") → "Wednesday, November 26, 2025"',
      'formatDate(null) → ""',
    ],
    category: 'format',
    sourceOp: { category: 'format', detail: 'date' },
  },

  // Aggregation helpers (existing)
  // Empty-input contract, shared by all five: sum and count have an identity
  // element and return 0; avg, min and max have none and return null, which
  // renders as an empty string rather than a fabricated 0 or Infinity.
  sum: {
    name: 'sum',
    signature: 'sum(...values: number[]): number',
    description: 'Returns the sum of all values, or 0 when there are none',
    examples: ['sum(1, 2, 3) → 6', 'sum([1, 2, 3]) → 6', 'sum([]) → 0'],
    category: 'number',
    sourceOp: { category: 'aggregate' },
  },
  avg: {
    name: 'avg',
    signature: 'avg(...values: number[]): number | null',
    description:
      'Returns the average of all values, or null when there are none',
    examples: ['avg(1, 2, 3) → 2', 'avg([1, 2, 3]) → 2', 'avg([]) → null'],
    category: 'number',
    sourceOp: { category: 'aggregate' },
  },
  min: {
    name: 'min',
    signature: 'min(...values: number[]): number | null',
    description: 'Returns the minimum value, or null when there are none',
    examples: ['min(3, 1, 2) → 1', 'min([]) → null'],
    category: 'number',
    sourceOp: { category: 'aggregate' },
  },
  max: {
    name: 'max',
    signature: 'max(...values: number[]): number | null',
    description: 'Returns the maximum value, or null when there are none',
    examples: ['max(3, 1, 2) → 3', 'max([]) → null'],
    category: 'number',
    sourceOp: { category: 'aggregate' },
  },
  count: {
    name: 'count',
    signature: 'count(...values: unknown[]): number',
    description: 'Returns the count of values, or 0 when there are none',
    examples: ['count(1, 2, 3) → 3', 'count([1, 2, 3]) → 3', 'count([]) → 0'],
    category: 'number',
    sourceOp: { category: 'aggregate' },
  },

  // String helpers (existing)
  upper: {
    name: 'upper',
    signature: 'upper(str: string): string',
    description: 'Converts string to uppercase',
    examples: ['upper("hello") → "HELLO"'],
    category: 'string',
  },
  lower: {
    name: 'lower',
    signature: 'lower(str: string): string',
    description: 'Converts string to lowercase',
    examples: ['lower("HELLO") → "hello"'],
    category: 'string',
  },
  trim: {
    name: 'trim',
    signature: 'trim(str: string): string',
    description: 'Removes leading and trailing whitespace',
    examples: ['trim("  hello  ") → "hello"'],
    category: 'string',
  },
  substring: {
    name: 'substring',
    signature: 'substring(str: string, start: number, end?: number): string',
    description: 'Extracts a portion of the string',
    examples: ['substring("hello", 1, 3) → "el"'],
    category: 'string',
  },
  replace: {
    name: 'replace',
    signature:
      'replace(str: string, search: string, replacement: string): string',
    description: 'Replaces all occurrences of search with replacement',
    examples: ['replace("hello", "l", "L") → "heLLo"'],
    category: 'string',
  },

  // Math helpers (existing)
  round: {
    name: 'round',
    signature: 'round(value: number, decimals?: number): number',
    description: 'Rounds to specified decimal places, clamped to -20..20',
    examples: ['round(3.567, 1) → 3.6'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  floor: {
    name: 'floor',
    signature: 'floor(value: number): number',
    description: 'Rounds down to nearest integer',
    examples: ['floor(3.7) → 3'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  ceil: {
    name: 'ceil',
    signature: 'ceil(value: number): number',
    description: 'Rounds up to nearest integer',
    examples: ['ceil(3.2) → 4'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  abs: {
    name: 'abs',
    signature: 'abs(value: number): number',
    description: 'Returns the absolute value',
    examples: ['abs(-5) → 5'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },

  // Date helpers (existing)
  now: {
    name: 'now',
    signature: 'now(): Date',
    description: 'Returns the current date/time',
    examples: ['now() → current Date'],
    category: 'date',
    sourceOp: { category: 'system', detail: 'clock' },
  },
  addDays: {
    name: 'addDays',
    signature: 'addDays(date: Date, days: number): Date | null',
    description:
      'Adds days to a date, or null when there is no date. Calendar dates stay on the calendar across DST boundaries',
    examples: ['addDays(date, 7) → date + 7 days'],
    category: 'date',
  },

  // Array helpers (existing)
  join: {
    name: 'join',
    signature: 'join(array: unknown[], separator?: string): string',
    description: 'Joins array elements into a string',
    examples: ['join(["a", "b", "c"], ", ") → "a, b, c"'],
    category: 'array',
  },
  first: {
    name: 'first',
    signature: 'first(array: T[]): T',
    description: 'Returns the first element',
    examples: ['first([1, 2, 3]) → 1'],
    category: 'array',
  },
  last: {
    name: 'last',
    signature: 'last(array: T[]): T',
    description: 'Returns the last element',
    examples: ['last([1, 2, 3]) → 3'],
    category: 'array',
  },

  // New polymorphic helpers
  len: {
    name: 'len',
    signature: 'len(value: array | string): number',
    description: 'Returns the length of an array or string',
    examples: ['len([1, 2, 3]) → 3', 'len("hello") → 5'],
    category: 'utility',
    polymorphic: true,
  },
  reverse: {
    name: 'reverse',
    signature: 'reverse(value: array | string): array | string',
    description: 'Reverses an array or string',
    examples: ['reverse([1, 2, 3]) → [3, 2, 1]', 'reverse("hello") → "olleh"'],
    category: 'utility',
    polymorphic: true,
  },
  indexOf: {
    name: 'indexOf',
    signature: 'indexOf(value: array | string, search: T): number',
    description: 'Returns the index of the first occurrence, or -1',
    examples: ['indexOf([10, 20, 30], 20) → 1', 'indexOf("hello", "l") → 2'],
    category: 'utility',
    polymorphic: true,
  },

  // Array helpers (new)
  slice: {
    name: 'slice',
    signature: 'slice(array: T[], start: number, end?: number): T[]',
    description: 'Returns a portion of the array',
    examples: ['slice([1, 2, 3, 4, 5], 1, 3) → [2, 3]'],
    category: 'array',
  },
  sort: {
    name: 'sort',
    signature: 'sort(array: T[]): T[]',
    description: 'Returns a sorted copy of the array',
    examples: ['sort([3, 1, 2]) → [1, 2, 3]'],
    category: 'array',
  },
  unique: {
    name: 'unique',
    signature: 'unique(array: T[]): T[]',
    description: 'Returns array with duplicates removed',
    examples: ['unique([1, 2, 2, 3]) → [1, 2, 3]'],
    category: 'array',
  },
  flatten: {
    name: 'flatten',
    signature: 'flatten(array: T[][]): T[]',
    description: 'Flattens nested arrays one level',
    examples: ['flatten([[1, 2], [3, 4]]) → [1, 2, 3, 4]'],
    category: 'array',
  },
  compact: {
    name: 'compact',
    signature: 'compact(array: T[]): T[]',
    description: 'Removes null and undefined values',
    examples: ['compact([1, null, 2, undefined, 3]) → [1, 2, 3]'],
    category: 'array',
  },
  pluck: {
    name: 'pluck',
    signature: 'pluck(array: object[], key: string): unknown[]',
    description: 'Extracts a property from each object',
    examples: ['pluck([{name: "A"}, {name: "B"}], "name") → ["A", "B"]'],
    category: 'array',
  },
  includes: {
    name: 'includes',
    signature: 'includes(array: T[], value: T): boolean',
    description: 'Checks if array contains the value',
    examples: ['includes([1, 2, 3], 2) → true'],
    category: 'array',
  },
  concat: {
    name: 'concat',
    signature: 'concat(...arrays: T[][]): T[]',
    description: 'Combines multiple arrays',
    examples: ['concat([1, 2], [3, 4]) → [1, 2, 3, 4]'],
    category: 'array',
  },

  // String helpers (new)
  uppercase: {
    name: 'uppercase',
    signature: 'uppercase(str: string): string',
    description: 'Converts string to uppercase (alias for upper)',
    examples: ['uppercase("hello") → "HELLO"'],
    category: 'string',
  },
  lowercase: {
    name: 'lowercase',
    signature: 'lowercase(str: string): string',
    description: 'Converts string to lowercase (alias for lower)',
    examples: ['lowercase("HELLO") → "hello"'],
    category: 'string',
  },
  capitalize: {
    name: 'capitalize',
    signature: 'capitalize(str: string): string',
    description: 'Capitalizes the first character',
    examples: ['capitalize("hello") → "Hello"'],
    category: 'string',
  },
  uncapitalize: {
    name: 'uncapitalize',
    signature: 'uncapitalize(str: string): string',
    description: 'Lowercases the first character',
    examples: ['uncapitalize("Hello") → "hello"'],
    category: 'string',
  },
  titlecase: {
    name: 'titlecase',
    signature: 'titlecase(str: string): string',
    description: 'Capitalizes the first letter of each word',
    examples: ['titlecase("hello world") → "Hello World"'],
    category: 'string',
  },
  startsWith: {
    name: 'startsWith',
    signature: 'startsWith(str: string, prefix: string): boolean',
    description: 'Checks if string starts with prefix',
    examples: ['startsWith("hello", "he") → true'],
    category: 'string',
  },
  endsWith: {
    name: 'endsWith',
    signature: 'endsWith(str: string, suffix: string): boolean',
    description: 'Checks if string ends with suffix',
    examples: ['endsWith("hello", "lo") → true'],
    category: 'string',
  },
  contains: {
    name: 'contains',
    signature: 'contains(str: string, substring: string): boolean',
    description: 'Checks if string contains substring',
    examples: ['contains("hello", "ell") → true'],
    category: 'string',
  },
  padStart: {
    name: 'padStart',
    signature: 'padStart(str: string, length: number, char?: string): string',
    description:
      'Pads the start of string to reach length, up to the 1,000,000-character helper output limit',
    examples: ['padStart("42", 5, "0") → "00042"'],
    category: 'string',
  },
  padEnd: {
    name: 'padEnd',
    signature: 'padEnd(str: string, length: number, char?: string): string',
    description:
      'Pads the end of string to reach length, up to the 1,000,000-character helper output limit',
    examples: ['padEnd("Hi", 5, "!") → "Hi!!!"'],
    category: 'string',
  },
  split: {
    name: 'split',
    signature: 'split(str: string, delimiter: string): string[]',
    description: 'Splits string by delimiter',
    examples: ['split("a,b,c", ",") → ["a", "b", "c"]'],
    category: 'string',
  },
  charAt: {
    name: 'charAt',
    signature: 'charAt(str: string, index: number): string',
    description: 'Returns character at index',
    examples: ['charAt("hello", 1) → "e"'],
    category: 'string',
  },
  repeat: {
    name: 'repeat',
    signature: 'repeat(str: string, count: number): string',
    description:
      'Repeats string count times, up to the 1,000,000-character helper output limit',
    examples: ['repeat("ab", 3) → "ababab"'],
    category: 'string',
  },
  truncate: {
    name: 'truncate',
    signature: 'truncate(str: string, length: number, suffix?: string): string',
    description:
      'Truncates string to at most length characters, suffix included',
    examples: [
      'truncate("Hello World", 8) → "Hello..."',
      'truncate("abcdef", 2) → ".."',
    ],
    category: 'string',
  },

  // Date helpers (new)
  addYears: {
    name: 'addYears',
    signature: 'addYears(date: Date, n: number): Date | null',
    description: 'Adds n years to date',
    examples: ['addYears(date, 1) → date + 1 year'],
    category: 'date',
  },
  addMonths: {
    name: 'addMonths',
    signature: 'addMonths(date: Date, n: number): Date | null',
    description: 'Adds n months to date',
    examples: ['addMonths(date, 3) → date + 3 months'],
    category: 'date',
  },
  addWeeks: {
    name: 'addWeeks',
    signature: 'addWeeks(date: Date, n: number): Date | null',
    description: 'Adds n weeks to date',
    examples: ['addWeeks(date, 2) → date + 14 days'],
    category: 'date',
  },
  addHours: {
    name: 'addHours',
    signature: 'addHours(date: Date, n: number): Date | null',
    description: 'Adds n hours to date',
    examples: ['addHours(date, 5) → date + 5 hours'],
    category: 'date',
  },
  addMinutes: {
    name: 'addMinutes',
    signature: 'addMinutes(date: Date, n: number): Date | null',
    description: 'Adds n minutes to date',
    examples: ['addMinutes(date, 30) → date + 30 minutes'],
    category: 'date',
  },
  addSeconds: {
    name: 'addSeconds',
    signature: 'addSeconds(date: Date, n: number): Date | null',
    description: 'Adds n seconds to date',
    examples: ['addSeconds(date, 45) → date + 45 seconds'],
    category: 'date',
  },
  year: {
    name: 'year',
    signature: 'year(date: Date): number | null',
    description: 'Extracts the year from date, or null when there is no date',
    examples: ['year(date) → 2025'],
    category: 'date',
  },
  month: {
    name: 'month',
    signature: 'month(date: Date): number | null',
    description:
      'Extracts the month (1-12) from date, or null when there is no date',
    examples: ['month(date) → 11 (November)'],
    category: 'date',
  },
  day: {
    name: 'day',
    signature: 'day(date: Date): number | null',
    description:
      'Extracts the day of month from date, or null when there is no date',
    examples: ['day(date) → 26'],
    category: 'date',
  },
  weekday: {
    name: 'weekday',
    signature: 'weekday(date: Date): number | null',
    description:
      'Extracts the day of week (0-6, Sunday=0), or null when there is no date',
    examples: ['weekday(date) → 3 (Wednesday)'],
    category: 'date',
  },
  hour: {
    name: 'hour',
    signature: 'hour(date: Date): number | null',
    description:
      'Extracts the hour (0-23) from date, or null when there is no date',
    examples: ['hour(date) → 14'],
    category: 'date',
  },
  minute: {
    name: 'minute',
    signature: 'minute(date: Date): number | null',
    description:
      'Extracts the minute (0-59) from date, or null when there is no date',
    examples: ['minute(date) → 30'],
    category: 'date',
  },
  second: {
    name: 'second',
    signature: 'second(date: Date): number | null',
    description:
      'Extracts the second (0-59) from date, or null when there is no date',
    examples: ['second(date) → 45'],
    category: 'date',
  },
  diffDays: {
    name: 'diffDays',
    signature: 'diffDays(date1: Date, date2: Date): number | null',
    description:
      'Returns the difference in days between dates, or null when either is missing',
    examples: ['diffDays(date1, date2) → 7'],
    category: 'date',
    sourceOp: { category: 'calculated' },
  },
  isBefore: {
    name: 'isBefore',
    signature: 'isBefore(date1: Date, date2: Date): boolean | null',
    description:
      'Returns true if date1 is before date2, or null when either is missing',
    examples: ['isBefore(yesterday, today) → true'],
    category: 'date',
  },
  isAfter: {
    name: 'isAfter',
    signature: 'isAfter(date1: Date, date2: Date): boolean | null',
    description:
      'Returns true if date1 is after date2, or null when either is missing',
    examples: ['isAfter(tomorrow, today) → true'],
    category: 'date',
  },
  parseDate: {
    name: 'parseDate',
    signature: 'parseDate(str: string, format?: string): Date | null',
    description:
      'Parses a string into a Date, or null when it is not a date. A date-only string (2025-11-26) stays on that calendar day whatever the host zone',
    examples: ['parseDate("2025-11-26") → Date'],
    category: 'date',
  },

  // Number helpers (new)
  sign: {
    name: 'sign',
    signature: 'sign(n: number): number',
    description: 'Returns -1, 0, or 1 based on sign',
    examples: ['sign(-5) → -1', 'sign(0) → 0', 'sign(5) → 1'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  sqrt: {
    name: 'sqrt',
    signature: 'sqrt(n: number): number',
    description: 'Returns the square root',
    examples: ['sqrt(16) → 4'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  pow: {
    name: 'pow',
    signature: 'pow(base: number, exponent: number): number',
    description: 'Returns base raised to exponent',
    examples: ['pow(2, 8) → 256'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  clamp: {
    name: 'clamp',
    signature: 'clamp(n: number, min: number, max: number): number',
    description: 'Constrains number to range [min, max]',
    examples: ['clamp(150, 0, 100) → 100'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  trunc: {
    name: 'trunc',
    signature: 'trunc(n: number): number',
    description: 'Truncates decimal part',
    examples: ['trunc(3.9) → 3', 'trunc(-3.9) → -3'],
    category: 'number',
    sourceOp: { category: 'calculated' },
  },
  random: {
    name: 'random',
    signature: 'random(): number',
    description: 'Returns a random number between 0 and 1',
    examples: ['random() → 0.xxxxx'],
    category: 'number',
    sourceOp: { category: 'system', detail: 'random' },
  },
  randomInt: {
    name: 'randomInt',
    signature: 'randomInt(min: number, max: number): number',
    description: 'Returns a random integer in range [min, max]',
    examples: ['randomInt(1, 10) → 1-10'],
    category: 'number',
    sourceOp: { category: 'system', detail: 'random' },
  },
  isNaN: {
    name: 'isNaN',
    signature: 'isNaN(value: unknown): boolean',
    description: 'Returns true if value is NaN',
    examples: ['isNaN(NaN) → true', 'isNaN(5) → false'],
    category: 'number',
  },
  isFinite: {
    name: 'isFinite',
    signature: 'isFinite(value: unknown): boolean',
    description: 'Returns true if value is a finite number',
    examples: ['isFinite(5) → true', 'isFinite(Infinity) → false'],
    category: 'number',
  },
  toNumber: {
    name: 'toNumber',
    signature: 'toNumber(value: unknown): number',
    description: 'Converts value to number',
    examples: ['toNumber("42") → 42'],
    category: 'number',
  },
  toInt: {
    name: 'toInt',
    signature: 'toInt(str: string, radix?: number): number',
    description:
      'Parses string as integer with optional radix, clamped to 2-36',
    examples: ['toInt("42") → 42', 'toInt("ff", 16) → 255'],
    category: 'number',
  },

  // Utility helpers (new)
  default: {
    name: 'default',
    signature: 'default(value: T, defaultValue: T): T',
    description: 'Returns defaultValue if value is null/undefined',
    examples: ['default(null, "none") → "none"'],
    category: 'utility',
  },
  type: {
    name: 'type',
    signature: 'type(value: unknown): string',
    description: 'Returns the type of value as a string',
    examples: ['type("hello") → "string"', 'type([1,2]) → "array"'],
    category: 'utility',
  },
  isEmpty: {
    name: 'isEmpty',
    signature: 'isEmpty(value: unknown): boolean',
    description:
      'Returns true for null, undefined, empty string, or empty array',
    examples: ['isEmpty(null) → true', 'isEmpty([]) → true'],
    category: 'utility',
  },
  isNull: {
    name: 'isNull',
    signature: 'isNull(value: unknown): boolean',
    description: 'Returns true only for null',
    examples: ['isNull(null) → true', 'isNull(undefined) → false'],
    category: 'utility',
  },
  isDefined: {
    name: 'isDefined',
    signature: 'isDefined(value: unknown): boolean',
    description: 'Returns true if not null or undefined',
    examples: ['isDefined("") → true', 'isDefined(null) → false'],
    category: 'utility',
  },
  isArray: {
    name: 'isArray',
    signature: 'isArray(value: unknown): boolean',
    description: 'Returns true if value is an array',
    examples: ['isArray([1, 2]) → true'],
    category: 'utility',
  },
  isString: {
    name: 'isString',
    signature: 'isString(value: unknown): boolean',
    description: 'Returns true if value is a string',
    examples: ['isString("hi") → true'],
    category: 'utility',
  },
  isNumber: {
    name: 'isNumber',
    signature: 'isNumber(value: unknown): boolean',
    description: 'Returns true if value is a number',
    examples: ['isNumber(42) → true'],
    category: 'utility',
  },
  isBoolean: {
    name: 'isBoolean',
    signature: 'isBoolean(value: unknown): boolean',
    description: 'Returns true if value is a boolean',
    examples: ['isBoolean(true) → true'],
    category: 'utility',
  },
  toString: {
    name: 'toString',
    signature: 'toString(value: unknown): string',
    description: 'Converts value to string',
    examples: ['toString(42) → "42"'],
    category: 'utility' as const,
  },
  fromJson: {
    name: 'fromJson',
    signature: 'fromJson(str: string): unknown',
    description: 'Parses JSON string',
    examples: ['fromJson(\'{"x": 1}\') → {x: 1}'],
    category: 'utility',
  },
  toJson: {
    name: 'toJson',
    signature: 'toJson(value: unknown): string',
    description: 'Converts value to JSON string',
    examples: ['toJson({x: 1}) → \'{"x":1}\''],
    category: 'utility',
    outputKind: 'json',
  },
} satisfies Record<keyof typeof standardLibrary, HelperMetadata>;

/**
 * Whether a helper returns JSON text rather than prose.
 *
 * The renderer consults this for an expression written directly into a
 * `<script>` body, so that `${toJson(x)}` is emitted as JSON with only the
 * five characters that are unsafe *there* escaped - which `JSON.parse` decodes
 * back to the originals, so the value round-trips exactly.
 */
export function producesJsonSource(name: string): boolean {
  return helperMetadata[name]?.outputKind === 'json';
}
