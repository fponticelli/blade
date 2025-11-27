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
import type { ProjectLspContext } from '../project-context.js';
import {
  isInsideExpression,
  isAfterDirective,
  isInsideTag,
  getPathAtOffset,
  getOffset,
} from '../document.js';
import { getVariablesAtOffset } from '../analyzer/scope.js';
import { getSchemaCompletions } from '../../project/schema.js';
import { helperMetadata } from '../../helpers/metadata.js';

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
    // Check if we're after a dot (path completion) or array access
    const pathInfo = getPathAtOffset(content, offset);
    // Trigger path completion if:
    // - path contains a dot (e.g., "user.name")
    // - path ends with array access followed by dot (e.g., "items[0].")
    const isPathContext =
      pathInfo &&
      (pathInfo.path.includes('.') ||
        /\[\d*\]\.$/.test(pathInfo.path) ||
        /\[\d*\]$/.test(pathInfo.path));
    if (isPathContext) {
      // Extract the partial token - everything after the last dot
      const lastDotIndex = pathInfo.path.lastIndexOf('.');
      const partialToken =
        lastDotIndex >= 0 ? pathInfo.path.slice(lastDotIndex + 1) : '';
      return {
        document: doc,
        position,
        contextKind: 'expression-path',
        scopeVariables: getVariablesAtOffset(doc.scope, offset),
        partialToken,
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

  // Check if we just typed $ (start of simple expression like $title)
  if (charBefore === '$') {
    return {
      document: doc,
      position,
      contextKind: 'expression',
      scopeVariables: getVariablesAtOffset(doc.scope, offset),
      partialToken: '',
    };
  }

  // Check if we're inside @props() arguments
  if (isInsidePropsDirective(content, offset)) {
    return {
      document: doc,
      position,
      contextKind: 'directive-argument',
      scopeVariables: [],
      partialToken: getPartialToken(content, offset),
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
 *
 * @param context - The completion context
 * @param scope - Document scope with variables
 * @param projectContext - Optional project context for schema-based completions
 */
export function getCompletions(
  context: CompletionContext,
  scope: DocumentScope,
  projectContext?: ProjectLspContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  switch (context.contextKind) {
    case 'expression':
      items.push(...getExpressionCompletions(context, scope, projectContext));
      break;

    case 'expression-path':
      // For path completions (drilling into objects), only show schema properties
      items.push(...getPathCompletions(context, projectContext));
      break;

    case 'directive':
      items.push(...getDirectiveCompletions(projectContext));
      break;

    case 'directive-argument':
      // Inside @props() or other directive arguments
      items.push(...getDirectiveArgumentCompletions(context, projectContext));
      break;

    case 'html-tag':
      items.push(...getHtmlTagCompletions(projectContext));
      break;

    case 'html-attribute':
      items.push(...getHtmlAttributeCompletions(context));
      break;

    case 'component-prop':
      items.push(...getComponentPropCompletions(context, projectContext));
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
  context: CompletionContext,
  scope: DocumentScope,
  projectContext?: ProjectLspContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Calculate offset from position for proper scope lookup
  const offset = getOffset(
    context.document.content,
    context.position.line,
    context.position.character
  );

  // Add scope variables at the current position
  const variables = getVariablesAtOffset(scope, offset);
  for (const variable of variables) {
    items.push({
      label: variable.name,
      kind: CompletionItemKind.Variable,
      detail: getVariableKindLabel(variable.kind),
      sortText: '0' + variable.name, // Variables first
    });
  }

  // Add schema-based completions if available
  if (projectContext?.schema) {
    const schemaItems = getSchemaBasedCompletions(context, projectContext);
    items.push(...schemaItems);
  }

  // Add common helpers (would come from configuration)
  items.push(...getBuiltinHelperCompletions());

  return items;
}

/**
 * Get completions for path expressions (drilling into objects/arrays)
 * Only returns schema properties, no variables or helpers
 */
function getPathCompletions(
  context: CompletionContext,
  projectContext?: ProjectLspContext
): CompletionItem[] {
  if (!projectContext?.schema) {
    return [];
  }

  const items: CompletionItem[] = [];
  const partialToken = context.partialToken || '';

  // Extract the base path from the full path expression
  const content = context.document.content;
  const offset = getOffset(
    content,
    context.position.line,
    context.position.character
  );
  const pathInfo = getPathAtOffset(content, offset);

  if (!pathInfo) {
    return [];
  }

  // Use the normalized basePath which converts array indices to []
  // e.g., "items[0]." -> "items[]"
  // e.g., "$user.address." -> "user.address"
  let basePath = pathInfo.basePath;

  // Remove the partial token from the end if present
  if (partialToken && basePath.endsWith('.' + partialToken)) {
    basePath = basePath.slice(0, -(partialToken.length + 1));
  } else if (basePath.endsWith('.')) {
    basePath = basePath.slice(0, -1);
  }

  // Get completions from schema for this path
  const schemaCompletions = getSchemaCompletions(
    projectContext.schema,
    basePath
  );

  for (const prop of schemaCompletions) {
    // Extract just the property name (last part of the path)
    const pathParts = prop.path.split('.');
    const propName = pathParts[pathParts.length - 1] || prop.path;

    // Skip if it doesn't match partial token
    if (
      partialToken &&
      !propName.toLowerCase().startsWith(partialToken.toLowerCase())
    ) {
      continue;
    }

    items.push({
      label: propName,
      kind: prop.hasChildren
        ? CompletionItemKind.Module
        : CompletionItemKind.Property,
      detail: `${prop.type}${prop.description ? ' - ' + prop.description : ''}`,
      documentation: prop.description,
      sortText: '0' + propName,
    });
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
  const partialToken = context.partialToken || '';

  // For regular expression context, only return top-level schema properties
  const schemaCompletions = getSchemaCompletions(projectContext.schema, '');

  for (const prop of schemaCompletions) {
    const propName = prop.path;

    // Skip if it doesn't match partial token
    if (
      partialToken &&
      !propName.toLowerCase().startsWith(partialToken.toLowerCase())
    ) {
      continue;
    }

    items.push({
      label: propName,
      kind: prop.hasChildren
        ? CompletionItemKind.Module
        : CompletionItemKind.Property,
      detail: `${prop.type}${prop.description ? ' - ' + prop.description : ''}`,
      documentation: prop.description,
      sortText: '0' + propName,
    });
  }

  return items;
}

/**
 * Get directive completions
 */
function getDirectiveCompletions(
  _projectContext?: ProjectLspContext
): CompletionItem[] {
  return [
    {
      label: 'if',
      kind: CompletionItemKind.Keyword,
      detail: 'Conditional block',
      insertText: 'if(${1:condition}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0if',
    },
    {
      label: 'else if',
      kind: CompletionItemKind.Keyword,
      detail: 'Else-if branch',
      insertText: 'else if(${1:condition}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0elseif',
    },
    {
      label: 'else',
      kind: CompletionItemKind.Keyword,
      detail: 'Else branch',
      insertText: 'else {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0else',
    },
    {
      label: 'for',
      kind: CompletionItemKind.Keyword,
      detail: 'Loop block',
      insertText: 'for(${1:item} of ${2:items}) {\n\t$0\n}',
      insertTextFormat: 2,
      sortText: '0for',
    },
    {
      label: 'match',
      kind: CompletionItemKind.Keyword,
      detail: 'Pattern matching block',
      insertText:
        'match(${1:value}) {\n\twhen ${2:"case"} {\n\t\t$0\n\t}\n\t* {\n\t\t\n\t}\n}',
      insertTextFormat: 2,
      sortText: '0match',
    },
    {
      label: '@',
      kind: CompletionItemKind.Keyword,
      detail: 'Variable declaration block',
      insertText: '@ {\n\tlet ${1:name} = ${2:value};\n}',
      insertTextFormat: 2,
      sortText: '0let',
    },
    {
      label: 'component',
      kind: CompletionItemKind.Keyword,
      detail: 'Component definition',
      insertText: 'component ${1:Name}(${2:props})',
      insertTextFormat: 2,
      sortText: '0component',
    },
    {
      label: 'props',
      kind: CompletionItemKind.Keyword,
      detail: 'Declare component props',
      insertText: 'props(${1:\\$prop1}, ${2:\\$prop2})',
      insertTextFormat: 2,
      sortText: '0props',
    },
    {
      label: 'slot',
      kind: CompletionItemKind.Keyword,
      detail: 'Named slot',
      insertText: 'slot ${1:name}',
      insertTextFormat: 2,
      sortText: '0slot',
    },
  ];
}

/**
 * Get completions for directive arguments (e.g., inside @props())
 */
function getDirectiveArgumentCompletions(
  context: CompletionContext,
  projectContext?: ProjectLspContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Check if we're inside @props()
  const content = context.document.content;
  const offset = getOffset(
    content,
    context.position.line,
    context.position.character
  );

  // Look back for @props(
  const before = content.slice(Math.max(0, offset - 50), offset);
  const propsMatch = /@props\s*\([^)]*$/.test(before);

  if (propsMatch && projectContext?.schema) {
    // Provide completions from schema for @props (no $ prefix)
    const schemaProps = getSchemaCompletions(projectContext.schema, '');
    for (const prop of schemaProps) {
      items.push({
        label: prop.path,
        kind: CompletionItemKind.Variable,
        detail: `${prop.type} - from schema`,
        documentation: prop.description,
        insertText: prop.path,
        sortText: '0' + prop.path,
      });
    }
  }

  return items;
}

/**
 * Get HTML tag completions
 */
function getHtmlTagCompletions(
  projectContext?: ProjectLspContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Add project components first
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

  // Add HTML tags after components
  items.push(
    ...commonTags.map((t, index) => ({
      label: t.tag,
      kind: CompletionItemKind.Property,
      detail: t.detail,
      sortText: (100 + index).toString().padStart(3, '0'), // After components
    }))
  );

  return items;
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
  context: CompletionContext,
  projectContext?: ProjectLspContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Try to find the component and its props
  const content = context.document.content;
  const offset = getOffset(
    content,
    context.position.line,
    context.position.character
  );

  // Look back to find the component name
  const tagInfo = isInsideTag(content, offset);
  if (tagInfo && projectContext) {
    const componentInfo = projectContext.components.get(tagInfo.tagName);
    if (componentInfo?.props) {
      for (const prop of componentInfo.props) {
        items.push({
          label: prop.name,
          kind: CompletionItemKind.Property,
          detail: prop.required ? 'required' : 'optional',
          sortText: prop.required ? '0' + prop.name : '1' + prop.name,
        });
      }
    }
  }

  // Add generic prop suggestions
  items.push({
    label: 'key',
    kind: CompletionItemKind.Property,
    detail: 'Unique key for lists',
    sortText: '2key',
  });

  return items;
}

/**
 * Get builtin helper function completions from metadata registry
 */
function getBuiltinHelperCompletions(): CompletionItem[] {
  return Object.values(helperMetadata).map(h => ({
    label: h.name,
    kind: CompletionItemKind.Function,
    detail: h.signature,
    documentation: `${h.description}\n\nExamples:\n${h.examples.map(e => `  ${e}`).join('\n')}`,
    sortText: '1' + h.name, // After variables
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

/**
 * Check if the cursor is inside @props() directive arguments
 */
function isInsidePropsDirective(content: string, offset: number): boolean {
  // Look backward for @props( that isn't closed
  let depth = 0;

  for (let i = offset - 1; i >= 0; i--) {
    const char = content[i];

    if (char === ')') {
      depth++;
    } else if (char === '(') {
      if (depth === 0) {
        // Check if this is preceded by @props
        const before = content.slice(Math.max(0, i - 6), i);
        if (before.endsWith('@props')) {
          return true;
        }
        return false;
      }
      depth--;
    } else if (char === '\n') {
      // @props should be on a single line
      return false;
    }
  }

  return false;
}
