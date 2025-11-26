/**
 * Hover Provider for Blade Language Server
 * Provides hover information for variables, components, and helpers
 */

import type {
  BladeDocument,
  DocumentScope,
  ScopeVariable,
  Position,
} from '../types.js';
import {
  isInsideExpression,
  isAfterDirective,
  getWordAtOffset,
  getOffset,
} from '../document.js';

/**
 * Hover information result
 */
export interface HoverInfo {
  contents: string;
  range?: {
    start: Position;
    end: Position;
  };
}

/**
 * Get hover information for the symbol at the given position
 */
export function getHoverInfo(
  doc: BladeDocument,
  position: Position
): HoverInfo | null {
  const offset = getOffset(doc.content, position.line, position.character);
  const wordInfo = getWordAtOffset(doc.content, offset);

  if (!wordInfo) {
    return null;
  }

  // Check for directive hover
  if (isAfterDirective(doc.content, offset)) {
    return getDirectiveHover(wordInfo.word);
  }

  // Check for expression hover
  if (isInsideExpression(doc.content, offset)) {
    return getExpressionHover(doc.scope, wordInfo.word);
  }

  // Check for component hover
  if (/^[A-Z]/.test(wordInfo.word)) {
    return getComponentHover(doc, wordInfo.word);
  }

  return null;
}

/**
 * Get hover information for a directive
 */
function getDirectiveHover(directive: string): HoverInfo | null {
  const directives: Record<string, { syntax: string; description: string }> = {
    if: {
      syntax: '@if(condition) { ... }',
      description:
        'Conditional rendering. Content is displayed only if the condition is truthy.',
    },
    else: {
      syntax: '@else { ... }',
      description:
        'Else branch. Rendered when the preceding @if condition is falsy.',
    },
    for: {
      syntax: '@for(item of items) { ... }\n@for(item, index of items) { ... }',
      description:
        'Loop iteration. Iterates over an array or object, rendering content for each item.',
    },
    match: {
      syntax: '@match(value) { when "case" { ... } * { ... } }',
      description: 'Pattern matching. Matches a value against multiple cases.',
    },
    '@': {
      syntax: '@@ { let name = value; }',
      description:
        'Variable declaration block. Declares local variables within the template.',
    },
    component: {
      syntax: '@component Name(prop1, prop2)',
      description:
        'Component definition. Defines a reusable template component.',
    },
  };

  const info = directives[directive];
  if (info) {
    return {
      contents: `**@${directive}**\n\n\`\`\`blade\n${info.syntax}\n\`\`\`\n\n${info.description}`,
    };
  }

  return null;
}

/**
 * Get hover information for an expression symbol
 */
function getExpressionHover(
  scope: DocumentScope,
  name: string
): HoverInfo | null {
  // Check for variable
  const variable = findVariableByName(scope, name);
  if (variable) {
    return {
      contents: formatVariableHover(variable),
    };
  }

  // Check for builtin helper
  const helperHover = getHelperHover(name);
  if (helperHover) {
    return helperHover;
  }

  return null;
}

/**
 * Get hover information for a component
 */
function getComponentHover(
  doc: BladeDocument,
  componentName: string
): HoverInfo | null {
  const componentDef = doc.components.get(componentName);
  if (!componentDef) {
    return null;
  }

  const props = componentDef.props
    .map(p => {
      const required = p.required ? ' (required)' : '';
      const defaultVal = p.defaultValue
        ? ` = ${typeof p.defaultValue === 'string' ? `"${p.defaultValue}"` : 'expr'}`
        : '';
      return `  ${p.name}${required}${defaultVal}`;
    })
    .join('\n');

  return {
    contents: `**Component ${componentName}**\n\n\`\`\`blade\n<${componentName}\n${props || '  // no props'}\n/>\n\`\`\``,
  };
}

/**
 * Get hover information for a builtin helper
 */
function getHelperHover(name: string): HoverInfo | null {
  const helpers: Record<string, { signature: string; description: string }> = {
    formatCurrency: {
      signature: 'formatCurrency(value: number, currency?: string): string',
      description: 'Formats a number as currency.',
    },
    formatDate: {
      signature: 'formatDate(date: Date | string, format?: string): string',
      description: 'Formats a date according to the specified format.',
    },
    formatNumber: {
      signature: 'formatNumber(value: number, options?: object): string',
      description: 'Formats a number with locale-specific formatting.',
    },
    uppercase: {
      signature: 'uppercase(value: string): string',
      description: 'Converts a string to uppercase.',
    },
    lowercase: {
      signature: 'lowercase(value: string): string',
      description: 'Converts a string to lowercase.',
    },
    capitalize: {
      signature: 'capitalize(value: string): string',
      description: 'Capitalizes the first letter of a string.',
    },
    truncate: {
      signature: 'truncate(value: string, length: number): string',
      description: 'Truncates a string to the specified length.',
    },
    sum: {
      signature: 'sum(values: number[]): number',
      description: 'Returns the sum of an array of numbers.',
    },
    avg: {
      signature: 'avg(values: number[]): number',
      description: 'Returns the average of an array of numbers.',
    },
    count: {
      signature: 'count(values: any[]): number',
      description: 'Returns the count of items in an array.',
    },
    join: {
      signature: 'join(values: any[], separator?: string): string',
      description: 'Joins array elements into a string.',
    },
  };

  const helper = helpers[name];
  if (helper) {
    return {
      contents: `**${name}**\n\n\`\`\`typescript\n${helper.signature}\n\`\`\`\n\n${helper.description}`,
    };
  }

  return null;
}

/**
 * Format variable information for hover
 */
function formatVariableHover(variable: ScopeVariable): string {
  const kindLabel = getVariableKindLabel(variable.kind);
  const typeInfo = variable.valueType ? `: ${variable.valueType}` : '';

  return `**${variable.name}**${typeInfo}\n\n*${kindLabel}*`;
}

/**
 * Get human-readable label for variable kind
 */
function getVariableKindLabel(kind: ScopeVariable['kind']): string {
  switch (kind) {
    case 'let':
      return 'Local variable (declared with @@ { let ... })';
    case 'for-item':
      return 'Loop item variable (from @for)';
    case 'for-index':
      return 'Loop index variable (from @for)';
    case 'for-key':
      return 'Loop key variable (from @for ... in)';
    case 'prop':
      return 'Component prop';
    case 'data':
      return 'Data context variable';
    case 'global':
      return 'Global variable ($.xxx)';
  }
}

/**
 * Find a variable by name in the scope
 */
function findVariableByName(
  scope: DocumentScope,
  name: string
): ScopeVariable | null {
  for (const [, variables] of scope.variables) {
    for (const v of variables) {
      if (v.name === name) {
        return v;
      }
    }
  }
  return null;
}
