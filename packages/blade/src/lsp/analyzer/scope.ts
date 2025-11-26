/**
 * Scope Analyzer for Blade Language Server
 * Analyzes template AST to collect variable scopes at each position
 */

import type {
  TemplateNode,
  ComponentDefinition,
  SourceLocation,
  IfNode,
  ForNode,
  LetNode,
  ComponentNode,
} from '../../ast/types.js';
import type {
  DocumentScope,
  ScopeVariable,
  ComponentInfo,
  PropInfo,
  SlotInfo,
  ComponentUsage,
} from '../types.js';
import { createEmptyScope } from '../types.js';

/**
 * Analyze a template AST to extract scope information
 */
export function analyzeScope(
  nodes: readonly TemplateNode[],
  components: Map<string, ComponentDefinition>
): DocumentScope {
  const scope = createEmptyScope();
  const context: AnalysisContext = {
    scope,
    currentVariables: [],
    nestingDepth: 0,
  };

  // Analyze component definitions
  for (const [name, def] of components) {
    const info = analyzeComponentDefinition(name, def);
    scope.components.push(info);
  }

  // Analyze template nodes
  analyzeNodes(nodes, context);

  return scope;
}

interface AnalysisContext {
  scope: DocumentScope;
  currentVariables: ScopeVariable[];
  nestingDepth: number;
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
 * Analyze nodes recursively, tracking scope at each position
 */
function analyzeNodes(
  nodes: readonly TemplateNode[],
  context: AnalysisContext
): void {
  for (const node of nodes) {
    analyzeNode(node, context);
  }
}

/**
 * Analyze a single node
 */
function analyzeNode(node: TemplateNode, context: AnalysisContext): void {
  const { scope } = context;

  // Record current variables at this node's location
  recordVariablesAtLocation(node.location, context);

  switch (node.kind) {
    case 'text':
      // Text nodes don't introduce new scope
      break;

    case 'element':
      // Check for component usage
      if (isComponentName(node.tag)) {
        const usage: ComponentUsage = {
          componentName: node.tag,
          location: node.location,
          props: {},
        };

        // Record prop locations
        for (const attr of node.attributes) {
          if (attr.kind === 'static' || attr.kind === 'expr') {
            usage.props[attr.name] = attr.location;
          }
        }

        scope.componentUsages.push(usage);
      }

      // Analyze children
      analyzeNodes(node.children, context);
      break;

    case 'if':
      analyzeIfNode(node, context);
      break;

    case 'for':
      analyzeForNode(node, context);
      break;

    case 'let':
      analyzeLetNode(node, context);
      break;

    case 'match':
      // Analyze match cases
      for (const c of node.cases) {
        analyzeNodes(c.body, context);
      }
      if (node.defaultCase) {
        analyzeNodes(node.defaultCase, context);
      }
      break;

    case 'component':
      analyzeComponentNode(node, context);
      break;

    case 'fragment':
      analyzeNodes(node.children, context);
      break;

    case 'slot':
      // Slots are handled at component definition level
      break;

    case 'comment':
      // Nothing to analyze
      break;
  }
}

/**
 * Analyze if node
 */
function analyzeIfNode(node: IfNode, context: AnalysisContext): void {
  context.nestingDepth++;

  // Analyze each branch
  for (const branch of node.branches) {
    analyzeNodes(branch.body, context);
  }

  // Analyze else branch if present
  if (node.elseBranch) {
    analyzeNodes(node.elseBranch, context);
  }

  context.nestingDepth--;
}

/**
 * Analyze for node - introduces loop variables
 */
function analyzeForNode(node: ForNode, context: AnalysisContext): void {
  context.nestingDepth++;

  // Create new variable scope for the loop
  const loopVariables: ScopeVariable[] = [...context.currentVariables];

  // Add item variable
  loopVariables.push({
    name: node.itemVar,
    kind: node.iterationType === 'of' ? 'for-item' : 'for-key',
    location: node.location,
  });

  // Add index variable if present
  if (node.indexVar) {
    loopVariables.push({
      name: node.indexVar,
      kind: 'for-index',
      location: node.location,
    });
  }

  // Analyze body with loop variables in scope
  const bodyContext: AnalysisContext = {
    ...context,
    currentVariables: loopVariables,
  };

  analyzeNodes(node.body, bodyContext);

  context.nestingDepth--;
}

/**
 * Analyze let node - introduces a new variable
 */
function analyzeLetNode(node: LetNode, context: AnalysisContext): void {
  const variable: ScopeVariable = {
    name: node.name,
    kind: node.isGlobal ? 'global' : 'let',
    location: node.location,
  };

  // Add to current scope
  context.currentVariables = [...context.currentVariables, variable];

  // Record at this location
  recordVariablesAtLocation(node.location, context);
}

/**
 * Analyze component node - creates isolated scope with props
 */
function analyzeComponentNode(
  node: ComponentNode,
  context: AnalysisContext
): void {
  // Record component usage
  const usage: ComponentUsage = {
    componentName: node.name,
    location: node.location,
    props: {},
  };

  for (const prop of node.props) {
    usage.props[prop.name] = prop.location;
  }

  context.scope.componentUsages.push(usage);

  // Component children (slots) are analyzed with parent scope
  if (node.children.length > 0) {
    analyzeNodes(node.children, context);
  }
}

/**
 * Record variables at a specific location
 */
function recordVariablesAtLocation(
  location: SourceLocation,
  context: AnalysisContext
): void {
  const offset = location.start.offset;
  const endOffset = location.end.offset;

  // Record variables for each position in this node's range
  // For efficiency, we just record at start and end
  context.scope.variables.set(offset, [...context.currentVariables]);

  if (endOffset !== offset) {
    context.scope.variables.set(endOffset, [...context.currentVariables]);
  }
}

/**
 * Check if a tag name is a component (PascalCase)
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Get variables in scope at a specific offset
 */
export function getVariablesAtOffset(
  scope: DocumentScope,
  offset: number
): ScopeVariable[] {
  // Find the closest offset that's <= the requested offset
  let closest = -1;
  let closestVars: ScopeVariable[] = [];

  for (const [off, vars] of scope.variables) {
    if (off <= offset && off > closest) {
      closest = off;
      closestVars = vars;
    }
  }

  return closestVars;
}

/**
 * Find the definition location of a variable by name at a given offset
 */
export function findVariableDefinition(
  scope: DocumentScope,
  name: string,
  offset: number
): SourceLocation | null {
  const vars = getVariablesAtOffset(scope, offset);
  const variable = vars.find(v => v.name === name);
  return variable?.location ?? null;
}

/**
 * Find all usages of a variable defined at a given location
 */
export function findVariableUsages(
  _scope: DocumentScope,
  _definitionOffset: number
): SourceLocation[] {
  // This is a simplified implementation
  // A full implementation would track expression AST nodes
  return [];
}

/**
 * Check if a variable is used anywhere in the scope
 */
export function isVariableUsed(
  _scope: DocumentScope,
  _variableName: string
): boolean {
  // This is a simplified check
  // A full implementation would walk expression ASTs
  // For now, return true to avoid false positives
  return true;
}

/**
 * Get the nesting depth at a specific offset
 */
export function getNestingDepthAtOffset(
  nodes: readonly TemplateNode[],
  offset: number
): number {
  let maxDepth = 0;

  function walk(nodeList: readonly TemplateNode[], currentDepth: number): void {
    for (const node of nodeList) {
      if (
        offset >= node.location.start.offset &&
        offset <= node.location.end.offset
      ) {
        maxDepth = Math.max(maxDepth, currentDepth);
      }

      if (node.kind === 'if') {
        for (const branch of node.branches) {
          walk(branch.body, currentDepth + 1);
        }
        if (node.elseBranch) {
          walk(node.elseBranch, currentDepth + 1);
        }
      } else if (node.kind === 'for') {
        walk(node.body, currentDepth + 1);
      } else if (node.kind === 'match') {
        for (const c of node.cases) {
          walk(c.body, currentDepth + 1);
        }
        if (node.defaultCase) {
          walk(node.defaultCase, currentDepth + 1);
        }
      } else if (node.kind === 'element' || node.kind === 'fragment') {
        walk(node.children, currentDepth);
      }
    }
  }

  walk(nodes, 0);
  return maxDepth;
}
