# Data Model: Template Syntax Improvements & Helper Functions

**Date**: 2025-11-26 | **Feature**: 006-template-helpers-escaping

## Entities

### EscapeSequence

Represents a backslash-prefixed character that should be rendered literally.

| Field | Type | Description |
|-------|------|-------------|
| `escaped` | `'@' \| '$' \| '\\'` | The character being escaped |
| `raw` | `string` | Original source text (e.g., `\@`) |
| `literal` | `string` | The literal character to output |

**Validation Rules**:
- Only `@`, `$`, and `\` can be escaped
- Backslash followed by other characters renders both literally

**State Transitions**: N/A (stateless transformation during tokenization)

### HelperFunction

Existing type in `evaluator/index.ts`. No changes needed.

```typescript
type HelperFunction = (
  scope: Scope,
  setWarning: (msg: string) => void
) => (...args: unknown[]) => unknown;
```

### HelperMetadata (New)

Metadata for LSP integration and documentation.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name (e.g., `len`) |
| `signature` | `string` | TypeScript-style signature |
| `description` | `string` | Brief description |
| `examples` | `string[]` | Usage examples |
| `category` | `HelperCategory` | Grouping for organization |
| `polymorphic` | `boolean` | Works on multiple types? |
| `sinceVersion` | `string` | Version added (for docs) |

```typescript
type HelperCategory =
  | 'array'
  | 'string'
  | 'date'
  | 'number'
  | 'utility'
  | 'format';
```

## Helper Function Registry

### Array Functions (FR-010 to FR-022)

| Name | Signature | Returns | Notes |
|------|-----------|---------|-------|
| `len` | `len(arr: T[]): number` | Array length | Polymorphic (also strings) |
| `first` | `first(arr: T[]): T` | First element | Exists |
| `last` | `last(arr: T[]): T` | Last element | Exists |
| `slice` | `slice(arr: T[], start: number, end?: number): T[]` | Portion of array | |
| `reverse` | `reverse(arr: T[]): T[]` | Reversed array | Polymorphic |
| `sort` | `sort(arr: T[]): T[]` | Sorted array | Natural order |
| `unique` | `unique(arr: T[]): T[]` | Deduplicated | |
| `flatten` | `flatten(arr: T[][]): T[]` | Flattened one level | |
| `compact` | `compact(arr: T[]): T[]` | Without null/undefined | |
| `pluck` | `pluck(arr: object[], key: string): unknown[]` | Extracted property | |
| `includes` | `includes(arr: T[], value: T): boolean` | Contains check | |
| `indexOf` | `indexOf(arr: T[], value: T): number` | Index or -1 | Polymorphic |
| `concat` | `concat(...arrays: T[][]): T[]` | Combined array | Variadic |

### String Functions (FR-030 to FR-046)

| Name | Signature | Returns | Notes |
|------|-----------|---------|-------|
| `len` | `len(str: string): number` | Character count | Polymorphic |
| `uppercase` | `uppercase(str: string): string` | Uppercased | Alias: `upper` |
| `lowercase` | `lowercase(str: string): string` | Lowercased | Alias: `lower` |
| `capitalize` | `capitalize(str: string): string` | First char upper | |
| `uncapitalize` | `uncapitalize(str: string): string` | First char lower | |
| `titlecase` | `titlecase(str: string): string` | Each word capitalized | |
| `startsWith` | `startsWith(str: string, prefix: string): boolean` | Prefix check | |
| `endsWith` | `endsWith(str: string, suffix: string): boolean` | Suffix check | |
| `contains` | `contains(str: string, substr: string): boolean` | Substring check | |
| `padStart` | `padStart(str: string, len: number, char?: string): string` | Left-padded | |
| `padEnd` | `padEnd(str: string, len: number, char?: string): string` | Right-padded | |
| `split` | `split(str: string, delim: string): string[]` | Split to array | |
| `charAt` | `charAt(str: string, idx: number): string` | Character at index | |
| `indexOf` | `indexOf(str: string, substr: string): number` | Index or -1 | Polymorphic |
| `repeat` | `repeat(str: string, count: number): string` | Repeated string | |
| `reverse` | `reverse(str: string): string` | Reversed string | Polymorphic |
| `truncate` | `truncate(str: string, len: number, suffix?: string): string` | Truncated | Default: `...` |

### Date Functions (FR-050 to FR-066)

| Name | Signature | Returns | Notes |
|------|-----------|---------|-------|
| `addYears` | `addYears(date: Date, n: number): Date` | Date + n years | |
| `addMonths` | `addMonths(date: Date, n: number): Date` | Date + n months | |
| `addWeeks` | `addWeeks(date: Date, n: number): Date` | Date + n weeks | |
| `addHours` | `addHours(date: Date, n: number): Date` | Date + n hours | |
| `addMinutes` | `addMinutes(date: Date, n: number): Date` | Date + n minutes | |
| `addSeconds` | `addSeconds(date: Date, n: number): Date` | Date + n seconds | |
| `year` | `year(date: Date): number` | Year (full) | |
| `month` | `month(date: Date): number` | Month (1-12) | 1-indexed |
| `day` | `day(date: Date): number` | Day of month | |
| `weekday` | `weekday(date: Date): number` | Day of week (0-6) | Sunday = 0 |
| `hour` | `hour(date: Date): number` | Hour (0-23) | |
| `minute` | `minute(date: Date): number` | Minute (0-59) | |
| `second` | `second(date: Date): number` | Second (0-59) | |
| `diffDays` | `diffDays(date1: Date, date2: Date): number` | Days between | |
| `isBefore` | `isBefore(date1: Date, date2: Date): boolean` | Comparison | |
| `isAfter` | `isAfter(date1: Date, date2: Date): boolean` | Comparison | |
| `parseDate` | `parseDate(str: string, format?: string): Date` | Parsed date | |

### Number Functions (FR-070 to FR-080)

| Name | Signature | Returns | Notes |
|------|-----------|---------|-------|
| `sign` | `sign(n: number): number` | -1, 0, or 1 | |
| `sqrt` | `sqrt(n: number): number` | Square root | |
| `pow` | `pow(base: number, exp: number): number` | Power | |
| `clamp` | `clamp(n: number, min: number, max: number): number` | Clamped value | |
| `trunc` | `trunc(n: number): number` | Truncated | |
| `random` | `random(): number` | Random 0-1 | |
| `randomInt` | `randomInt(min: number, max: number): number` | Random integer | Inclusive |
| `isNaN` | `isNaN(value: unknown): boolean` | NaN check | |
| `isFinite` | `isFinite(value: unknown): boolean` | Finite check | |
| `toNumber` | `toNumber(value: unknown): number` | Converted | |
| `toInt` | `toInt(str: string, radix?: number): number` | Parsed integer | |

### Utility Functions (FR-090 to FR-101)

| Name | Signature | Returns | Notes |
|------|-----------|---------|-------|
| `default` | `default(value: T, def: T): T` | Value or default | Null coalescing |
| `type` | `type(value: unknown): string` | Type name | |
| `isEmpty` | `isEmpty(value: unknown): boolean` | Empty check | null/undefined/''/{}/[] |
| `isNull` | `isNull(value: unknown): boolean` | Null check | |
| `isDefined` | `isDefined(value: unknown): boolean` | Not null/undefined | |
| `isArray` | `isArray(value: unknown): boolean` | Array check | |
| `isString` | `isString(value: unknown): boolean` | String check | |
| `isNumber` | `isNumber(value: unknown): boolean` | Number check | |
| `isBoolean` | `isBoolean(value: unknown): boolean` | Boolean check | |
| `toString` | `toString(value: unknown): string` | String conversion | |
| `fromJson` | `fromJson(str: string): unknown` | Parsed JSON | |
| `toJson` | `toJson(value: unknown): string` | JSON string | |

## Relationships

```
HelperFunction (runtime)
    └── registered in → standardLibrary (export)
    └── documented by → HelperMetadata (LSP/docs)

EscapeSequence (tokenizer)
    └── produces → TEXT token with literal value
```

## Validation Summary

| Entity | Validation | Error Handling |
|--------|------------|----------------|
| EscapeSequence | Only `@`, `$`, `\` escapable | Others render literally |
| HelperFunction args | Type coercion via `expectX` | `setWarning()` + fallback |
| Date inputs | Valid date string/object | Epoch + warning |
| Number inputs | Numeric or convertible | 0 + warning |
| Array inputs | Array or single value | Wrap in array |
