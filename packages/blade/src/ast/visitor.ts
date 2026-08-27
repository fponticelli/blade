// AST Traversal
//
// One typed, exhaustive walker over the template and expression ASTs.
//
// Hand-rolled walkers drift. Several copies of this logic once lived in the
// project compiler, the resolver and the LSP scope analyser; three of them took
// `node: unknown`, cast to `Record<string, unknown>` and dispatched on string
// literals, so the compiler could not tell them a node kind was missing - and it
// was: none of them descended into fragment children or slot fallbacks, so a
// component referenced only inside a `<slot>` fallback was never resolved, never
// prop-checked and never got a definition location. The expression walkers had
// the same disease in the other direction: one omitted the `array` and `member`
// kinds, so `${[a.x, b.y]}` reported an empty set of accessed paths.
//
// Every switch below ends in a `never` guard. Adding a node or expression kind
// to ast/types.ts is a compile error *here* - and nowhere else.

import type {
  AttributeNode,
  ExprAst,
  FunctionExpr,
  TemplateNode,
} from './types.js';

/**
 * Any expression the AST can hold.
 *
 * {@link FunctionExpr} is deliberately not a member of the {@link ExprAst}
 * union - a function is not a value-producing expression - but it is reachable
 * as `LetNode.value`, so traversal has to name it honestly rather than cast.
 */
export type AnyExpr = ExprAst | FunctionExpr;

/**
 * Visitor for {@link walkNodes}.
 *
 * Return `false` to skip the visited node's subtree; any other return value
 * (including nothing) continues the walk.
 */
export type NodeVisitor = (
  node: TemplateNode,
  parent: TemplateNode | undefined
) => void | false;

/**
 * Visitor for {@link walkExpressions}.
 *
 * Return `false` to skip the visited expression's sub-expressions.
 */
export type ExprVisitor = (expr: ExprAst) => void | false;

// =============================================================================
// Template nodes
// =============================================================================

/**
 * Every template node structurally contained by the given node, in document
 * order.
 *
 * This is the *only* place that knows which fields of which node kinds hold
 * children. It covers element and component children, every `@if` branch body
 * and its `@else`, the `@for` body, every `@match` case body and its default
 * case, fragment children and slot fallback content.
 */
export function childrenOf(node: TemplateNode): readonly TemplateNode[] {
  switch (node.kind) {
    case 'text':
    case 'comment':
    case 'doctype':
    case 'let':
    case 'props':
      return [];
    case 'element':
    case 'component':
    case 'fragment':
    case 'slot-fill':
      return node.children;
    case 'slot':
      return node.fallback ?? [];
    case 'for':
      return node.body;
    case 'if': {
      const out: TemplateNode[] = [];
      for (const branch of node.branches) out.push(...branch.body);
      if (node.elseBranch) out.push(...node.elseBranch);
      return out;
    }
    case 'match': {
      const out: TemplateNode[] = [];
      for (const matchCase of node.cases) out.push(...matchCase.body);
      if (node.defaultCase) out.push(...node.defaultCase);
      return out;
    }
    default: {
      // Exhaustiveness guard: a new TemplateNode kind fails to compile here.
      const _never: never = node;
      return _never;
    }
  }
}

/**
 * Walks a forest of template nodes pre-order, reporting each node's parent.
 *
 * @param nodes - Roots to walk; each root is visited with an undefined parent
 * @param visit - Called for every node; return `false` to skip its subtree
 */
export function walkNodes(
  nodes: readonly TemplateNode[],
  visit: NodeVisitor
): void {
  const step = (node: TemplateNode, parent: TemplateNode | undefined): void => {
    if (visit(node, parent) === false) return;
    for (const child of childrenOf(node)) {
      step(child, node);
    }
  };
  for (const node of nodes) {
    step(node, undefined);
  }
}

// =============================================================================
// Expressions
// =============================================================================

/**
 * Every expression structurally contained by the given expression, in
 * evaluation order.
 *
 * Includes the elements of an array literal and the object of a member access -
 * the two kinds a hand-rolled walker in the compiler used to forget, silently
 * emptying the auditability metadata for `${[a.x, b.y]}`.
 *
 * A wildcard's inner path node is returned as a sub-expression: it is a genuine
 * `PathNode`, and callers that collect paths de-duplicate anyway.
 */
export function subExpressionsOf(expr: AnyExpr): readonly ExprAst[] {
  switch (expr.kind) {
    case 'literal':
    case 'path':
      return [];
    case 'unary':
      return [expr.operand];
    case 'binary':
      return [expr.left, expr.right];
    case 'ternary':
      return [expr.condition, expr.truthy, expr.falsy];
    case 'call':
      return expr.args;
    case 'wildcard':
      return [expr.path];
    case 'array':
      return expr.elements;
    case 'member':
      // The trailing path segments index into a computed result, not into an
      // expression, so only the object is a sub-expression.
      return [expr.object];
    case 'function':
      return [expr.body];
    default: {
      // Exhaustiveness guard: a new ExprAst kind fails to compile here.
      const _never: never = expr;
      return _never;
    }
  }
}

/**
 * Walks an expression tree pre-order.
 *
 * A {@link FunctionExpr} root is not itself passed to the visitor - it is not an
 * {@link ExprAst} - but its body and everything below it is.
 *
 * @param expr - Root expression
 * @param visit - Called for every expression; return `false` to skip its subtree
 */
export function walkExpressions(expr: AnyExpr, visit: ExprVisitor): void {
  const step = (current: ExprAst): void => {
    if (visit(current) === false) return;
    for (const sub of subExpressionsOf(current)) {
      step(sub);
    }
  };
  if (expr.kind === 'function') {
    step(expr.body);
    return;
  }
  step(expr);
}

// =============================================================================
// Expressions held by a node
// =============================================================================

/**
 * The expressions an attribute holds: none for a static attribute, one for an
 * expression attribute, and every expression segment of a mixed attribute.
 */
export function attributeExpressions(
  attribute: AttributeNode
): readonly ExprAst[] {
  switch (attribute.kind) {
    case 'static':
      return [];
    case 'expr':
      return [attribute.expr];
    case 'event':
      // The handler is an expression like any other: it is read from the same
      // scope, counts towards the same metadata, and is checked by the same
      // passes. Only its *destination* is unusual.
      return [attribute.expr];
    case 'mixed': {
      const out: ExprAst[] = [];
      for (const segment of attribute.segments) {
        if (segment.kind === 'expr') out.push(segment.expr);
      }
      return out;
    }
    default: {
      // Exhaustiveness guard: a new AttributeNode kind fails to compile here.
      const _never: never = attribute;
      return _never;
    }
  }
}

/**
 * Every expression the node holds *directly*, in source order.
 *
 * Directly means: not through its children. Combine with {@link walkNodes} to
 * cover a whole tree, and with {@link walkExpressions} to reach every
 * sub-expression.
 *
 * A `let` node's value may be a {@link FunctionExpr}, so the element type is
 * {@link AnyExpr}; {@link walkExpressions} accepts that directly.
 */
export function expressionsOf(node: TemplateNode): readonly AnyExpr[] {
  switch (node.kind) {
    case 'comment':
    case 'doctype':
    case 'fragment':
    case 'slot':
    case 'slot-fill':
      return [];
    case 'text': {
      const out: ExprAst[] = [];
      for (const segment of node.segments) {
        if (segment.kind === 'expr') out.push(segment.expr);
      }
      return out;
    }
    case 'element': {
      const out: ExprAst[] = [];
      for (const attribute of node.attributes) {
        out.push(...attributeExpressions(attribute));
      }
      return out;
    }
    case 'if':
      return node.branches.map(branch => branch.condition);
    case 'for':
      return node.key === undefined
        ? [node.itemsExpr]
        : [node.itemsExpr, node.key];
    case 'match': {
      const out: ExprAst[] = [node.value];
      for (const matchCase of node.cases) {
        // Literal cases carry plain values, not expressions.
        if (matchCase.kind === 'expression') out.push(matchCase.condition);
      }
      return out;
    }
    case 'component':
      return node.props.map(prop => prop.value);
    case 'let':
      return [node.value];
    case 'props': {
      // A declaration's default value is a real expression and is reachable
      // from nowhere else.
      const out: ExprAst[] = [];
      for (const declaration of node.props) {
        if (declaration.defaultValue) out.push(declaration.defaultValue);
      }
      return out;
    }
    default: {
      // Exhaustiveness guard: a new TemplateNode kind fails to compile here.
      const _never: never = node;
      return _never;
    }
  }
}
