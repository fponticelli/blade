# Blade Template Engine - Complete Specification

## 1. Executive Summary

This document specifies a hybrid build-time/runtime HTML template system with:
- Type safety for build-time templates
- Runtime parsing for database-stored templates  
- Expression language with nested functions and arithmetic
- Full source tracking for auditability (`rd-source`, `rd-source-op`, `rd-source-note`)
- Component system with slots and isolated scope
- Resource limits and security controls
- Comprehensive tooling support (LSP, validation, source maps)

---

## 2. Template Input Sources

### 2.1 Build-time Templates (TypeScript)
- Authored by developers
- Type-checked using JSON Schema-derived TS types
- Compiled to IR before deployment
- **Out of scope for this specification** - focus is on runtime templates

### 2.2 Runtime Templates (Database/UI)
- Authored by entry-level developers or end users
- Must be parsed as strings at runtime
- Limited but expressive template language
- Compiles to same IR structure

---

## 3. Syntax Overview

Templates are HTML-first with embedded expressions and directives.

### 3.1 Expression Syntax

**Simple expression (unambiguous context):**
```html
$page
$data.source.total
$formatCurrency(order.total)
```

**Explicit expression (complex or ambiguous):**
```html
${page + 1}
${sum(order.lines[*].amount) * (1 + taxRate)}
${"Total: " + total}
```

**In text:**
```html
<span>Total: $formatCurrency(order.total)</span>
<p>Page ${page + 1} of $totalPages</p>
```

**In attributes:**
```html
<div class="status-${order.status}">
<input value=$userName />
<button disabled=${!isValid}>Submit</button>
```

### 3.2 Comments

**Line comments:**
```html
// This is a comment
<div>Content</div>
```

**Block comments:**
```html
/* 
  Multi-line comment
*/
<div>Content</div>
```

**HTML comments (in output):**
```html
<>
  <!-- This HTML comment is preserved -->
  <div>Content</div>
</>
```

**Rendering:**
- By default, comments are not rendered in output
- Configuration option `includeComments: true` renders all comments as HTML comments
- Useful for debugging template structure

### 3.3 Control Flow Directives

**Conditional:**
```html
@if(order.discount) {
  <div>Discount: $order.discount.amount</div>
}

@if(status == "paid") {
  <span>Paid</span>
} else if(status == "pending") {
  <span>Pending</span>
} else {
  <span>Unknown</span>
}
```

**Loops:**
```html
// Iterate over values
@for(item of items) {
  <li>$item.name</li>
}

// Iterate with index
@for(item, index of items) {
  <li>${index + 1}. $item.name</li>
}

// Iterate over indices (arrays) or keys (objects)
@for(index in items) {
  <li>Index: $index</li>
}

// Iterate over values and keys (objects)
@for(value, key of object) {
  <div>$key: $value</div>
}
```

**Match statements:**
```html
@match(order.status) {
  when "paid", "completed" {
    <div class="success">Fulfilled</div>
  }
  when "pending", "processing" {
    <div class="warning">In progress</div>
  }
  _.startsWith("error_") {
    <div class="error">Error occurred</div>
  }
  * {
    <div>Unknown status</div>
  }
}
```

**Match rules:**
- `when` clauses match literal values (strings, numbers, booleans)
- Expression clauses use `_` as the matched value
- `*` is the default case (optional)
- First match wins (short-circuit evaluation)

### 3.4 Variable and Function Definitions

**Definition block:**
```html
@@ {
  let taxRate = 0.08;
  let total = sum(order.lines[*].amount);
  let discounted = (amount, percent) => amount * (1 - percent / 100);
  let netPrice = discounted(total, 10);
}

<div>Total: ${formatCurrency(netPrice)}</div>
```

**Rules:**
- `@@` blocks define variables and functions
- `let varName = expr` declares new variable (block-scoped)
- `varName = expr` (no `let`) reassigns existing variable or global in current scope
- Functions are arrow expressions: `(args) => expr`
- Functions are single-expression only (no statement blocks)
- Functions support closures and recursion (with depth limits)

**Scope rules:**
```html
@@ {
  let x = 10;
}

<div>$x</div>  <!-- Available -->

@if(condition) {
  @@ {
    let y = 20;
  }
  <div>${x + y}</div>  <!-- Both available -->
}

<div>$y</div>  <!-- Error: y not in scope -->
```

### 3.5 Global Variables

**Access and modification:**
```html
<!-- Globals passed to render: { locale: "en-US", currency: "USD" } -->

@@ {
  $.currency = "EUR";  // Override global in current scope
  let localVar = "test";
}

<div>${formatCurrency(100)}</div>  <!-- Uses $.currency = "EUR" -->

@if(condition) {
  @@ {
    let $.currency = "GBP";  // Shadow global with new local
  }
  <div>${formatCurrency(100)}</div>  <!-- Uses "GBP" -->
}

<div>${formatCurrency(100)}</div>  <!-- Back to "EUR" -->
```

**Variable resolution order:**
- `varName` → locals → data context
- `$.varName` → globals only

### 3.6 Components

**Definition:**
```html
<template:PriceBreakdown subtotal! tax={0.1} currency="USD">
  <div class="breakdown">
    <div>Subtotal: ${formatCurrency(subtotal, currency)}</div>
    <div>Tax: ${formatCurrency(tax, currency)}</div>
    <div>Total: ${formatCurrency(subtotal + tax, currency)}</div>
  </div>
</template:PriceBreakdown>
```

**Loading:**
```html
@load('PriceBreakdown')
@load('Header', 'Footer')

<!-- Later in template -->
<PriceBreakdown subtotal=$order.subtotal tax=$order.tax />
```

**Usage:**
```html
<PriceBreakdown 
  subtotal=$order.subtotal 
  tax={0.08}
  currency="EUR" />
```

**Prop rules:**
- `prop!` → required (component doesn't render if null/undefined)
- `prop` → optional (defaults to undefined)
- `prop={expr}` → optional with default value
- `prop="static"` → optional with static string default
- Component names must be capitalized
- Props create isolated scope (no access to parent context)

**Self-closing vs body:**
```html
<PriceBreakdown subtotal=$x />
<PriceBreakdown subtotal=$x></PriceBreakdown>
<!-- Both valid and equivalent -->
```

### 3.7 Slots

**Definition:**
```html
<template:Card title!>
  <div class="card">
    <div class="header">
      <slot name="header">
        <h3>$title</h3>  <!-- Fallback if no header slot -->
      </slot>
    </div>
    <div class="body">
      <slot />  <!-- Default/unnamed slot -->
    </div>
    <div class="footer">
      <slot name="footer" />  <!-- No fallback -->
    </div>
  </div>
</template:Card>
```

**Usage:**
```html
<Card title="Product Details">
  <slot:header>
    <h2>Custom Header</h2>
  </slot:header>
  
  <p>This goes to the default slot</p>
  <p>Multiple elements allowed</p>
  
  <slot:footer>
    <small>Footer content</small>
  </slot:footer>
</Card>
```

**Slot scope:**
- Slot content has access to parent scope only
- Slot content cannot access component's props
- Like "windows" that render parent content in component layout

### 3.8 Fragments

**Purpose:** Preserve whitespace and group elements

```html
@if(condition) {
  <>
    <span>A</span>
    <span>B</span>
  </>
}
<!-- Whitespace inside fragment is preserved -->

<div>
  <>
    <span>One</span>
    <span>Two</span>
  </>
</div>
<!-- Groups elements without wrapper div -->
```

**Whitespace rules:**
- Content inside directives has whitespace trimmed by default
- Fragments `<>...</>` preserve all whitespace inside
- Fragments can be used anywhere, including outside directives

---

## 4. Expression Language

### 4.1 Operators and Precedence

**Precedence (highest to lowest):**

1. **Primary**
   - Literals: `123`, `"string"`, `true`, `false`, `null`
   - Paths: `data.field`, `array[0]`, `object["key"]`
   - Grouping: `(expr)`
   - Function calls: `func(args)`

2. **Unary**
   - Logical NOT: `!expr`
   - Negation: `-expr`

3. **Multiplicative**
   - Multiply: `a * b`
   - Divide: `a / b`
   - Modulo: `a % b`

4. **Additive**
   - Add: `a + b`
   - Subtract: `a - b`

5. **Relational**
   - Less than: `a < b`
   - Less or equal: `a <= b`
   - Greater than: `a > b`
   - Greater or equal: `a >= b`

6. **Equality**
   - Equal: `a == b`
   - Not equal: `a != b`

7. **Logical AND**
   - `a && b`

8. **Logical OR**
   - `a || b`

9. **Nullish Coalescing**
   - `a ?? b` (returns b if a is null/undefined)

10. **Ternary**
    - `condition ? truthy : falsy`

### 4.2 Path Expressions

**Simple paths:**
```html
$order.total
$user.profile.name
$items[0].price
$data["key-with-dashes"]
```

**Array wildcards:**
```html
$order.lines[*].amount
<!-- Evaluates to array: [10, 20, 30] -->

$sum(order.lines[*].amount)
<!-- Passes array to function: sum([10, 20, 30]) -->
```

**Nested wildcards (flattened):**
```html
$departments[*].employees[*].salary
<!-- Returns flat array: [50000, 60000, 70000, 55000, 65000] -->
```

**Implicit optional chaining:**
```html
$order.customer.name
<!-- If order is null: returns undefined (no error) -->
<!-- If customer is null: returns undefined (no error) -->
```

All path access has implicit optional chaining - no need for `?.` operator.

### 4.3 Type Coercion

**String concatenation:**
```html
${"Total: " + 100}        → "Total: 100"
${100 + " items"}         → "100 items"
${firstName + " " + lastName}  → "John Doe"
```

**Arithmetic with non-numbers:**
```html
${5 + true}               → 6
${"5" + 3}                → "53" (string concat)
${5 + null}               → 5
${5 + undefined}          → NaN
```

**Boolean coercion:**
```html
${"Status: " + true}      → "Status: true"
${!!"value"}              → true
${!!null}                 → false
```

**Array rendering:**
```html
${[1, 2, 3]}              → "1, 2, 3"
${items[*].name}          → "Apple, Banana, Orange"
```

Arrays are joined with comma-space (`, `) when rendered as strings.

**General rule:** Always coerce to something renderable. Follow JavaScript coercion semantics.

### 4.4 Function Calls

**Syntax:**
```html
$formatCurrency(100)
$sum(items[*].price)
$percentChange(prev, curr)
$formatDate($.now(), "YYYY-MM-DD")
```

**Features:**
- Optional parameters supported
- Variable arity (spread/rest parameters)
- No overloading (single signature per function)
- Functions are curried with scope (see Section 5.3)

---

## 5. Runtime Context and Scope

### 5.1 Render Context

**Structure:**
```typescript
interface RenderContext {
  data: any;              // Data passed to render()
  globals: Record<string, any>;  // Global variables
  helpers: HelperRegistry;       // Helper functions
  loader?: TemplateLoader;       // Component loader
  config: EngineConfig;          // Configuration
}
```

### 5.2 Scope Model

**Layered scope:**
```typescript
interface Scope {
  locals: Record<string, any>;   // Variables from @@ blocks
  data: any;                     // Data context
  globals: Record<string, any>;  // Global variables
}
```

**Variable resolution:**
- `varName` → search locals, then data
- `$.varName` → globals only (direct access)

**Example:**
```typescript
// Render call
render(template, 
  { order: {...}, user: {...} },  // data
  { globals: { locale: "en-US", currency: "USD" } }
);

// In template
${order.total}     // Looks in locals.order, then data.order
${$.currency}      // Looks in globals.currency only
```

### 5.3 Helper Function Currying

**Helper function signature:**
```typescript
type HelperFunction = (scope: Scope) => (...args: any[]) => any;

// Example implementation
const formatCurrency = (scope: Scope) => (value: number, currency?: string) => {
  const curr = currency ?? scope.globals.currency ?? "USD";
  const locale = scope.globals.locale ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: curr
  }).format(value);
};
```

**At runtime:**
```typescript
// Engine curries helper with current scope
const scopedFormatCurrency = formatCurrency(currentScope);

// Template calls the curried function
scopedFormatCurrency(100);           // Uses $.currency from scope
scopedFormatCurrency(100, "EUR");    // Overrides with explicit arg
```

**Scope capture timing:** At call time (dynamic), not at helper registration.

**User-defined functions:**
```html
@@ {
  let myHelper = (value) => formatCurrency(value * 2);
}

$myHelper(50)  // Has direct access to scope, no currying needed
```

User functions access scope directly through closure. Only built-in helpers are curried.

### 5.4 Scope Inheritance in Control Flow

**Block scoping:**
```html
@@ {
  let x = 10;
}

@if(condition) {
  @@ {
    let y = 20;
    x = 15;  // Reassigns parent scope's x
  }
  <div>${x + y}</div>  <!-- 15 + 20 = 35 -->
}

<div>$x</div>  <!-- 15 (modified) -->
<div>$y</div>  <!-- Error: y not in scope -->
```

**Loop scoping:**
```html
@for(item of items) {
  @@ {
    let price = item.amount * 1.1;
  }
  <div>$price</div>  <!-- Available in loop -->
}

<div>$price</div>  <!-- Error: not in scope -->
```

---

## 6. Internal Representation (IR)

### 6.1 Base Types

```typescript
interface SourceLocation {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
  source?: string;  // Original template text for context
}

interface PathMetadata {
  // Compile-time: static analysis
  staticPaths: string[];           // All paths found in template
  staticOperations: string[];      // All operations found
  staticHelpers: Set<string>;      // All helpers referenced
  
  // Runtime: actual access tracking (populated during render)
  accessedPaths?: string[];        // Paths actually accessed
  accessedOperations?: string[];   // Operations actually used
}

interface BaseNode {
  location: SourceLocation;
  metadata?: PathMetadata;
}
```

### 6.2 Expression AST

```typescript
type ExprAst = 
  | LiteralNode
  | PathNode
  | UnaryNode
  | BinaryNode
  | TernaryNode
  | CallNode
  | ArrayWildcardNode;

interface LiteralNode extends BaseNode {
  kind: "literal";
  value: string | number | boolean | null;
}

interface PathNode extends BaseNode {
  kind: "path";
  segments: string[];  // ["order", "lines", "0", "amount"]
  isGlobal: boolean;   // true if starts with $.
}

interface UnaryNode extends BaseNode {
  kind: "unary";
  operator: "!" | "-";
  operand: ExprAst;
}

interface BinaryNode extends BaseNode {
  kind: "binary";
  operator: "+" | "-" | "*" | "/" | "%" | 
            "==" | "!=" | "<" | ">" | "<=" | ">=" | 
            "&&" | "||" | "??";
  left: ExprAst;
  right: ExprAst;
}

interface TernaryNode extends BaseNode {
  kind: "ternary";
  condition: ExprAst;
  truthy: ExprAst;
  falsy: ExprAst;
}

interface CallNode extends BaseNode {
  kind: "call";
  callee: string;  // Function name
  args: ExprAst[];
}

interface ArrayWildcardNode extends BaseNode {
  kind: "wildcard";
  path: PathNode;  // e.g., order.lines[*].amount
  // Flattens nested wildcards: departments[*].employees[*].salary
}
```

### 6.3 Template Nodes

```typescript
type TemplateNode =
  | TextNode
  | ElementNode
  | IfNode
  | ForNode
  | MatchNode
  | LetNode
  | ComponentNode
  | FragmentNode
  | SlotNode
  | CommentNode;

interface TextNode extends BaseNode {
  kind: "text";
  segments: TextSegment[];
}

type TextSegment =
  | { kind: "literal"; text: string; location: SourceLocation }
  | { kind: "expr"; expr: ExprAst; location: SourceLocation };

interface ElementNode extends BaseNode {
  kind: "element";
  tag: string;
  attributes: AttributeNode[];
  children: TemplateNode[];
}

type AttributeNode =
  | { kind: "static"; name: string; value: string; location: SourceLocation }
  | { kind: "expr"; name: string; expr: ExprAst; location: SourceLocation };

interface IfNode extends BaseNode {
  kind: "if";
  branches: IfBranch[];
  elseBranch?: TemplateNode[];
}

interface IfBranch {
  condition: ExprAst;
  body: TemplateNode[];
  location: SourceLocation;
}

interface ForNode extends BaseNode {
  kind: "for";
  itemsExpr: ExprAst;
  itemVar: string;
  indexVar?: string;  // for (item, index of ...)
  iterationType: "of" | "in";  // of=values, in=indices/keys
  body: TemplateNode[];
}

interface MatchNode extends BaseNode {
  kind: "match";
  value: ExprAst;
  cases: MatchCase[];
  defaultCase?: TemplateNode[];  // * case
}

interface MatchCase {
  kind: "literal" | "expression";
  values?: (string | number | boolean)[];  // when "a", "b", "c"
  condition?: ExprAst;  // _.startsWith("error")
  body: TemplateNode[];
  location: SourceLocation;
}

interface LetNode extends BaseNode {
  kind: "let";
  declarations: Declaration[];
}

interface Declaration {
  name: string;
  isGlobal: boolean;  // true if name starts with $.
  value: ExprAst | FunctionExpr;
  location: SourceLocation;
}

interface FunctionExpr {
  kind: "function";
  params: string[];
  body: ExprAst;  // Single expression only
  location: SourceLocation;
}

interface ComponentNode extends BaseNode {
  kind: "component";
  name: string;  // Must be capitalized
  props: ComponentProp[];
  children: TemplateNode[];  // Slot content
  
  // Path tracking for caller context
  propPathMapping: Map<string, string[]>;  // prop → original paths
}

interface ComponentProp {
  name: string;
  value: ExprAst | string;  // expr or static string
  location: SourceLocation;
}

interface FragmentNode extends BaseNode {
  kind: "fragment";
  children: TemplateNode[];
  preserveWhitespace: true;  // Always true
}

interface SlotNode extends BaseNode {
  kind: "slot";
  name?: string;  // undefined = default slot
  fallback?: TemplateNode[];  // Default content
}

interface CommentNode extends BaseNode {
  kind: "comment";
  style: "line" | "block" | "html";  // //, /* */, <!-- -->
  text: string;
}
```

### 6.4 Component Definition

```typescript
interface ComponentDefinition {
  name: string;
  props: PropDefinition[];
  body: TemplateNode[];
  location: SourceLocation;
}

interface PropDefinition {
  name: string;
  required: boolean;  // prop! vs prop
  defaultValue?: ExprAst | string;  // prop={default} or prop="default"
  location: SourceLocation;
}
```

### 6.5 Root Node

```typescript
interface RootNode extends BaseNode {
  kind: "root";
  children: TemplateNode[];
  components: Map<string, ComponentDefinition>;  // Name → Definition
  metadata: TemplateMetadata;
}

interface TemplateMetadata {
  // Compile-time analysis
  globalsUsed: Set<string>;      // All $.xxx referenced
  pathsAccessed: Set<string>;    // All data paths used
  helpersUsed: Set<string>;      // All helper functions called
  componentsUsed: Set<string>;   // All components referenced
}

interface CompiledTemplate {
  root: RootNode;
  sourceMap?: SourceMap;  // Optional source mapping for debugging
  diagnostics: Diagnostic[];
}

interface Diagnostic {
  level: "error" | "warning";
  message: string;
  location: SourceLocation;
  code?: string;  // Error code for categorization
}
```

---

## 7. Compilation Pipeline

### 7.1 Compilation Phases

```typescript
async function compile(
  source: string,
  options?: CompileOptions
): Promise<CompiledTemplate>
```

**Phase 1: Lexical Analysis**
- Tokenize template string
- Identify directives, expressions, HTML elements
- Track source positions

**Phase 2: Parsing**
- Parse HTML structure
- Parse control flow directives
- Parse expressions into ExprAst
- Build initial IR tree

**Phase 3: Component Loading**
- Process `@load` directives
- Recursively compile loaded components
- Detect circular dependencies
- Build component registry

**Phase 4: Static Analysis**
- Extract all paths, helpers, globals referenced
- Validate component prop usage
- Check for undefined variables (warnings)
- Populate compile-time metadata

**Phase 5: Validation (if enabled)**
- Schema validation against data types
- Helper function existence checks
- Component existence checks
- Generate diagnostics

**Phase 6: Optimization**
- Constant folding
- Dead code elimination (unreachable branches)
- Expression simplification

### 7.2 Compile Options

```typescript
interface CompileOptions {
  // Component loading
  loader?: TemplateLoader;
  maxLoadDepth?: number;          // Default: 10
  
  // Validation
  validate?: boolean;              // Default: false
  strict?: boolean;                // Warnings as errors
  dataSchema?: JSONSchema;         // For path validation
  
  // Output options
  includeSourceMap?: boolean;      // Default: false
  includeMetadata?: boolean;       // Default: true
  
  // Resource limits
  maxExpressionDepth?: number;     // Default: 10
  maxFunctionDepth?: number;       // Default: 10
  
  // Configuration
  globalPrefix?: string;           // Default: "$"
}

interface TemplateLoader {
  load(name: string): Promise<ComponentDefinition> | ComponentDefinition;
}
```

### 7.3 Loader Behavior

**Loading rules:**
- `@load` must appear at template root only
- Components loaded at compile time (not runtime)
- Each component compiled once per compilation (cached during compile)
- Circular dependencies cause compilation failure
- Missing components cause compilation failure
- Maximum load depth prevents infinite chains

**Loader implementation example:**
```typescript
const loader: TemplateLoader = {
  load: async (name: string) => {
    const source = await database.getTemplate(name);
    const compiled = await compile(source, { loader: this });
    return {
      name,
      props: compiled.root.components.get(name)!.props,
      body: compiled.root.components.get(name)!.body,
      location: compiled.root.location
    };
  }
};
```

---

## 8. Rendering Pipeline

### 8.1 Render Function

```typescript
function render(
  template: CompiledTemplate,
  data: any,
  options?: RenderOptions
): RenderResult

interface RenderOptions {
  globals?: Record<string, any>;
  helpers?: HelperRegistry;
  loader?: TemplateLoader;  // For dynamic component resolution
  config?: EngineConfig;
}

interface RenderResult {
  html: string;
  metadata: RuntimeMetadata;
}

interface RuntimeMetadata {
  pathsAccessed: Set<string>;     // Actually accessed during render
  helpersUsed: Set<string>;
  renderTime: number;              // Milliseconds
  iterationCount: number;          // Total loop iterations
  recursionDepth: number;          // Max recursion reached
}
```

### 8.2 Rendering Process

**For each node:**

1. **TextNode**: Evaluate expressions, concatenate segments
2. **ElementNode**: 
   - Render opening tag with attributes
   - Add source tracking attributes (`rd-source`, etc.)
   - Recursively render children
   - Render closing tag
3. **IfNode**: Evaluate conditions, render matching branch
4. **ForNode**: 
   - Evaluate items expression
   - Check iteration limits
   - Create scoped context for each iteration
   - Render body for each item
5. **MatchNode**: Evaluate value, find first matching case, render body
6. **LetNode**: Evaluate declarations, add to current scope
7. **ComponentNode**:
   - Evaluate prop expressions
   - Create isolated scope with props
   - Check required props (skip render if any null/undefined)
   - Render component body
   - Aggregate path tracking from caller context
8. **FragmentNode**: Render children with whitespace preservation
9. **SlotNode**: Render slot content from caller, or fallback
10. **CommentNode**: Optionally render based on config

### 8.3 Expression Evaluation

```typescript
function evaluateExpression(
  expr: ExprAst,
  scope: Scope,
  tracker: PathTracker
): any
```

**Evaluation rules:**
- **LiteralNode**: Return value directly
- **PathNode**: 
  - Resolve through scope (locals → data or globals)
  - Track accessed path
  - Return undefined for null/undefined intermediate values (implicit optional chaining)
- **UnaryNode**: Evaluate operand, apply operator
- **BinaryNode**: Evaluate left and right, apply operator with coercion
- **TernaryNode**: Evaluate condition, return truthy or falsy result
- **CallNode**: 
  - Curry helper with current scope
  - Evaluate arguments
  - Call curried function
  - Track helper usage
- **ArrayWildcardNode**: 
  - Evaluate path array
  - Extract property from each element
  - Flatten nested arrays
  - Return result array

**Error handling during evaluation:**
- Null/undefined path access → return undefined (no error)
- Division by zero → return NaN
- Invalid function argument → emit warning, attempt coercion
- Array index out of bounds → return undefined
- Type mismatch → coerce to renderable value

---

## 9. Source Tracking

### 9.1 Path Extraction

**For each element, aggregate paths from:**
- Text segment expressions
- Attribute expressions
- Local control flow (if conditions, loop expressions)

**Example:**
```html
<div class="total">
  Subtotal: ${formatCurrency(subtotal)}
  Tax: ${formatCurrency(tax)}
  Total: ${formatCurrency(subtotal + tax)}
</div>
```

**Extracted:**
- Expression 1: `subtotal`
- Expression 2: `tax`
- Expression 3: `subtotal`, `tax`

### 9.2 rd-source Attribute

**Format:** Semicolon-separated expressions, comma-separated paths within expression

```html
<div rd-source="subtotal;tax;subtotal,tax">
```

**Generation:**
```typescript
const pathsPerExpr = [
  ["subtotal"],
  ["tax"],
  ["subtotal", "tax"]
];

const rdSource = pathsPerExpr
  .map(paths => paths.join(","))
  .join(";");
```

### 9.3 rd-source-op Attribute

**Operation classification:**

```typescript
interface HelperMetadata {
  op: "format" | "aggregate" | "calculated" | "system" | "none";
  label?: string;  // e.g., "currency", "percent"
}

const helperRegistry = {
  formatCurrency: { op: "format", label: "currency" },
  formatPercent: { op: "format", label: "percent" },
  sum: { op: "aggregate" },
  avg: { op: "aggregate" },
  now: { op: "system", label: "clock" },
  // ... etc
};
```

**Classification rules per expression:**
1. If outermost call is format helper → `"format:label"`
2. If any aggregate helper → `"aggregate"`
3. If system helper → `"system:label"`
4. If arithmetic operators or calculated helper → `"calculated"`
5. Otherwise → `"none"`

**Example:**
```html
${formatCurrency(sum(order.lines[*].amount))}
```
→ `rd-source-op="format:currency"` (outermost is format)

```html
${(current - previous) / previous}
```
→ `rd-source-op="calculated"`

**Multiple expressions:**
```html
<div rd-source="subtotal;tax;subtotal,tax"
     rd-source-op="format:currency;format:currency;format:currency">
```

### 9.4 rd-source-note Attribute

**Automatic generation:**
```typescript
function generateNote(expr: ExprAst): string {
  // Generate human-readable description
  // Example: "format currency of sum of order.lines[*].amount"
}
```

**Manual override:**
```html
<!-- Syntax TBD - could use attribute or special comment -->
<span @note="Value after applying tax">
  ${total * (1 + taxRate)}
</span>

<!-- Renders: -->
<span rd-source-note="Value after applying tax">
  ...
</span>
```

### 9.5 Component Path Resolution

**Caller paths tracked through components:**

```html
<!-- Caller -->
<PriceBreakdown subtotal=${order.subtotal} tax=${order.tax} />

<!-- Component definition -->
<template:PriceBreakdown subtotal! tax!>
  <div>${formatCurrency(subtotal + tax)}</div>
</template:PriceBreakdown>

<!-- Rendered output -->
<div rd-source="order.subtotal,order.tax" 
     rd-source-op="format:currency">
  $150.00
</div>
```

**Implementation:**
- When passing props, track mapping: `subtotal` → `order.subtotal`
- During component render, resolve prop names to caller paths
- Aggregate all caller paths in `rd-source`

**Nested components:**
Paths tracked through all levels:
```
ComponentA(data=${order.total})
  → ComponentB(value=${data * 2})
    → <div>${value}</div>
```
Final element: `rd-source="order.total"`

---

## 10. Resource Limits and Security

### 10.1 Resource Limits

**Configurable limits (with defaults):**

```typescript
interface ResourceLimits {
  // Loop limits
  maxLoopNesting: number;        // Default: 5
  maxIterationsPerLoop: number;  // Default: 1000
  maxTotalIterations: number;    // Default: 10000
  
  // Expression limits
  maxFunctionCallDepth: number;  // Default: 10
  maxExpressionNodes: number;    // Default: 1000 (AST node count)
  
  // Recursion limits
  maxRecursionDepth: number;     // Default: 50
  maxComponentDepth: number;     // Default: 10
  
  // Compilation limits
  maxLoadDepth: number;          // Default: 10
  
  // No limits on:
  // - Template size
  // - Execution time
}
```

**Enforcement:**
- Limits checked at runtime
- Exceeded limits throw errors (stop rendering)
- All limits are overrideable via configuration

### 10.2 Security Model

**Function execution:**
- Only functions in provided `HelperRegistry` can be called
- No dynamic function creation in templates
- User-defined functions (`@@ { let fn = ... }`) can only call:
  - Other user-defined functions
  - Registered helpers
  - Built-in operators

**Data access:**
- No restrictions on path access
- Templates can read any property in data context
- No write access (templates are read-only)

**Sandboxing:**
- Templates cannot execute arbitrary code
- No access to:
  - `eval()` or similar
  - Constructor functions
  - Prototype manipulation
  - Import/require

**Best practices:**
- Provide minimal helpers needed
- Use JSON Schema validation for data
- Review templates before deployment
- Apply resource limits appropriate to use case

---

## 11. Error Handling

### 11.1 Parse-Time Errors

**Fatal errors (compilation fails):**
- Unclosed tags (if strict HTML parsing enabled)
- Invalid expression syntax: `${total +}`
- Malformed directives: `@if condition) {}`
- Circular component dependencies
- Component load failures
- Maximum load depth exceeded

**Warnings (compilation succeeds):**
- Unclosed tags (if lenient HTML parsing)
- Empty statements
- Unused variables
- Undeclared variables accessed
- Undeclared props passed to components

### 11.2 Runtime Errors

**Silent failures (render as empty/default):**
- Null/undefined path access: `${order.customer.name}` → `""`
- Array index out of bounds: `${items[999].name}` → `""`
- Required component props missing → component not rendered

**Warning emissions:**
- Invalid helper function argument (attempts coercion)
- Type mismatches (coerces to renderable)

**Errors (throw, stop rendering):**
- Resource limit exceeded
- Infinite loop detection
- Helper function throws exception

**Special cases:**
- Division by zero: returns `NaN`
- Null coalescing: `null ?? "default"` → `"default"`

### 11.3 Error Reporting

```typescript
interface RenderError extends Error {
  location: SourceLocation;
  expression?: ExprAst;
  context?: Record<string, any>;
  code: string;  // e.g., "MAX_ITERATIONS_EXCEEDED"
}
```

**Error context includes:**
- Source location (line, column)
- Original template text
- Current scope values
- Call stack (for helper functions)

---

## 12. Helper Function Standard Library

### 12.1 Helper Function Registry

```typescript
interface HelperRegistry {
  [name: string]: HelperFunction;
}

type HelperFunction = (scope: Scope) => (...args: any[]) => any;

interface HelperFunctionWithMetadata {
  fn: HelperFunction;
  metadata?: {
    op?: "format" | "aggregate" | "calculated" | "system";
    label?: string;
  };
}
```

### 12.2 Standard Library Functions

**Formatting:**
```typescript
formatCurrency(value: number, currency?: string): string
  // Uses $.currency and $.locale from scope if not provided

formatNumber(value: number, decimals?: number): string
  // Uses $.locale from scope

formatPercent(value: number, decimals?: number): string
  // Uses $.locale from scope

formatDate(date: Date | string, format?: string): string
  // Uses $.locale and $.timezone from scope
```

**Aggregation:**
```typescript
sum(values: number[]): number
avg(values: number[]): number
min(values: number[]): number
max(values: number[]): number
count(values: any[]): number
```

**String manipulation:**
```typescript
upper(str: string): string
lower(str: string): string
trim(str: string): string
substring(str: string, start: number, end?: number): string
replace(str: string, search: string, replacement: string): string
```

**Math:**
```typescript
round(value: number, decimals?: number): number
floor(value: number): number
ceil(value: number): number
abs(value: number): number
```

**Date/Time:**
```typescript
now(): Date
addDays(date: Date, days: number): Date
addHours(date: Date, hours: number): Date
```

**Array:**
```typescript
join(array: any[], separator?: string): string
first(array: any[]): any
last(array: any[]): any
```

**Logic:**
```typescript
default(value: any, defaultValue: any): any
  // Nullish coalescing helper: value ?? defaultValue
```

### 12.3 Custom Helper Registration

```typescript
const customHelpers: HelperRegistry = {
  myHelper: (scope) => (arg1, arg2) => {
    // Can access scope.globals, scope.locals, scope.data
    const currency = scope.globals.currency;
    return `${arg1} in ${currency}`;
  }
};

render(template, data, {
  helpers: { ...standardLibrary, ...customHelpers }
});
```

---

## 13. Validation and Tooling

### 13.1 Template Validation

**Separate validation function:**
```typescript
function validateTemplate(
  source: string,
  options: ValidationOptions
): ValidationResult

interface ValidationOptions {
  schema?: JSONSchema;           // Data schema
  helpers?: HelperRegistry;      // Available helpers
  components?: ComponentRegistry; // Available components
  strict?: boolean;              // Warnings as errors
}

interface ValidationResult {
  valid: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}
```

**Validation during compilation:**
```typescript
const compiled = await compile(source, {
  validate: true,
  strict: false,
  dataSchema: mySchema,
  helpers: myHelpers
});

// compiled.diagnostics contains errors and warnings
```

**Both approaches supported** for different use cases:
- Separate `validateTemplate()` for editor tooling (real-time validation)
- Built-in validation for runtime safety

### 13.2 Language Server Protocol (LSP)

**Features:**
- Syntax highlighting for template syntax
- Autocomplete for:
  - Data paths (from JSON Schema)
  - Helper functions (from registry)
  - Component names (from loader)
  - Component props
  - Global variables
- Hover documentation:
  - Helper function signatures
  - Component prop types
  - Data path types
- Go-to-definition:
  - Jump to component definition
  - Jump to variable declaration
- Real-time diagnostics:
  - Syntax errors
  - Type mismatches
  - Undefined references
  - Unused variables

**Edit-time warnings:**
- Undeclared variable access
- Missing required props
- Type incompatibilities
- Unreachable code
- Performance concerns (deep nesting, large loops)

### 13.3 Source Maps

**Purpose:** Map rendered HTML back to template source

```typescript
interface SourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;  // VLQ-encoded mappings
}
```

**Generated during compilation** (if enabled):
```typescript
const compiled = await compile(source, {
  includeSourceMap: true
});

// compiled.sourceMap available
```

**Use cases:**
- Debugging rendered output
- Error reporting with template context
- Development tools

### 13.4 Development Workflow

**Recommended setup:**

1. **Editor with LSP support**
   - Real-time validation
   - Autocomplete and IntelliSense
   - Error highlighting

2. **Compile-time validation**
   - Pre-deployment checks
   - CI/CD integration
   - Schema conformance

3. **Runtime monitoring**
   - Error tracking
   - Performance metrics
   - Path access logging

4. **Debugging tools**
   - Source maps for error locations
   - Template inspector (future)
   - Render trace logging

---

## 14. Configuration

### 14.1 Engine Configuration

```typescript
interface EngineConfig {
  // Resource limits
  limits: ResourceLimits;
  
  // Output options
  includeComments: boolean;        // Default: false
  includeSourceTracking: boolean;  // Default: true
  preserveWhitespace: boolean;     // Default: false (trim except in fragments)
  htmlEscape: boolean;             // Default: true
  
  // Validation
  validateOnCompile: boolean;      // Default: false
  strict: boolean;                 // Default: false (warnings, not errors)
  
  // Global prefix
  globalPrefix: string;            // Default: "$"
  
  // Source tracking
  sourceTrackingPrefix: string;    // Default: "rd-"
  includeOperationTracking: boolean; // Default: true
  includeNoteGeneration: boolean;  // Default: false
  
  // Performance
  enableOptimizations: boolean;    // Default: true
}
```

### 14.2 Configuration Usage

```typescript
const engine = new TemplateEngine({
  limits: {
    maxLoopNesting: 10,
    maxIterationsPerLoop: 5000
  },
  includeComments: true,
  strict: true
});

const compiled = await engine.compile(source, { loader });
const result = engine.render(compiled, data, { globals });
```

---

## 15. Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)
- Define complete TypeScript types for IR
- Implement base node classes
- Source location tracking
- Error reporting infrastructure

### Phase 2: Expression Parser (Week 2-3)
- Lexer for expression tokens
- Recursive descent parser
- Operator precedence handling
- AST generation
- Path extraction and wildcard support

### Phase 3: Template Parser (Week 3-4)
- HTML parser integration
- Directive parsing (`@if`, `@for`, `@match`, `@@`)
- Component syntax parsing
- Expression embedding in HTML
- IR tree generation

### Phase 4: Component System (Week 4-5)
- Component definition parsing
- Prop validation
- Slot mechanism
- Async loader integration
- Circular dependency detection

### Phase 5: Expression Evaluator (Week 5-6)
- Scope management
- Path resolution with optional chaining
- Type coercion
- Helper function currying
- Runtime error handling

### Phase 6: Renderer (Week 6-7)
- Node rendering for all types
- Control flow execution
- Component instantiation
- Source tracking generation
- HTML escaping

### Phase 7: Validation (Week 7-8)
- JSON Schema integration
- Static analysis
- Compile-time validation
- Runtime validation hooks
- Diagnostic generation

### Phase 8: Tooling (Week 8-10)
- LSP server implementation
- Source map generation
- Validation API
- Debug hooks
- Performance profiling

### Phase 9: Testing (Week 10-12)
- Unit tests for all components
- Integration tests
- Performance benchmarks
- Fuzzing for parser
- Regression test suite

### Phase 10: Documentation & Examples (Week 12-13)
- API documentation
- Language reference
- Helper function reference
- Migration guides
- Example templates

---

## 16. Testing Strategy

### 16.1 Unit Tests

**Expression parser:**
- All operators and precedence
- Path expressions with wildcards
- Function calls with various arguments
- Edge cases (empty strings, null, undefined)

**Template parser:**
- All directive forms
- Component syntax
- Nested structures
- Malformed input (error cases)

**Evaluator:**
- Type coercion rules
- Null handling
- Array operations
- Helper function calls

**Renderer:**
- All node types
- Source tracking generation
- Component rendering
- Slot content

### 16.2 Integration Tests

**End-to-end scenarios:**
- Simple templates with expressions
- Complex nested components
- Loops with aggregations
- Conditional rendering
- Slot composition

**Error handling:**
- Parse errors with good messages
- Runtime errors with context
- Resource limit enforcement

### 16.3 Performance Tests

**Benchmarks:**
- Compilation time for various sizes
- Render time for various complexities
- Memory usage during render
- Large dataset handling

**Optimization validation:**
- Constant folding effectiveness
- Dead code elimination
- Cache hit rates

### 16.4 Fuzzing

**Parser fuzzing:**
- Random template generation
- Malformed input
- Edge case discovery
- Crash detection

---

## 17. Future Extensions

### 17.1 Planned Features

**Template composition:**
- Template inheritance
- Mixins/includes beyond components
- Partial templates

**Advanced helpers:**
- Async helper functions
- Streaming helpers
- Custom aggregations

**Performance:**
- Template precompilation for common patterns
- Incremental rendering
- Virtual DOM diffing
- Lazy evaluation

**Developer experience:**
- Visual template editor
- Template debugging UI
- Performance profiler
- Template marketplace

### 17.2 Deferred Features

**Not in current scope:**
- Two-way data binding
- Client-side reactivity
- Build-time TypeScript templates (noted as out of scope)
- Template hot-reloading
- Distributed rendering

---

## 18. Appendix A: Complete Grammar (EBNF)

```ebnf
(* Template Grammar *)

template = { templateItem } ;

templateItem = text
             | expression
             | element
             | directive
             | component
             | fragment
             | slot
             | comment ;

(* Expressions *)

expression = "$" identifier { "." identifier | "[" ( integer | "*" ) "]" }
           | "${" expr "}" ;

expr = ternary ;

ternary = nullish [ "?" expr ":" expr ] ;

nullish = logical_or { "??" logical_or } ;

logical_or = logical_and { "||" logical_and } ;

logical_and = equality { "&&" equality } ;

equality = relational { ( "==" | "!=" ) relational } ;

relational = additive { ( "<" | ">" | "<=" | ">=" ) additive } ;

additive = multiplicative { ( "+" | "-" ) multiplicative } ;

multiplicative = unary { ( "*" | "/" | "%" ) unary } ;

unary = ( "!" | "-" ) unary
      | primary ;

primary = literal
        | path
        | call
        | "(" expr ")" ;

literal = string | number | boolean | null ;

path = identifier { "." identifier | "[" ( integer | "*" | string ) "]" } ;

call = identifier "(" [ expr { "," expr } ] ")" ;

(* Directives *)

directive = if_directive
          | for_directive
          | match_directive
          | let_directive
          | load_directive ;

if_directive = "@if" "(" expr ")" block
               { "else" "if" "(" expr ")" block }
               [ "else" block ] ;

for_directive = "@for" "(" identifier [ "," identifier ] ( "of" | "in" ) expr ")" block ;

match_directive = "@match" "(" expr ")" "{"
                  { match_case }
                  [ default_case ]
                  "}" ;

match_case = ( "when" literal { "," literal } | expr_match ) block ;

expr_match = "_" expr ;  (* expression using _ as matched value *)

default_case = "*" block ;

let_directive = "@@" "{"
                { let_declaration }
                "}" ;

let_declaration = "let" identifier "=" ( expr | function_expr ) ";" ;

function_expr = "(" [ identifier { "," identifier } ] ")" "=>" expr ;

load_directive = "@load" "(" string { "," string } ")" ;

(* Components *)

component = "<" component_name { component_prop } ( "/>" | ">" { templateItem } "</" component_name ">" ) ;

component_name = uppercase_identifier ;

component_prop = identifier ( "=" ( expression | string ) | "=" "{" expr "}" ) ;

component_def = "<template:" component_name { prop_def } ">"
                { templateItem }
                "</template:" component_name ">" ;

prop_def = identifier [ "!" | "=" ( "{" expr "}" | string ) ] ;

(* Other constructs *)

element = "<" tag_name { attribute } ( "/>" | ">" { templateItem } "</" tag_name ">" ) ;

attribute = identifier ( "=" ( string | expression | "{" expr "}" ) )? ;

fragment = "<>" { templateItem } "</>" ;

slot = "<slot" [ "name" "=" string ] ( "/>" | ">" { templateItem } "</slot>" ) ;

slot_content = "<slot:" identifier ">" { templateItem } "</slot:" identifier ">" ;

comment = "//" text_until_newline
        | "/*" text_until "*/"
        | "<!--" text_until "-->" ;

block = "{" { templateItem } "}" ;

(* Lexical elements *)

identifier = letter { letter | digit | "_" } ;

uppercase_identifier = uppercase_letter { letter | digit | "_" } ;

string = '"' { char } '"' | "'" { char } "'" ;

number = digit { digit } [ "." digit { digit } ] ;

boolean = "true" | "false" ;

null = "null" ;
```

---

## 19. Appendix B: Example Templates

### Example 1: Simple Invoice

```html
@load('PriceBreakdown')

@@ {
  let subtotal = sum(order.lines[*].amount);
  let tax = subtotal * 0.08;
  let total = subtotal + tax;
}

<div class="invoice">
  <h1>Invoice #${order.id}</h1>
  
  <div class="customer">
    <strong>$order.customer.name</strong>
    <div>$order.customer.address</div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Quantity</th>
        <th>Price</th>
      </tr>
    </thead>
    <tbody>
      @for(line of order.lines) {
        <tr>
          <td>$line.product.name</td>
          <td>$line.quantity</td>
          <td>${formatCurrency(line.amount)}</td>
        </tr>
      }
    </tbody>
  </table>
  
  <PriceBreakdown subtotal=$subtotal tax=$tax total=$total />
</div>

<template:PriceBreakdown subtotal! tax! total!>
  <div class="breakdown">
    <div>Subtotal: ${formatCurrency(subtotal)}</div>
    <div>Tax: ${formatCurrency(tax)}</div>
    <div><strong>Total: ${formatCurrency(total)}</strong></div>
  </div>
</template:PriceBreakdown>
```

### Example 2: Dashboard with Conditional Rendering

```html
@@ {
  $.locale = "en-US";
  let changePercent = (curr, prev) => ((curr - prev) / prev) * 100;
}

<div class="dashboard">
  <h1>Sales Dashboard</h1>
  
  @if(metrics) {
    <div class="metrics">
      @for(metric of metrics) {
        <div class="metric-card">
          <h3>$metric.name</h3>
          <div class="value">${formatNumber(metric.current)}</div>
          
          @if(metric.previous) {
            @@ {
              let change = changePercent(metric.current, metric.previous);
            }
            
            <div class={change >= 0 ? "positive" : "negative"}>
              ${formatPercent(change / 100, 1)}
            </div>
          }
        </div>
      }
    </div>
  } else {
    <div class="no-data">No metrics available</div>
  }
</div>
```

### Example 3: Complex Matching and Slots

```html
@load('StatusBadge', 'Card')

<div class="order-list">
  @for(order of orders) {
    <Card>
      <slot:header>
        <div class="order-header">
          <span>Order #${order.id}</span>
          <StatusBadge status=$order.status />
        </div>
      </slot:header>
      
      <div class="order-details">
        <div>Customer: $order.customer.name</div>
        <div>Total: ${formatCurrency(order.total)}</div>
        <div>Date: ${formatDate(order.date, "MMM DD, YYYY")}</div>
      </div>
      
      <slot:footer>
        @match(order.status) {
          when "pending", "processing" {
            <button>Cancel Order</button>
          }
          when "shipped" {
            <button>Track Shipment</button>
          }
          when "delivered" {
            <button>Review Order</button>
          }
          * {
            <span>No actions available</span>
          }
        }
      </slot:footer>
    </Card>
  }
</div>

<template:Card>
  <div class="card">
    <div class="card-header">
      <slot name="header">
        <h3>Card Title</h3>
      </slot>
    </div>
    <div class="card-body">
      <slot />
    </div>
    <div class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template:Card>

<template:StatusBadge status!>
  @match(status) {
    when "paid", "completed" {
      <span class="badge badge-success">✓ Complete</span>
    }
    when "pending" {
      <span class="badge badge-warning">⏳ Pending</span>
    }
    _.startsWith("error") {
      <span class="badge badge-error">✗ Error</span>
    }
    * {
      <span class="badge badge-default">$status</span>
    }
  }
</template:StatusBadge>
```

---

## 20. Summary

This template engine provides:

✅ **Unified system** for both build-time and runtime templates  
✅ **Strong typing** support for developer-authored templates  
✅ **Full source tracking** for auditability and debugging  
✅ **Component system** with slots and isolated scope  
✅ **Expression language** with nested functions, arithmetic, and array operations  
✅ **Security controls** via function allowlisting and resource limits  
✅ **Comprehensive tooling** with LSP, validation, and source maps  
✅ **Flexible configuration** for different deployment scenarios  
✅ **Clear error handling** with helpful diagnostics  
✅ **Performance optimization** through compilation and caching  

**The system is now fully specified and ready for implementation.**

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Ready for Implementation
