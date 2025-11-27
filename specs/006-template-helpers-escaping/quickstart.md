# Quickstart: Template Syntax Improvements & Helper Functions

**Branch**: `006-template-helpers-escaping` | **Date**: 2025-11-26

## Overview

This guide explains how to use escape sequences and the expanded helper function library in Blade templates.

---

## Escape Sequences

### Escaping Special Characters

Use backslash (`\`) to render literal `@`, `$`, or `\` characters:

```blade
{{-- Literal @ character --}}
Contact: user\@example.com

{{-- Literal $ character --}}
Price: \$100.00

{{-- Literal backslash --}}
Path: C:\\Users\\Documents
```

**Output:**
```
Contact: user@example.com
Price: $100.00
Path: C:\Users\Documents
```

### When Escaping Isn't Needed

`@` and `$` are only special when they form valid syntax:

```blade
{{-- @ without valid directive name → literal --}}
Tweet @mentions work without escaping

{{-- $ without letter/underscore → literal --}}
Prices: $100, $50, $25

{{-- These work as-is, no escape needed --}}
```

**Rule of thumb:**
- `@` needs escaping only before: `if`, `for`, `match`, `let`, `props`, `component`, `slot`
- `$` needs escaping only before letters (a-z, A-Z) or underscore

---

## Array Helper Functions

### Length and Access

```blade
@let(items = [1, 2, 3, 4, 5])

Length: {len($items)}          {{-- 5 --}}
First: {first($items)}          {{-- 1 --}}
Last: {last($items)}            {{-- 5 --}}
Slice: {slice($items, 1, 3)}    {{-- [2, 3] --}}
```

### Transformation

```blade
@let(numbers = [3, 1, 4, 1, 5])

Sorted: {sort($numbers)}        {{-- [1, 1, 3, 4, 5] --}}
Unique: {unique($numbers)}      {{-- [3, 1, 4, 5] --}}
Reversed: {reverse($numbers)}   {{-- [5, 1, 4, 1, 3] --}}
```

### Filtering

```blade
@let(data = [1, null, 2, undefined, 3])

Compact: {compact($data)}       {{-- [1, 2, 3] --}}
```

### Object Arrays

```blade
@let(users = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 }
])

Names: {pluck($users, "name")}  {{-- ["Alice", "Bob"] --}}
```

### Searching

```blade
@let(colors = ["red", "green", "blue"])

Contains green? {includes($colors, "green")}  {{-- true --}}
Index of blue: {indexOf($colors, "blue")}     {{-- 2 --}}
```

---

## String Helper Functions

### Case Conversion

```blade
{uppercase("hello")}       {{-- HELLO --}}
{lowercase("HELLO")}       {{-- hello --}}
{capitalize("hello")}      {{-- Hello --}}
{titlecase("hello world")} {{-- Hello World --}}
```

### Inspection

```blade
@let(text = "Hello, World!")

Length: {len($text)}                    {{-- 13 --}}
Starts with H? {startsWith($text, "H")} {{-- true --}}
Contains World? {contains($text, "World")} {{-- true --}}
Char at 7: {charAt($text, 7)}           {{-- W --}}
```

### Manipulation

```blade
{padStart("42", 5, "0")}    {{-- 00042 --}}
{padEnd("Hi", 5, "!")}      {{-- Hi!!! --}}
{repeat("ab", 3)}           {{-- ababab --}}
{reverse("hello")}          {{-- olleh --}}
{truncate("Hello World", 8)} {{-- Hello... --}}
```

### Splitting and Joining

```blade
@let(csv = "a,b,c")
{split($csv, ",")}          {{-- ["a", "b", "c"] --}}

@let(items = ["x", "y", "z"])
{join($items, " | ")}       {{-- x | y | z --}}
```

---

## Date Helper Functions

### Date Arithmetic

```blade
@let(today = now())

Tomorrow: {addDays($today, 1)}
Next week: {addWeeks($today, 1)}
Next month: {addMonths($today, 1)}
Next year: {addYears($today, 1)}
```

### Extracting Components

```blade
@let(date = parseDate("2025-11-26"))

Year: {year($date)}     {{-- 2025 --}}
Month: {month($date)}   {{-- 11 --}}
Day: {day($date)}       {{-- 26 --}}
Weekday: {weekday($date)} {{-- 3 (Wednesday) --}}
```

### Comparison

```blade
@let(start = parseDate("2025-01-01"))
@let(end = parseDate("2025-12-31"))

Days between: {diffDays($start, $end)}  {{-- 364 --}}
Start before end? {isBefore($start, $end)} {{-- true --}}
```

---

## Number Helper Functions

### Math Operations

```blade
{sqrt(16)}              {{-- 4 --}}
{pow(2, 8)}             {{-- 256 --}}
{abs(-5)}               {{-- 5 --}}
{sign(-42)}             {{-- -1 --}}
{clamp(150, 0, 100)}    {{-- 100 --}}
```

### Rounding

```blade
{round(3.7)}            {{-- 4 --}}
{floor(3.7)}            {{-- 3 --}}
{ceil(3.2)}             {{-- 4 --}}
{trunc(3.9)}            {{-- 3 --}}
```

### Conversion

```blade
{toNumber("42")}        {{-- 42 --}}
{toInt("ff", 16)}       {{-- 255 --}}
```

### Random Numbers

```blade
{random()}              {{-- 0.xxxxx (0-1) --}}
{randomInt(1, 100)}     {{-- 1-100 inclusive --}}
```

---

## Utility Functions

### Type Checking

```blade
{type("hello")}         {{-- string --}}
{type(42)}              {{-- number --}}
{type([1, 2])}          {{-- array --}}

{isString("hi")}        {{-- true --}}
{isNumber(42)}          {{-- true --}}
{isArray([1, 2])}       {{-- true --}}
{isBoolean(true)}       {{-- true --}}
```

### Null Handling

```blade
@let(name = null)

{default($name, "Anonymous")}  {{-- Anonymous --}}
{isNull($name)}                {{-- true --}}
{isDefined($name)}             {{-- false --}}
{isEmpty($name)}               {{-- true --}}
```

### JSON

```blade
@let(obj = { name: "Alice", age: 30 })

{toJson($obj)}                 {{-- {"name":"Alice","age":30} --}}

@let(json = '{"x": 1}')
{fromJson($json).x}            {{-- 1 --}}
```

---

## Polymorphic Functions

Some functions work on both arrays and strings:

```blade
{{-- len() --}}
{len([1, 2, 3])}        {{-- 3 --}}
{len("hello")}          {{-- 5 --}}

{{-- reverse() --}}
{reverse([1, 2, 3])}    {{-- [3, 2, 1] --}}
{reverse("hello")}      {{-- olleh --}}

{{-- indexOf() --}}
{indexOf([10, 20, 30], 20)}  {{-- 1 --}}
{indexOf("hello", "l")}      {{-- 2 --}}
```

---

## Error Handling

Helper functions never throw errors. Invalid inputs produce warnings and sensible defaults:

```blade
{{-- Invalid date → epoch date + warning --}}
{year(parseDate("not-a-date"))}  {{-- 1970 --}}

{{-- Non-numeric → 0 + warning --}}
{sqrt("hello")}                   {{-- 0 --}}

{{-- Non-array → wrapped in array --}}
{len(42)}                         {{-- 1 --}}
```

Warnings are accumulated and returned with the render result:

```typescript
const result = render(ast, data);
if (result.warnings.length > 0) {
  console.warn('Template warnings:', result.warnings);
}
```

---

## Best Practices

1. **Use polymorphic functions** - `len()` works on strings and arrays
2. **Check nulls with `default()`** - Avoid undefined errors
3. **Use `isEmpty()` for safety** - Checks null, undefined, empty string, empty array
4. **Prefer explicit escapes** - Use `\@` even when not strictly needed for clarity
5. **Handle warnings in production** - Log them for debugging

---

## API Reference

### Importing Helpers

All helpers are included in the standard library automatically:

```typescript
import { render, compile } from 'blade';

const ast = compile(template);
const html = render(ast, data);
// All helper functions available in expressions
```

### Adding Custom Helpers

```typescript
import { render, compile, standardLibrary } from 'blade';

const customHelpers = {
  ...standardLibrary,
  myHelper: (scope, setWarning) => (value) => {
    // Custom logic
    return result;
  }
};

const html = render(ast, data, { helpers: customHelpers });
```
