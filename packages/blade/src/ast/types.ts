// AST Type Definitions for Blade Templates

// =============================================================================
// Source Location
// =============================================================================

export interface SourceLocation {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
  source?: string;
}

// =============================================================================
// Path Metadata (for source tracking)
// =============================================================================

export interface PathMetadata {
  staticPaths: string[];
  staticOperations: string[];
  staticHelpers: Set<string>;
  accessedPaths?: string[];
  accessedOperations?: string[];
}

// =============================================================================
// Base Node
// =============================================================================

export interface BaseNode {
  location: SourceLocation;
  metadata?: PathMetadata;
}

// =============================================================================
// Expression AST
// =============================================================================

export type ExprAst =
  | LiteralNode
  | PathNode
  | UnaryNode
  | BinaryNode
  | TernaryNode
  | CallNode
  | ArrayWildcardNode;

export interface LiteralNode extends BaseNode {
  kind: 'literal';
  value: string | number | boolean | null;
}

export interface PathNode extends BaseNode {
  kind: 'path';
  segments: string[];
  isGlobal: boolean;
}

export interface UnaryNode extends BaseNode {
  kind: 'unary';
  operator: '!' | '-';
  operand: ExprAst;
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | '&&'
  | '||'
  | '??';

export interface BinaryNode extends BaseNode {
  kind: 'binary';
  operator: BinaryOperator;
  left: ExprAst;
  right: ExprAst;
}

export interface TernaryNode extends BaseNode {
  kind: 'ternary';
  condition: ExprAst;
  truthy: ExprAst;
  falsy: ExprAst;
}

export interface CallNode extends BaseNode {
  kind: 'call';
  callee: string;
  args: ExprAst[];
}

export interface ArrayWildcardNode extends BaseNode {
  kind: 'wildcard';
  path: PathNode;
}

// =============================================================================
// Template Nodes
// =============================================================================

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

export interface TextNode extends BaseNode {
  kind: 'text';
  segments: TextSegment[];
}

export type TextSegment =
  | { kind: 'literal'; text: string; location: SourceLocation }
  | { kind: 'expr'; expr: ExprAst; location: SourceLocation };

export interface ElementNode extends BaseNode {
  kind: 'element';
  tag: string;
  attributes: AttributeNode[];
  children: TemplateNode[];
}

export type AttributeNode =
  | { kind: 'static'; name: string; value: string; location: SourceLocation }
  | { kind: 'expr'; name: string; expr: ExprAst; location: SourceLocation };

export interface IfNode extends BaseNode {
  kind: 'if';
  branches: IfBranch[];
  elseBranch?: TemplateNode[];
}

export interface IfBranch {
  condition: ExprAst;
  body: TemplateNode[];
  location: SourceLocation;
}

export interface ForNode extends BaseNode {
  kind: 'for';
  itemsExpr: ExprAst;
  itemVar: string;
  indexVar?: string;
  iterationType: 'of' | 'in';
  body: TemplateNode[];
}

export interface MatchNode extends BaseNode {
  kind: 'match';
  value: ExprAst;
  cases: MatchCase[];
  defaultCase?: TemplateNode[];
}

export interface MatchCase {
  kind: 'literal' | 'expression';
  values?: (string | number | boolean)[];
  condition?: ExprAst;
  body: TemplateNode[];
  location: SourceLocation;
}

export interface LetNode extends BaseNode {
  kind: 'let';
  declarations: Declaration[];
}

export interface Declaration {
  name: string;
  isGlobal: boolean;
  value: ExprAst | FunctionExpr;
  location: SourceLocation;
}

export interface FunctionExpr {
  kind: 'function';
  params: string[];
  body: ExprAst;
  location: SourceLocation;
}

export interface ComponentNode extends BaseNode {
  kind: 'component';
  name: string;
  props: ComponentProp[];
  children: TemplateNode[];
  propPathMapping: Map<string, string[]>;
}

export interface ComponentProp {
  name: string;
  value: ExprAst | string;
  location: SourceLocation;
}

export interface FragmentNode extends BaseNode {
  kind: 'fragment';
  children: TemplateNode[];
  preserveWhitespace: true;
}

export interface SlotNode extends BaseNode {
  kind: 'slot';
  name?: string;
  fallback?: TemplateNode[];
}

export interface CommentNode extends BaseNode {
  kind: 'comment';
  style: 'line' | 'block' | 'html';
  text: string;
}

// =============================================================================
// Component Definition
// =============================================================================

export interface ComponentDefinition {
  name: string;
  props: PropDefinition[];
  body: TemplateNode[];
  location: SourceLocation;
}

export interface PropDefinition {
  name: string;
  required: boolean;
  defaultValue?: ExprAst | string;
  location: SourceLocation;
}

// =============================================================================
// Root Node & Compiled Template
// =============================================================================

export interface RootNode extends BaseNode {
  kind: 'root';
  children: TemplateNode[];
  components: Map<string, ComponentDefinition>;
  metadata: TemplateMetadata;
}

export interface TemplateMetadata {
  globalsUsed: Set<string>;
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;
  componentsUsed: Set<string>;
}

export interface CompiledTemplate {
  root: RootNode;
  sourceMap?: SourceMap;
  diagnostics: Diagnostic[];
}

export interface SourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
}

export interface Diagnostic {
  level: 'error' | 'warning';
  message: string;
  location: SourceLocation;
  code?: string;
}
