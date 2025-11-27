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
import type { ProjectLspContext } from '../project-context.js';
import {
  isInsideExpression,
  isAfterDirective,
  getWordAtOffset,
  getOffset,
  getPathAtOffset,
} from '../document.js';
import { getSchemaPropertyInfo } from '../../project/schema.js';
import { getSampleValues, formatSampleHint } from '../../project/samples.js';
import { getVariablesAtOffset } from '../analyzer/scope.js';
import { helperMetadata } from '../../helpers/metadata.js';

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
 *
 * @param doc - The document
 * @param position - Cursor position
 * @param projectContext - Optional project context for schema/sample info
 */
export function getHoverInfo(
  doc: BladeDocument,
  position: Position,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  const offset = getOffset(doc.content, position.line, position.character);
  const wordInfo = getWordAtOffset(doc.content, offset);

  if (!wordInfo) {
    return null;
  }

  // Check for directive hover (the directive name itself like @if, @for)
  if (isAfterDirective(doc.content, offset)) {
    return getDirectiveHover(wordInfo.word);
  }

  // Check for @props variable hover
  const propsContext = isInsidePropsDirective(doc.content, offset);
  if (propsContext) {
    return getPropsVariableHover(wordInfo.word, projectContext);
  }

  // Check for variables inside @if/@for directive parentheses
  const directiveArgContext = isInsideDirectiveArgs(doc.content, offset);
  if (directiveArgContext) {
    return getDirectiveArgHover(doc, offset, wordInfo.word, directiveArgContext, projectContext);
  }

  // Check for template definition prop hover (<template:Card title! subtitle="Default">)
  const templatePropContext = isInsideTemplateDefinition(doc.content, offset);
  if (templatePropContext) {
    return getTemplatePropHover(wordInfo.word, templatePropContext, projectContext);
  }

  // Check for expression hover - either inside ${...} or a simple $variable
  const isInExpr = isInsideExpression(doc.content, offset);
  const isSimpleVar = isSimpleVariableExpression(doc.content, offset);

  if (isInExpr || isSimpleVar) {
    return getExpressionHover(doc, offset, wordInfo.word, projectContext);
  }

  // Check for component hover
  if (/^[A-Z]/.test(wordInfo.word)) {
    return getComponentHover(doc, wordInfo.word, projectContext);
  }

  return null;
}

/**
 * Check if offset is inside a simple $variable expression (not ${...})
 * This includes both $variable and paths like $item.name (even when hovering on .name)
 */
function isSimpleVariableExpression(content: string, offset: number): boolean {
  // Look backward to find if there's a $ before the current word/path
  let i = offset - 1;

  // Skip over word characters, dots, brackets, and numbers (for paths like $item.name or $items[0].name)
  while (i >= 0 && /[\w.\[\]0-9*]/.test(content[i] ?? '')) {
    i--;
  }

  // Check if we hit a $
  return i >= 0 && content[i] === '$';
}

/**
 * Check if offset is inside @props directive
 */
function isInsidePropsDirective(content: string, offset: number): boolean {
  // Look back for @props(
  const before = content.slice(Math.max(0, offset - 100), offset);
  const match = /@props\s*\([^)]*$/.test(before);
  return match;
}

/**
 * Check if offset is inside directive arguments like @if(condition) or @for(item of items)
 * Returns the directive name and full argument content if inside, null otherwise
 */
function isInsideDirectiveArgs(content: string, offset: number): { directive: string; fullMatch: string } | null {
  // Look back for @directive(
  const before = content.slice(Math.max(0, offset - 200), offset);

  // Check if we're after an @directive( that hasn't been closed yet
  const unclosedMatch = before.match(/@(if|for|match)\s*\(([^)]*)$/);
  if (unclosedMatch) {
    // Found an unclosed directive - need to find the closing ) to get full content
    const afterCursor = content.slice(offset);
    const closingParen = afterCursor.indexOf(')');
    if (closingParen >= 0) {
      const fullContent = unclosedMatch[2]! + afterCursor.slice(0, closingParen);
      return { directive: unclosedMatch[1]!, fullMatch: fullContent };
    }
    // No closing paren found, return what we have
    return { directive: unclosedMatch[1]!, fullMatch: unclosedMatch[2]! };
  }

  // Check if cursor is on a line with a complete @directive(...) pattern
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineBeforeCursor = before.slice(lineStart);
  const afterCursor = content.slice(offset);
  const lineEnd = afterCursor.indexOf('\n');
  const lineAfterCursor = lineEnd >= 0 ? afterCursor.slice(0, lineEnd) : afterCursor;
  const fullLine = lineBeforeCursor + lineAfterCursor;

  // Find @directive(...) on this line and check if cursor is inside the parens
  const directiveMatch = fullLine.match(/@(if|for|match)\s*\(([^)]*)\)/);
  if (directiveMatch) {
    const directiveStart = fullLine.indexOf(directiveMatch[0]!);
    const argsStart = fullLine.indexOf('(', directiveStart) + 1;
    const argsEnd = fullLine.indexOf(')', argsStart);
    const cursorInLine = lineBeforeCursor.length;

    if (cursorInLine >= argsStart && cursorInLine <= argsEnd) {
      return { directive: directiveMatch[1]!, fullMatch: directiveMatch[2]! };
    }
  }

  return null;
}

/**
 * Check if offset is inside a template definition like <template:Card title! subtitle="Default">
 */
function isInsideTemplateDefinition(content: string, offset: number): { componentName: string } | null {
  // Look back for <template:Name
  const before = content.slice(Math.max(0, offset - 200), offset);
  const match = before.match(/<template:(\w+)[^>]*$/);
  if (match) {
    return { componentName: match[1]! };
  }
  return null;
}

/**
 * Get hover for a prop name inside @props()
 */
function getPropsVariableHover(
  propName: string,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  // Remove trailing ? from optional props
  const cleanName = propName.replace(/\?$/, '');

  if (projectContext?.schema) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, cleanName);
    if (schemaInfo) {
      let contents = `**${cleanName}**: \`${schemaInfo.type}\`\n\n*Component prop*`;

      if (schemaInfo.description) {
        contents += `\n\n${schemaInfo.description}`;
      }

      if (projectContext.samples) {
        const sampleValues = getSampleValues(projectContext.samples, cleanName);
        const sampleHint = formatSampleHint(sampleValues);
        if (sampleHint) {
          contents += `\n\n---\n\n${sampleHint}`;
        }
      }

      return { contents };
    }
  }

  // No schema info - just show it's a prop
  return {
    contents: `**${cleanName}**\n\n*Component prop*`,
  };
}

/**
 * Get hover for variables inside @if/@for directive arguments
 */
function getDirectiveArgHover(
  _doc: BladeDocument,
  _offset: number,
  name: string,
  context: { directive: string; fullMatch: string },
  projectContext?: ProjectLspContext
): HoverInfo | null {
  // For @for, check if this is the loop variable (item) or the source (items)
  if (context.directive === 'for') {
    // Parse @for(item, index of items) or @for(item of items)
    const forMatch = context.fullMatch.match(/^(\w+)(?:\s*,\s*(\w+))?\s+of\s+(\w+)/);
    if (forMatch) {
      const [, itemVar, indexVar, sourceVar] = forMatch;

      if (name === itemVar) {
        // This is the loop item variable - show narrowed type from schema
        if (projectContext?.schema && sourceVar) {
          const sourceInfo = getSchemaPropertyInfo(projectContext.schema, sourceVar);
          if (sourceInfo?.type === 'array') {
            // Get the item type from schema (items[].*)
            const itemSchemaPath = `${sourceVar}[]`;
            const itemProps = projectContext.schema.properties.filter(p =>
              p.path.startsWith(itemSchemaPath + '.')
            );
            if (itemProps.length > 0) {
              const propNames = itemProps.map(p => p.path.split('.').pop()).join(', ');
              return {
                contents: `**${name}**: \`object\`\n\n*Loop item from ${sourceVar}*\n\nProperties: ${propNames}`,
              };
            }
            return {
              contents: `**${name}**: \`${sourceVar}[]\` item\n\n*Loop item variable (from @for)*`,
            };
          }
        }
        return {
          contents: `**${name}**\n\n*Loop item variable (from @for)*`,
        };
      }

      if (name === indexVar) {
        return {
          contents: `**${name}**: \`number\`\n\n*Loop index variable (from @for)*`,
        };
      }

      if (name === sourceVar) {
        // This is the source array - show schema info
        const schemaHover = getSchemaVariableHover(name, projectContext);
        if (schemaHover) {
          return schemaHover;
        }
        // No schema - provide a basic fallback
        return {
          contents: `**${name}**\n\n*Source array for @for loop*`,
        };
      }
    }
  }

  // For @if, show schema info for the variable
  if (context.directive === 'if') {
    return getSchemaVariableHover(name, projectContext);
  }

  return null;
}

/**
 * Get hover for a template definition prop
 */
function getTemplatePropHover(
  propName: string,
  _context: { componentName: string },
  projectContext?: ProjectLspContext
): HoverInfo | null {
  // Remove trailing ! from required props
  const cleanName = propName.replace(/!$/, '');
  const isRequired = propName.endsWith('!');

  if (projectContext?.schema) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, cleanName);
    if (schemaInfo) {
      let contents = `**${cleanName}**: \`${schemaInfo.type}\`${isRequired ? ' (required)' : ''}\n\n*Template prop definition*`;

      if (schemaInfo.description) {
        contents += `\n\n${schemaInfo.description}`;
      }

      return { contents };
    }
  }

  return {
    contents: `**${cleanName}**${isRequired ? ' (required)' : ''}\n\n*Template prop definition*`,
  };
}

/**
 * Get hover for a variable with schema info
 */
function getSchemaVariableHover(
  name: string,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  if (projectContext?.schema) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, name);
    if (schemaInfo) {
      let contents = `**${name}**: \`${schemaInfo.type}\``;

      if (schemaInfo.description) {
        contents += `\n\n${schemaInfo.description}`;
      }

      if (projectContext.samples) {
        const sampleValues = getSampleValues(projectContext.samples, name);
        const sampleHint = formatSampleHint(sampleValues);
        if (sampleHint) {
          contents += `\n\n---\n\n${sampleHint}`;
        }
      }

      return { contents };
    }
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
    props: {
      syntax: '@props($prop1, $prop2, $prop3 = defaultValue)',
      description:
        'Declares the props that this component accepts. Props without default values are required.',
    },
    slot: {
      syntax: '@slot name',
      description:
        'Declares a named slot for content projection. Used inside component definitions.',
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
  doc: BladeDocument,
  offset: number,
  name: string,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  // Strip leading $ from variable names (scope stores them without $)
  const varName = name.startsWith('$') ? name.slice(1) : name;

  // Get the full path first for loop variable mapping
  const pathInfo = getPathAtOffset(doc.content, offset);

  // Check for variable (including loop variables) - use offset-aware lookup
  const variable = findVariableByNameAtOffset(doc.scope, varName, offset);
  if (variable) {
    // For loop item variables, provide schema-aware hover
    if (variable.kind === 'for-item' && variable.sourceVar && projectContext?.schema) {
      // Determine if we're on the variable itself ($item) vs a property path ($item.name)
      // The path might be "$item.name" but we're only hovering on "$item"
      // Check: does the basePath have a dot? If so, we need to check if offset is on first segment
      let isOnVariableOnly = !pathInfo || pathInfo.basePath === varName;

      if (pathInfo && pathInfo.basePath.includes('.')) {
        // Path has multiple segments - check if we're on the first one
        // Find position of first dot in the path
        const firstDotInPath = pathInfo.path.indexOf('.');
        if (firstDotInPath > 0) {
          // If offset is before the first dot (relative to path start), we're on the variable
          const offsetInPath = offset - pathInfo.start;
          isOnVariableOnly = offsetInPath < firstDotInPath;
        }
      }

      if (isOnVariableOnly) {
        const sourceInfo = getSchemaPropertyInfo(projectContext.schema, variable.sourceVar);
        if (sourceInfo?.type === 'array') {
          // Get the item properties from schema
          const itemSchemaPath = `${variable.sourceVar}[]`;
          const itemProps = projectContext.schema.properties.filter(p =>
            p.path.startsWith(itemSchemaPath + '.')
          );
          if (itemProps.length > 0) {
            const propNames = itemProps.map(p => p.path.split('.').pop()).join(', ');
            return {
              contents: `**${varName}**: \`object\`\n\n*Loop item from ${variable.sourceVar}*\n\nProperties: ${propNames}`,
            };
          }
          return {
            contents: `**${varName}**: \`${variable.sourceVar}[]\` item\n\n*Loop item variable (from @for)*`,
          };
        }
      }
      // If we're on a path like $item.name, map to schema path items[].name
      if (pathInfo && pathInfo.basePath.startsWith(varName + '.')) {
        const restPath = pathInfo.basePath.slice(varName.length + 1); // "name" from "item.name"
        const schemaPath = `${variable.sourceVar}[].${restPath}`;
        const schemaInfo = getSchemaPropertyInfo(projectContext.schema, schemaPath);
        if (schemaInfo) {
          let contents = `**${pathInfo.path}**: \`${schemaInfo.type}\`\n\n*Property of loop item from ${variable.sourceVar}*`;
          if (schemaInfo.description) {
            contents += `\n\n${schemaInfo.description}`;
          }
          // Add sample values
          if (projectContext.samples) {
            const sampleValues = getSampleValues(projectContext.samples, schemaPath);
            const sampleHint = formatSampleHint(sampleValues);
            if (sampleHint) {
              contents += `\n\n---\n\n${sampleHint}`;
            }
          }
          return { contents };
        }
      }
    }

    // For other variables, show basic hover
    return {
      contents: formatVariableHover(variable),
    };
  }

  // Check for loop variable paths (e.g., $item.name where item is from @for(item of items))
  // This handles the case where we're hovering on a property of a loop variable
  if (projectContext?.schema && pathInfo && pathInfo.basePath.includes('.')) {
    const firstSegment = pathInfo.basePath.split('.')[0]!;
    // Look for a loop variable with this name
    const loopVar = findVariableByNameAtOffset(doc.scope, firstSegment, offset);
    if (loopVar?.kind === 'for-item' && loopVar.sourceVar) {
      // Map the path to schema: item.name -> items[].name
      const restPath = pathInfo.basePath.slice(firstSegment.length + 1);
      const schemaPath = `${loopVar.sourceVar}[].${restPath}`;
      const schemaInfo = getSchemaPropertyInfo(projectContext.schema, schemaPath);
      if (schemaInfo) {
        let contents = `**${pathInfo.path}**: \`${schemaInfo.type}\`\n\n*Property of loop item from ${loopVar.sourceVar}*`;
        if (schemaInfo.description) {
          contents += `\n\n${schemaInfo.description}`;
        }
        if (projectContext.samples) {
          const sampleValues = getSampleValues(projectContext.samples, schemaPath);
          const sampleHint = formatSampleHint(sampleValues);
          if (sampleHint) {
            contents += `\n\n---\n\n${sampleHint}`;
          }
        }
        return { contents };
      }
    }
  }

  // Check for schema-based hover (for paths like $user.name or $items[0].name)
  if (projectContext?.schema && pathInfo) {
    // Use basePath for schema lookup (normalizes array indices to [])
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, pathInfo.basePath);
    if (schemaInfo) {
      // Determine if this is a wildcard array access (items[*].name returns array)
      const isWildcardAccess = pathInfo.path.includes('[*]');
      const displayType = isWildcardAccess ? `${schemaInfo.type}[]` : schemaInfo.type;

      // Display the original path but with schema type info
      let contents = `**${pathInfo.path}**: \`${displayType}\``;

      if (isWildcardAccess) {
        contents += `\n\n*Collects all ${schemaInfo.type} values from the array*`;
      }

      if (schemaInfo.description) {
        contents += `\n\n${schemaInfo.description}`;
      }

      // Add sample values if available
      if (projectContext.samples) {
        const sampleValues = getSampleValues(projectContext.samples, pathInfo.basePath);
        if (sampleValues.length > 0) {
          // For wildcard access, show all values as an array
          if (isWildcardAccess) {
            const allValues = sampleValues.map(v => v.displayValue).join(', ');
            contents += `\n\n---\n\nExample: [${allValues}]`;
          } else {
            const sampleHint = formatSampleHint(sampleValues);
            if (sampleHint) {
              contents += `\n\n---\n\n${sampleHint}`;
            }
          }
        }
      }

      return { contents };
    }
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
  componentName: string,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  // Check document-local components first
  const componentDef = doc.components.get(componentName);
  if (componentDef) {
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

  // Check project components
  if (projectContext) {
    const projectComponent = projectContext.components.get(componentName);
    if (projectComponent) {
      let contents = `**Component ${componentName}**\n\n`;
      contents += `*File: ${projectComponent.filePath}*\n\n`;

      if (projectComponent.props && projectComponent.props.length > 0) {
        const props = projectComponent.props
          .map(p => `  ${p.name}${p.required ? ' (required)' : ''}`)
          .join('\n');
        contents += `\`\`\`blade\n<${componentName}\n${props}\n/>\n\`\`\``;
      } else {
        contents += `\`\`\`blade\n<${componentName} />\n\`\`\``;
      }

      return { contents };
    }
  }

  return null;
}

/**
 * Get hover information for a builtin helper from metadata registry
 */
function getHelperHover(name: string): HoverInfo | null {
  const helper = helperMetadata[name];
  if (helper) {
    let contents = `**${name}**\n\n\`\`\`typescript\n${helper.signature}\n\`\`\`\n\n${helper.description}`;

    if (helper.examples.length > 0) {
      contents += `\n\n**Examples:**\n${helper.examples.map(e => `  ${e}`).join('\n')}`;
    }

    if (helper.polymorphic) {
      contents += `\n\n*Polymorphic: works on multiple types*`;
    }

    return { contents };
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
 * Find a variable by name in the scope at a given offset
 */
function findVariableByNameAtOffset(
  scope: DocumentScope,
  name: string,
  offset: number
): ScopeVariable | null {
  // Get variables in scope at this offset
  const varsAtOffset = getVariablesAtOffset(scope, offset);
  for (const v of varsAtOffset) {
    if (v.name === name) {
      return v;
    }
  }
  return null;
}

