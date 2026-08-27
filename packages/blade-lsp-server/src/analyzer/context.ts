/**
 * What kind of place in the document the cursor is in.
 *
 * There used to be three answers to that question and they disagreed.
 * `document.ts` scanned backwards over word characters and called anything
 * preceded by an `@` a directive - so typing `support@example.com` offered
 * `if`/`for`/`match` in the middle of an email address. `isInsideExpression`
 * scanned to offset 0 with no bound, and `isInsideTag` scanned back for a `<`
 * with no bound either, so a `5 < 10` anywhere earlier in a paragraph made
 * everything after it look like it was inside a tag. All three were O(document)
 * per keystroke, and all three were re-lexing the document by hand and reaching
 * a different conclusion than the parser that had just read the same text.
 *
 * The parser is total and its positions are absolute, so a mid-edit document
 * still yields a usable AST. This module locates the node containing the offset
 * and asks *it* what the position is. A bounded scan remains for the text a
 * parse cannot describe - a half-typed `${`, a `<div ` with no `>` yet - and it
 * never leaves the current line or the containing node, whichever is tighter.
 */

import type {
  ComponentDefinition,
  ExprAst,
  SourceLocation,
  TemplateNode,
} from '@bladets/template';
import { childrenOf, expressionsOf } from '@bladets/template';
import type { BladeDocument, CompletionContextKind } from '../types.js';
import { lineStartAt } from '../line-index.js';
import { getPathAtOffset } from '../document.js';
import type { PathInfo } from '../document.js';

/**
 * A resolved cursor position.
 *
 * One description, consumed by completion, hover and definition, so that the
 * three cannot drift into different opinions about the same offset again.
 */
export interface PositionContext {
  readonly offset: number;
  /** What can be completed here. */
  readonly kind: CompletionContextKind;
  /** The innermost node whose span contains the offset, if the parse found one. */
  readonly node: TemplateNode | undefined;
  /** The directive whose header the cursor sits in, if any. */
  readonly directive: DirectiveContext | undefined;
  /** The tag being edited, for tag, attribute and prop positions. */
  readonly tagName: string | undefined;
  /** The component being *defined*, when inside a `<template:Name ...>` tag. */
  readonly templateDefinition: string | undefined;
  /** The path expression under the cursor, when there is one. */
  readonly path: PathInfo | null;
  /** Word characters immediately before the cursor, without a leading `$`. */
  readonly partialToken: string;
}

/** The header of a directive - the part between its parentheses. */
export interface DirectiveContext {
  readonly name: 'if' | 'for' | 'match' | 'let' | 'props';
  /** The node itself, when the parse produced one. */
  readonly node: TemplateNode | undefined;
}

/** Directive names offered after an `@`. */
const DIRECTIVE_NAMES = new Set([
  'if',
  'else',
  'for',
  'match',
  'props',
  'slot',
  'component',
]);

/**
 * Resolves the cursor position against the parsed document.
 *
 * @param doc - The document; its AST and text are the same version
 * @param rawOffset - Offset of the cursor, clamped into the document
 */
export function resolveContext(
  doc: BladeDocument,
  rawOffset: number
): PositionContext {
  const content = doc.content;
  const offset = Math.max(0, Math.min(rawOffset, content.length));
  const partialToken = partialTokenAt(content, offset);
  const node = innermostNodeAt(doc, offset);

  const base = {
    offset,
    node,
    partialToken,
    directive: undefined,
    tagName: undefined,
    templateDefinition: undefined,
    path: null,
  } satisfies Omit<PositionContext, 'kind'>;

  // 1. A directive header the parser understood.
  const directive = directiveAt(content, node, offset);
  if (directive) {
    if (directive.name === 'props') {
      return { ...base, kind: 'directive-argument', directive };
    }
    return {
      ...base,
      kind: 'expression',
      directive,
      path: getPathAtOffset(content, offset),
    };
  }

  // 2. An expression the parser understood: the authoritative answer, and the
  //    one that keeps an `@` or a `<` inside a string from being misread.
  if (node && withinAny(directExpressionSpans(node), offset)) {
    return expressionContext(base, content, offset);
  }

  // 3. An open tag: `<div |`, `<Card |`, `<template:Card |`.
  const tag = openTagAt(doc, node, offset);
  if (tag) return { ...base, ...tag };

  // 4. Text the parse could not describe, or a position a trigger character
  //    just created. Everything below is bounded by the current line and by the
  //    containing node.
  const bound = scanBound(doc, node, offset);
  return fallbackContext(doc, base, bound);
}

/** Whether the offset is inside `@props(...)`, the one implementation. */
export function isInsidePropsDirective(
  doc: BladeDocument,
  offset: number
): boolean {
  return resolveContext(doc, offset).directive?.name === 'props';
}

// =============================================================================
// AST lookup
// =============================================================================

/**
 * The innermost node whose span contains the offset.
 *
 * Component definitions are searched too: their bodies are not part of the
 * document's top-level node list, so a cursor inside a `<template:Card>` block
 * used to resolve against nothing at all.
 */
export function innermostNodeAt(
  doc: BladeDocument,
  offset: number
): TemplateNode | undefined {
  let found = deepestContaining(doc.ast ?? [], offset);
  if (found) return found;

  for (const [, definition] of doc.components) {
    if (!contains(definition.location, offset)) continue;
    found = deepestContaining(definition.body, offset);
    if (found) return found;
  }
  return undefined;
}

/** The component definition whose span contains the offset, if any. */
export function definitionAt(
  doc: BladeDocument,
  offset: number
): ComponentDefinition | undefined {
  for (const [, definition] of doc.components) {
    if (contains(definition.location, offset)) return definition;
  }
  return undefined;
}

function deepestContaining(
  nodes: readonly TemplateNode[],
  offset: number
): TemplateNode | undefined {
  for (const node of nodes) {
    if (!contains(node.location, offset)) continue;
    return deepestContaining(childrenOf(node), offset) ?? node;
  }
  return undefined;
}

function contains(location: SourceLocation, offset: number): boolean {
  return offset >= location.start.offset && offset <= location.end.offset;
}

function withinAny(spans: readonly SourceLocation[], offset: number): boolean {
  return spans.some(span => contains(span, offset));
}

/**
 * The spans of the expressions a node holds directly.
 *
 * A cursor inside one of these is inside an expression no matter what the
 * surrounding characters look like.
 */
function directExpressionSpans(node: TemplateNode): readonly SourceLocation[] {
  const spans: SourceLocation[] = [];

  if (node.kind === 'text') {
    for (const segment of node.segments) {
      if (segment.kind === 'expr') spans.push(segment.location);
    }
    return spans;
  }

  if (node.kind === 'element') {
    // The expression's own span, not the attribute's: a cursor on the
    // attribute *name* is editing an attribute, not an expression.
    for (const attribute of node.attributes) {
      if (attribute.kind === 'expr' || attribute.kind === 'event') {
        spans.push(attribute.expr.location);
      } else if (attribute.kind === 'mixed') {
        for (const segment of attribute.segments) {
          if (segment.kind === 'expr') spans.push(segment.expr.location);
        }
      }
    }
    return spans;
  }

  if (node.kind === 'component') {
    for (const prop of node.props) spans.push(prop.value.location);
    return spans;
  }

  for (const expr of expressionsOf(node)) {
    spans.push((expr as ExprAst).location);
  }
  return spans;
}

/**
 * The directive header the offset sits in.
 *
 * "Header" is everything from the directive keyword to the start of its body,
 * which is where its condition, its collection or its prop list is written.
 */
function directiveAt(
  content: string,
  node: TemplateNode | undefined,
  offset: number
): DirectiveContext | undefined {
  if (!node) return undefined;

  switch (node.kind) {
    case 'props':
      return insideArguments(content, node.location, offset, offset)
        ? { name: 'props', node }
        : undefined;
    case 'let':
      // `@ { let total = price * qty; }` has no argument list; the whole
      // declaration is its header.
      return contains(node.location, offset)
        ? { name: 'let', node }
        : undefined;
    case 'if': {
      for (const branch of node.branches) {
        const end = headerEnd(branch.location, branch.body);
        if (insideArguments(content, branch.location, offset, end)) {
          return { name: 'if', node };
        }
      }
      return undefined;
    }
    case 'for':
      return insideArguments(
        content,
        node.location,
        offset,
        headerEnd(node.location, node.body)
      )
        ? { name: 'for', node }
        : undefined;
    case 'match':
      return insideArguments(
        content,
        node.location,
        offset,
        headerEnd(node.location, firstCaseBody(node.cases))
      )
        ? { name: 'match', node }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Whether the offset is past the directive's opening parenthesis and before the
 * end of its header.
 *
 * The keyword itself is deliberately excluded: a cursor in `@i|f(...)` is
 * completing a directive *name*, not reading its arguments.
 */
function insideArguments(
  content: string,
  location: SourceLocation,
  offset: number,
  headerLimit: number
): boolean {
  if (offset > headerLimit || offset < location.start.offset) return false;
  const open = content.indexOf('(', location.start.offset);
  return open !== -1 && open < headerLimit && offset > open;
}

function firstCaseBody(
  cases: readonly { readonly body: readonly TemplateNode[] }[]
): readonly TemplateNode[] {
  return cases[0]?.body ?? [];
}

/** Where a directive's header stops: the start of its body, or its own end. */
function headerEnd(
  location: SourceLocation,
  body: readonly TemplateNode[]
): number {
  const first = body[0];
  return first ? first.location.start.offset : location.end.offset;
}

// =============================================================================
// Tags
// =============================================================================

interface TagContext {
  readonly kind: CompletionContextKind;
  readonly tagName: string | undefined;
  readonly templateDefinition: string | undefined;
}

/**
 * The open tag the offset sits in, if the parse produced one.
 *
 * The end of an open tag is not in the AST, so it is found by a scan bounded by
 * the node's own span - tens of characters, not the document.
 */
function openTagAt(
  doc: BladeDocument,
  node: TemplateNode | undefined,
  offset: number
): TagContext | undefined {
  const definition = definitionAt(doc, offset);
  if (definition) {
    const end = openTagEnd(doc.content, definition.location);
    if (offset > definition.location.start.offset && offset <= end) {
      return {
        kind: 'directive-argument',
        tagName: `template:${definition.name}`,
        templateDefinition: definition.name,
      };
    }
  }

  if (!node || (node.kind !== 'element' && node.kind !== 'component')) {
    return undefined;
  }

  const start = node.location.start.offset;
  const end = openTagEnd(doc.content, node.location);
  if (offset <= start || offset > end) return undefined;

  const name = node.kind === 'element' ? node.tag : node.name;
  // Inside the tag name itself: `<di|v>`.
  if (offset <= start + 1 + name.length) {
    return { kind: 'html-tag', tagName: name, templateDefinition: undefined };
  }

  return {
    kind: isComponentTag(name) ? 'component-prop' : 'html-attribute',
    tagName: name,
    templateDefinition: undefined,
  };
}

/** The offset of the `>` that closes an open tag, bounded by the node. */
function openTagEnd(content: string, location: SourceLocation): number {
  let quote: string | undefined;
  for (let i = location.start.offset; i <= location.end.offset; i++) {
    const char = content[i];
    if (char === undefined) break;
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i;
  }
  return location.end.offset;
}

function isComponentTag(name: string): boolean {
  return /^[A-Z]/.test(name);
}

// =============================================================================
// Bounded fallback for text no parse describes
// =============================================================================

/** The earliest offset a backward scan may reach. */
function scanBound(
  doc: BladeDocument,
  node: TemplateNode | undefined,
  offset: number
): number {
  const line = lineStartAt(doc.lines, offset);
  const nodeStart = node?.location.start.offset ?? 0;
  return Math.max(line, nodeStart);
}

function fallbackContext(
  doc: BladeDocument,
  base: Omit<PositionContext, 'kind'>,
  bound: number
): PositionContext {
  const content = doc.content;
  const offset = base.offset;

  // An unclosed `${`: the shape a half-typed block expression has before the
  // parser can make a segment of it.
  if (hasUnclosedInterpolation(content, offset, bound)) {
    return expressionContext(base, content, offset);
  }

  // An unclosed `@props(`: same story, for the directive whose arguments are
  // schema property names.
  if (hasUnclosedProps(content, offset, bound)) {
    return {
      ...base,
      kind: 'directive-argument',
      directive: { name: 'props', node: undefined },
    };
  }

  // A `$` that starts a simple expression, possibly with a partial name typed.
  const dollar = simpleExpressionStart(content, offset, bound);
  if (dollar !== undefined) {
    return expressionContext(base, content, offset);
  }

  // An `@` at a token boundary. The boundary requirement is what stops the `@`
  // of an email address from being read as a directive.
  if (directiveStart(content, offset, bound)) {
    return { ...base, kind: 'directive' };
  }

  const tag = unclosedTag(content, offset, bound);
  if (tag) {
    if (tag.name === '') {
      return { ...base, kind: 'html-tag' };
    }
    if (!tag.inAttribute) {
      return { ...base, kind: 'html-tag', tagName: tag.name };
    }
    if (tag.name.startsWith('template:')) {
      return {
        ...base,
        kind: 'directive-argument',
        tagName: tag.name,
        templateDefinition: tag.name.slice('template:'.length),
      };
    }
    return {
      ...base,
      kind: isComponentTag(tag.name) ? 'component-prop' : 'html-attribute',
      tagName: tag.name,
    };
  }

  return { ...base, kind: 'text' };
}

function expressionContext(
  base: Omit<PositionContext, 'kind'>,
  content: string,
  offset: number
): PositionContext {
  const path = getPathAtOffset(content, offset);
  const isPath =
    path !== null &&
    (path.path.includes('.') ||
      /\[\d*\]\.?$/.test(path.path) ||
      /\[\*\]\.?$/.test(path.path));

  return {
    ...base,
    kind: isPath ? 'expression-path' : 'expression',
    path,
  };
}

/** `${` with no `}` between it and the cursor, within the bound. */
function hasUnclosedInterpolation(
  content: string,
  offset: number,
  bound: number
): boolean {
  let depth = 0;
  for (let i = offset - 1; i >= bound; i--) {
    const char = content[i];
    if (char === '}') {
      depth++;
    } else if (char === '{') {
      if (depth === 0) return i > 0 && content[i - 1] === '$';
      depth--;
    }
  }
  return false;
}

function hasUnclosedProps(
  content: string,
  offset: number,
  bound: number
): boolean {
  let depth = 0;
  for (let i = offset - 1; i >= bound; i--) {
    const char = content[i];
    if (char === ')') {
      depth++;
    } else if (char === '(') {
      if (depth === 0) {
        return /@props\s*$/.test(content.slice(bound, i));
      }
      depth--;
    }
  }
  return false;
}

/** The offset of the `$` starting a simple expression at the cursor. */
function simpleExpressionStart(
  content: string,
  offset: number,
  bound: number
): number | undefined {
  let i = offset - 1;
  while (i >= bound && isPathChar(content[i] ?? '')) i--;
  return i >= bound && content[i] === '$' ? i : undefined;
}

/**
 * Whether the cursor is typing a directive name after an `@`.
 *
 * The `@` must open a token: the character before it may not be a word
 * character, or `support@ex|ample.com` is a directive.
 */
function directiveStart(
  content: string,
  offset: number,
  bound: number
): boolean {
  let i = offset - 1;
  while (i >= bound && /\w/.test(content[i] ?? '')) i--;
  if (i < 0 || content[i] !== '@') return false;

  const before = i > 0 ? content[i - 1] : undefined;
  if (before !== undefined && /[\w$)\]"']/.test(before)) return false;

  const typed = content.slice(i + 1, offset);
  if (typed === '') return true;
  // Only offer directives while what is typed can still become one.
  for (const name of DIRECTIVE_NAMES) {
    if (name.startsWith(typed)) return true;
  }
  return false;
}

interface UnclosedTag {
  readonly name: string;
  readonly inAttribute: boolean;
}

/**
 * An open `<` on this line with no `>` after it.
 *
 * `<` must be followed by a tag-name character, so arithmetic (`5 < 10`) is not
 * mistaken for markup.
 */
function unclosedTag(
  content: string,
  offset: number,
  bound: number
): UnclosedTag | undefined {
  for (let i = offset - 1; i >= bound; i--) {
    const char = content[i];
    if (char === '>') return undefined;
    if (char !== '<') continue;

    const next = content[i + 1] ?? '';
    if (i + 1 === offset) return { name: '', inAttribute: false };
    if (!/[A-Za-z/!]/.test(next)) return undefined;

    let end = i + 1;
    while (end < content.length && /[\w:.-]/.test(content[end] ?? '')) end++;
    return { name: content.slice(i + 1, end), inAttribute: offset > end };
  }
  return undefined;
}

function isPathChar(char: string): boolean {
  return /[\w.[\]*]/.test(char);
}

/**
 * The word characters immediately before the cursor.
 *
 * A leading `$` is not part of the token being completed: completion items are
 * labelled `title`, not `$title`, and the sigil is added back when the item is
 * inserted.
 */
export function partialTokenAt(content: string, offset: number): string {
  let start = offset;
  while (start > 0 && /\w/.test(content[start - 1] ?? '')) start--;
  return content.slice(start, offset);
}
