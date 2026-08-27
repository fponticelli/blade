/**
 * Free variables of a template.
 *
 * A component file that declares no `@props` still has to be given a prop list,
 * or nothing can check its call sites. That list used to come from a regular
 * expression over the raw source - `/\$([a-zA-Z_][a-zA-Z0-9_]*)/g` - which has
 * no notion of binding and no notion of syntax. It reported the item variable
 * of `@for($item of $items)` as a caller-supplied prop, so a component that
 * looped over its own data failed to compile at every call site; it reported
 * `$brand-color` inside a `<style>` block, `$` in prose and `$id` in a comment;
 * and it could not see `${...}` block expressions at all, so the props that
 * really were required went missing.
 *
 * This computes the same thing properly: the variables a tree *reads* minus the
 * variables it *binds*, walking the parsed AST with a scope. `@let`, `@props`,
 * `@for` item and index variables and arrow-function parameters all bind;
 * globals (`$.currency`) are not free variables of a template, because nothing
 * a caller passes can satisfy them.
 */

import type { SourceLocation, TemplateNode } from '../ast/types.js';
import { childrenOf, expressionsOf, subExpressionsOf } from '../ast/visitor.js';
import type { AnyExpr } from '../ast/visitor.js';

/**
 * Every variable a tree reads without binding, with the location of its first
 * reference, in first-reference order.
 *
 * The location is the reference, not a declaration: an inferred prop has no
 * declaration, and pointing at the first place it is used is the only honest
 * answer.
 *
 * @param nodes - The tree to analyse
 * @param bound - Names already in scope, if any
 * @returns Free variable name to the location of its first reference
 */
export function collectFreeVariables(
  nodes: readonly TemplateNode[],
  bound: Iterable<string> = []
): Map<string, SourceLocation> {
  const free = new Map<string, SourceLocation>();
  walkScope(nodes, new Set(bound), free);
  return free;
}

/**
 * Walks one sibling list left to right.
 *
 * Order matters: `@let` and `@props` bind for everything that *follows* them,
 * so the scope is threaded through the loop rather than computed up front. A
 * `@let` whose value reads a name of its own is reading the outer one.
 */
function walkScope(
  nodes: readonly TemplateNode[],
  bound: ReadonlySet<string>,
  free: Map<string, SourceLocation>
): void {
  let scope = bound;

  for (const node of nodes) {
    switch (node.kind) {
      case 'let': {
        recordExpression(node.value, scope, free);
        scope = extend(scope, [node.name]);
        break;
      }
      case 'props': {
        for (const declaration of node.props) {
          if (declaration.defaultValue) {
            recordExpression(declaration.defaultValue, scope, free);
          }
        }
        scope = extend(
          scope,
          node.props.map(declaration => declaration.name)
        );
        break;
      }
      case 'for': {
        // The collection is read in the enclosing scope; the key is read with
        // the item variable bound, which is the whole point of a key.
        recordExpression(node.itemsExpr, scope, free);
        const names = [node.itemVar];
        if (node.indexVar) names.push(node.indexVar);
        const inner = extend(scope, names);
        if (node.key) recordExpression(node.key, inner, free);
        walkScope(node.body, inner, free);
        break;
      }
      default: {
        for (const expr of expressionsOf(node)) {
          recordExpression(expr, scope, free);
        }
        walkScope(childrenOf(node), scope, free);
        break;
      }
    }
  }
}

function extend(
  scope: ReadonlySet<string>,
  names: readonly string[]
): ReadonlySet<string> {
  if (names.length === 0) return scope;
  const extended = new Set(scope);
  for (const name of names) extended.add(name);
  return extended;
}

/**
 * Records the free variables of one expression.
 *
 * Hand-rolled rather than `walkExpressions`, because an arrow function binds
 * its parameters and a scope-free walk would report them as free.
 */
function recordExpression(
  expr: AnyExpr,
  bound: ReadonlySet<string>,
  free: Map<string, SourceLocation>
): void {
  if (expr.kind === 'function') {
    recordExpression(expr.body, extend(bound, expr.params), free);
    return;
  }

  if (expr.kind === 'path' && !expr.isGlobal) {
    const first = expr.segments[0];
    if (
      first?.kind === 'key' &&
      !bound.has(first.key) &&
      !free.has(first.key)
    ) {
      free.set(first.key, expr.location);
    }
  }

  for (const sub of subExpressionsOf(expr)) {
    recordExpression(sub, bound, free);
  }
}
