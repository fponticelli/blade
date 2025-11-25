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
  | ArrayWildcardNode;

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
  | ComponentNode
  | FragmentNode
  | SlotNode
  | CommentNode;

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
 * HTML attribute discriminated union.
 *
 * Attributes can be:
 * - Static: constant string value
 * - Expression: fully dynamic value
 * - Mixed: combination of static strings and expressions
 *
 * @example
 * - class="active" → StaticAttributeNode
 * - disabled=${!isValid} → ExprAttributeNode
 * - class="status-${order.status}" → MixedAttributeNode
 */
export type AttributeNode =
  | StaticAttributeNode
  | ExprAttributeNode
  | MixedAttributeNode;

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
 * @property body - Template nodes to render for each iteration
 *
 * @example
 * @for(item, index of items) {
 *   <li>${index + 1}. $item.name</li>
 * }
 */
export interface ForNode extends BaseNode {
  readonly kind: 'for';
  readonly itemsExpr: ExprAst;
  readonly itemVar: string;
  readonly indexVar?: string;
  readonly iterationType: 'of' | 'in';
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
  readonly value: ExprAst | FunctionExpr;
  readonly location: SourceLocation;
}

/**
 * Function expression (arrow function).
 *
 * User-defined functions are single-expression only (no statement blocks).
 * They support closures and recursion with depth limits.
 *
 * @property kind - Always "function"
 * @property params - Parameter names
 * @property body - Single expression (function body)
 * @property location - Source location of this function
 *
 * @example
 * (amount, percent) => amount * (1 - percent / 100)
 */
export interface FunctionExpr {
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
 * @property propPathMapping - Maps prop names to original caller paths for source tracking
 *
 * @example
 * <PriceBreakdown subtotal=$order.subtotal tax={0.08} />
 */
export interface ComponentNode extends BaseNode {
  readonly kind: 'component';
  readonly name: string;
  readonly props: readonly ComponentProp[];
  readonly children: readonly TemplateNode[];
  readonly propPathMapping: ReadonlyMap<string, readonly string[]>;
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
 * @property preserveWhitespace - Always true (fragments preserve whitespace)
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
  readonly preserveWhitespace: true;
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
 * Component definition (template).
 *
 * Components are defined with <template:Name> syntax and can be loaded
 * at compile time via @load directive or through a TemplateLoader.
 *
 * @property name - Component name (must be capitalized)
 * @property props - Component prop definitions with defaults and required flags
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
  readonly props: readonly PropDefinition[];
  readonly body: readonly TemplateNode[];
  readonly location: SourceLocation;
}

/**
 * Component prop definition.
 *
 * Defines a single prop with optional default value and required flag.
 *
 * @property name - Prop name
 * @property required - True if prop ends with ! (e.g., subtotal!)
 * @property defaultValue - Optional default value expression or string
 * @property location - Source location of this prop definition
 *
 * @example
 * - subtotal! → { name: "subtotal", required: true }
 * - tax={0.1} → { name: "tax", required: false, defaultValue: LiteralNode(0.1) }
 * - currency="USD" → { name: "currency", required: false, defaultValue: "USD" }
 */
export interface PropDefinition {
  readonly name: string;
  readonly required: boolean;
  readonly defaultValue?: ExprAst | string;
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
 * @property metadata - Compile-time metadata for static analysis
 */
export interface RootNode {
  readonly kind: 'root';
  readonly children: readonly TemplateNode[];
  readonly components: ReadonlyMap<string, ComponentDefinition>;
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
 * Compiled template result.
 *
 * Output of the compilation pipeline, ready for rendering.
 * Can be cached and reused with different data.
 *
 * @property root - Root AST node
 * @property sourceMap - Optional source map for debugging (VLQ-encoded)
 * @property diagnostics - Compilation errors and warnings
 */
export interface CompiledTemplate {
  readonly root: RootNode;
  readonly sourceMap?: SourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Source map for mapping rendered output back to template source.
 *
 * Follows the Source Map v3 specification format.
 * Generated when compileOptions.includeSourceMap is true.
 *
 * @property version - Source map version (always 3)
 * @property sources - Array of source file names
 * @property names - Array of identifier names
 * @property mappings - VLQ-encoded mapping data
 */
export interface SourceMap {
  readonly version: number;
  readonly sources: readonly string[];
  readonly names: readonly string[];
  readonly mappings: string;
}

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
}
