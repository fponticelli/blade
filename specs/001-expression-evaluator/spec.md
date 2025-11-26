# Feature Specification: Expression Evaluator

**Feature Branch**: `001-expression-evaluator`
**Created**: 2025-11-25
**Status**: Draft
**Input**: User description: "Expression Evaluator - Phase 5 implementation enabling execution of parsed template expressions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Evaluate Simple Data Access (Priority: P1)

As a template author, I want to access data values using path expressions like `$order.total` or `$user.name` so that I can display dynamic content from my data context.

**Why this priority**: Data access is the foundational capability - without it, no template can display dynamic content. Every other evaluation feature depends on this working correctly.

**Independent Test**: Can be fully tested by providing a data object and evaluating path expressions against it, verifying correct values are returned.

**Acceptance Scenarios**:

1. **Given** a data context `{ user: { name: "Alice" } }`, **When** evaluating `$user.name`, **Then** the result is `"Alice"`
2. **Given** a data context `{ order: { total: 99.99 } }`, **When** evaluating `$order.total`, **Then** the result is `99.99`
3. **Given** a data context `{ items: [{ name: "A" }, { name: "B" }] }`, **When** evaluating `$items[0].name`, **Then** the result is `"A"`
4. **Given** a data context `{ user: null }`, **When** evaluating `$user.name`, **Then** the result is `undefined` (no error thrown)
5. **Given** a data context `{}`, **When** evaluating `$missing.path`, **Then** the result is `undefined` (no error thrown)

---

### User Story 2 - Evaluate Arithmetic and Comparison Expressions (Priority: P2)

As a template author, I want to perform calculations and comparisons in my templates like `${price * quantity}` or `${total > 100}` so that I can compute derived values and make conditional decisions.

**Why this priority**: Arithmetic and comparisons are essential for any non-trivial template - calculating totals, percentages, and determining which content to display.

**Independent Test**: Can be fully tested by evaluating expressions with arithmetic/comparison operators and verifying correct results.

**Acceptance Scenarios**:

1. **Given** values `a=10, b=3`, **When** evaluating `${a + b}`, **Then** the result is `13`
2. **Given** values `a=10, b=3`, **When** evaluating `${a - b}`, **Then** the result is `7`
3. **Given** values `a=10, b=3`, **When** evaluating `${a * b}`, **Then** the result is `30`
4. **Given** values `a=10, b=3`, **When** evaluating `${a / b}`, **Then** the result is approximately `3.33`
5. **Given** values `a=10, b=3`, **When** evaluating `${a % b}`, **Then** the result is `1`
6. **Given** values `a=10, b=5`, **When** evaluating `${a > b}`, **Then** the result is `true`
7. **Given** values `a=10, b=10`, **When** evaluating `${a == b}`, **Then** the result is `true`
8. **Given** values `a=10, b=5`, **When** evaluating `${a != b}`, **Then** the result is `true`
9. **Given** values `a=true, b=false`, **When** evaluating `${a && b}`, **Then** the result is `false`
10. **Given** values `a=true, b=false`, **When** evaluating `${a || b}`, **Then** the result is `true`

---

### User Story 3 - Evaluate Helper Function Calls (Priority: P3)

As a template author, I want to call helper functions like `$formatCurrency(order.total)` so that I can format and transform data for display.

**Why this priority**: Helper functions enable data formatting (currency, dates, numbers) and aggregation (sum, count) - critical for presenting data appropriately.

**Independent Test**: Can be fully tested by registering helper functions and evaluating call expressions, verifying the helpers are invoked with correct arguments and scope.

**Acceptance Scenarios**:

1. **Given** a registered helper `double(x) => x * 2`, **When** evaluating `$double(5)`, **Then** the result is `10`
2. **Given** a registered helper `formatCurrency` and scope with `$.currency = "USD"`, **When** evaluating `$formatCurrency(100)`, **Then** the helper receives the current scope for locale/currency access
3. **Given** a registered helper `sum(arr)`, **When** evaluating `$sum([1, 2, 3])`, **Then** the result is `6`
4. **Given** no helper named `unknownFn` is registered, **When** evaluating `$unknownFn(5)`, **Then** an appropriate error is reported

---

### User Story 4 - Evaluate Array Wildcard Expressions (Priority: P4)

As a template author, I want to use wildcard expressions like `$items[*].price` to extract arrays of values from collections so that I can aggregate or display lists of properties.

**Why this priority**: Wildcards enable powerful data extraction patterns needed for aggregation (sum of prices) and list displays.

**Independent Test**: Can be fully tested by providing array data and evaluating wildcard path expressions.

**Acceptance Scenarios**:

1. **Given** data `{ items: [{ price: 10 }, { price: 20 }] }`, **When** evaluating `$items[*].price`, **Then** the result is `[10, 20]`
2. **Given** data `{ depts: [{ employees: [{ salary: 50 }, { salary: 60 }] }, { employees: [{ salary: 70 }] }] }`, **When** evaluating `$depts[*].employees[*].salary`, **Then** the result is `[50, 60, 70]` (flattened)
3. **Given** data `{ items: [] }`, **When** evaluating `$items[*].price`, **Then** the result is `[]`

---

### User Story 5 - Evaluate Conditional and Nullish Expressions (Priority: P5)

As a template author, I want to use ternary expressions `${condition ? a : b}` and nullish coalescing `${value ?? default}` so that I can provide fallbacks and conditional values inline.

**Why this priority**: Conditional expressions allow inline decision-making without full `@if` blocks, improving template conciseness.

**Independent Test**: Can be fully tested by evaluating ternary and nullish expressions with various truthy/falsy values.

**Acceptance Scenarios**:

1. **Given** `condition=true, a="yes", b="no"`, **When** evaluating `${condition ? a : b}`, **Then** the result is `"yes"`
2. **Given** `condition=false, a="yes", b="no"`, **When** evaluating `${condition ? a : b}`, **Then** the result is `"no"`
3. **Given** `value=null, fallback="default"`, **When** evaluating `${value ?? fallback}`, **Then** the result is `"default"`
4. **Given** `value="actual", fallback="default"`, **When** evaluating `${value ?? fallback}`, **Then** the result is `"actual"`
5. **Given** `value=0, fallback="default"`, **When** evaluating `${value ?? fallback}`, **Then** the result is `0` (nullish, not falsy)

---

### User Story 6 - Resolve Variables from Scope Hierarchy (Priority: P6)

As a template author, I want variables to be resolved through a scope hierarchy (locals, then data, then globals) and I want to access globals explicitly with `$.varName` so that I can organize my template data appropriately.

**Why this priority**: Proper scope resolution ensures variables from `@@ {}` blocks, passed data, and globals are all accessible in predictable ways.

**Independent Test**: Can be fully tested by setting up scope with locals, data, and globals and verifying resolution order.

**Acceptance Scenarios**:

1. **Given** locals `{ x: 1 }`, data `{ x: 2 }`, globals `{ x: 3 }`, **When** evaluating `$x`, **Then** the result is `1` (locals first)
2. **Given** locals `{}`, data `{ x: 2 }`, globals `{ x: 3 }`, **When** evaluating `$x`, **Then** the result is `2` (data second)
3. **Given** locals `{ x: 1 }`, data `{ x: 2 }`, globals `{ x: 3 }`, **When** evaluating `$.x`, **Then** the result is `3` (globals explicit)
4. **Given** locals `{}`, data `{}`, globals `{}`, **When** evaluating `$missing`, **Then** the result is `undefined`

---

### Edge Cases

- What happens when dividing by zero? Result is `NaN` (not an error)
- What happens when accessing an array index out of bounds? Result is `undefined`
- What happens when a helper function throws an error? The error propagates and stops rendering
- What happens with deeply nested path access on null? Each step returns `undefined` safely (implicit optional chaining)
- What happens when string concatenation involves non-strings? Values are coerced to strings following standard rules
- What happens with `true + 5`? Follows standard coercion: `6`
- What happens with `"5" + 3`? String concatenation: `"53"`
- What happens with `5 + null`? Arithmetic with null: `5`
- What happens with `5 + undefined`? Results in `NaN`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST evaluate literal values (strings, numbers, booleans, null) and return them directly
- **FR-002**: System MUST resolve path expressions through scope hierarchy: locals then data, with `$.` prefix accessing globals directly
- **FR-003**: System MUST support implicit optional chaining - accessing properties on null/undefined returns undefined without error
- **FR-004**: System MUST evaluate unary operators: logical NOT (`!`) and numeric negation (`-`)
- **FR-005**: System MUST evaluate binary arithmetic operators: `+`, `-`, `*`, `/`, `%`
- **FR-006**: System MUST evaluate binary comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **FR-007**: System MUST evaluate binary logical operators: `&&`, `||`
- **FR-008**: System MUST evaluate nullish coalescing operator: `??`
- **FR-009**: System MUST evaluate ternary conditional expressions: `condition ? truthy : falsy`
- **FR-010**: System MUST evaluate function calls by currying registered helpers with current scope, then invoking with provided arguments
- **FR-011**: System MUST evaluate array wildcard expressions `array[*].property` returning an array of extracted values
- **FR-012**: System MUST flatten nested wildcard expressions (e.g., `a[*].b[*].c` returns a single flat array)
- **FR-013**: System MUST perform type coercion following standard rules for string concatenation, arithmetic, and boolean operations
- **FR-014**: System MUST return `NaN` for division by zero (not throw an error)
- **FR-015**: System MUST return `undefined` for array index out of bounds (not throw an error)
- **FR-016**: System MUST propagate errors thrown by helper functions to the caller

### Key Entities

- **Scope**: The evaluation context containing locals (variables from `@@` blocks), data (passed to render), and globals (configuration like locale, currency)
- **Expression AST Node**: The parsed representation of an expression (LiteralNode, PathNode, BinaryNode, etc.) that the evaluator processes
- **Helper Function**: A registered function that receives scope for context-aware operations (formatting, aggregation)
- **Path**: A series of property accesses like `order.customer.address.city` or array accesses like `items[0].name`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 7 expression AST node types (Literal, Path, Unary, Binary, Ternary, Call, Wildcard) can be evaluated correctly
- **SC-002**: 100% of acceptance scenarios pass automated testing
- **SC-003**: Scope resolution correctly prioritizes locals over data over globals in all test cases
- **SC-004**: Implicit optional chaining prevents errors for null/undefined access in all tested paths
- **SC-005**: Type coercion produces results consistent with specification (string concat, arithmetic, boolean)
- **SC-006**: Helper function currying correctly provides scope access to helpers
- **SC-007**: Array wildcard expressions correctly extract and flatten values from nested structures

## Assumptions

- Expression AST nodes are already correctly parsed by the existing parser (Phase 3 complete)
- Helper functions follow the established signature: `(scope) => (...args) => result`
- The Scope interface already exists in `evaluator/index.ts` and does not need modification
- Type coercion follows JavaScript semantics as documented in the specification
- No execution time limits are required for the evaluator (resource limits are a renderer concern)
