// AST Type Definitions for Blade Templates
//
// This file defines the complete Internal Representation (IR) for Blade templates.
// All nodes in the AST include source location information for error reporting,
// debugging, and source map generation.

/**
 * Tracks the precise location of a node in the source template.
 *
 * @property start - Beginning position of the node
 * @property start.line - Line number (1-indexed)
 * @property start.column - Column number (1-indexed)
 * @property start.offset - Absolute character position from start of source (0-indexed)
 * @property end - Ending position of the node
 * @property source - Optional original template text for context in error messages
 *
 * @example
 * For template "<div>\n  $foo\n</div>", the expression $foo would have:
 * - start: { line: 2, column: 3, offset: 9 }
 * - end: { line: 2, column: 7, offset: 13 }
 */
export interface SourceLocation {
  readonly start: {
    readonly line: number;
    readonly column: number;
    readonly offset: number;
  };
  readonly end: {
    readonly line: number;
    readonly column: number;
    readonly offset: number;
  };
  readonly source?: string;
}

/**
 * Metadata for source tracking and auditability (rd-source attributes).
 *
 * This enables tracking which data paths contributed to rendered output,
 * supporting audit trails and debugging. Populated at compile-time (static)
 * and optionally at runtime (accessed).
 *
 * @property staticPaths - All data paths referenced in template (compile-time)
 * @property staticOperations - All operations found (compile-time)
 * @property staticHelpers - All helper functions referenced (compile-time)
 * @property accessedPaths - Paths actually accessed during render (runtime)
 * @property accessedOperations - Operations actually executed (runtime)
 *
 * @example
 * For "${formatCurrency(order.total)}":
 * - staticPaths: ["order.total"]
 * - staticHelpers: Set(["formatCurrency"])
 * - staticOperations: ["format:currency"]
 */
export interface PathMetadata {
  readonly staticPaths: readonly string[];
  readonly staticOperations: readonly string[];
  readonly staticHelpers: ReadonlySet<string>;
  readonly accessedPaths?: readonly string[];
  readonly accessedOperations?: readonly string[];
}

/**
 * Base interface for all AST nodes.
 *
 * Every node in the AST includes location information for error reporting
 * and optional metadata for source tracking.
 *
 * @property location - Source location of this node in the template
 * @property metadata - Optional path metadata for source tracking (rd-source)
 */
export interface BaseNode {
  readonly location: SourceLocation;
  readonly metadata?: PathMetadata;
}

/**
 * Expression AST nodes.
 *
 * Expressions are used in:
 * - Text interpolation: $foo or ${foo + bar}
 * - Attribute values: <div class=${status}>
 * - Directive conditions: @if(isValid)
 * - Loop expressions: @for(item of items)
 * - Variable declarations: @@ { let x = 10; }
 *
 * All expressions support operator precedence (see spec Section 4.1).
 */
export type ExprAst =
  | LiteralNode
  | PathNode
  | UnaryNode
  | BinaryNode
  | TernaryNode
  | CallNode
  | ArrayWildcardNode
  | ArrayNode
  | MemberAccessNode
  | FunctionExpr;

/**
 * Type discriminator for literal values.
 *
 * Helps distinguish between different literal types during evaluation.
 */
export type LiteralType = 'string' | 'number' | 'boolean' | 'nil';

/**
 * Literal value node.
 *
 * Represents constant values in expressions.
 *
 * @property kind - Always "literal"
 * @property type - Literal type discriminator for faster evaluation
 * @property value - The literal value (null for nil type, undefined also treated as nil)
 *
 * @example
 * - 123 → { kind: "literal", type: "number", value: 123 }
 * - "hello" → { kind: "literal", type: "string", value: "hello" }
 * - true → { kind: "literal", type: "boolean", value: true }
 * - null → { kind: "literal", type: "nil", value: null }
 */
export interface LiteralNode extends BaseNode {
  readonly kind: 'literal';
  readonly type: LiteralType;
  readonly value: string | number | boolean | null | undefined;
}

/**
 * Property key access in a path (e.g., "name" in order.customer.name).
 *
 * @property kind - Always "key"
 * @property key - Property name to access
 */
export interface KeyPathItem {
  readonly kind: 'key';
  readonly key: string;
}

/**
 * Array index access in a path (e.g., 0 in items[0].name).
 *
 * @property kind - Always "index"
 * @property index - Numeric index to access
 */
export interface IndexPathItem {
  readonly kind: 'index';
  readonly index: number;
}

/**
 * Wildcard array access in a path (e.g., * in items[*].price).
 *
 * Extracts the specified property from all elements in an array.
 * Nested wildcards are flattened during evaluation.
 *
 * @property kind - Always "star"
 */
export interface StarPathItem {
  readonly kind: 'star';
}

/**
 * Path segment discriminated union.
 *
 * Represents a single step in a path traversal.
 */
export type PathItem = KeyPathItem | IndexPathItem | StarPathItem;

/**
 * Path expression node.
 *
 * Represents access to data, locals, or globals.
 * All path access has implicit optional chaining (no errors for null/undefined).
 *
 * @property kind - Always "path"
 * @property segments - Path components as discriminated unions
 * @property isGlobal - True if path starts with $ (e.g., $.currency)
 *
 * @example
 * - $order.total → { segments: [{kind:"key",key:"order"}, {kind:"key",key:"total"}], isGlobal: false }
 * - $.currency → { segments: [{kind:"key",key:"currency"}], isGlobal: true }
 * - $items[0].name → { segments: [{kind:"key",key:"items"}, {kind:"index",index:0}, {kind:"key",key:"name"}], isGlobal: false }
 * - $items[*].price → { segments: [{kind:"key",key:"items"}, {kind:"star"}, {kind:"key",key:"price"}], isGlobal: false }
 */
export interface PathNode extends BaseNode {
  readonly kind: 'path';
  readonly segments: readonly PathItem[];
  readonly isGlobal: boolean;
}

/**
 * Unary operation node.
 *
 * Supports logical NOT and arithmetic negation.
 *
 * @property kind - Always "unary"
 * @property operator - Either "!" (logical NOT) or "-" (negation)
 * @property operand - The expression to apply the operator to
 *
 * @example
 * - !isValid → { operator: "!", operand: PathNode(isValid) }
 * - -total → { operator: "-", operand: PathNode(total) }
 */
export interface UnaryNode extends BaseNode {
  readonly kind: 'unary';
  readonly operator: '!' | '-';
  readonly operand: ExprAst;
}

/**
 * Binary operators with precedence levels.
 *
 * Precedence (highest to lowest):
 * 1. Multiplicative: *, /, %
 * 2. Additive: +, -
 * 3. Relational: <, >, <=, >=
 * 4. Equality: ==, !=
 * 5. Logical AND: &&
 * 6. Logical OR: ||
 * 7. Nullish coalescing: ??
 */
export type BinaryOperator =
  | '+' // Addition or string concatenation
  | '-' // Subtraction
  | '*' // Multiplication
  | '/' // Division
  | '%' // Modulo
  | '==' // Equality
  | '!=' // Inequality
  | '<' // Less than
  | '>' // Greater than
  | '<=' // Less than or equal
  | '>=' // Greater than or equal
  | '&&' // Logical AND (short-circuit)
  | '||' // Logical OR (short-circuit)
  | '??'; // Nullish coalescing (null/undefined only)

/**
 * Binary operation node.
 *
 * Supports arithmetic, comparison, and logical operations with automatic
 * type coercion following JavaScript semantics.
 *
 * @property kind - Always "binary"
 * @property operator - The binary operator
 * @property left - Left operand
 * @property right - Right operand
 *
 * @example
 * - total + tax → { operator: "+", left: PathNode(total), right: PathNode(tax) }
 * - "Total: " + 100 → { operator: "+", left: LiteralNode("Total: "), right: LiteralNode(100) }
 * - count > 0 → { operator: ">", left: PathNode(count), right: LiteralNode(0) }
 */
export interface BinaryNode extends BaseNode {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: ExprAst;
  readonly right: ExprAst;
}

/**
 * Ternary conditional expression node.
 *
 * Implements the ternary operator: condition ? truthy : falsy
 *
 * @property kind - Always "ternary"
 * @property condition - Expression to evaluate
 * @property truthy - Expression returned if condition is truthy
 * @property falsy - Expression returned if condition is falsy
 *
 * @example
 * - isValid ? "Yes" : "No" → { condition: PathNode(isValid), truthy: LiteralNode("Yes"), falsy: LiteralNode("No") }
 * - count > 0 ? count : "None" → { condition: BinaryNode(...), truthy: PathNode(count), falsy: LiteralNode("None") }
 */
export interface TernaryNode extends BaseNode {
  readonly kind: 'ternary';
  readonly condition: ExprAst;
  readonly truthy: ExprAst;
  readonly falsy: ExprAst;
}

/**
 * Function call node.
 *
 * Calls a helper function with arguments. Only registered helpers can be called.
 * Helpers are curried with scope at call time (see spec Section 5.3).
 *
 * @property kind - Always "call"
 * @property callee - Name of the helper function
 * @property args - Array of argument expressions
 *
 * @example
 * - formatCurrency(100) → { callee: "formatCurrency", args: [LiteralNode(100)] }
 * - sum(items[*].price) → { callee: "sum", args: [ArrayWildcardNode(...)] }
 * - formatDate($.now(), "YYYY-MM-DD") → { callee: "formatDate", args: [CallNode(now), LiteralNode("YYYY-MM-DD")] }
 */
export interface CallNode extends BaseNode {
  readonly kind: 'call';
  readonly callee: string;
  readonly args: readonly ExprAst[];
}

/**
 * Array wildcard node.
 *
 * Extracts a property from all elements in an array. Nested wildcards are flattened.
 *
 * @property kind - Always "wildcard"
 * @property path - Path expression containing [*] wildcards
 *
 * @example
 * - items[*].price → Returns array [10, 20, 30] if items has 3 elements
 * - departments[*].employees[*].salary → Flattened array of all salaries
 *
 * Used with aggregation functions:
 * - sum(items[*].price) → sum([10, 20, 30])
 */
export interface ArrayWildcardNode extends BaseNode {
  readonly kind: 'wildcard';
  readonly path: PathNode;
}

/**
 * Array literal node.
 *
 * Represents an array literal expression like [1, 2, 3] or [].
 *
 * @property kind - Always "array"
 * @property elements - Array of expressions that make up the array elements
 *
 * @example
 * - [] → { kind: "array", elements: [] }
 * - [1, 2, 3] → { kind: "array", elements: [LiteralNode(1), LiteralNode(2), LiteralNode(3)] }
 * - [a, b + 1] → { kind: "array", elements: [PathNode(a), BinaryNode(+, PathNode(b), LiteralNode(1))] }
 */
export interface ArrayNode extends BaseNode {
  readonly kind: 'array';
  readonly elements: readonly ExprAst[];
}

/**
 * Member access node.
 *
 * Represents member access on any expression result, such as:
 * - foo()[0] - index access on function result
 * - foo()[*].bar - wildcard + property access on function result
 * - (a || b).length - property access on expression result
 *
 * @property kind - Always "member"
 * @property object - The expression whose result is being accessed
 * @property path - The path segments to access on the result
 * @property hasWildcard - Whether the path contains a [*] wildcard
 *
 * @example
 * - foo()[0] → { object: CallNode(foo), path: [index(0)], hasWildcard: false }
 * - foo()[*].bar → { object: CallNode(foo), path: [star(), key("bar")], hasWildcard: true }
 */
export interface MemberAccessNode extends BaseNode {
  readonly kind: 'member';
  readonly object: ExprAst;
  readonly path: readonly PathItem[];
  readonly hasWildcard: boolean;
}

/**
 * Template node types.
 *
 * Template nodes represent the structure of the template, including HTML elements,
 * control flow directives, text with embedded expressions, and components.
 */
export type TemplateNode =
  | TextNode
  | ElementNode
  | IfNode
  | ForNode
  | MatchNode
  | LetNode
  | PropsNode
  | ComponentNode
  | FragmentNode
  | SlotNode
  | SlotFillNode
  | CommentNode
  | DoctypeNode;

/**
 * Text node with optional expression interpolation.
 *
 * Text content is broken into segments that are either static strings
 * or dynamic expressions to be evaluated.
 *
 * @property kind - Always "text"
 * @property segments - Array of literal text and expression segments
 *
 * @example
 * Template: "Total: ${formatCurrency(total)}"
 * Segments: [
 *   { kind: "literal", text: "Total: " },
 *   { kind: "expr", expr: CallNode(formatCurrency, [PathNode(total)]) }
 * ]
 */
export interface TextNode extends BaseNode {
  readonly kind: 'text';
  readonly segments: readonly TextSegment[];
}

/**
 * Text segment (literal or expression).
 *
 * @property kind - Either "literal" for static text or "expr" for interpolated expressions
 * @property text - Static text content (only for literal segments)
 * @property expr - Expression to evaluate (only for expr segments)
 * @property unsafe - If true, expression output will NOT be HTML-escaped (only for expr segments)
 * @property location - Source location of this segment
 */
export type TextSegment =
  | {
      readonly kind: 'literal';
      readonly text: string;
      readonly location: SourceLocation;
    }
  | {
      readonly kind: 'expr';
      readonly expr: ExprAst;
      readonly unsafe?: boolean;
      readonly location: SourceLocation;
    };

/**
 * HTML element node.
 *
 * Represents standard HTML elements with attributes and children.
 * Rendered with source tracking attributes (rd-source, rd-source-op, rd-source-note).
 *
 * @property kind - Always "element"
 * @property tag - HTML tag name (e.g., "div", "span", "button")
 * @property attributes - Array of static or dynamic attributes
 * @property children - Nested template nodes
 *
 * @example
 * Template: <div class="status-${order.status}">$order.total</div>
 */
export interface ElementNode extends BaseNode {
  readonly kind: 'element';
  readonly tag: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateNode[];
}

/**
 * Static attribute value segment.
 *
 * Represents a literal string portion of an attribute value.
 *
 * @property kind - Always "static"
 * @property value - Static string value
 * @property location - Source location of this segment
 */
export interface StaticAttributeValue {
  readonly kind: 'static';
  readonly value: string;
  readonly location: SourceLocation;
}

/**
 * Static HTML attribute node.
 *
 * Attribute with a constant string value.
 *
 * @property name - Attribute name
 * @property kind - Always "static"
 * @property value - Static string value
 * @property location - Source location
 *
 * @example
 * class="container" → { kind: "static", name: "class", value: "container" }
 */
export interface StaticAttributeNode extends StaticAttributeValue {
  readonly name: string;
}

/**
 * Expression attribute value segment.
 *
 * Represents a dynamic expression portion of an attribute value.
 *
 * @property kind - Always "expr"
 * @property expr - Expression to evaluate
 * @property location - Source location of this segment
 */
export interface ExprAttributeValue {
  readonly kind: 'expr';
  readonly expr: ExprAst;
  readonly location: SourceLocation;
}

/**
 * Expression HTML attribute node.
 *
 * Attribute with a fully dynamic expression value.
 *
 * @property name - Attribute name
 * @property kind - Always "expr"
 * @property expr - Expression to evaluate
 * @property location - Source location
 *
 * @example
 * disabled=${!isValid} → { kind: "expr", name: "disabled", expr: UnaryNode(...) }
 */
export interface ExprAttributeNode extends ExprAttributeValue {
  readonly name: string;
}

/**
 * Mixed HTML attribute node.
 *
 * Attribute with both static and dynamic parts (string interpolation).
 * Useful for attributes like class="base-${dynamic}" or href="/user/${id}".
 *
 * @property kind - Always "mixed"
 * @property name - Attribute name
 * @property segments - Array of static and expression segments
 *
 * @example
 * class="status-${order.status}" → {
 *   kind: "mixed",
 *   name: "class",
 *   segments: [
 *     { kind: "static", value: "status-" },
 *     { kind: "expr", expr: PathNode(order.status) }
 *   ]
 * }
 */
export interface MixedAttributeNode {
  readonly kind: 'mixed';
  readonly name: string;
  readonly segments: readonly (StaticAttributeValue | ExprAttributeValue)[];
  readonly location: SourceLocation;
}

/**
 * An event binding: `on:click=${handler}`.
 *
 * Not an attribute, despite its spelling. An attribute carries text, and no
 * text means "this function": that is precisely why `onclick="${x}"` is
 * refused - it would have to serialise a value into JavaScript source this
 * engine never parses, and every escaper it could apply would be a guess about
 * a language it is not reading. An `on:` binding never becomes source. Its
 * expression evaluates to a callable, and a sink that can hold a listener binds
 * it to the element.
 *
 * Which is also why it is a separate node kind rather than a name convention
 * checked at three different depths: the compiler, the validator and the
 * traversal all need to agree that this thing never reaches an attribute
 * position, and a discriminated union is how they are made to.
 *
 * @property kind - Always "event"
 * @property name - The binding exactly as written, e.g. `on:click`
 * @property event - The event to listen for, e.g. `click`
 * @property expr - Expression evaluating to the handler
 *
 * @example
 * on:click=${submit} → {
 *   kind: "event", name: "on:click", event: "click", expr: PathNode(submit)
 * }
 */
export interface EventAttributeNode {
  readonly kind: 'event';
  readonly name: string;
  readonly event: string;
  readonly expr: ExprAst;
  readonly location: SourceLocation;
}

/**
 * HTML attribute discriminated union.
 *
 * Attributes can be:
 * - Static: constant string value
 * - Expression: fully dynamic value
 * - Mixed: combination of static strings and expressions
 * - Event: an `on:` binding, which is behaviour rather than text
 *
 * @example
 * - class="active" → StaticAttributeNode
 * - disabled=${!isValid} → ExprAttributeNode
 * - class="status-${order.status}" → MixedAttributeNode
 * - on:click=${submit} → EventAttributeNode
 */
export type AttributeNode =
  | StaticAttributeNode
  | ExprAttributeNode
  | MixedAttributeNode
  | EventAttributeNode;

/**
 * Conditional rendering node.
 *
 * Implements @if/@else if/@else directives with short-circuit evaluation.
 *
 * @property kind - Always "if"
 * @property branches - Array of condition/body pairs for @if and @else if
 * @property elseBranch - Optional body for @else clause
 *
 * @example
 * @if(status == "paid") {
 *   <span>Paid</span>
 * } else if(status == "pending") {
 *   <span>Pending</span>
 * } else {
 *   <span>Unknown</span>
 * }
 */
export interface IfNode extends BaseNode {
  readonly kind: 'if';
  readonly branches: readonly IfBranch[];
  readonly elseBranch?: readonly TemplateNode[];
}

/**
 * Single branch in an if/else if chain.
 *
 * @property condition - Expression to evaluate
 * @property body - Template nodes to render if condition is truthy
 * @property location - Source location of this branch
 */
export interface IfBranch {
  readonly condition: ExprAst;
  readonly body: readonly TemplateNode[];
  readonly location: SourceLocation;
}

/**
 * Loop iteration node.
 *
 * Implements @for directive with support for:
 * - @for(item of items) - iterate over values
 * - @for(item, index of items) - iterate over values with index
 * - @for(index in items) - iterate over indices/keys
 *
 * @property kind - Always "for"
 * @property itemsExpr - Expression that evaluates to array or object
 * @property itemVar - Variable name for current item/value
 * @property indexVar - Optional variable name for index/key
 * @property iterationType - "of" for values, "in" for indices/keys
 * @property key - Optional expression naming what each pass *is*
 * @property body - Template nodes to render for each iteration
 *
 * @example
 * @for(item, index of items) {
 *   <li>${index + 1}. $item.name</li>
 * }
 *
 * @example
 * @for(row of rows key row.id) {
 *   <input value=$row.name/>
 * }
 */
export interface ForNode extends BaseNode {
  readonly kind: 'for';
  readonly itemsExpr: ExprAst;
  readonly itemVar: string;
  readonly indexVar?: string;
  readonly iterationType: 'of' | 'in';
  /**
   * What a pass *is*, as opposed to where it sits: `key row.id`.
   *
   * Evaluated with the item variable bound and nothing else, because an
   * identity that depends on the position is not an identity - which is why a
   * key that reads the index variable is a compile error.
   *
   * Ignored by a render that produces its output once: an eager sink builds
   * every pass from scratch and has no earlier node to match this one against.
   * A reactive sink uses it to move a row's existing DOM instead of rewriting
   * the row that happens to sit in the same slot.
   */
  readonly key?: ExprAst;
  readonly body: readonly TemplateNode[];
}

/**
 * Pattern matching node.
 *
 * Implements @match directive with literal and expression matching.
 * First match wins (short-circuit evaluation).
 *
 * @property kind - Always "match"
 * @property value - Expression to match against
 * @property cases - Array of match cases
 * @property defaultCase - Optional default case (*)
 *
 * @example
 * @match(order.status) {
 *   when "paid", "completed" {
 *     <div class="success">Fulfilled</div>
 *   }
 *   _.startsWith("error_") {
 *     <div class="error">Error occurred</div>
 *   }
 *   * {
 *     <div>Unknown status</div>
 *   }
 * }
 */
export interface MatchNode extends BaseNode {
  readonly kind: 'match';
  readonly value: ExprAst;
  readonly cases: readonly MatchCase[];
  readonly defaultCase?: readonly TemplateNode[];
}

/**
 * Literal match case in a match statement.
 *
 * Matches against one or more literal values (strings, numbers, booleans).
 * Uses strict equality (===) for matching.
 *
 * @property kind - Always "literal"
 * @property values - Array of literal values to match against
 * @property body - Template nodes to render if matched
 * @property location - Source location of this case
 *
 * @example
 * when "paid", "completed" → {
 *   kind: "literal",
 *   values: ["paid", "completed"],
 *   body: [...]
 * }
 */
export interface MatchLiteralCase {
  readonly kind: 'literal';
  readonly values: readonly (string | number | boolean)[];
  readonly body: readonly TemplateNode[];
  readonly location: SourceLocation;
}

/**
 * Expression match case in a match statement.
 *
 * Evaluates a boolean expression where _ represents the matched value.
 * First truthy expression wins.
 *
 * @property kind - Always "expression"
 * @property condition - Boolean expression using _ as the matched value
 * @property body - Template nodes to render if condition is truthy
 * @property location - Source location of this case
 *
 * @example
 * _.startsWith("error_") → {
 *   kind: "expression",
 *   condition: CallNode(startsWith, [PathNode(_), LiteralNode("error_")]),
 *   body: [...]
 * }
 */
export interface MatchExpressionCase {
  readonly kind: 'expression';
  readonly condition: ExprAst;
  readonly body: readonly TemplateNode[];
  readonly location: SourceLocation;
}

/**
 * Match case discriminated union.
 *
 * Represents a single case in a @match statement.
 * Can be either literal matching or expression-based matching.
 *
 * @example
 * Literal: when "paid", "completed" → MatchLiteralCase
 * Expression: _.startsWith("error") → MatchExpressionCase
 */
export type MatchCase = MatchLiteralCase | MatchExpressionCase;

/**
 * Variable or function declaration node.
 *
 * Represents a single let/const declaration in @@ blocks.
 * Simplified from the original spec to have a flatter structure.
 *
 * @property kind - Always "let"
 * @property name - Variable or function name
 * @property isGlobal - True if name starts with $ (e.g., $.currency)
 * @property value - Expression or function to assign
 * @property location - Source location of this declaration
 *
 * @example
 * let taxRate = 0.08 → {
 *   kind: "let",
 *   name: "taxRate",
 *   isGlobal: false,
 *   value: LiteralNode(0.08)
 * }
 *
 * let $.currency = "EUR" → {
 *   kind: "let",
 *   name: "currency",
 *   isGlobal: true,
 *   value: LiteralNode("EUR")
 * }
 *
 * let discounted = (amount, percent) => amount * (1 - percent / 100) → {
 *   kind: "let",
 *   name: "discounted",
 *   isGlobal: false,
 *   value: FunctionExpr(...)
 * }
 */
export interface LetNode extends BaseNode {
  readonly kind: 'let';
  readonly name: string;
  readonly isGlobal: boolean;
  readonly value: ExprAst;
  readonly location: SourceLocation;
}

/**
 * Function expression (arrow function).
 *
 * User-defined functions are single-expression only (no statement blocks).
 * They support closures and recursion with depth limits.
 *
 * A member of {@link ExprAst} like any other expression: it evaluates to a
 * value - a callable one. Keeping it outside the union was what let the parser
 * smuggle one in with `as unknown as ExprAst`, which in turn cost the compiler
 * its exhaustiveness check and left `@let` arrow functions parsed, stored and
 * never callable.
 *
 * @property kind - Always "function"
 * @property params - Parameter names
 * @property body - Single expression (function body)
 * @property location - Source location of this function
 *
 * @example
 * (amount, percent) => amount * (1 - percent / 100)
 */
export interface FunctionExpr extends BaseNode {
  readonly kind: 'function';
  readonly params: readonly string[];
  readonly body: ExprAst;
  readonly location: SourceLocation;
}

/**
 * Component instance node.
 *
 * Represents usage of a component (must be capitalized name).
 * Components have isolated scope - only props are accessible inside.
 *
 * @property kind - Always "component"
 * @property name - Component name (capitalized, e.g., "PriceBreakdown")
 * @property props - Props passed to component
 * @property children - Slot content
 *
 * @example
 * <PriceBreakdown subtotal=$order.subtotal tax={0.08} />
 */
export interface ComponentNode extends BaseNode {
  readonly kind: 'component';
  readonly name: string;
  readonly props: readonly ComponentProp[];
  readonly children: readonly TemplateNode[];
}

/**
 * Component prop (argument).
 *
 * Represents a single prop passed to a component.
 * Props are always expressions (no static string values in this simplified version).
 *
 * @property name - Prop name
 * @property value - Expression to evaluate for the prop value
 * @property location - Source location of this prop
 *
 * @example
 * subtotal=$order.subtotal → {
 *   name: "subtotal",
 *   value: PathNode(order.subtotal)
 * }
 *
 * tax={0.08} → {
 *   name: "tax",
 *   value: LiteralNode(0.08)
 * }
 *
 * currency="USD" → {
 *   name: "currency",
 *   value: LiteralNode("USD")
 * }
 */
export interface ComponentProp {
  readonly name: string;
  readonly value: ExprAst;
  readonly location: SourceLocation;
}

/**
 * Fragment node for whitespace preservation.
 *
 * Fragments group elements without a wrapper and preserve all internal whitespace.
 *
 * @property kind - Always "fragment"
 * @property children - Template nodes inside fragment
 *
 * @example
 * <>
 *   <span>A</span>
 *   <span>B</span>
 * </>
 */
export interface FragmentNode extends BaseNode {
  readonly kind: 'fragment';
  readonly children: readonly TemplateNode[];
}

/**
 * Slot insertion point in component definition.
 *
 * Slots render content from the component caller's scope.
 *
 * @property kind - Always "slot"
 * @property name - Slot name (undefined for default slot)
 * @property fallback - Optional fallback content if slot not provided
 *
 * @example
 * <slot /> - Default slot with no fallback
 * <slot name="header"> - Named slot
 * <slot name="footer"><p>Default footer</p></slot> - Named slot with fallback
 */
export interface SlotNode extends BaseNode {
  readonly kind: 'slot';
  readonly name?: string;
  readonly fallback?: readonly TemplateNode[];
}

/**
 * Content a component call supplies for one of the component's named slots.
 *
 * `<slot:header>...</slot:header>` inside a `<Card>` is a fill, not an element:
 * it names a hole in `Card`'s body rather than describing markup of its own. It
 * had to become its own node kind for that distinction to exist at all - parsed
 * as an ordinary element, the fill matched no slot, the slot rendered its
 * fallback, and the `<slot:header>` tag itself was written into the page as an
 * unknown element.
 *
 * Fills are only meaningful as the direct children of a component call;
 * anywhere else they are reported by the validator.
 *
 * @property kind - Always "slot-fill"
 * @property name - Name of the slot being filled
 * @property children - Content to render in the caller's own scope
 *
 * @example
 * <Card><slot:header><h2>Title</h2></slot:header>body</Card>
 */
export interface SlotFillNode extends BaseNode {
  readonly kind: 'slot-fill';
  readonly name: string;
  readonly children: readonly TemplateNode[];
}

/**
 * Comment node.
 *
 * Comments can be line (//), block, or HTML style.
 * By default not rendered unless config.includeComments is true.
 *
 * @property kind - Always "comment"
 * @property style - Comment syntax style: "line", "block", or "html"
 * @property text - Comment content
 *
 * @example
 * Line comment: style="line", text="This is a line comment"
 * Block comment: style="block", text="Block comment"
 * HTML comment: style="html", text="HTML comment"
 */
export interface CommentNode extends BaseNode {
  readonly kind: 'comment';
  readonly style: 'line' | 'block' | 'html';
  readonly text: string;
}

/**
 * DOCTYPE declaration node.
 *
 * Represents HTML DOCTYPE declarations like <!DOCTYPE html>.
 *
 * @property kind - Always "doctype"
 * @property value - The doctype value (e.g., "html" for <!DOCTYPE html>)
 */
export interface DoctypeNode extends BaseNode {
  readonly kind: 'doctype';
  readonly value: string;
}

/**
 * Component definition (template).
 *
 * Components are defined inline with <template:Name> syntax.
 *
 * @property name - Component name (must be capitalized)
 * @property props - Declared props, in source order
 * @property body - Template nodes inside component definition
 * @property location - Source location of the definition
 *
 * @example
 * <template:PriceBreakdown subtotal! tax={0.1} currency="USD">
 *   <div>${formatCurrency(subtotal + tax, currency)}</div>
 * </template:PriceBreakdown>
 */
export interface ComponentDefinition {
  readonly name: string;
  readonly props: readonly PropDeclaration[];
  readonly body: readonly TemplateNode[];
  readonly location: SourceLocation;
}

/**
 * Root node of a compiled template.
 *
 * The root node contains all top-level template nodes, component definitions,
 * and compile-time metadata for validation and optimization.
 *
 * @property kind - Always "root"
 * @property children - Top-level template nodes
 * @property components - Map of component name to definition (from <template:> tags)
 * @property props - Props the template declares with `@props()`, in source order
 * @property metadata - Compile-time metadata for static analysis
 */
export interface RootNode {
  readonly kind: 'root';
  readonly children: readonly TemplateNode[];
  readonly components: ReadonlyMap<string, ComponentDefinition>;
  readonly props: readonly PropDeclaration[];
  readonly metadata: TemplateMetadata;
  readonly location: SourceLocation;
}

/**
 * Compile-time template metadata.
 *
 * Collected during static analysis phase (Phase 4 of compilation).
 * Used for validation, optimization, and tooling support.
 *
 * @property globalsUsed - All global variables referenced ($.xxx)
 * @property pathsAccessed - All data paths accessed (static analysis)
 * @property helpersUsed - All helper functions called
 * @property componentsUsed - All components referenced (for loading)
 */
export interface TemplateMetadata {
  readonly globalsUsed: ReadonlySet<string>;
  readonly pathsAccessed: ReadonlySet<string>;
  readonly helpersUsed: ReadonlySet<string>;
  readonly componentsUsed: ReadonlySet<string>;
}

/**
 * A template that compiled with no error diagnostics.
 *
 * This is the only thing a renderer factory accepts. "Parsed cleanly" and
 * "failed to parse" used to be the same type - `{ root, diagnostics }` either
 * way - so whether a broken template rendered partial output or threw depended
 * on which of the three renderers you happened to call. Only one of them
 * looked at `diagnostics`.
 *
 * @property kind - Always "valid"
 * @property root - Root AST node
 * @property diagnostics - Warnings only; a valid template has no errors
 */
export interface ValidTemplate {
  readonly kind: 'valid';
  readonly root: RootNode;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * A template that produced at least one error diagnostic.
 *
 * Its partial tree is exposed for tooling - the LSP still wants to offer
 * completions inside a document that does not parse - but it is a distinct
 * type, so a renderer structurally cannot take it.
 *
 * @property kind - Always "partial"
 * @property root - Best-effort partial tree; do not render it
 * @property diagnostics - At least one entry is level "error"
 */
export interface PartialTemplate {
  readonly kind: 'partial';
  readonly root: RootNode;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The result of {@link compile}.
 *
 * Discriminated on `ok`: a caller cannot reach a template without deciding
 * what to do about failure.
 *
 * @example
 * ```typescript
 * const result = compile(source);
 * if (!result.ok) return report(result.diagnostics);
 * const render = createStringRenderer(result.template);
 * ```
 */
export type CompileResult =
  | { readonly ok: true; readonly template: ValidTemplate }
  | {
      readonly ok: false;
      readonly partial: PartialTemplate;
      /** The same array as `partial.diagnostics`. */
      readonly diagnostics: readonly Diagnostic[];
    };

/**
 * @deprecated Use {@link ValidTemplate}. Kept only while `renderer/index.ts`
 * still spells the renderable template this way.
 */
export type CompiledTemplate = ValidTemplate;

/**
 * Compilation or validation diagnostic.
 *
 * Errors prevent template from being used, warnings are informational.
 *
 * @property level - "error" stops compilation, "warning" allows usage
 * @property message - Human-readable diagnostic message
 * @property location - Source location where issue occurred
 * @property code - Optional error code for categorization
 *
 * @example
 * {
 *   level: "error",
 *   message: "Undefined variable 'foo'",
 *   location: { start: { line: 5, column: 10, offset: 42 }, ... },
 *   code: "UNDEFINED_VARIABLE"
 * }
 */
export interface Diagnostic {
  readonly level: 'error' | 'warning';
  readonly message: string;
  readonly location: SourceLocation;
  readonly code?: string;
  /**
   * The file the location indexes, when it is not the one being compiled.
   *
   * A project compile validates every component it discovered, not only the
   * entry file, so a diagnostic has to say which file line 12 belongs to.
   * Absent means "the source that was compiled".
   */
  readonly file?: string;
}

// =============================================================================
// Project-based Template Compilation Types
// =============================================================================

/**
 * A single prop declaration from @props() directive.
 *
 * Used to declare component inputs explicitly at the top of a .blade file.
 *
 * @property name - Variable name without $ prefix
 * @property required - True if no default value provided
 * @property defaultValue - Default value expression (undefined if required)
 * @property location - Source location for error reporting
 *
 * @example
 * @props($name) → { name: 'name', required: true, defaultValue: undefined }
 * @props($disabled = false) → { name: 'disabled', required: false, defaultValue: LiteralNode(false) }
 */
export interface PropDeclaration {
  readonly name: string;
  readonly required: boolean;
  readonly defaultValue: ExprAst | undefined;
  readonly location: SourceLocation;
}

/**
 * The `@props()` directive node.
 *
 * `@props` is a directive like `@if` or `@for`, parsed by the one template
 * parser and represented in the one AST. It used to be an out-of-band
 * preprocessor - a second parser that sliced the directive off the front of the
 * source and handed the remainder to the real parser, leaving every caller to
 * rebase the resulting offsets by hand. Most callers did not, and the ones that
 * did rebased the line but not the column, so diagnostics and source-tracking
 * coordinates landed in the wrong place; `compile()` never ran it at all, so
 * every template that declared props failed with "Unknown directive: @props".
 *
 * The declarations are also surfaced together on {@link RootNode.props}, which
 * is what a component loader wants.
 *
 * @property kind - Always "props"
 * @property props - Declared props, in source order
 *
 * @example
 * @props(label, disabled = false, onClick?) → {
 *   kind: 'props',
 *   props: [
 *     { name: 'label', required: true },
 *     { name: 'disabled', required: false, defaultValue: LiteralNode(false) },
 *     { name: 'onClick', required: false, defaultValue: undefined }
 *   ]
 * }
 */
export interface PropsNode extends BaseNode {
  readonly kind: 'props';
  readonly props: readonly PropDeclaration[];
}

/**
 * Configuration for a Blade project.
 *
 * A project is a folder containing an index.blade entry point.
 *
 * @property rootPath - Absolute path to project root (folder containing index.blade)
 * @property entry - Entry point filename (default: 'index.blade')
 * @property schema - Parsed JSON Schema from schema.json (if present)
 * @property samples - Loaded sample data from samples/*.json
 */
export interface ProjectConfig {
  readonly rootPath: string;
  readonly entry: string;
  readonly schema: JsonSchema | undefined;
  readonly samples: ReadonlyMap<string, unknown>;
}

/**
 * Information about a discovered component.
 *
 * Components are .blade files discovered in the project folder structure.
 *
 * @property tagName - Tag name for usage (e.g., 'Button', 'Components.Form.Input')
 * @property filePath - Absolute path to .blade file
 * @property namespace - Namespace segments (e.g., ['Components', 'Form'] for Components.Form.Input)
 * @property props - Parsed prop declarations (lazy-loaded)
 * @property propsInferred - True if props were inferred from variable usage (no @props directive)
 *
 * @example
 * button.blade → { tagName: 'Button', filePath: '/path/button.blade', namespace: [] }
 * components/form/input.blade → { tagName: 'Components.Form.Input', namespace: ['Components', 'Form'] }
 */
export interface ComponentInfo {
  readonly tagName: string;
  readonly filePath: string;
  readonly namespace: readonly string[];
  props: readonly PropDeclaration[] | undefined;
  propsInferred: boolean;
}

/**
 * Runtime context for project compilation.
 *
 * Contains all discovered components and project configuration.
 *
 * @property config - Project configuration
 * @property components - Discovered components keyed by tag name
 * @property templateComponents - Components passed via template (shadow discovered)
 * @property warnings - Collected warnings during discovery
 * @property errors - Collected errors during discovery
 */
export interface ProjectContext {
  readonly config: ProjectConfig;
  readonly components: Map<string, ComponentInfo>;
  readonly templateComponents: ReadonlyMap<string, ComponentDefinition>;
  readonly warnings: Diagnostic[];
  readonly errors: Diagnostic[];
}

/**
 * The subset of JSON Schema this package understands.
 *
 * One type, not three. There used to be `JsonSchema` here, `JsonSchemaProperty`
 * in `project/schema.ts` and `JSONSchema` in `validation/index.ts` - different
 * shapes under clashing names, and the last of them carried an
 * `[key: string]: unknown` index signature that made every typo structurally
 * valid.
 *
 * This is deliberately not a validator: it describes what the LSP and the
 * template validator read out of a `schema.json`.
 */
export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly default?: unknown;
  readonly enum?: readonly unknown[];
  /** Which dialect the document declares; selects the validator. */
  readonly $schema?: string;
  /** Local reference, e.g. `#/$defs/User`. */
  readonly $ref?: string;
  /** Where `$ref` targets live, in either spelling. */
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
  readonly definitions?: Readonly<Record<string, JsonSchema>>;
  /** Conjunction: every branch applies. */
  readonly allOf?: readonly JsonSchema[];
  /** Alternatives: exactly one branch applies. */
  readonly oneOf?: readonly JsonSchema[];
  /** Alternatives: at least one branch applies. */
  readonly anyOf?: readonly JsonSchema[];
  /** `false` refuses properties the schema does not name. */
  readonly additionalProperties?: boolean | JsonSchema;
  readonly title?: string;
  readonly format?: string;
}

/**
 * Result from compileProject().
 *
 * @property ast - Compiled AST with all components resolved
 * @property context - Project context used during compilation
 * @property warnings - Non-fatal warnings (e.g., @props syntax errors with fallback)
 * @property errors - Fatal errors preventing successful compilation
 * @property success - True if compilation succeeded (errors is empty)
 */
export interface ProjectResult {
  readonly ast: RootNode;
  readonly context: ProjectContext;
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
  readonly success: boolean;
  /**
   * The entry template with every discovered component merged in - ready to
   * hand to a renderer factory - or null when the project did not compile.
   *
   * `ast` is the entry file's tree and nothing more: its `components` map holds
   * only what the file declared inline with `<template:Name>`, so rendering it
   * fails on the first `<Comment/>` that lives in a sibling file. Every caller
   * that wanted to render a project therefore rebuilt this merge by hand -
   * the VS Code preview still carries its own copy - and each copy is a chance
   * to disagree about what a project *is*. It is computed once, here, by the
   * code that already discovered the components.
   */
  readonly template: ValidTemplate | null;
}

// `ProjectOptions` used to be declared here, with an `entry` the project
// compiler ignored when it built the context and a `sourceTracking` flag that
// nothing has ever read - source tracking is a *render* option
// (`sourceTrackingPrefix`) and is chosen when a template is rendered, not when
// a project is compiled. The options a project load actually takes live with
// the loader, as `ProjectLoadOptions` in `project/sources.ts`, where the
// filesystem and discovery bounds they include belong.
