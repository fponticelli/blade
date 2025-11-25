// AST Builder DSL
//
// Provides a terse, ergonomic API for constructing AST nodes with sensible defaults.
// Used primarily in tests and parser implementation.
//
// Design principles:
// - Partial option objects instead of positional arguments
// - Smart defaults for location and metadata
// - Minimal boilerplate for common cases
// - Type-safe and IDE-friendly

import type {
  SourceLocation,
  PathMetadata,
  LiteralType,
  ExprAst,
  LiteralNode,
  PathNode,
  PathItem,
  KeyPathItem,
  IndexPathItem,
  StarPathItem,
  UnaryNode,
  BinaryNode,
  BinaryOperator,
  TernaryNode,
  CallNode,
  ArrayWildcardNode,
  TemplateNode,
  TextNode,
  TextSegment,
  ElementNode,
  AttributeNode,
  StaticAttributeNode,
  ExprAttributeNode,
  MixedAttributeNode,
  StaticAttributeValue,
  ExprAttributeValue,
  IfNode,
  ForNode,
  MatchNode,
  MatchCase,
  MatchLiteralCase,
  MatchExpressionCase,
  LetNode,
  FunctionExpr,
  ComponentNode,
  FragmentNode,
  SlotNode,
  CommentNode,
  ComponentDefinition,
  PropDefinition,
  RootNode,
  TemplateMetadata,
  CompiledTemplate,
  Diagnostic,
} from './types.js';

// =============================================================================
// Location & Metadata Helpers
// =============================================================================

/**
 * Creates a minimal source location (defaults to line 1, col 1).
 * Useful for tests and generated code.
 */
export function loc(opts?: {
  line?: number;
  column?: number;
  offset?: number;
  endLine?: number;
  endColumn?: number;
  endOffset?: number;
  source?: string;
}): SourceLocation {
  const line = opts?.line ?? 1;
  const column = opts?.column ?? 1;
  const offset = opts?.offset ?? 0;

  return {
    start: { line, column, offset },
    end: {
      line: opts?.endLine ?? line,
      column: opts?.endColumn ?? column + 1,
      offset: opts?.endOffset ?? offset + 1,
    },
    source: opts?.source,
  };
}

/**
 * Creates empty path metadata.
 */
export function metadata(opts?: {
  staticPaths?: string[];
  staticOperations?: string[];
  staticHelpers?: string[];
  accessedPaths?: string[];
  accessedOperations?: string[];
}): PathMetadata {
  return {
    staticPaths: opts?.staticPaths ?? [],
    staticOperations: opts?.staticOperations ?? [],
    staticHelpers: new Set(opts?.staticHelpers ?? []),
    accessedPaths: opts?.accessedPaths,
    accessedOperations: opts?.accessedOperations,
  };
}

// =============================================================================
// Path Item Helpers
// =============================================================================

export const path = {
  /**
   * Creates a key path item.
   * @example path.key('order')
   */
  key(key: string): KeyPathItem {
    return { kind: 'key', key };
  },

  /**
   * Creates an index path item.
   * @example path.index(0)
   */
  index(index: number): IndexPathItem {
    return { kind: 'index', index };
  },

  /**
   * Creates a star (wildcard) path item.
   * @example path.star()
   */
  star(): StarPathItem {
    return { kind: 'star' };
  },

  /**
   * Parses a path string into path items.
   * @example path.parse('order.customer.name') → [key('order'), key('customer'), key('name')]
   * @example path.parse('items[0].name') → [key('items'), index(0), key('name')]
   * @example path.parse('items[*].price') → [key('items'), star(), key('price')]
   */
  parse(pathStr: string): PathItem[] {
    const segments: PathItem[] = [];
    const parts = pathStr.replace(/^\$\.?/, '').split(/\.|\[|\]/);

    for (const part of parts) {
      if (!part) continue;
      if (part === '*') {
        segments.push(path.star());
      } else if (/^\d+$/.test(part)) {
        segments.push(path.index(parseInt(part, 10)));
      } else {
        segments.push(path.key(part));
      }
    }

    return segments;
  },
};

// =============================================================================
// Expression Builders
// =============================================================================

function inferLiteralType(value: string | number | boolean | null | undefined): LiteralType {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'nil';
}

export const expr = {
  /**
   * Creates a literal node.
   * @example expr.literal(123)
   * @example expr.literal("hello")
   */
  literal(
    value: string | number | boolean | null | undefined,
    opts?: { type?: LiteralType; location?: SourceLocation }
  ): LiteralNode {
    return {
      kind: 'literal',
      type: opts?.type ?? inferLiteralType(value),
      value,
      location: opts?.location ?? loc(),
    };
  },

  /**
   * Creates a path node.
   * @example expr.path([path.key('order'), path.key('total')])
   * @example expr.path([path.key('currency')], { isGlobal: true })
   */
  pathNode(
    segments: PathItem[],
    opts?: { isGlobal?: boolean; location?: SourceLocation }
  ): PathNode {
    return {
      kind: 'path',
      segments,
      isGlobal: opts?.isGlobal ?? false,
      location: opts?.location ?? loc(),
    };
  },

  /**
   * Creates a path node from a string.
   * @example expr.pathFrom('order.customer.name')
   * @example expr.pathFrom('$.currency', { isGlobal: true })
   * @example expr.pathFrom('items[0].name')
   * @example expr.pathFrom('items[*].price')
   */
  pathFrom(
    pathStr: string,
    opts?: { isGlobal?: boolean; location?: SourceLocation }
  ): PathNode {
    const segments = path.parse(pathStr);
    return expr.pathNode(segments, {
      isGlobal: opts?.isGlobal ?? pathStr.startsWith('$'),
      location: opts?.location,
    });
  },

  /**
   * Creates a unary operation node.
   * @example expr.unary('!', expr.pathFrom('isValid'))
   * @example expr.unary('-', expr.literal(10))
   */
  unary(
    operator: '!' | '-',
    operand: ExprAst,
    location?: SourceLocation
  ): UnaryNode {
    return {
      kind: 'unary',
      operator,
      operand,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a binary operation node.
   * @example expr.binary('+', expr.pathFrom('a'), expr.pathFrom('b'))
   */
  binary(
    operator: BinaryOperator,
    left: ExprAst,
    right: ExprAst,
    location?: SourceLocation
  ): BinaryNode {
    return {
      kind: 'binary',
      operator,
      left,
      right,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a ternary expression node.
   * @example expr.ternary(condition, expr.literal('yes'), expr.literal('no'))
   */
  ternary(
    condition: ExprAst,
    truthy: ExprAst,
    falsy: ExprAst,
    location?: SourceLocation
  ): TernaryNode {
    return {
      kind: 'ternary',
      condition,
      truthy,
      falsy,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a function call node.
   * @example expr.call('sum', [expr.pathFrom('items')])
   * @example expr.call('formatCurrency', [expr.literal(100)])
   */
  call(
    callee: string,
    args: ExprAst[] = [],
    location?: SourceLocation
  ): CallNode {
    return {
      kind: 'call',
      callee,
      args,
      location: location ?? loc(),
    };
  },

  /**
   * Creates an array wildcard node.
   * @example expr.wildcard(expr.pathFrom('items[*].price'))
   */
  wildcard(pathNode: PathNode, location?: SourceLocation): ArrayWildcardNode {
    return {
      kind: 'wildcard',
      path: pathNode,
      location: location ?? loc(),
    };
  },
};

// =============================================================================
// Template Node Builders
// =============================================================================

export const node = {
  /**
   * Creates a text node with literal and/or expression segments.
   * @example node.text([seg.literal('Hello')])
   * @example node.text([seg.literal('Total: '), seg.expr(expr.pathFrom('total'))])
   */
  text(segments: TextSegment[], location?: SourceLocation): TextNode {
    return {
      kind: 'text',
      segments,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a text node from a plain string.
   * @example node.textLiteral('Hello, world!')
   */
  textLiteral(text: string, location?: SourceLocation): TextNode {
    return node.text([seg.literal(text, location)], location);
  },

  /**
   * Creates an HTML element node.
   * @example node.element({ tag: 'div', attributes: [attr.static('class', 'foo')] })
   */
  element(opts: {
    tag: string;
    attributes?: AttributeNode[];
    children?: TemplateNode[];
    location?: SourceLocation;
    metadata?: PathMetadata;
  }): ElementNode {
    return {
      kind: 'element',
      tag: opts.tag,
      attributes: opts.attributes ?? [],
      children: opts.children ?? [],
      location: opts.location ?? loc(),
      metadata: opts.metadata,
    };
  },

  /**
   * Creates an if/else if/else node.
   * @example node.ifNode({ branches: [{ condition: expr.pathFrom('isValid'), body: [...] }] })
   */
  ifNode(opts: {
    branches: Array<{
      condition: ExprAst;
      body: TemplateNode[];
      location?: SourceLocation;
    }>;
    elseBranch?: TemplateNode[];
    location?: SourceLocation;
  }): IfNode {
    return {
      kind: 'if',
      branches: opts.branches.map((b) => ({
        condition: b.condition,
        body: b.body,
        location: b.location ?? loc(),
      })),
      elseBranch: opts.elseBranch,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a for loop node.
   * @example node.forLoop({ itemVar: 'item', itemsExpr: expr.pathFrom('items'), body: [...] })
   */
  forLoop(opts: {
    itemVar: string;
    itemsExpr: ExprAst;
    indexVar?: string;
    iterationType?: 'of' | 'in';
    body: TemplateNode[];
    location?: SourceLocation;
  }): ForNode {
    return {
      kind: 'for',
      itemVar: opts.itemVar,
      itemsExpr: opts.itemsExpr,
      indexVar: opts.indexVar,
      iterationType: opts.iterationType ?? 'of',
      body: opts.body,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a match/switch node.
   * @example node.match({ value: expr.pathFrom('status'), cases: [...] })
   */
  match(opts: {
    value: ExprAst;
    cases: MatchCase[];
    defaultCase?: TemplateNode[];
    location?: SourceLocation;
  }): MatchNode {
    return {
      kind: 'match',
      value: opts.value,
      cases: opts.cases,
      defaultCase: opts.defaultCase,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a let/variable declaration node.
   * @example node.letNode({ name: 'x', value: expr.literal(10) })
   */
  letNode(opts: {
    name: string;
    value: ExprAst | FunctionExpr;
    isGlobal?: boolean;
    location?: SourceLocation;
  }): LetNode {
    return {
      kind: 'let',
      name: opts.name,
      isGlobal: opts.isGlobal ?? false,
      value: opts.value,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a function expression.
   * @example node.fn({ params: ['x', 'y'], body: expr.binary('+', ...) })
   */
  fn(opts: {
    params: string[];
    body: ExprAst;
    location?: SourceLocation;
  }): FunctionExpr {
    return {
      kind: 'function',
      params: opts.params,
      body: opts.body,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a component instance node.
   * @example node.component({ name: 'Card', props: [...], children: [...] })
   */
  component(opts: {
    name: string;
    props?: Array<{
      name: string;
      value: ExprAst;
      location?: SourceLocation;
    }>;
    children?: TemplateNode[];
    propPathMapping?: ReadonlyMap<string, readonly string[]>;
    location?: SourceLocation;
  }): ComponentNode {
    return {
      kind: 'component',
      name: opts.name,
      props:
        opts.props?.map((p) => ({
          name: p.name,
          value: p.value,
          location: p.location ?? loc(),
        })) ?? [],
      children: opts.children ?? [],
      propPathMapping: opts.propPathMapping ?? new Map(),
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a fragment node.
   * @example node.fragment([...children])
   */
  fragment(
    children: TemplateNode[],
    location?: SourceLocation
  ): FragmentNode {
    return {
      kind: 'fragment',
      children,
      preserveWhitespace: true,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a slot node.
   * @example node.slot({ name: 'header', fallback: [...] })
   */
  slot(opts?: {
    name?: string;
    fallback?: TemplateNode[];
    location?: SourceLocation;
  }): SlotNode {
    return {
      kind: 'slot',
      name: opts?.name,
      fallback: opts?.fallback,
      location: opts?.location ?? loc(),
    };
  },

  /**
   * Creates a comment node.
   * @example node.comment({ style: 'line', text: 'This is a comment' })
   */
  comment(opts: {
    style: 'line' | 'block' | 'html';
    text: string;
    location?: SourceLocation;
  }): CommentNode {
    return {
      kind: 'comment',
      style: opts.style,
      text: opts.text,
      location: opts.location ?? loc(),
    };
  },
};

// =============================================================================
// Text Segment Helpers
// =============================================================================

export const seg = {
  /**
   * Creates a literal text segment.
   */
  literal(text: string, location?: SourceLocation): TextSegment {
    return {
      kind: 'literal',
      text,
      location: location ?? loc(),
    };
  },

  /**
   * Creates an expression text segment.
   */
  expr(exprAst: ExprAst, location?: SourceLocation): TextSegment {
    return {
      kind: 'expr',
      expr: exprAst,
      location: location ?? loc(),
    };
  },
};

// =============================================================================
// Attribute Helpers
// =============================================================================

export const attr = {
  /**
   * Creates a static attribute.
   * @example attr.static('class', 'container')
   */
  static(
    name: string,
    value: string,
    location?: SourceLocation
  ): StaticAttributeNode {
    return {
      kind: 'static',
      name,
      value,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a dynamic expression attribute.
   * @example attr.expr('disabled', expr.unary('!', expr.pathFrom('isValid')))
   */
  expr(name: string, exprAst: ExprAst, location?: SourceLocation): ExprAttributeNode {
    return {
      kind: 'expr',
      name,
      expr: exprAst,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a mixed attribute (static + expression segments).
   * @example attr.mixed('class', [{ kind: 'static', value: 'status-' }, { kind: 'expr', expr: ... }])
   */
  mixed(
    name: string,
    segments: (StaticAttributeValue | ExprAttributeValue)[],
    location?: SourceLocation
  ): MixedAttributeNode {
    return {
      kind: 'mixed',
      name,
      segments,
      location: location ?? loc(),
    };
  },

  /**
   * Creates a static attribute value segment (for use in mixed attributes).
   */
  staticValue(value: string, location?: SourceLocation): StaticAttributeValue {
    return {
      kind: 'static',
      value,
      location: location ?? loc(),
    };
  },

  /**
   * Creates an expression attribute value segment (for use in mixed attributes).
   */
  exprValue(exprAst: ExprAst, location?: SourceLocation): ExprAttributeValue {
    return {
      kind: 'expr',
      expr: exprAst,
      location: location ?? loc(),
    };
  },
};

// =============================================================================
// Match Case Helpers
// =============================================================================

export const match = {
  /**
   * Creates a literal match case.
   * @example match.literal(['paid', 'completed'], [...body])
   */
  literal(
    values: (string | number | boolean)[],
    body: TemplateNode[],
    location?: SourceLocation
  ): MatchLiteralCase {
    return {
      kind: 'literal',
      values,
      body,
      location: location ?? loc(),
    };
  },

  /**
   * Creates an expression match case.
   * @example match.expression(expr.call('startsWith', [expr.pathFrom('_'), expr.literal('error')]), [...body])
   */
  expression(
    condition: ExprAst,
    body: TemplateNode[],
    location?: SourceLocation
  ): MatchExpressionCase {
    return {
      kind: 'expression',
      condition,
      body,
      location: location ?? loc(),
    };
  },
};

// =============================================================================
// Component Definition Helpers
// =============================================================================

export const comp = {
  /**
   * Creates a component definition.
   * @example comp.define({ name: 'Card', props: [...], body: [...] })
   */
  define(opts: {
    name: string;
    props?: Array<{
      name: string;
      required?: boolean;
      defaultValue?: ExprAst | string;
      location?: SourceLocation;
    }>;
    body: TemplateNode[];
    location?: SourceLocation;
  }): ComponentDefinition {
    return {
      name: opts.name,
      props:
        opts.props?.map((p) => ({
          name: p.name,
          required: p.required ?? false,
          defaultValue: p.defaultValue,
          location: p.location ?? loc(),
        })) ?? [],
      body: opts.body,
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates a prop definition.
   * @example comp.prop({ name: 'title', required: true })
   */
  prop(opts: {
    name: string;
    required?: boolean;
    defaultValue?: ExprAst | string;
    location?: SourceLocation;
  }): PropDefinition {
    return {
      name: opts.name,
      required: opts.required ?? false,
      defaultValue: opts.defaultValue,
      location: opts.location ?? loc(),
    };
  },
};

// =============================================================================
// Root & Compilation Helpers
// =============================================================================

export const root = {
  /**
   * Creates a root node.
   * @example root.node({ children: [...], components: new Map() })
   */
  node(opts: {
    children: TemplateNode[];
    components?: ReadonlyMap<string, ComponentDefinition>;
    metadata?: TemplateMetadata;
    location?: SourceLocation;
  }): RootNode {
    return {
      kind: 'root',
      children: opts.children,
      components: opts.components ?? new Map(),
      metadata: opts.metadata ?? root.metadata(),
      location: opts.location ?? loc(),
    };
  },

  /**
   * Creates empty template metadata.
   */
  metadata(opts?: {
    globalsUsed?: string[];
    pathsAccessed?: string[];
    helpersUsed?: string[];
    componentsUsed?: string[];
  }): TemplateMetadata {
    return {
      globalsUsed: new Set(opts?.globalsUsed ?? []),
      pathsAccessed: new Set(opts?.pathsAccessed ?? []),
      helpersUsed: new Set(opts?.helpersUsed ?? []),
      componentsUsed: new Set(opts?.componentsUsed ?? []),
    };
  },

  /**
   * Creates a compiled template.
   */
  compiled(opts: {
    root: RootNode;
    diagnostics?: Diagnostic[];
  }): CompiledTemplate {
    return {
      root: opts.root,
      diagnostics: opts.diagnostics ?? [],
    };
  },
};

// =============================================================================
// Diagnostic Helpers
// =============================================================================

export const diag = {
  /**
   * Creates an error diagnostic.
   */
  error(opts: {
    message: string;
    location?: SourceLocation;
    code?: string;
  }): Diagnostic {
    return {
      level: 'error',
      message: opts.message,
      location: opts.location ?? loc(),
      code: opts.code,
    };
  },

  /**
   * Creates a warning diagnostic.
   */
  warning(opts: {
    message: string;
    location?: SourceLocation;
    code?: string;
  }): Diagnostic {
    return {
      level: 'warning',
      message: opts.message,
      location: opts.location ?? loc(),
      code: opts.code,
    };
  },
};

// =============================================================================
// Convenience Aliases for Parser
// =============================================================================

export const element = {
  node: node.element,
};
export const component = {
  node: node.component,
};
export const slot = {
  node: node.slot,
};
export const comment = {
  node: node.comment,
};
export const text = {
  node: (opts: { segments: TextSegment[]; location?: SourceLocation }) =>
    node.text(opts.segments, opts.location),
  literalSegment: seg.literal,
  exprSegment: seg.expr,
};
export const ifNode = {
  node: (opts: {
    condition?: ExprAst;
    then?: TemplateNode[];
    else?: TemplateNode[] | null;
    branches?: Array<{ condition: ExprAst; body: TemplateNode[]; location?: SourceLocation }>;
    elseBranch?: TemplateNode[];
    location?: SourceLocation;
  }) => {
    // Support both simple (condition/then/else) and branch-based syntax
    if (opts.condition && opts.then) {
      return node.ifNode({
        branches: [{ condition: opts.condition, body: opts.then }],
        elseBranch: opts.else ?? undefined,
        location: opts.location,
      });
    }
    return node.ifNode({
      branches: opts.branches ?? [],
      elseBranch: opts.elseBranch,
      location: opts.location,
    });
  },
};
export const forNode = {
  node: (opts: {
    item: string;
    index?: string;
    iterable: ExprAst;
    body: TemplateNode[];
    iterationType?: 'of' | 'in';
    location?: SourceLocation;
  }) =>
    node.forLoop({
      itemVar: opts.item,
      itemsExpr: opts.iterable,
      indexVar: opts.index,
      iterationType: opts.iterationType,
      body: opts.body,
      location: opts.location,
    }),
};
export const matchNode = {
  node: node.match,
  literalCase: (opts: {
    values: (string | number | boolean)[];
    body: TemplateNode[];
    location?: SourceLocation;
  }) => match.literal(opts.values, opts.body, opts.location),
  expressionCase: (opts: {
    condition: ExprAst;
    body: TemplateNode[];
    location?: SourceLocation;
  }) => match.expression(opts.condition, opts.body, opts.location),
};
export const letNode = {
  node: node.letNode,
};
export const fragment = {
  node: node.fragment,
};
export const attribute = {
  static: (opts: { name: string; value: string; location?: SourceLocation }) =>
    attr.static(opts.name, opts.value, opts.location),
  expr: (opts: { name: string; expr: ExprAst; location?: SourceLocation }) =>
    attr.expr(opts.name, opts.expr, opts.location),
  mixed: (opts: {
    name: string;
    segments: (StaticAttributeValue | ExprAttributeValue)[];
    location?: SourceLocation;
  }) => attr.mixed(opts.name, opts.segments, opts.location),
  staticValue: attr.staticValue,
  exprValue: attr.exprValue,
};

/**
 * Creates a source location from start and end positions.
 * Used by expression parser for token-based location tracking.
 */
export function location(
  start: { line: number; column: number; offset: number },
  end: { line: number; column: number; offset: number }
): SourceLocation {
  return {
    start,
    end,
  };
}

// =============================================================================
// Expression Parser Compatibility Exports
// =============================================================================
// These exports provide the exact signatures expected by the expression parser

/**
 * Creates a literal node with explicit type and location.
 */
export function literal(
  value: string | number | boolean | null | undefined,
  type: LiteralType,
  location?: SourceLocation
): LiteralNode {
  return {
    kind: 'literal',
    type,
    value,
    location: location ?? loc(),
  };
}

/**
 * Creates a path node with explicit isGlobal and location.
 * Note: The expression parser calls this as `ast.path(segments, isGlobal, location)`
 * We export it directly - not as an alias since `path` is already exported as an object.
 */
export function exprPath(
  segments: PathItem[],
  isGlobal: boolean,
  location?: SourceLocation
): PathNode {
  return {
    kind: 'path',
    segments,
    isGlobal,
    location: location ?? loc(),
  };
}

/**
 * Creates a key path item with location.
 */
export function pathKey(key: string, location?: SourceLocation): KeyPathItem {
  return { kind: 'key', key };
}

/**
 * Creates an index path item with location.
 */
export function pathIndex(index: number, location?: SourceLocation): IndexPathItem {
  return { kind: 'index', index };
}

/**
 * Creates a star (wildcard) path item with location.
 */
export function pathStar(location?: SourceLocation): StarPathItem {
  return { kind: 'star' };
}

/**
 * Creates a unary operation node.
 */
export function unary(
  operator: '!' | '-',
  operand: ExprAst,
  location?: SourceLocation
): UnaryNode {
  return {
    kind: 'unary',
    operator,
    operand,
    location: location ?? loc(),
  };
}

/**
 * Creates a binary operation node.
 */
export function binary(
  operator: BinaryOperator,
  left: ExprAst,
  right: ExprAst,
  location?: SourceLocation
): BinaryNode {
  return {
    kind: 'binary',
    operator,
    left,
    right,
    location: location ?? loc(),
  };
}

/**
 * Creates a ternary expression node.
 */
export function ternary(
  condition: ExprAst,
  truthy: ExprAst,
  falsy: ExprAst,
  location?: SourceLocation
): TernaryNode {
  return {
    kind: 'ternary',
    condition,
    truthy,
    falsy,
    location: location ?? loc(),
  };
}

/**
 * Creates a function call node.
 */
export function call(
  callee: string,
  args: ExprAst[],
  location?: SourceLocation
): CallNode {
  return {
    kind: 'call',
    callee,
    args,
    location: location ?? loc(),
  };
}

/**
 * Creates a function expression node (for arrow functions).
 */
export function functionExpr(
  params: string[],
  body: ExprAst,
  location?: SourceLocation
): FunctionExpr {
  return {
    kind: 'function',
    params,
    body,
    location: location ?? loc(),
  };
}
