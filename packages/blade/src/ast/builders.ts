// AST Builders
//
// ONE constructor per node kind, and every one of them takes the source
// location it is building the node at.
//
// Two things this file used to get wrong, both of which cost real diagnostics:
//
//   (a) `location` was optional and defaulted to line 1, column 1, offset 0.
//       `SourceLocation` is REQUIRED on `BaseNode`, and its doc comment says
//       the point of it is "error reporting, debugging, and source map
//       generation" - so a silent 1:1:0 is not a default, it is a wrong answer
//       that type-checks. A diagnostic on line 40 highlighted zero characters
//       at offset 0, which is an unusable editor squiggle. Two call sites in
//       validation/index.ts had written `expr.location ?? fallback` on a
//       NON-OPTIONAL field: the authors did not trust the type, correctly.
//       Location is now a required argument everywhere, and the one way to say
//       "this node has no source" is to write {@link syntheticLoc} - a
//       deliberate, greppable act.
//
//   (b) there were two and a half parallel construction APIs. The namespaced
//       banks below, a "Convenience Aliases for Parser" bank and an "Expression
//       Parser Compatibility Exports" bank - and the latter two did not
//       delegate, they RE-WROTE the object literals. `expr.literal` and
//       `literal` each independently built `{kind:'literal', type, value,
//       location}`, and so did the rest, so changing `LiteralNode` meant three
//       coordinated edits with no compiler link between the copies. They
//       existed only because the template parser and the expression parser
//       wanted different argument orders. Both banks are gone; the two parsers
//       call the canonical constructors.
//
// The boundary itself is worth keeping and is now enforced by having one door:
// `grep "kind: '"` outside this directory finds no node construction at all.

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
  ArrayNode,
  MemberAccessNode,
  TemplateNode,
  TextNode,
  TextSegment,
  ElementNode,
  AttributeNode,
  StaticAttributeNode,
  ExprAttributeNode,
  MixedAttributeNode,
  EventAttributeNode,
  StaticAttributeValue,
  ExprAttributeValue,
  IfNode,
  IfBranch,
  ForNode,
  MatchNode,
  MatchCase,
  MatchLiteralCase,
  MatchExpressionCase,
  LetNode,
  PropsNode,
  PropDeclaration,
  FunctionExpr,
  ComponentNode,
  ComponentProp,
  FragmentNode,
  SlotNode,
  SlotFillNode,
  CommentNode,
  DoctypeNode,
  ComponentDefinition,
  PartialTemplate,
  ValidTemplate,
  RootNode,
  TemplateMetadata,
  Diagnostic,
} from './types.js';

// =============================================================================
// Locations
// =============================================================================

/** One end of a source span. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/**
 * Creates a source location spanning `start` to `end`.
 *
 * The canonical way to build a location: both ends are supplied, so the offsets
 * cannot silently disagree with the lines and columns beside them.
 *
 * @param start - Where the construct begins
 * @param end - Where it ends, exclusive
 * @param source - Optional file the span belongs to
 */
export function location(
  start: SourcePosition,
  end: SourcePosition,
  source?: string
): SourceLocation {
  return {
    start: { line: start.line, column: start.column, offset: start.offset },
    end: { line: end.line, column: end.column, offset: end.offset },
    source,
  };
}

/**
 * The location of a node that genuinely has no source text.
 *
 * For tests and for generated nodes - and for nothing else. It is spelled out
 * rather than defaulted so that "this node came from nowhere" is a claim
 * someone made on purpose and a reviewer can grep for, instead of what happens
 * when a caller forgets an argument.
 *
 * A parser, a compiler or an inference pass that has a real line and column
 * must build one with {@link location}: a diagnostic pointing at 1:1 with a
 * zero-width span is worse than no diagnostic, because an editor renders it as
 * a squiggle over nothing at the top of the file.
 */
export function syntheticLoc(): SourceLocation {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 2, offset: 1 },
  };
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * Creates path metadata, empty by default.
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
// Path Items
// =============================================================================

/**
 * Path segments. These carry no location of their own - a path's span is the
 * span of the {@link PathNode} that holds them.
 */
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
// Expressions
// =============================================================================

function inferLiteralType(
  value: string | number | boolean | null | undefined
): LiteralType {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'nil';
}

export const expr = {
  /**
   * Creates a literal node.
   *
   * `type` is inferred from the value unless the caller knows better - the
   * expression parser does, because the token it read says which literal form
   * was written.
   *
   * @example expr.literal(123, span)
   * @example expr.literal('hello', span, 'string')
   */
  literal(
    value: string | number | boolean | null | undefined,
    location: SourceLocation,
    type: LiteralType = inferLiteralType(value)
  ): LiteralNode {
    return { kind: 'literal', type, value, location };
  },

  /**
   * Creates a path node.
   * @example expr.pathNode([path.key('order'), path.key('total')], span)
   * @example expr.pathNode([path.key('currency')], span, true)
   */
  pathNode(
    segments: PathItem[],
    location: SourceLocation,
    isGlobal = false
  ): PathNode {
    return { kind: 'path', segments, isGlobal, location };
  },

  /**
   * Creates a path node from a string.
   *
   * `isGlobal` defaults to whether the string names a global (`$.currency`).
   *
   * @example expr.pathFrom('order.customer.name', span)
   * @example expr.pathFrom('$.currency', span)
   * @example expr.pathFrom('items[*].price', span)
   */
  pathFrom(
    pathStr: string,
    location: SourceLocation,
    isGlobal = pathStr.startsWith('$')
  ): PathNode {
    return expr.pathNode(path.parse(pathStr), location, isGlobal);
  },

  /**
   * Creates a unary operation node.
   * @example expr.unary('!', expr.pathFrom('isValid', span), span)
   */
  unary(
    operator: '!' | '-',
    operand: ExprAst,
    location: SourceLocation
  ): UnaryNode {
    return { kind: 'unary', operator, operand, location };
  },

  /**
   * Creates a binary operation node.
   * @example expr.binary('+', left, right, span)
   */
  binary(
    operator: BinaryOperator,
    left: ExprAst,
    right: ExprAst,
    location: SourceLocation
  ): BinaryNode {
    return { kind: 'binary', operator, left, right, location };
  },

  /**
   * Creates a ternary expression node.
   * @example expr.ternary(condition, truthy, falsy, span)
   */
  ternary(
    condition: ExprAst,
    truthy: ExprAst,
    falsy: ExprAst,
    location: SourceLocation
  ): TernaryNode {
    return { kind: 'ternary', condition, truthy, falsy, location };
  },

  /**
   * Creates a function call node.
   * @example expr.call('sum', [items], span)
   */
  call(callee: string, args: ExprAst[], location: SourceLocation): CallNode {
    return { kind: 'call', callee, args, location };
  },

  /**
   * Creates an array wildcard node.
   * @example expr.wildcard(expr.pathFrom('items[*].price', span), span)
   */
  wildcard(pathNode: PathNode, location: SourceLocation): ArrayWildcardNode {
    return { kind: 'wildcard', path: pathNode, location };
  },

  /**
   * Creates an array literal node.
   * @example expr.array([one, two], span)
   */
  array(elements: ExprAst[], location: SourceLocation): ArrayNode {
    return { kind: 'array', elements, location };
  },

  /**
   * Creates a member access node.
   * @example expr.member(callNode, [path.index(0)], false, span) // foo()[0]
   * @example expr.member(callNode, [path.star(), path.key('bar')], true, span)
   */
  member(
    object: ExprAst,
    pathSegments: PathItem[],
    hasWildcard: boolean,
    location: SourceLocation
  ): MemberAccessNode {
    return {
      kind: 'member',
      object,
      path: pathSegments,
      hasWildcard,
      location,
    };
  },

  /**
   * Creates a function expression - the value half of `@let f = (x) => ...`.
   * @example expr.fn(['x', 'y'], body, span)
   */
  fn(params: string[], body: ExprAst, location: SourceLocation): FunctionExpr {
    return { kind: 'function', params, body, location };
  },
};

// =============================================================================
// Text Segments
// =============================================================================

/** The expression half of {@link TextSegment}, named so builders can share it. */
type ExprTextSegment = Extract<TextSegment, { kind: 'expr' }>;

export const seg = {
  /**
   * Creates a literal text segment.
   */
  literal(text: string, location: SourceLocation): TextSegment {
    return { kind: 'literal', text, location };
  },

  /**
   * Creates an escaped expression text segment - `$name` or `${expr}`.
   */
  expr(exprAst: ExprAst, location: SourceLocation): ExprTextSegment {
    return { kind: 'expr', expr: exprAst, location };
  },

  /**
   * Creates a raw expression text segment - `$!name` or `$!{expr}`.
   *
   * `unsafe` is the author's explicit assertion that the value is already
   * trusted HTML; nothing downstream escapes it. It is the same segment as
   * {@link seg.expr} plus that assertion, and is built from it so the two
   * cannot drift apart.
   */
  unsafeExpr(exprAst: ExprAst, location: SourceLocation): ExprTextSegment {
    return { ...seg.expr(exprAst, location), unsafe: true };
  },
};

// =============================================================================
// Attributes
// =============================================================================

export const attr = {
  /**
   * Creates a static attribute.
   *
   * A whole attribute is one segment plus a name - `StaticAttributeNode`
   * *extends* `StaticAttributeValue` - so it is built from the segment builder
   * rather than repeating its shape.
   *
   * @example attr.static('class', 'container', span)
   */
  static(
    name: string,
    value: string,
    location: SourceLocation
  ): StaticAttributeNode {
    return { ...attr.staticValue(value, location), name };
  },

  /**
   * Creates a dynamic expression attribute.
   * @example attr.expr('disabled', notValid, span)
   */
  expr(
    name: string,
    exprAst: ExprAst,
    location: SourceLocation
  ): ExprAttributeNode {
    return { ...attr.exprValue(exprAst, location), name };
  },

  /**
   * Creates a mixed attribute (static + expression segments).
   * @example attr.mixed('class', [attr.staticValue('status-', s), attr.exprValue(e, s)], span)
   */
  mixed(
    name: string,
    segments: (StaticAttributeValue | ExprAttributeValue)[],
    location: SourceLocation
  ): MixedAttributeNode {
    return { kind: 'mixed', name, segments, location };
  },

  /**
   * Creates an event binding.
   * @example attr.event('on:click', 'click', handler, span)
   */
  event(
    name: string,
    event: string,
    exprAst: ExprAst,
    location: SourceLocation
  ): EventAttributeNode {
    return { kind: 'event', name, event, expr: exprAst, location };
  },

  /**
   * Creates a static value segment, for use inside {@link attr.mixed}.
   */
  staticValue(value: string, location: SourceLocation): StaticAttributeValue {
    return { kind: 'static', value, location };
  },

  /**
   * Creates an expression value segment, for use inside {@link attr.mixed}.
   */
  exprValue(exprAst: ExprAst, location: SourceLocation): ExprAttributeValue {
    return { kind: 'expr', expr: exprAst, location };
  },
};

// =============================================================================
// Match Cases
// =============================================================================

export const match = {
  /**
   * Creates a literal match case.
   * @example match.literal(['paid', 'completed'], body, span)
   */
  literal(
    values: (string | number | boolean)[],
    body: TemplateNode[],
    location: SourceLocation
  ): MatchLiteralCase {
    return { kind: 'literal', values, body, location };
  },

  /**
   * Creates an expression match case.
   * @example match.expression(condition, body, span)
   */
  expression(
    condition: ExprAst,
    body: TemplateNode[],
    location: SourceLocation
  ): MatchExpressionCase {
    return { kind: 'expression', condition, body, location };
  },
};

// =============================================================================
// Template Nodes
// =============================================================================

export const node = {
  /**
   * Creates a text node from literal and/or expression segments.
   * @example node.text([seg.literal('Hello', s)], span)
   */
  text(segments: TextSegment[], location: SourceLocation): TextNode {
    return { kind: 'text', segments, location };
  },

  /**
   * Creates a text node holding one literal string.
   * @example node.textLiteral('Hello, world!', span)
   */
  textLiteral(text: string, location: SourceLocation): TextNode {
    return node.text([seg.literal(text, location)], location);
  },

  /**
   * Creates an HTML element node.
   * @example node.element({ tag: 'div', attributes: [...], location: span })
   */
  element(opts: {
    tag: string;
    attributes?: AttributeNode[];
    children?: TemplateNode[];
    location: SourceLocation;
    metadata?: PathMetadata;
  }): ElementNode {
    return {
      kind: 'element',
      tag: opts.tag,
      attributes: opts.attributes ?? [],
      children: opts.children ?? [],
      location: opts.location,
      metadata: opts.metadata,
    };
  },

  /**
   * Creates an if/else if/else node.
   *
   * Every branch carries its own span, because an `@else if` diagnostic that
   * pointed at the opening `@if` sent the reader to the wrong line.
   *
   * @example node.ifNode({ branches: [{ condition, body, location: s }], location: span })
   */
  ifNode(opts: {
    branches: IfBranch[];
    elseBranch?: TemplateNode[];
    location: SourceLocation;
  }): IfNode {
    return {
      kind: 'if',
      branches: opts.branches,
      elseBranch: opts.elseBranch,
      location: opts.location,
    };
  },

  /**
   * Creates a for loop node.
   * @example node.forLoop({ itemVar: 'item', itemsExpr: items, body, location: span })
   */
  forLoop(opts: {
    itemVar: string;
    itemsExpr: ExprAst;
    indexVar?: string;
    iterationType?: 'of' | 'in';
    key?: ExprAst;
    body: TemplateNode[];
    location: SourceLocation;
  }): ForNode {
    return {
      kind: 'for',
      itemVar: opts.itemVar,
      itemsExpr: opts.itemsExpr,
      indexVar: opts.indexVar,
      iterationType: opts.iterationType ?? 'of',
      key: opts.key,
      body: opts.body,
      location: opts.location,
    };
  },

  /**
   * Creates a match node.
   * @example node.match({ value: status, cases: [...], location: span })
   */
  match(opts: {
    value: ExprAst;
    cases: MatchCase[];
    defaultCase?: TemplateNode[];
    location: SourceLocation;
  }): MatchNode {
    return {
      kind: 'match',
      value: opts.value,
      cases: opts.cases,
      defaultCase: opts.defaultCase,
      location: opts.location,
    };
  },

  /**
   * Creates a let/variable declaration node.
   * @example node.letNode({ name: 'x', value: ten, location: span })
   */
  letNode(opts: {
    name: string;
    value: ExprAst | FunctionExpr;
    isGlobal?: boolean;
    location: SourceLocation;
  }): LetNode {
    return {
      kind: 'let',
      name: opts.name,
      isGlobal: opts.isGlobal ?? false,
      value: opts.value,
      location: opts.location,
    };
  },

  /**
   * Creates a `@props` declaration node.
   * @example node.props({ props: [comp.prop({ name: 'label', location: s })], location: span })
   */
  props(opts: {
    props: readonly PropDeclaration[];
    location: SourceLocation;
  }): PropsNode {
    return { kind: 'props', props: opts.props, location: opts.location };
  },

  /**
   * Creates a component instance node.
   * @example node.component({ name: 'Card', props: [...], location: span })
   */
  component(opts: {
    name: string;
    props?: readonly ComponentProp[];
    children?: TemplateNode[];
    location: SourceLocation;
  }): ComponentNode {
    return {
      kind: 'component',
      name: opts.name,
      props: opts.props ?? [],
      children: opts.children ?? [],
      location: opts.location,
    };
  },

  /**
   * Creates one `name=value` prop on a component call.
   * @example node.componentProp('title', titleExpr, span)
   */
  componentProp(
    name: string,
    value: ExprAst,
    location: SourceLocation
  ): ComponentProp {
    return { name, value, location };
  },

  /**
   * Creates a fragment node.
   * @example node.fragment(children, span)
   */
  fragment(children: TemplateNode[], location: SourceLocation): FragmentNode {
    return { kind: 'fragment', children, location };
  },

  /**
   * Creates a slot node.
   * @example node.slot({ name: 'header', fallback: [...], location: span })
   */
  slot(opts: {
    name?: string;
    fallback?: TemplateNode[];
    location: SourceLocation;
  }): SlotNode {
    return {
      kind: 'slot',
      name: opts.name,
      fallback: opts.fallback,
      location: opts.location,
    };
  },

  /**
   * Creates a slot fill node.
   * @example node.slotFill({ name: 'header', children: [...], location: span })
   */
  slotFill(opts: {
    name: string;
    children?: TemplateNode[];
    location: SourceLocation;
  }): SlotFillNode {
    return {
      kind: 'slot-fill',
      name: opts.name,
      children: opts.children ?? [],
      location: opts.location,
    };
  },

  /**
   * Creates a comment node.
   * @example node.comment({ style: 'line', text: 'note', location: span })
   */
  comment(opts: {
    style: 'line' | 'block' | 'html';
    text: string;
    location: SourceLocation;
  }): CommentNode {
    return {
      kind: 'comment',
      style: opts.style,
      text: opts.text,
      location: opts.location,
    };
  },

  /**
   * Creates a DOCTYPE declaration node.
   * @example node.doctype({ value: 'html', location: span })
   */
  doctype(opts: { value: string; location: SourceLocation }): DoctypeNode {
    return { kind: 'doctype', value: opts.value, location: opts.location };
  },
};

// =============================================================================
// Component Definitions
// =============================================================================

export const comp = {
  /**
   * Creates a component definition.
   * @example comp.define({ name: 'Card', props: [...], body: [...], location: span })
   */
  define(opts: {
    name: string;
    props?: readonly PropDeclaration[];
    body: TemplateNode[];
    location: SourceLocation;
  }): ComponentDefinition {
    return {
      name: opts.name,
      props: opts.props ?? [],
      body: opts.body,
      location: opts.location,
    };
  },

  /**
   * Creates a prop declaration.
   *
   * The one constructor for the one prop shape: `<template:Card title!>` and
   * `@props($title)` produce the same thing.
   *
   * @example comp.prop({ name: 'title', required: true, location: span })
   */
  prop(opts: {
    name: string;
    required?: boolean;
    defaultValue?: ExprAst;
    location: SourceLocation;
  }): PropDeclaration {
    return {
      name: opts.name,
      required: opts.required ?? false,
      defaultValue: opts.defaultValue,
      location: opts.location,
    };
  },
};

// =============================================================================
// Roots and Compilation Results
// =============================================================================

export const root = {
  /**
   * Creates a root node.
   * @example root.node({ children, location: span })
   */
  node(opts: {
    children: TemplateNode[];
    components?: ReadonlyMap<string, ComponentDefinition>;
    props?: readonly PropDeclaration[];
    metadata?: TemplateMetadata;
    location: SourceLocation;
  }): RootNode {
    return {
      kind: 'root',
      children: opts.children,
      components: opts.components ?? new Map(),
      props: opts.props ?? [],
      metadata: opts.metadata ?? root.metadata(),
      location: opts.location,
    };
  },

  /**
   * Creates template metadata, empty by default.
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
   * Creates a template that compiled with no errors.
   */
  valid(opts: { root: RootNode; diagnostics?: Diagnostic[] }): ValidTemplate {
    return {
      kind: 'valid',
      root: opts.root,
      diagnostics: opts.diagnostics ?? [],
    };
  },

  /**
   * Creates the partial result of a template that failed to compile.
   */
  partial(opts: {
    root: RootNode;
    diagnostics: readonly Diagnostic[];
  }): PartialTemplate {
    return {
      kind: 'partial',
      root: opts.root,
      diagnostics: opts.diagnostics,
    };
  },
};

// =============================================================================
// Diagnostics
// =============================================================================

export const diag = {
  /**
   * Creates an error diagnostic.
   */
  error(opts: {
    message: string;
    location: SourceLocation;
    code?: string;
  }): Diagnostic {
    return {
      level: 'error',
      message: opts.message,
      location: opts.location,
      code: opts.code,
    };
  },

  /**
   * Creates a warning diagnostic.
   */
  warning(opts: {
    message: string;
    location: SourceLocation;
    code?: string;
  }): Diagnostic {
    return {
      level: 'warning',
      message: opts.message,
      location: opts.location,
      code: opts.code,
    };
  },
};
