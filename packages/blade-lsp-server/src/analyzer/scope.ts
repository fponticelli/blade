/**
 * Scope Analyzer for Blade Language Server
 *
 * Answers one question - "which variables can the cursor see here?" - and
 * answers it in O(log n).
 *
 * The previous version stored two copies of the full in-scope variable list per
 * AST node, at the node's start offset and again at its end, in a
 * `Map<offset, ScopeVariable[]>`; the lookup then iterated the entire map
 * looking for the greatest key <= the offset. A 2000-node template meant ~4000
 * entries scanned per lookup and 4000 copied arrays per parse, and completion
 * ran the lookup twice per request on a path VS Code triggers on every space.
 *
 * Scopes in a template are laminar - a `@for` body is wholly inside its
 * parent, a `@let` runs to the end of its enclosing block - so they flatten
 * into a sorted list of disjoint segments over which the visible set is
 * constant. That is built once per parse and resolved by binary search.
 *
 * The walk also collects what the lint rules need and the old analyser never
 * produced: which names are actually read, which helpers are called, and how
 * deep the control flow nests. `blade.lsp.diagnostics.unusedVariables`,
 * `.deprecatedHelpers` and `.deepNesting` were contributed settings with no
 * implementation behind them because this information did not exist.
 */

import type {
  TemplateNode,
  ComponentDefinition,
  SourceLocation,
  IfNode,
  ForNode,
  ExprAst,
  PropDeclaration,
} from '@bladets/template';
import type { AnyExpr } from '@bladets/template';
import { expressionsOf, walkExpressions } from '@bladets/template';
import type {
  DocumentScope,
  ScopeSegment,
  ScopeVariable,
  ComponentInfo,
  PropInfo,
  SlotInfo,
  ComponentUsage,
  HelperCall,
  NestingSite,
} from '../types.js';

/** No variables at all; shared so that segment merging can compare by identity. */
const NO_VARIABLES: readonly ScopeVariable[] = [];

/**
 * One span of the document over which a fixed set of variables is visible.
 *
 * Regions nest but never partially overlap, which is what lets them flatten.
 * `end` is inclusive: a cursor sitting on the closing brace of a `@for` is
 * still inside the loop as far as an editor is concerned.
 */
interface ScopeRegion {
  readonly start: number;
  readonly end: number;
  readonly variables: readonly ScopeVariable[];
}

interface Analysis {
  readonly regions: ScopeRegion[];
  readonly declarations: ScopeVariable[];
  readonly components: ComponentInfo[];
  readonly componentUsages: ComponentUsage[];
  readonly helperCalls: HelperCall[];
  readonly usedVariables: Set<string>;
  readonly helpersUsed: Set<string>;
  readonly nestingSites: NestingSite[];
  maxNestingDepth: number;
}

/** The scope in force for one sibling list. */
interface Frame {
  /** Visible variables, outermost first. */
  readonly variables: readonly ScopeVariable[];
  /** Last offset the enclosing block covers; a `@let` runs to here. */
  readonly blockEnd: number;
  /** Control-flow nesting depth of the sibling list itself. */
  readonly depth: number;
}

/**
 * Analyze a template AST to extract scope information.
 *
 * @param nodes - Top-level template nodes
 * @param components - Component definitions declared by the document
 * @param documentEnd - Length of the document text; scopes that run "to the end
 *   of the file" end here
 */
export function analyzeScope(
  nodes: readonly TemplateNode[],
  components: ReadonlyMap<string, ComponentDefinition>,
  documentEnd = endOf(nodes, components)
): DocumentScope {
  const analysis: Analysis = {
    regions: [],
    declarations: [],
    components: [],
    componentUsages: [],
    helperCalls: [],
    usedVariables: new Set(),
    helpersUsed: new Set(),
    nestingSites: [],
    maxNestingDepth: 0,
  };

  // The whole document, with nothing bound. Every other region nests in it, so
  // a lookup always resolves.
  analysis.regions.push({
    start: 0,
    end: documentEnd,
    variables: NO_VARIABLES,
  });

  analyzeSiblings(nodes, analysis, {
    variables: NO_VARIABLES,
    blockEnd: documentEnd,
    depth: 0,
  });

  // A component definition body is an isolated scope: at render time it sees
  // its own props and the globals, and nothing of the caller. Offering the
  // enclosing file's `@props` inside a `<template:>` body - which is what a
  // single document-wide variable list did - offered names that evaluate to
  // nothing.
  for (const [name, definition] of components) {
    analysis.components.push(analyzeComponentDefinition(name, definition));

    const props = definition.props.map(declarationVariable);
    analysis.declarations.push(...props);
    analysis.regions.push({
      start: definition.location.start.offset,
      end: definition.location.end.offset,
      variables: props,
    });
    analyzeSiblings(definition.body, analysis, {
      variables: props,
      blockEnd: definition.location.end.offset,
      depth: 0,
    });
  }

  return {
    segments: buildSegments(analysis.regions),
    declarations: analysis.declarations,
    components: analysis.components,
    componentUsages: analysis.componentUsages,
    helperCalls: analysis.helperCalls,
    usedVariables: analysis.usedVariables,
    helpersUsed: analysis.helpersUsed,
    nestingSites: analysis.nestingSites,
    maxNestingDepth: analysis.maxNestingDepth,
  };
}

/** The end of the outermost span anything in the document occupies. */
function endOf(
  nodes: readonly TemplateNode[],
  components: ReadonlyMap<string, ComponentDefinition>
): number {
  let end = 0;
  for (const node of nodes) end = Math.max(end, node.location.end.offset);
  for (const [, definition] of components) {
    end = Math.max(end, definition.location.end.offset);
  }
  return end;
}

function declarationVariable(declaration: PropDeclaration): ScopeVariable {
  return {
    name: declaration.name,
    kind: 'prop',
    location: declaration.location,
  };
}

/**
 * Analyze a component definition to extract props and slots
 */
function analyzeComponentDefinition(
  name: string,
  def: ComponentDefinition
): ComponentInfo {
  const props: PropInfo[] = def.props.map(p => ({
    name: p.name,
    required: p.required,
    defaultValue:
      p.defaultValue !== undefined ? String(p.defaultValue) : undefined,
  }));

  const slots: SlotInfo[] = [];

  // Find slots in the component body
  function findSlots(nodes: readonly TemplateNode[]) {
    for (const node of nodes) {
      if (node.kind === 'slot') {
        slots.push({
          name: node.name ?? null,
          location: node.location,
        });
      } else if (node.kind === 'element' || node.kind === 'fragment') {
        findSlots(node.children);
      } else if (node.kind === 'if') {
        for (const branch of node.branches) {
          findSlots(branch.body);
        }
        if (node.elseBranch) {
          findSlots(node.elseBranch);
        }
      } else if (node.kind === 'for') {
        findSlots(node.body);
      } else if (node.kind === 'match') {
        for (const c of node.cases) {
          findSlots(c.body);
        }
        if (node.defaultCase) {
          findSlots(node.defaultCase);
        }
      }
    }
  }

  findSlots(def.body);

  return {
    name,
    props,
    slots,
    location: def.location,
  };
}

/**
 * Walks one sibling list left to right.
 *
 * Order matters: `@props` and `@let` bind for everything that *follows* them
 * within the enclosing block, so the visible set is threaded through the loop
 * rather than computed up front.
 */
function analyzeSiblings(
  nodes: readonly TemplateNode[],
  analysis: Analysis,
  frame: Frame
): void {
  let variables = frame.variables;

  for (const node of nodes) {
    recordExpressions(node, analysis);

    switch (node.kind) {
      case 'props': {
        const declared = node.props.map(declarationVariable);
        analysis.declarations.push(...declared);
        variables = [...variables, ...declared];
        analysis.regions.push({
          start: node.location.start.offset,
          end: frame.blockEnd,
          variables,
        });
        break;
      }

      case 'let': {
        const variable: ScopeVariable = {
          name: node.name,
          kind: node.isGlobal ? 'global' : 'let',
          location: node.location,
        };
        analysis.declarations.push(variable);
        variables = [...variables, variable];
        analysis.regions.push({
          start: node.location.start.offset,
          end: frame.blockEnd,
          variables,
        });
        break;
      }

      case 'for':
        analyzeForNode(node, analysis, { ...frame, variables });
        break;

      case 'if':
        analyzeIfNode(node, analysis, { ...frame, variables });
        break;

      case 'match': {
        enterControlFlow(node.location, analysis, frame.depth);
        for (const matchCase of node.cases) {
          analyzeSiblings(matchCase.body, analysis, {
            variables,
            blockEnd: matchCase.location.end.offset,
            depth: frame.depth + 1,
          });
        }
        if (node.defaultCase) {
          analyzeSiblings(node.defaultCase, analysis, {
            variables,
            blockEnd: node.location.end.offset,
            depth: frame.depth + 1,
          });
        }
        break;
      }

      case 'element': {
        if (isComponentName(node.tag)) {
          const usage: ComponentUsage = {
            componentName: node.tag,
            location: node.location,
            props: {},
          };
          for (const attr of node.attributes) {
            if (attr.kind === 'static' || attr.kind === 'expr') {
              usage.props[attr.name] = attr.location;
            }
          }
          analysis.componentUsages.push(usage);
        }
        analyzeSiblings(node.children, analysis, {
          variables,
          blockEnd: node.location.end.offset,
          depth: frame.depth,
        });
        break;
      }

      case 'component': {
        const usage: ComponentUsage = {
          componentName: node.name,
          location: node.location,
          props: {},
        };
        for (const prop of node.props) {
          usage.props[prop.name] = prop.location;
        }
        analysis.componentUsages.push(usage);
        // A slot fill's content is the CALLER's markup, evaluated in the
        // caller's scope, so it is analysed here like any other child.
        analyzeSiblings(node.children, analysis, {
          variables,
          blockEnd: node.location.end.offset,
          depth: frame.depth,
        });
        break;
      }

      case 'fragment':
      case 'slot-fill':
        analyzeSiblings(node.children, analysis, {
          variables,
          blockEnd: node.location.end.offset,
          depth: frame.depth,
        });
        break;

      case 'slot':
        // A slot's fallback is the component's own template code, so it is
        // analysed in the component's scope - the one in force right here.
        if (node.fallback) {
          analyzeSiblings(node.fallback, analysis, {
            variables,
            blockEnd: node.location.end.offset,
            depth: frame.depth,
          });
        }
        break;

      case 'text':
      case 'comment':
      case 'doctype':
        break;

      default: {
        // Exhaustiveness guard: a new TemplateNode kind fails to compile here
        // rather than being silently skipped, which is how a whole node kind
        // could go unanalysed and take its completions and diagnostics with it.
        const _never: never = node;
        return _never;
      }
    }
  }
}

/** Records a control-flow node and updates the document's maximum depth. */
function enterControlFlow(
  location: SourceLocation,
  analysis: Analysis,
  parentDepth: number
): void {
  const depth = parentDepth + 1;
  analysis.nestingSites.push({ depth, location });
  analysis.maxNestingDepth = Math.max(analysis.maxNestingDepth, depth);
}

function analyzeIfNode(node: IfNode, analysis: Analysis, frame: Frame): void {
  enterControlFlow(node.location, analysis, frame.depth);

  for (const branch of node.branches) {
    analyzeSiblings(branch.body, analysis, {
      variables: frame.variables,
      blockEnd: branch.location.end.offset,
      depth: frame.depth + 1,
    });
  }

  if (node.elseBranch) {
    analyzeSiblings(node.elseBranch, analysis, {
      variables: frame.variables,
      blockEnd: node.location.end.offset,
      depth: frame.depth + 1,
    });
  }
}

/**
 * Extract the source variable name from a for loop's items expression.
 * Returns the variable name for simple paths like "items", "user.orders".
 */
function extractSourceVarName(
  itemsExpr: ForNode['itemsExpr']
): string | undefined {
  if (itemsExpr.kind !== 'path') {
    return undefined;
  }

  const pathParts: string[] = [];
  for (const seg of itemsExpr.segments) {
    // An index or wildcard ends the simple path: `items[0]` sources from
    // `items`, and nothing further can be named.
    if (seg.kind !== 'key') break;
    pathParts.push(seg.key);
  }
  return pathParts.length > 0 ? pathParts.join('.') : undefined;
}

function analyzeForNode(node: ForNode, analysis: Analysis, frame: Frame): void {
  enterControlFlow(node.location, analysis, frame.depth);

  const loopVariables: ScopeVariable[] = [...frame.variables];

  const item: ScopeVariable = {
    name: node.itemVar,
    kind: node.iterationType === 'of' ? 'for-item' : 'for-key',
    location: node.location,
    sourceVar: extractSourceVarName(node.itemsExpr),
  };
  loopVariables.push(item);
  analysis.declarations.push(item);

  if (node.indexVar) {
    const index: ScopeVariable = {
      name: node.indexVar,
      kind: 'for-index',
      location: node.location,
    };
    loopVariables.push(index);
    analysis.declarations.push(index);
  }

  // The loop variables cover the whole directive, header included, so that
  // hovering the item variable where it is declared resolves it.
  analysis.regions.push({
    start: node.location.start.offset,
    end: node.location.end.offset,
    variables: loopVariables,
  });

  analyzeSiblings(node.body, analysis, {
    variables: loopVariables,
    blockEnd: node.location.end.offset,
    depth: frame.depth + 1,
  });
}

/** Records every name and helper the node's own expressions read. */
function recordExpressions(node: TemplateNode, analysis: Analysis): void {
  for (const expr of expressionsOf(node)) {
    recordExpression(expr, analysis);
  }
}

function recordExpression(expr: AnyExpr, analysis: Analysis): void {
  walkExpressions(expr, current => {
    recordUse(current, analysis);
  });
}

function recordUse(expr: ExprAst, analysis: Analysis): void {
  if (expr.kind === 'path') {
    // A global (`$.currency`) is not a template variable: nothing declared in
    // the document can satisfy or fail to satisfy it.
    if (expr.isGlobal) return;
    const first = expr.segments[0];
    if (first?.kind === 'key') {
      analysis.usedVariables.add(first.key);
    }
    return;
  }

  if (expr.kind === 'call') {
    analysis.helpersUsed.add(expr.callee);
    analysis.helperCalls.push({
      helperName: expr.callee,
      location: expr.location,
    });
  }
}

/**
 * Flattens nested regions into the sorted, disjoint segments a lookup binary
 * searches.
 *
 * Regions are laminar, so a sweep over their boundaries with a stack yields the
 * innermost region in force at each one. Consecutive segments that resolve to
 * the same variable list are merged, which keeps the table proportional to the
 * number of scopes rather than to the number of nodes.
 */
function buildSegments(regions: readonly ScopeRegion[]): ScopeSegment[] {
  const sorted = [...regions].sort(
    (a, b) => a.start - b.start || b.end - a.end
  );

  const boundaries: number[] = [];
  for (const region of sorted) {
    boundaries.push(region.start, region.end + 1);
  }
  boundaries.sort((a, b) => a - b);

  const segments: ScopeSegment[] = [];
  const stack: ScopeRegion[] = [];
  let next = 0;
  let previous = -1;

  for (const boundary of boundaries) {
    if (boundary === previous) continue;
    previous = boundary;

    while (stack.length > 0 && stack[stack.length - 1]!.end < boundary) {
      stack.pop();
    }
    while (next < sorted.length && sorted[next]!.start <= boundary) {
      const region = sorted[next]!;
      next++;
      if (region.end >= boundary) stack.push(region);
    }

    const variables = stack[stack.length - 1]?.variables ?? NO_VARIABLES;
    const last = segments[segments.length - 1];
    if (last && last.variables === variables) continue;
    segments.push({ start: boundary, variables });
  }

  return segments;
}

/**
 * Check if a tag name is a component (PascalCase)
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Get variables in scope at a specific offset.
 *
 * Binary search over the segment table: ~12 comparisons for a document that
 * used to cost 4000.
 */
export function getVariablesAtOffset(
  scope: DocumentScope,
  offset: number
): readonly ScopeVariable[] {
  const segments = scope.segments;
  if (segments.length === 0 || offset < segments[0]!.start) {
    return NO_VARIABLES;
  }

  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (segments[mid]!.start <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return segments[low]!.variables;
}

/**
 * Find the definition location of a variable by name at a given offset
 */
export function findVariableDefinition(
  scope: DocumentScope,
  name: string,
  offset: number
): SourceLocation | null {
  const variable = findVariableAtOffset(scope, name, offset);
  return variable?.location ?? null;
}

/** The variable of that name visible at the offset, if any. */
export function findVariableAtOffset(
  scope: DocumentScope,
  name: string,
  offset: number
): ScopeVariable | null {
  const variables = getVariablesAtOffset(scope, offset);
  // Innermost wins: a `@for` item shadows a prop of the same name.
  for (let i = variables.length - 1; i >= 0; i--) {
    if (variables[i]!.name === name) return variables[i]!;
  }
  return null;
}

/** Any variable of that name declared anywhere in the document. */
export function findVariableByName(
  scope: DocumentScope,
  name: string
): ScopeVariable | null {
  return scope.declarations.find(variable => variable.name === name) ?? null;
}

/**
 * Whether a declared variable is read anywhere in the document.
 *
 * Used to hard-code `true` "to avoid false positives", which made
 * `blade.lsp.diagnostics.unusedVariables` a setting that could not do anything.
 * The answer now comes from the expression walk, which is exhaustive.
 */
export function isVariableUsed(
  scope: DocumentScope,
  variableName: string
): boolean {
  return scope.usedVariables.has(variableName);
}
