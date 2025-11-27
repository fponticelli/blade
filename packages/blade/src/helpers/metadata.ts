/**
 * Helper Function Metadata
 *
 * Provides metadata for LSP integration and documentation.
 */

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
}

/**
 * Registry of all helper function metadata for LSP and documentation.
 */
export const helperMetadata: Record<string, HelperMetadata> = {
  // Formatting helpers (existing)
  formatCurrency: {
    name: 'formatCurrency',
    signature: 'formatCurrency(value: number, currency?: string): string',
    description: 'Formats a number as currency using locale settings',
    examples: ['formatCurrency(1234.56) → "$1,234.56"', 'formatCurrency(1234.56, "EUR") → "€1,234.56"'],
    category: 'format',
  },
  formatNumber: {
    name: 'formatNumber',
    signature: 'formatNumber(value: number, decimals?: number): string',
    description: 'Formats a number with locale-aware formatting',
    examples: ['formatNumber(1234.567, 2) → "1,234.57"'],
    category: 'format',
  },
  formatPercent: {
    name: 'formatPercent',
    signature: 'formatPercent(value: number, decimals?: number): string',
    description: 'Formats a number as a percentage',
    examples: ['formatPercent(0.1234, 1) → "12.3%"'],
    category: 'format',
  },
  formatDate: {
    name: 'formatDate',
    signature: 'formatDate(date: Date, format?: "short" | "long"): string',
    description: 'Formats a date using locale settings',
    examples: ['formatDate(date, "short") → "11/26/25"', 'formatDate(date, "long") → "Wednesday, November 26, 2025"'],
    category: 'format',
  },

  // Aggregation helpers (existing)
  sum: {
    name: 'sum',
    signature: 'sum(...values: number[]): number',
    description: 'Returns the sum of all values',
    examples: ['sum(1, 2, 3) → 6', 'sum([1, 2, 3]) → 6'],
    category: 'number',
  },
  avg: {
    name: 'avg',
    signature: 'avg(...values: number[]): number',
    description: 'Returns the average of all values',
    examples: ['avg(1, 2, 3) → 2', 'avg([1, 2, 3]) → 2'],
    category: 'number',
  },
  min: {
    name: 'min',
    signature: 'min(...values: number[]): number',
    description: 'Returns the minimum value',
    examples: ['min(3, 1, 2) → 1'],
    category: 'number',
  },
  max: {
    name: 'max',
    signature: 'max(...values: number[]): number',
    description: 'Returns the maximum value',
    examples: ['max(3, 1, 2) → 3'],
    category: 'number',
  },
  count: {
    name: 'count',
    signature: 'count(...values: unknown[]): number',
    description: 'Returns the count of values',
    examples: ['count(1, 2, 3) → 3', 'count([1, 2, 3]) → 3'],
    category: 'number',
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
    signature: 'replace(str: string, search: string, replacement: string): string',
    description: 'Replaces all occurrences of search with replacement',
    examples: ['replace("hello", "l", "L") → "heLLo"'],
    category: 'string',
  },

  // Math helpers (existing)
  round: {
    name: 'round',
    signature: 'round(value: number, decimals?: number): number',
    description: 'Rounds to specified decimal places',
    examples: ['round(3.567, 1) → 3.6'],
    category: 'number',
  },
  floor: {
    name: 'floor',
    signature: 'floor(value: number): number',
    description: 'Rounds down to nearest integer',
    examples: ['floor(3.7) → 3'],
    category: 'number',
  },
  ceil: {
    name: 'ceil',
    signature: 'ceil(value: number): number',
    description: 'Rounds up to nearest integer',
    examples: ['ceil(3.2) → 4'],
    category: 'number',
  },
  abs: {
    name: 'abs',
    signature: 'abs(value: number): number',
    description: 'Returns the absolute value',
    examples: ['abs(-5) → 5'],
    category: 'number',
  },

  // Date helpers (existing)
  now: {
    name: 'now',
    signature: 'now(): Date',
    description: 'Returns the current date/time',
    examples: ['now() → current Date'],
    category: 'date',
  },
  addDays: {
    name: 'addDays',
    signature: 'addDays(date: Date, days: number): Date',
    description: 'Adds days to a date',
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
    description: 'Pads the start of string to reach length',
    examples: ['padStart("42", 5, "0") → "00042"'],
    category: 'string',
  },
  padEnd: {
    name: 'padEnd',
    signature: 'padEnd(str: string, length: number, char?: string): string',
    description: 'Pads the end of string to reach length',
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
    description: 'Repeats string count times',
    examples: ['repeat("ab", 3) → "ababab"'],
    category: 'string',
  },
  truncate: {
    name: 'truncate',
    signature: 'truncate(str: string, length: number, suffix?: string): string',
    description: 'Truncates string with optional suffix',
    examples: ['truncate("Hello World", 8) → "Hello..."'],
    category: 'string',
  },

  // Date helpers (new)
  addYears: {
    name: 'addYears',
    signature: 'addYears(date: Date, n: number): Date',
    description: 'Adds n years to date',
    examples: ['addYears(date, 1) → date + 1 year'],
    category: 'date',
  },
  addMonths: {
    name: 'addMonths',
    signature: 'addMonths(date: Date, n: number): Date',
    description: 'Adds n months to date',
    examples: ['addMonths(date, 3) → date + 3 months'],
    category: 'date',
  },
  addWeeks: {
    name: 'addWeeks',
    signature: 'addWeeks(date: Date, n: number): Date',
    description: 'Adds n weeks to date',
    examples: ['addWeeks(date, 2) → date + 14 days'],
    category: 'date',
  },
  addHours: {
    name: 'addHours',
    signature: 'addHours(date: Date, n: number): Date',
    description: 'Adds n hours to date',
    examples: ['addHours(date, 5) → date + 5 hours'],
    category: 'date',
  },
  addMinutes: {
    name: 'addMinutes',
    signature: 'addMinutes(date: Date, n: number): Date',
    description: 'Adds n minutes to date',
    examples: ['addMinutes(date, 30) → date + 30 minutes'],
    category: 'date',
  },
  addSeconds: {
    name: 'addSeconds',
    signature: 'addSeconds(date: Date, n: number): Date',
    description: 'Adds n seconds to date',
    examples: ['addSeconds(date, 45) → date + 45 seconds'],
    category: 'date',
  },
  year: {
    name: 'year',
    signature: 'year(date: Date): number',
    description: 'Extracts the year from date',
    examples: ['year(date) → 2025'],
    category: 'date',
  },
  month: {
    name: 'month',
    signature: 'month(date: Date): number',
    description: 'Extracts the month (1-12) from date',
    examples: ['month(date) → 11 (November)'],
    category: 'date',
  },
  day: {
    name: 'day',
    signature: 'day(date: Date): number',
    description: 'Extracts the day of month from date',
    examples: ['day(date) → 26'],
    category: 'date',
  },
  weekday: {
    name: 'weekday',
    signature: 'weekday(date: Date): number',
    description: 'Extracts the day of week (0-6, Sunday=0)',
    examples: ['weekday(date) → 3 (Wednesday)'],
    category: 'date',
  },
  hour: {
    name: 'hour',
    signature: 'hour(date: Date): number',
    description: 'Extracts the hour (0-23) from date',
    examples: ['hour(date) → 14'],
    category: 'date',
  },
  minute: {
    name: 'minute',
    signature: 'minute(date: Date): number',
    description: 'Extracts the minute (0-59) from date',
    examples: ['minute(date) → 30'],
    category: 'date',
  },
  second: {
    name: 'second',
    signature: 'second(date: Date): number',
    description: 'Extracts the second (0-59) from date',
    examples: ['second(date) → 45'],
    category: 'date',
  },
  diffDays: {
    name: 'diffDays',
    signature: 'diffDays(date1: Date, date2: Date): number',
    description: 'Returns the difference in days between dates',
    examples: ['diffDays(date1, date2) → 7'],
    category: 'date',
  },
  isBefore: {
    name: 'isBefore',
    signature: 'isBefore(date1: Date, date2: Date): boolean',
    description: 'Returns true if date1 is before date2',
    examples: ['isBefore(yesterday, today) → true'],
    category: 'date',
  },
  isAfter: {
    name: 'isAfter',
    signature: 'isAfter(date1: Date, date2: Date): boolean',
    description: 'Returns true if date1 is after date2',
    examples: ['isAfter(tomorrow, today) → true'],
    category: 'date',
  },
  parseDate: {
    name: 'parseDate',
    signature: 'parseDate(str: string, format?: string): Date',
    description: 'Parses a string into a Date',
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
  },
  sqrt: {
    name: 'sqrt',
    signature: 'sqrt(n: number): number',
    description: 'Returns the square root',
    examples: ['sqrt(16) → 4'],
    category: 'number',
  },
  pow: {
    name: 'pow',
    signature: 'pow(base: number, exponent: number): number',
    description: 'Returns base raised to exponent',
    examples: ['pow(2, 8) → 256'],
    category: 'number',
  },
  clamp: {
    name: 'clamp',
    signature: 'clamp(n: number, min: number, max: number): number',
    description: 'Constrains number to range [min, max]',
    examples: ['clamp(150, 0, 100) → 100'],
    category: 'number',
  },
  trunc: {
    name: 'trunc',
    signature: 'trunc(n: number): number',
    description: 'Truncates decimal part',
    examples: ['trunc(3.9) → 3', 'trunc(-3.9) → -3'],
    category: 'number',
  },
  random: {
    name: 'random',
    signature: 'random(): number',
    description: 'Returns a random number between 0 and 1',
    examples: ['random() → 0.xxxxx'],
    category: 'number',
  },
  randomInt: {
    name: 'randomInt',
    signature: 'randomInt(min: number, max: number): number',
    description: 'Returns a random integer in range [min, max]',
    examples: ['randomInt(1, 10) → 1-10'],
    category: 'number',
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
    description: 'Parses string as integer with optional radix',
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
    description: 'Returns true for null, undefined, empty string, or empty array',
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
  },
};

/**
 * Get all helper names
 */
export function getHelperNames(): string[] {
  return Object.keys(helperMetadata);
}

/**
 * Get helpers by category
 */
export function getHelpersByCategory(category: HelperCategory): HelperMetadata[] {
  return Object.values(helperMetadata).filter(h => h.category === category);
}
