# Feature Specification: Template Syntax Improvements & Helper Functions

**Feature Branch**: `006-template-helpers-escaping`
**Created**: 2025-11-26
**Status**: Draft
**Input**: User description: "Template improvements - @ and $ handling, escaping special characters, and comprehensive predefined helper functions"

## Clarifications

### Session 2025-11-26

- Q: How should helper function warnings be surfaced to developers? → A: Runtime warnings accumulated in context object via setWarning (provided with scope), returned with result object

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Template Author Uses Literal @ and $ Characters (Priority: P1)

A template author wants to display literal `@` and `$` characters in output without triggering directive or expression parsing, such as displaying email addresses, currency symbols, or code examples.

**Why this priority**: This is essential for basic template authoring. Without escaping support, users cannot display common patterns like email addresses (`user@example.com`) or prices with dollar signs (`$100`).

**Independent Test**: Create a template with escaped characters and verify they render as literal text without triggering parsing.

**Acceptance Scenarios**:

1. **Given** a template with `\@`, **When** rendered, **Then** output contains literal `@` character
2. **Given** a template with `\$`, **When** rendered, **Then** output contains literal `$` character
3. **Given** a template with `\\`, **When** rendered, **Then** output contains literal `\` character
4. **Given** `@example` (not a valid directive), **When** rendered, **Then** output contains literal `@example`
5. **Given** `$123` ($ not followed by letter), **When** rendered, **Then** output contains literal `$123`

---

### User Story 2 - Developer Uses Array Utility Functions (Priority: P1)

A developer needs to manipulate arrays within templates - getting length, slicing, filtering, mapping, and extracting elements for display purposes.

**Why this priority**: Array operations are fundamental for template rendering. Templates commonly iterate over and transform data collections.

**Independent Test**: Write templates using each array function and verify correct results.

**Acceptance Scenarios**:

1. **Given** an array `[1,2,3]`, **When** calling `len(items)`, **Then** returns `3`
2. **Given** an array `[1,2,3,4,5]`, **When** calling `slice(items, 1, 3)`, **Then** returns `[2,3]`
3. **Given** an array `[{name:"A"},{name:"B"}]`, **When** calling `pluck(items, "name")`, **Then** returns `["A","B"]`
4. **Given** an array `[1,2,3]`, **When** calling `reverse(items)`, **Then** returns `[3,2,1]`
5. **Given** an array `[3,1,2]`, **When** calling `sort(items)`, **Then** returns `[1,2,3]`
6. **Given** an array with nulls, **When** calling `compact(items)`, **Then** returns array without null/undefined values
7. **Given** nested arrays, **When** calling `flatten(items)`, **Then** returns single flat array
8. **Given** an array, **When** calling `unique(items)`, **Then** returns array with duplicates removed

---

### User Story 3 - Developer Uses String Utility Functions (Priority: P1)

A developer needs to transform and manipulate strings - case conversion, trimming, padding, splitting, and searching within templates.

**Why this priority**: String manipulation is essential for formatting display text, processing user data, and building dynamic content.

**Independent Test**: Write templates using each string function and verify correct results.

**Acceptance Scenarios**:

1. **Given** a string `"hello"`, **When** calling `uppercase(str)`, **Then** returns `"HELLO"`
2. **Given** a string `"HELLO"`, **When** calling `lowercase(str)`, **Then** returns `"hello"`
3. **Given** a string `"hello"`, **When** calling `capitalize(str)`, **Then** returns `"Hello"`
4. **Given** a string `"Hello World"`, **When** calling `uncapitalize(str)`, **Then** returns `"hello World"`
5. **Given** a string `"hello world"`, **When** calling `titlecase(str)`, **Then** returns `"Hello World"`
6. **Given** a string `"hello"`, **When** calling `startsWith(str, "he")`, **Then** returns `true`
7. **Given** a string `"hello"`, **When** calling `endsWith(str, "lo")`, **Then** returns `true`
8. **Given** a string `"hello"`, **When** calling `contains(str, "ell")`, **Then** returns `true`
9. **Given** a string `"hello"`, **When** calling `padStart(str, 8, ".")`, **Then** returns `"...hello"`
10. **Given** a string `"hello"`, **When** calling `padEnd(str, 8, ".")`, **Then** returns `"hello..."`
11. **Given** a string `"a,b,c"`, **When** calling `split(str, ",")`, **Then** returns `["a","b","c"]`
12. **Given** a string `"hello"`, **When** calling `len(str)`, **Then** returns `5`
13. **Given** a string `"hello"`, **When** calling `charAt(str, 1)`, **Then** returns `"e"`
14. **Given** a string `"hello"`, **When** calling `indexOf(str, "l")`, **Then** returns `2`
15. **Given** a string `"hello"`, **When** calling `repeat(str, 3)`, **Then** returns `"hellohellohello"`
16. **Given** a string `"Hello"`, **When** calling `reverse(str)`, **Then** returns `"olleH"`

---

### User Story 4 - Developer Uses Date Utility Functions (Priority: P2)

A developer needs to perform date calculations and transformations - adding time intervals, extracting components, and comparing dates within templates.

**Why this priority**: Date manipulation is common for displaying schedules, deadlines, and time-relative content, but less critical than core string/array operations.

**Independent Test**: Write templates using each date function and verify correct results.

**Acceptance Scenarios**:

1. **Given** a date, **When** calling `addYears(date, 1)`, **Then** returns date one year later
2. **Given** a date, **When** calling `addMonths(date, 3)`, **Then** returns date three months later
3. **Given** a date, **When** calling `addWeeks(date, 2)`, **Then** returns date two weeks later
4. **Given** a date, **When** calling `addHours(date, 5)`, **Then** returns date five hours later
5. **Given** a date, **When** calling `addMinutes(date, 30)`, **Then** returns date thirty minutes later
6. **Given** a date, **When** calling `addSeconds(date, 45)`, **Then** returns date forty-five seconds later
7. **Given** a date, **When** calling `year(date)`, **Then** returns the year as number
8. **Given** a date, **When** calling `month(date)`, **Then** returns the month (1-12)
9. **Given** a date, **When** calling `day(date)`, **Then** returns the day of month
10. **Given** a date, **When** calling `weekday(date)`, **Then** returns the day of week (0-6, Sunday=0)
11. **Given** a date, **When** calling `hour(date)`, **Then** returns the hour (0-23)
12. **Given** a date, **When** calling `minute(date)`, **Then** returns the minute (0-59)
13. **Given** a date, **When** calling `second(date)`, **Then** returns the second (0-59)
14. **Given** two dates, **When** calling `diffDays(date1, date2)`, **Then** returns difference in days
15. **Given** two dates, **When** calling `isBefore(date1, date2)`, **Then** returns true if date1 is before date2
16. **Given** two dates, **When** calling `isAfter(date1, date2)`, **Then** returns true if date1 is after date2
17. **Given** a date string, **When** calling `parseDate(str)`, **Then** returns parsed Date object
18. **Given** a date string with format, **When** calling `parseDate(str, format)`, **Then** returns correctly parsed Date

---

### User Story 5 - Developer Uses Number Utility Functions (Priority: P2)

A developer needs additional number operations beyond basic math - clamping, random numbers, and number formatting utilities.

**Why this priority**: Number utilities extend the existing math helpers and are commonly needed for data processing.

**Independent Test**: Write templates using each number function and verify correct results.

**Acceptance Scenarios**:

1. **Given** a number `-5`, **When** calling `sign(num)`, **Then** returns `-1`
2. **Given** a number `4`, **When** calling `sqrt(num)`, **Then** returns `2`
3. **Given** numbers `2, 8`, **When** calling `pow(base, exp)`, **Then** returns `256`
4. **Given** number `100` and range `0, 50`, **When** calling `clamp(num, min, max)`, **Then** returns `50`
5. **Given** a number `3.7`, **When** calling `trunc(num)`, **Then** returns `3`
6. **Given** no args, **When** calling `random()`, **Then** returns number between 0 and 1
7. **Given** `min, max`, **When** calling `randomInt(min, max)`, **Then** returns integer in range
8. **Given** a number, **When** calling `isNaN(num)`, **Then** returns true if NaN, false otherwise
9. **Given** a number, **When** calling `isFinite(num)`, **Then** returns true if finite, false otherwise
10. **Given** a string `"42"`, **When** calling `toNumber(str)`, **Then** returns `42`
11. **Given** a string `"3.14"`, **When** calling `toFloat(str)`, **Then** returns `3.14`
12. **Given** a string `"ff"` and base `16`, **When** calling `toInt(str, base)`, **Then** returns `255`

---

### User Story 6 - Developer Uses Logic/Utility Functions (Priority: P2)

A developer needs general-purpose utility functions for common operations like type checking, default values, and conditional logic.

**Why this priority**: These utilities simplify template logic and reduce verbosity.

**Independent Test**: Write templates using each utility function and verify correct results.

**Acceptance Scenarios**:

1. **Given** `null` and default `"none"`, **When** calling `default(val, def)`, **Then** returns `"none"`
2. **Given** any value, **When** calling `type(val)`, **Then** returns type string ("string", "number", "array", etc.)
3. **Given** any value, **When** calling `isEmpty(val)`, **Then** returns true for null/undefined/empty string/empty array
4. **Given** any value, **When** calling `isNull(val)`, **Then** returns true only for null
5. **Given** any value, **When** calling `isDefined(val)`, **Then** returns true if not null/undefined
6. **Given** any value, **When** calling `isArray(val)`, **Then** returns true if array
7. **Given** any value, **When** calling `isString(val)`, **Then** returns true if string
8. **Given** any value, **When** calling `isNumber(val)`, **Then** returns true if number
9. **Given** any value, **When** calling `isBoolean(val)`, **Then** returns true if boolean
10. **Given** any value, **When** calling `toString(val)`, **Then** returns string representation
11. **Given** a JSON string, **When** calling `fromJson(str)`, **Then** returns parsed object
12. **Given** an object, **When** calling `toJson(obj)`, **Then** returns JSON string

---

### Edge Cases

- What happens when escape character `\` appears at end of template? → Render literal `\`
- What happens when `\` is followed by a non-special character (not `@`, `$`, or `\`)? → Render `\` and the character literally
- How do functions handle null/undefined inputs? → Return sensible defaults (empty string, 0, empty array) with optional warnings
- What happens when array functions are called on non-arrays? → Treat single value as single-element array
- What happens with invalid date strings? → Return epoch date (1970-01-01) with warning
- How do string functions handle non-string inputs? → Convert to string first

## Requirements *(mandatory)*

### Functional Requirements

#### Escaping & Special Characters

- **FR-001**: System MUST treat `\@` as a literal `@` character in output
- **FR-002**: System MUST treat `\$` as a literal `$` character in output
- **FR-003**: System MUST treat `\\` as a literal `\` character in output
- **FR-004**: System MUST leave `@` followed by non-directive keywords as literal text (e.g., `@example`, `@anything`)
- **FR-005**: System MUST leave `$` not followed by an alphabetic character as literal text (e.g., `$100`, `$!`, `$ `)
- **FR-006**: System MUST process escapes in all text content (element content, attribute values)

#### Array Helper Functions

- **FR-010**: System MUST provide `len(array)` returning the number of elements
- **FR-011**: System MUST provide `first(array)` returning the first element (already exists)
- **FR-012**: System MUST provide `last(array)` returning the last element (already exists)
- **FR-013**: System MUST provide `slice(array, start, end?)` returning a portion of the array
- **FR-014**: System MUST provide `reverse(array)` returning array in reverse order
- **FR-015**: System MUST provide `sort(array)` returning sorted array
- **FR-016**: System MUST provide `unique(array)` returning array with duplicates removed
- **FR-017**: System MUST provide `flatten(array)` returning flattened nested arrays
- **FR-018**: System MUST provide `compact(array)` removing null/undefined values
- **FR-019**: System MUST provide `pluck(array, key)` extracting property from array of objects
- **FR-020**: System MUST provide `includes(array, value)` checking if value exists in array
- **FR-021**: System MUST provide `indexOf(array, value)` returning index of value or -1
- **FR-022**: System MUST provide `concat(arrays...)` combining arrays

#### String Helper Functions

- **FR-030**: System MUST provide `len(string)` returning character count
- **FR-031**: System MUST provide `uppercase(string)` converting to uppercase (alias for existing `upper`)
- **FR-032**: System MUST provide `lowercase(string)` converting to lowercase (alias for existing `lower`)
- **FR-033**: System MUST provide `capitalize(string)` capitalizing first character
- **FR-034**: System MUST provide `uncapitalize(string)` lowercasing first character
- **FR-035**: System MUST provide `titlecase(string)` capitalizing first letter of each word
- **FR-036**: System MUST provide `startsWith(string, prefix)` checking string start
- **FR-037**: System MUST provide `endsWith(string, suffix)` checking string end
- **FR-038**: System MUST provide `contains(string, substring)` checking if substring exists
- **FR-039**: System MUST provide `padStart(string, length, char?)` padding start of string
- **FR-040**: System MUST provide `padEnd(string, length, char?)` padding end of string
- **FR-041**: System MUST provide `split(string, delimiter)` splitting string into array
- **FR-042**: System MUST provide `charAt(string, index)` returning character at index
- **FR-043**: System MUST provide `indexOf(string, substring)` returning index of substring
- **FR-044**: System MUST provide `repeat(string, count)` repeating string n times
- **FR-045**: System MUST provide `reverse(string)` reversing character order
- **FR-046**: System MUST provide `truncate(string, length, suffix?)` truncating with ellipsis

#### Date Helper Functions

- **FR-050**: System MUST provide `addYears(date, n)` adding n years
- **FR-051**: System MUST provide `addMonths(date, n)` adding n months
- **FR-052**: System MUST provide `addWeeks(date, n)` adding n weeks
- **FR-053**: System MUST provide `addHours(date, n)` adding n hours
- **FR-054**: System MUST provide `addMinutes(date, n)` adding n minutes
- **FR-055**: System MUST provide `addSeconds(date, n)` adding n seconds
- **FR-056**: System MUST provide `year(date)` extracting year
- **FR-057**: System MUST provide `month(date)` extracting month (1-12)
- **FR-058**: System MUST provide `day(date)` extracting day of month
- **FR-059**: System MUST provide `weekday(date)` extracting day of week (0-6)
- **FR-060**: System MUST provide `hour(date)` extracting hour
- **FR-061**: System MUST provide `minute(date)` extracting minute
- **FR-062**: System MUST provide `second(date)` extracting second
- **FR-063**: System MUST provide `diffDays(date1, date2)` calculating day difference
- **FR-064**: System MUST provide `isBefore(date1, date2)` comparing dates
- **FR-065**: System MUST provide `isAfter(date1, date2)` comparing dates
- **FR-066**: System MUST provide `parseDate(string, format?)` parsing date strings

#### Number Helper Functions

- **FR-070**: System MUST provide `sign(number)` returning -1, 0, or 1
- **FR-071**: System MUST provide `sqrt(number)` returning square root
- **FR-072**: System MUST provide `pow(base, exponent)` returning power
- **FR-073**: System MUST provide `clamp(number, min, max)` constraining to range
- **FR-074**: System MUST provide `trunc(number)` truncating decimal part
- **FR-075**: System MUST provide `random()` returning random 0-1 float
- **FR-076**: System MUST provide `randomInt(min, max)` returning random integer in range
- **FR-077**: System MUST provide `isNaN(value)` checking for NaN
- **FR-078**: System MUST provide `isFinite(value)` checking for finite number
- **FR-079**: System MUST provide `toNumber(value)` converting to number
- **FR-080**: System MUST provide `toInt(string, radix?)` parsing integer with optional base

#### Utility Functions

- **FR-090**: System MUST provide `default(value, defaultValue)` for null coalescing
- **FR-091**: System MUST provide `type(value)` returning type name as string
- **FR-092**: System MUST provide `isEmpty(value)` checking for null/undefined/empty
- **FR-093**: System MUST provide `isNull(value)` checking for null specifically
- **FR-094**: System MUST provide `isDefined(value)` checking for non-null/undefined
- **FR-095**: System MUST provide `isArray(value)` type checking
- **FR-096**: System MUST provide `isString(value)` type checking
- **FR-097**: System MUST provide `isNumber(value)` type checking
- **FR-098**: System MUST provide `isBoolean(value)` type checking
- **FR-099**: System MUST provide `toString(value)` converting to string
- **FR-100**: System MUST provide `fromJson(string)` parsing JSON
- **FR-101**: System MUST provide `toJson(value)` serializing to JSON

### Non-Functional Requirements

- **NFR-001**: Helper function warnings MUST be accumulated via `setWarning` callback provided in scope context
- **NFR-002**: Warnings MUST be returned with the render result object, not logged to console at runtime
- **NFR-003**: LSP SHOULD surface warnings during validation/hover for developer feedback

### Key Entities

- **Helper Function**: A callable function available in template expressions, receives scope and returns a curried function
- **Escape Sequence**: A backslash followed by a special character, representing a literal character in output
- **Standard Library**: The collection of all predefined helper functions
- **Warning Context**: The `setWarning` callback passed to helpers via scope for accumulating non-fatal issues

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Template authors can render literal `@` and `$` characters without workarounds
- **SC-002**: All helper functions documented with signatures and examples in LSP hover
- **SC-003**: Helper functions handle edge cases gracefully with warnings (via setWarning context) rather than throwing errors
- **SC-004**: Existing templates continue to work without modification (backward compatible)
- **SC-005**: All helper functions have consistent naming (verb-first for actions, noun for extractors)
- **SC-006**: 100% test coverage for all new helper functions
- **SC-007**: LSP provides autocompletion for all helper functions with parameter hints

## Assumptions

- Escape character `\` is intuitive for developers familiar with most programming languages
- Function naming follows JavaScript conventions where appropriate for familiarity
- Polymorphic functions (like `len`) that work on both strings and arrays are acceptable
- Date handling uses JavaScript's Date object semantics
- Helper functions emit warnings rather than throwing errors for invalid inputs
- The `$` variable prefix is only recognized when followed by a letter (a-z, A-Z) or underscore
- Invalid directives (@ followed by unknown keywords) are left as literal text for maximum compatibility
