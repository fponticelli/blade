/**
 * Completion Provider for Blade Language Server
 *
 * Context-aware completion for expressions, directives, HTML and component
 * props. The context itself comes from `analyzer/context.ts`, which reads the
 * parsed AST; this module only decides what to offer once the position is
 * known. It used to do both, with its own backward text scans that disagreed
 * with the parser and with hover's copies of the same predicates.
 *
 * Every helper here reads `context.offset` and `context.scopeVariables`, which
 * are resolved exactly once per request. Four of them used to convert the
 * position back to an offset independently, splitting the whole document each
 * time, and the scope lookup ran twice per keystroke.
 */

import type {
  BladeDocument,
  CompletionContext,
  HelperDefinition,
  LspConfig,
  ScopeVariable,
} from '../types.js';
import { DEFAULT_LSP_CONFIG } from '../types.js';
import type { ProjectLspContext } from '../project-context.js';
import { resolveContext } from '../analyzer/context.js';
import { getVariablesAtOffset } from '../analyzer/scope.js';
import { positionOfOffset } from '../document.js';
import { getSchemaCompletions } from '@bladets/template/node';
import { helperMetadata } from '@bladets/template';

/**
 * Completion item kind (from LSP spec)
 */
export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

/**
 * Completion item structure
 */
export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: 1 | 2; // 1 = PlainText, 2 = Snippet
  sortText?: string;
  filterText?: string;
  /** Rendered struck through by the client. */
  deprecated?: boolean;
}

/** Everything a completion request may consult beyond the document itself. */
export interface CompletionOptions {
  /** Discovered components, schema and samples for the document's project. */
  readonly projectContext?: ProjectLspContext | null;
  /** Effective settings; `completion.snippets` is honoured here. */
  readonly config?: LspConfig;
  /** Helper definitions loaded from `completion.helpersDefinitionPath`. */
  readonly helpers?: readonly HelperDefinition[];
}

/**
 * Determine the completion context at a given offset.
 *
 * @param doc - A document whose text and scope are the same version
 * @param offset - Cursor offset
 */
export function getCompletionContext(
  doc: BladeDocument,
  offset: number
): CompletionContext {
  const resolved = resolveContext(doc, offset);
  const wantsScope =
    resolved.kind === 'expression' || resolved.kind === 'expression-path';

  return {
    document: doc,
    position: positionOfOffset(doc, resolved.offset),
    offset: resolved.offset,
    contextKind: resolved.kind,
    scopeVariables: wantsScope
      ? getVariablesAtOffset(doc.scope, resolved.offset)
      : EMPTY_VARIABLES,
    partialToken: resolved.partialToken,
    basePath: basePathOf(resolved.path?.basePath, resolved.partialToken),
    tagName: resolved.tagName,
    sigil:
      doc.content[resolved.offset - resolved.partialToken.length - 1] === '$',
  };
}

const EMPTY_VARIABLES: readonly ScopeVariable[] = [];

/**
 * The object path a path completion should drill into.
 *
 * `items[0].` normalises to `items[]`, `$user.address.na` (with `na` typed) to
 * `user.address`.
 */
function basePathOf(
  basePath: string | undefined,
  partialToken: string
): string | undefined {
  if (basePath === undefined) return undefined;
  if (partialToken && basePath.endsWith('.' + partialToken)) {
    return basePath.slice(0, -(partialToken.length + 1));
  }
  if (basePath.endsWith('.')) return basePath.slice(0, -1);
  return basePath;
}

/**
 * Get completions for a resolved context.
 *
 * @param context - The completion context, from {@link getCompletionContext}
 * @param options - Project context, settings and loaded helper definitions
 */
export function getCompletions(
  context: CompletionContext,
  options: CompletionOptions = {}
): CompletionItem[] {
  const config = options.config ?? DEFAULT_LSP_CONFIG;
  const projectContext = options.projectContext ?? undefined;

  switch (context.contextKind) {
    case 'expression':
      return getExpressionCompletions(context, projectContext, options.helpers);

    case 'expression-path':
      // Drilling into an object: only the schema knows what is in there.
      return getPathCompletions(context, projectContext);

    case 'directive':
      return getDirectiveCompletions(config);

    case 'directive-argument':
      // `@props(...)` and `<template:Name ...>` both declare names that must
      // exist in the schema.
      return getSchemaNameCompletions(context, projectContext);

    case 'html-tag':
      return getHtmlTagCompletions(projectContext);

    case 'html-attribute':
      return getHtmlAttributeCompletions();

    case 'component-prop':
      return getComponentPropCompletions(context, projectContext);

    case 'html-attribute-value':
    case 'slot-name':
    case 'text':
      return [];
  }
}

/**
 * Get expression-related completions
 */
function getExpressionCompletions(
  context: CompletionContext,
  projectContext: ProjectLspContext | undefined,
  helpers: readonly HelperDefinition[] | undefined
): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const variable of context.scopeVariables) {
    items.push({
      label: variable.name,
      kind: CompletionItemKind.Variable,
      detail: getVariableKindLabel(variable.kind),
      sortText: '0' + variable.name, // Variables first
    });
  }

  if (projectContext?.schema) {
    items.push(...getSchemaBasedCompletions(context, projectContext));
  }

  items.push(...getBuiltinHelperCompletions());
  items.push(...getConfiguredHelperCompletions(helpers));

  return context.sigil ? items.map(withSigil) : items;
}

/**
 * Get completions for path expressions (drilling into objects/arrays)
 * Only returns schema properties, no variables or helpers
 */
function getPathCompletions(
  context: CompletionContext,
  projectContext: ProjectLspContext | undefined
): CompletionItem[] {
  if (!projectContext?.schema || context.basePath === undefined) {
    return [];
  }

  const items: CompletionItem[] = [];
  const partialToken = context.partialToken ?? '';

  for (const prop of getSchemaCompletions(
    projectContext.schema,
    context.basePath
  )) {
    const pathParts = prop.path.split('.');
    const propName = pathParts[pathParts.length - 1] || prop.path;

    if (!matchesPartial(propName, partialToken)) continue;

    items.push(schemaItem(propName, prop));
  }

  return items;
}

/**
 * Get schema-based completions for top-level variables (used in expression context)
 */
function getSchemaBasedCompletions(
  context: CompletionContext,
  projectContext: ProjectLspContext
): CompletionItem[] {
  if (!projectContext.schema) {
    return [];
  }

  const items: CompletionItem[] = [];
  const partialToken = context.partialToken ?? '';

  for (const prop of getSchemaCompletions(projectContext.schema, '')) {
    if (!matchesPartial(prop.path, partialToken)) continue;
    items.push(schemaItem(prop.path, prop));
  }

  return items;
}

function schemaItem(
  label: string,
  prop: {
    type: string;
    description?: string;
    hasChildren: boolean;
  }
): CompletionItem {
  return {
    label,
    kind: prop.hasChildren
      ? CompletionItemKind.Module
      : CompletionItemKind.Property,
    detail: `${prop.type}${prop.description ? ' - ' + prop.description : ''}`,
    documentation: prop.description,
    sortText: '0' + label,
  };
}

/**
 * Re-attach the `$` the user has already typed.
 *
 * The client computes its replacement range from the word under the cursor,
 * and a `$` is part of that word, so an item that does not carry it is
 * filtered out and inserted over the sigil.
 */
function withSigil(item: CompletionItem): CompletionItem {
  return {
    ...item,
    insertText: `$${item.insertText ?? item.label}`,
    filterText: `$${item.filterText ?? item.label}`,
  };
}

function matchesPartial(candidate: string, partialToken: string): boolean {
  if (!partialToken) return true;
  return candidate.toLowerCase().startsWith(partialToken.toLowerCase());
}

/** One directive offer, with and without its snippet body. */
interface DirectiveTemplate {
  readonly label: string;
  readonly detail: string;
  readonly snippet: string;
  readonly plain: string;
  readonly sortText: string;
}

const DIRECTIVES: readonly DirectiveTemplate[] = [
  {
    label: 'if',
    detail: 'Conditional block',
    snippet: 'if(${1:condition}) {\n\t$0\n}',
    plain: 'if',
    sortText: '0if',
  },
  {
    label: 'else if',
    detail: 'Else-if branch',
    snippet: 'else if(${1:condition}) {\n\t$0\n}',
    plain: 'else if',
    sortText: '0elseif',
  },
  {
    label: 'else',
    detail: 'Else branch',
    snippet: 'else {\n\t$0\n}',
    plain: 'else',
    sortText: '0else',
  },
  {
    label: 'for',
    detail: 'Loop block',
    snippet: 'for(${1:item} of ${2:items}) {\n\t$0\n}',
    plain: 'for',
    sortText: '0for',
  },
  {
    label: 'match',
    detail: 'Pattern matching block',
    snippet:
      'match(${1:value}) {\n\twhen ${2:"case"} {\n\t\t$0\n\t}\n\t* {\n\t\t\n\t}\n}',
    plain: 'match',
    sortText: '0match',
  },
  {
    label: '@',
    detail: 'Variable declaration block',
    snippet: '@ {\n\tlet ${1:name} = ${2:value};\n}',
    plain: '@',
    sortText: '0let',
  },
  {
    label: 'component',
    detail: 'Component definition',
    snippet: 'component ${1:Name}(${2:props})',
    plain: 'component',
    sortText: '0component',
  },
  {
    label: 'props',
    detail: 'Declare component props',
    snippet: 'props(${1:\\$prop1}, ${2:\\$prop2})',
    plain: 'props',
    sortText: '0props',
  },
  {
    label: 'slot',
    detail: 'Named slot',
    snippet: 'slot ${1:name}',
    plain: 'slot',
    sortText: '0slot',
  },
];

/**
 * Get directive completions.
 *
 * `completion.snippets` is a contributed setting, and snippets used to be
 * emitted unconditionally regardless of it.
 */
function getDirectiveCompletions(config: LspConfig): CompletionItem[] {
  const snippets = config.completion.snippets;
  return DIRECTIVES.map(directive => ({
    label: directive.label,
    kind: snippets ? CompletionItemKind.Snippet : CompletionItemKind.Keyword,
    detail: directive.detail,
    insertText: snippets ? directive.snippet : directive.plain,
    insertTextFormat: snippets ? (2 as const) : (1 as const),
    sortText: directive.sortText,
  }));
}

/**
 * Names that must exist in the schema: `@props(...)` arguments and the props a
 * `<template:Name ...>` declares.
 */
function getSchemaNameCompletions(
  context: CompletionContext,
  projectContext: ProjectLspContext | undefined
): CompletionItem[] {
  if (!projectContext?.schema) {
    return [];
  }

  const partialToken = context.partialToken ?? '';
  const items: CompletionItem[] = [];

  for (const prop of getSchemaCompletions(projectContext.schema, '')) {
    if (!matchesPartial(prop.path, partialToken)) continue;
    items.push({
      label: prop.path,
      kind: CompletionItemKind.Variable,
      detail: `${prop.type} - from schema`,
      documentation: prop.description,
      insertText: prop.path,
      sortText: '0' + prop.path,
    });
  }

  return items;
}

/**
 * Get HTML tag completions
 */
function getHtmlTagCompletions(
  projectContext: ProjectLspContext | undefined
): CompletionItem[] {
  const items: CompletionItem[] = [];

  if (projectContext) {
    for (const [name] of projectContext.components) {
      items.push({
        label: name,
        kind: CompletionItemKind.Class,
        detail: 'Component',
        sortText: '0' + name, // Components first
      });
    }
  }

  items.push(
    ...COMMON_TAGS.map((t, index) => ({
      label: t.tag,
      kind: CompletionItemKind.Property,
      detail: t.detail,
      sortText: (100 + index).toString().padStart(3, '0'), // After components
    }))
  );

  return items;
}

const COMMON_TAGS: readonly { tag: string; detail: string }[] = [
  // Block elements
  { tag: 'div', detail: 'Generic container' },
  { tag: 'section', detail: 'Section element' },
  { tag: 'article', detail: 'Article element' },
  { tag: 'header', detail: 'Header element' },
  { tag: 'footer', detail: 'Footer element' },
  { tag: 'main', detail: 'Main content' },
  { tag: 'nav', detail: 'Navigation' },
  { tag: 'aside', detail: 'Sidebar content' },
  // Text elements
  { tag: 'p', detail: 'Paragraph' },
  { tag: 'span', detail: 'Inline container' },
  { tag: 'h1', detail: 'Heading 1' },
  { tag: 'h2', detail: 'Heading 2' },
  { tag: 'h3', detail: 'Heading 3' },
  { tag: 'h4', detail: 'Heading 4' },
  { tag: 'h5', detail: 'Heading 5' },
  { tag: 'h6', detail: 'Heading 6' },
  { tag: 'strong', detail: 'Bold text' },
  { tag: 'em', detail: 'Emphasized text' },
  { tag: 'a', detail: 'Anchor/link' },
  // List elements
  { tag: 'ul', detail: 'Unordered list' },
  { tag: 'ol', detail: 'Ordered list' },
  { tag: 'li', detail: 'List item' },
  // Form elements
  { tag: 'form', detail: 'Form' },
  { tag: 'input', detail: 'Input field' },
  { tag: 'button', detail: 'Button' },
  { tag: 'select', detail: 'Select dropdown' },
  { tag: 'option', detail: 'Select option' },
  { tag: 'textarea', detail: 'Text area' },
  { tag: 'label', detail: 'Form label' },
  // Table elements
  { tag: 'table', detail: 'Table' },
  { tag: 'thead', detail: 'Table header' },
  { tag: 'tbody', detail: 'Table body' },
  { tag: 'tr', detail: 'Table row' },
  { tag: 'th', detail: 'Table header cell' },
  { tag: 'td', detail: 'Table data cell' },
  // Media elements
  { tag: 'img', detail: 'Image' },
  { tag: 'video', detail: 'Video' },
  { tag: 'audio', detail: 'Audio' },
  // Other
  { tag: 'br', detail: 'Line break' },
  { tag: 'hr', detail: 'Horizontal rule' },
  { tag: 'script', detail: 'Script' },
  { tag: 'style', detail: 'Style' },
  { tag: 'link', detail: 'Link' },
  { tag: 'meta', detail: 'Meta' },
];

const GLOBAL_ATTRIBUTES: readonly { attr: string; detail: string }[] = [
  { attr: 'class', detail: 'CSS class names' },
  { attr: 'id', detail: 'Unique identifier' },
  { attr: 'style', detail: 'Inline styles' },
  { attr: 'title', detail: 'Tooltip text' },
  { attr: 'data-', detail: 'Custom data attribute' },
  { attr: 'aria-', detail: 'Accessibility attribute' },
  { attr: 'role', detail: 'ARIA role' },
  { attr: 'tabindex', detail: 'Tab order' },
  { attr: 'hidden', detail: 'Hide element' },
  { attr: 'lang', detail: 'Language' },
  { attr: 'dir', detail: 'Text direction' },
];

const EVENT_ATTRIBUTES: readonly string[] = [
  'onclick',
  'onchange',
  'onsubmit',
  'oninput',
  'onkeydown',
  'onkeyup',
  'onfocus',
  'onblur',
];

/**
 * Get HTML attribute completions
 */
function getHtmlAttributeCompletions(): CompletionItem[] {
  const items: CompletionItem[] = GLOBAL_ATTRIBUTES.map((a, index) => ({
    label: a.attr,
    kind: CompletionItemKind.Property,
    detail: a.detail,
    sortText: index.toString().padStart(3, '0'),
  }));

  for (const event of EVENT_ATTRIBUTES) {
    items.push({
      label: event,
      kind: CompletionItemKind.Event,
      detail: 'Event handler',
    });
  }

  items.push({
    label: 'href',
    kind: CompletionItemKind.Property,
    detail: 'Hyperlink reference',
  });

  items.push({
    label: 'src',
    kind: CompletionItemKind.Property,
    detail: 'Source URL',
  });

  return items;
}

/**
 * Get component prop completions
 */
function getComponentPropCompletions(
  context: CompletionContext,
  projectContext: ProjectLspContext | undefined
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const tagName = context.tagName;

  // A component defined in this very document is the nearest definition.
  const local = tagName
    ? context.document.scope.components.find(c => c.name === tagName)
    : undefined;
  if (local) {
    for (const prop of local.props) {
      items.push(propItem(prop.name, prop.required));
    }
  } else if (tagName && projectContext) {
    const componentInfo = projectContext.components.get(tagName);
    for (const prop of componentInfo?.props ?? []) {
      items.push(propItem(prop.name, prop.required));
    }
  }

  items.push({
    label: 'key',
    kind: CompletionItemKind.Property,
    detail: 'Unique key for lists',
    sortText: '2key',
  });

  return items;
}

function propItem(name: string, required: boolean): CompletionItem {
  return {
    label: name,
    kind: CompletionItemKind.Property,
    detail: required ? 'required' : 'optional',
    sortText: required ? '0' + name : '1' + name,
  };
}

/**
 * Builtin helper completions, from the metadata registry.
 *
 * Built once: the registry is a constant, and rebuilding ninety items with
 * their formatted documentation on every keystroke is pure waste.
 */
const BUILTIN_HELPER_COMPLETIONS: readonly CompletionItem[] = Object.values(
  helperMetadata
).map(h => ({
  label: h.name,
  kind: CompletionItemKind.Function,
  detail: h.signature,
  documentation: `${h.description}\n\nExamples:\n${h.examples.map(e => `  ${e}`).join('\n')}`,
  sortText: '1' + h.name, // After variables
}));

function getBuiltinHelperCompletions(): readonly CompletionItem[] {
  return BUILTIN_HELPER_COMPLETIONS;
}

/**
 * Helpers declared by `completion.helpersDefinitionPath`.
 *
 * The setting was contributed and the file was never read, so a project that
 * ships its own helpers got no completion for any of them.
 */
function getConfiguredHelperCompletions(
  helpers: readonly HelperDefinition[] | undefined
): CompletionItem[] {
  if (!helpers || helpers.length === 0) return [];
  return helpers.map(helper => ({
    label: helper.name,
    kind: CompletionItemKind.Function,
    detail: helper.signature,
    documentation: helper.deprecated
      ? `**Deprecated.** ${helper.deprecatedMessage ?? ''}\n\n${helper.description ?? ''}`.trim()
      : helper.description,
    sortText: '1' + helper.name,
    deprecated: helper.deprecated === true,
  }));
}

/**
 * Get variable kind label
 */
function getVariableKindLabel(kind: ScopeVariable['kind']): string {
  switch (kind) {
    case 'let':
      return 'Local variable';
    case 'for-item':
      return 'Loop item';
    case 'for-index':
      return 'Loop index';
    case 'for-key':
      return 'Loop key';
    case 'prop':
      return 'Component prop';
    case 'data':
      return 'Data variable';
    case 'global':
      return 'Global variable';
  }
}
