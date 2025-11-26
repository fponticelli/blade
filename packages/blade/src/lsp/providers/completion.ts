/**
 * Completion Provider for Blade Language Server
 * Provides context-aware autocompletion for expressions, directives, and HTML
 */

import type {
  BladeDocument,
  DocumentScope,
  CompletionContext,
  ScopeVariable,
} from '../types.js';
import {
  isInsideExpression,
  isAfterDirective,
  isInsideTag,
  getPathAtOffset,
} from '../document.js';

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
}

/**
 * Determine the completion context at a given offset
 */
export function getCompletionContext(
  doc: BladeDocument,
  offset: number
): CompletionContext {
  const content = doc.content;
  const position = offsetToPosition(content, offset);

  // Check for expression context
  if (isInsideExpression(content, offset)) {
    // Check if we're after a dot (path completion)
    const pathInfo = getPathAtOffset(content, offset);
    if (pathInfo && pathInfo.path.includes('.')) {
      return {
        document: doc,
        position,
        contextKind: 'expression-path',
        scopeVariables: getVariablesAtOffset(doc.scope, offset),
        partialToken: pathInfo.path.split('.').pop() || '',
      };
    }
    return {
      document: doc,
      position,
      contextKind: 'expression',
      scopeVariables: getVariablesAtOffset(doc.scope, offset),
      partialToken: getPartialToken(content, offset),
    };
  }

  // Check for directive context
  if (isAfterDirective(content, offset)) {
    return {
      document: doc,
      position,
      contextKind: 'directive',
      scopeVariables: [],
      partialToken: getPartialToken(content, offset),
    };
  }

  // Check for tag context
  const tagInfo = isInsideTag(content, offset);
  if (tagInfo) {
    // Check if it's a component (PascalCase)
    if (/^[A-Z]/.test(tagInfo.tagName)) {
      if (tagInfo.inAttribute) {
        return {
          document: doc,
          position,
          contextKind: 'component-prop',
          scopeVariables: [],
          partialToken: getPartialToken(content, offset),
        };
      }
    }

    if (tagInfo.inAttribute) {
      return {
        document: doc,
        position,
        contextKind: 'html-attribute',
        scopeVariables: [],
        partialToken: getPartialToken(content, offset),
      };
    }
  }

  // Check if we just typed < (start of tag)
  const charBefore = content[offset - 1];
  if (charBefore === '<') {
    return {
      document: doc,
      position,
      contextKind: 'html-tag',
      scopeVariables: [],
      partialToken: '',
    };
  }

  // Check if we just typed @ (start of directive)
  if (charBefore === '@') {
    return {
      document: doc,
      position,
      contextKind: 'directive',
      scopeVariables: [],
      partialToken: '',
    };
  }

  // Default to text context
  return {
    document: doc,
    position,
    contextKind: 'text',
    scopeVariables: [],
    partialToken: '',
  };
}

/**
 * Get completions based on context
 */
export function getCompletions(
  context: CompletionContext,
  scope: DocumentScope
): CompletionItem[] {
  const items: CompletionItem[] = [];

  switch (context.contextKind) {
    case 'expression':
    case 'expression-path':
      items.push(...getExpressionCompletions(context, scope));
      break;

    case 'directive':
      items.push(...getDirectiveCompletions());
      break;

    case 'html-tag':
      items.push(...getHtmlTagCompletions());
      break;

    case 'html-attribute':
      items.push(...getHtmlAttributeCompletions(context));
      break;

    case 'component-prop':
      items.push(...getComponentPropCompletions(context));
      break;

    case 'text':
      // No completions in plain text
      break;
  }

  return items;
}

/**
 * Get expression-related completions
 */
function getExpressionCompletions(
  _context: CompletionContext,
  scope: DocumentScope
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Add scope variables
  const variables = getVariablesAtOffset(scope, 0); // Get all variables for now
  for (const variable of variables) {
    items.push({
      label: variable.name,
      kind: CompletionItemKind.Variable,
      detail: getVariableKindLabel(variable.kind),
      sortText: '0' + variable.name, // Variables first
    });
  }

  // Add common helpers (would come from configuration)
  items.push(...getBuiltinHelperCompletions());

  return items;
}

/**
 * Get directive completions
 */
function getDirectiveCompletions(): CompletionItem[] {
  return [
    {
      label: '@if',
      kind: CompletionItemKind.Keyword,
      detail: 'Conditional block',
      insertText: '@if(${1:condition}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0if',
    },
    {
      label: '@else if',
      kind: CompletionItemKind.Keyword,
      detail: 'Else-if branch',
      insertText: '@else if(${1:condition}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0elseif',
    },
    {
      label: '@else',
      kind: CompletionItemKind.Keyword,
      detail: 'Else branch',
      insertText: '@else {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0else',
    },
    {
      label: '@for',
      kind: CompletionItemKind.Keyword,
      detail: 'Loop block',
      insertText: '@for(${1:item} of ${2:items}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0for',
    },
    {
      label: '@match',
      kind: CompletionItemKind.Keyword,
      detail: 'Pattern matching block',
      insertText:
        '@match(${1:value}) {\n\twhen ${2:"case"} {\n\t\t$0\n\t}\n\t* {\n\t\t\n\t}\n}',
      insertTextFormat: 2,
      sortText: '0match',
    },
    {
      label: '@@',
      kind: CompletionItemKind.Keyword,
      detail: 'Variable declaration block',
      insertText: '@@ {\n\tlet ${1:name} = ${2:value};\n}',
      insertTextFormat: 2,
      sortText: '0let',
    },
    {
      label: '@component',
      kind: CompletionItemKind.Keyword,
      detail: 'Component definition',
      insertText: '@component ${1:Name}(${2:props})',
      insertTextFormat: 2,
      sortText: '0component',
    },
    {
      label: '@end',
      kind: CompletionItemKind.Keyword,
      detail: 'End block',
      sortText: '0end',
    },
  ];
}

/**
 * Get HTML tag completions
 */
function getHtmlTagCompletions(): CompletionItem[] {
  const commonTags = [
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

  return commonTags.map((t, index) => ({
    label: t.tag,
    kind: CompletionItemKind.Property,
    detail: t.detail,
    sortText: index.toString().padStart(3, '0'),
  }));
}

/**
 * Get HTML attribute completions
 */
function getHtmlAttributeCompletions(
  _context: CompletionContext
): CompletionItem[] {
  const globalAttributes = [
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

  // Add tag-specific attributes based on context
  // For now, return global attributes
  const items: CompletionItem[] = globalAttributes.map((a, index) => ({
    label: a.attr,
    kind: CompletionItemKind.Property,
    detail: a.detail,
    sortText: index.toString().padStart(3, '0'),
  }));

  // Add common event handlers
  const events = [
    'onclick',
    'onchange',
    'onsubmit',
    'oninput',
    'onkeydown',
    'onkeyup',
    'onfocus',
    'onblur',
  ];
  for (const event of events) {
    items.push({
      label: event,
      kind: CompletionItemKind.Event,
      detail: 'Event handler',
    });
  }

  // Add href for links
  items.push({
    label: 'href',
    kind: CompletionItemKind.Property,
    detail: 'Hyperlink reference',
  });

  // Add src for images
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
  _context: CompletionContext
): CompletionItem[] {
  // This would look up the component definition to get its props
  // For now, return generic prop suggestions
  return [
    {
      label: 'key',
      kind: CompletionItemKind.Property,
      detail: 'Unique key for lists',
    },
  ];
}

/**
 * Get builtin helper function completions
 */
function getBuiltinHelperCompletions(): CompletionItem[] {
  const helpers = [
    {
      name: 'formatCurrency',
      sig: '(value: number, currency?: string) => string',
      detail: 'Format number as currency',
    },
    {
      name: 'formatDate',
      sig: '(date: Date | string, format?: string) => string',
      detail: 'Format date',
    },
    {
      name: 'formatNumber',
      sig: '(value: number, options?: object) => string',
      detail: 'Format number',
    },
    {
      name: 'uppercase',
      sig: '(value: string) => string',
      detail: 'Convert to uppercase',
    },
    {
      name: 'lowercase',
      sig: '(value: string) => string',
      detail: 'Convert to lowercase',
    },
    {
      name: 'capitalize',
      sig: '(value: string) => string',
      detail: 'Capitalize first letter',
    },
    {
      name: 'truncate',
      sig: '(value: string, length: number) => string',
      detail: 'Truncate string',
    },
    {
      name: 'sum',
      sig: '(values: number[]) => number',
      detail: 'Sum array of numbers',
    },
    {
      name: 'avg',
      sig: '(values: number[]) => number',
      detail: 'Average of numbers',
    },
    {
      name: 'count',
      sig: '(values: any[]) => number',
      detail: 'Count array items',
    },
    {
      name: 'join',
      sig: '(values: any[], separator?: string) => string',
      detail: 'Join array items',
    },
  ];

  return helpers.map(h => ({
    label: h.name,
    kind: CompletionItemKind.Function,
    detail: h.sig,
    documentation: h.detail,
    sortText: '1' + h.name, // After variables
  }));
}

/**
 * Get variables available at a given offset
 */
function getVariablesAtOffset(
  scope: DocumentScope,
  _offset: number
): ScopeVariable[] {
  // The scope.variables is a Map<number, ScopeVariable[]>
  // For now, collect all variables (a more sophisticated implementation
  // would only return variables visible at the given offset)
  const allVariables: ScopeVariable[] = [];
  const seenNames = new Set<string>();

  for (const [, vars] of scope.variables) {
    for (const v of vars) {
      if (!seenNames.has(v.name)) {
        seenNames.add(v.name);
        allVariables.push(v);
      }
    }
  }

  return allVariables;
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

/**
 * Convert offset to position
 */
function offsetToPosition(
  content: string,
  offset: number
): { line: number; character: number } {
  const lines = content.slice(0, offset).split('\n');
  return {
    line: lines.length - 1,
    character: (lines[lines.length - 1] ?? '').length,
  };
}

/**
 * Get the partial token being typed at offset
 */
function getPartialToken(content: string, offset: number): string {
  let start = offset;

  // Go backward to find token start
  while (start > 0 && /[\w$]/.test(content[start - 1] ?? '')) {
    start--;
  }

  return content.slice(start, offset);
}
