/**
 * Hover Provider for Blade Language Server
 *
 * Every "where am I?" question is answered by `analyzer/context.ts`. This file
 * used to carry five backward-scanning predicates of its own, three of which
 * had a counterpart in `providers/completion.ts` with a different cutoff: the
 * props check tested a regular expression against a fixed 100-character window
 * here and a 50-character one there, so on a long `@props(...)` line hover
 * offered schema types while completion silently offered nothing.
 */

import type { PropDeclaration } from '@bladets/template';
import type { BladeDocument, ScopeVariable, Position } from '../types.js';
import type { ProjectLspContext } from '../project-context.js';
import {
  getWordAtOffset,
  getPathAtOffset,
  offsetOfPosition,
} from '../document.js';
import { resolveContext } from '../analyzer/context.js';
import type { PositionContext } from '../analyzer/context.js';
import { getSchemaPropertyInfo } from '@bladets/template/node';
import { getSampleValues, formatSampleHint } from '@bladets/template/node';
import { findVariableAtOffset } from '../analyzer/scope.js';
import { helperMetadata } from '@bladets/template';

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
  projectContext?: ProjectLspContext | null
): HoverInfo | null {
  const offset = offsetOfPosition(doc, position);
  const wordInfo = getWordAtOffset(doc.content, offset);

  if (!wordInfo) {
    return null;
  }

  const context = resolveContext(doc, offset);
  const project = projectContext ?? undefined;

  switch (context.kind) {
    case 'directive':
      // The directive keyword itself: `@i|f`.
      return getDirectiveHover(wordInfo.word);

    case 'directive-argument': {
      if (context.templateDefinition !== undefined) {
        // `<template:Card ti|tle! subtitle="Default">`
        const definition = doc.components.get(context.templateDefinition);
        return getTemplatePropHover(
          wordInfo.word,
          definition?.props.find(prop => prop.name === wordInfo.word),
          project
        );
      }
      return getPropsVariableHover(
        wordInfo.word,
        doc.props.find(prop => prop.name === wordInfo.word),
        project
      );
    }

    case 'expression':
    case 'expression-path':
      return (
        getExpressionHover(doc, offset, wordInfo.word, project) ??
        getDirectiveRoleHover(context, wordInfo.word)
      );

    case 'html-tag':
    case 'component-prop':
    case 'html-attribute':
    case 'html-attribute-value':
    case 'slot-name':
    case 'text':
      if (/^[A-Z]/.test(wordInfo.word)) {
        return getComponentHover(doc, wordInfo.word, project);
      }
      return null;
  }
}

/**
 * What a name means to the directive whose header it sits in.
 *
 * Only reached when nothing more specific applied - the schema knows nothing
 * about the name and it is not a helper - so that a loop variable in
 * `@for(item of items)` still says what it is.
 */
function getDirectiveRoleHover(
  context: PositionContext,
  name: string
): HoverInfo | null {
  const node = context.directive?.node;
  if (!node) return null;

  if (node.kind === 'for') {
    if (name === node.itemVar) {
      return { contents: `**${name}**\n\n*Loop item variable (from @for)*` };
    }
    if (name === node.indexVar) {
      return {
        contents: `**${name}**: \`number\`\n\n*Loop index variable (from @for)*`,
      };
    }
    return { contents: `**${name}**\n\n*Source array for @for loop*` };
  }

  return null;
}

/**
 * Get hover for a prop name inside @props()
 */
function getPropsVariableHover(
  propName: string,
  declaration: PropDeclaration | undefined,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  const cleanName = propName.replace(/\?$/, '');
  // Whether a prop is required is a property of the declaration, not of the
  // characters around the cursor: `getWordAtOffset` stops at word characters,
  // so the `!` this used to look for was never in the string it tested.
  const requirement = describeRequirement(declaration);

  if (projectContext?.schema) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, cleanName);
    if (schemaInfo) {
      let contents = `**${cleanName}**: \`${schemaInfo.type}\`${requirement}\n\n*Component prop*`;

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
    contents: `**${cleanName}**${requirement}\n\n*Component prop*`,
  };
}

/**
 * Get hover for a template definition prop
 */
function getTemplatePropHover(
  propName: string,
  declaration: PropDeclaration | undefined,
  projectContext?: ProjectLspContext
): HoverInfo | null {
  const cleanName = propName.replace(/!$/, '');
  const requirement = describeRequirement(declaration);

  if (projectContext?.schema) {
    const schemaInfo = getSchemaPropertyInfo(projectContext.schema, cleanName);
    if (schemaInfo) {
      let contents = `**${cleanName}**: \`${schemaInfo.type}\`${requirement}\n\n*Template prop definition*`;

      if (schemaInfo.description) {
        contents += `\n\n${schemaInfo.description}`;
      }

      return { contents };
    }
  }

  return {
    contents: `**${cleanName}**${requirement}\n\n*Template prop definition*`,
  };
}

/** ` (required)` or ` (optional)`, from the declaration the parser produced. */
function describeRequirement(declaration: PropDeclaration | undefined): string {
  if (!declaration) return '';
  return declaration.required ? ' (required)' : ' (optional)';
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
  const variable = findVariableAtOffset(doc.scope, varName, offset);
  if (variable) {
    // For loop item variables, provide schema-aware hover
    if (
      variable.kind === 'for-item' &&
      variable.sourceVar &&
      projectContext?.schema
    ) {
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
        const sourceInfo = getSchemaPropertyInfo(
          projectContext.schema,
          variable.sourceVar
        );
        if (sourceInfo?.type === 'array') {
          // Get the item properties from schema
          const itemSchemaPath = `${variable.sourceVar}[]`;
          const itemProps = projectContext.schema.properties.filter(p =>
            p.path.startsWith(itemSchemaPath + '.')
          );
          if (itemProps.length > 0) {
            const propNames = itemProps
              .map(p => p.path.split('.').pop())
              .join(', ');
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
        const schemaInfo = getSchemaPropertyInfo(
          projectContext.schema,
          schemaPath
        );
        if (schemaInfo) {
          let contents = `**${pathInfo.path}**: \`${schemaInfo.type}\`\n\n*Property of loop item from ${variable.sourceVar}*`;
          if (schemaInfo.description) {
            contents += `\n\n${schemaInfo.description}`;
          }
          // Add sample values
          if (projectContext.samples) {
            const sampleValues = getSampleValues(
              projectContext.samples,
              schemaPath
            );
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
    const loopVar = findVariableAtOffset(doc.scope, firstSegment, offset);
    if (loopVar?.kind === 'for-item' && loopVar.sourceVar) {
      // Map the path to schema: item.name -> items[].name
      const restPath = pathInfo.basePath.slice(firstSegment.length + 1);
      const schemaPath = `${loopVar.sourceVar}[].${restPath}`;
      const schemaInfo = getSchemaPropertyInfo(
        projectContext.schema,
        schemaPath
      );
      if (schemaInfo) {
        let contents = `**${pathInfo.path}**: \`${schemaInfo.type}\`\n\n*Property of loop item from ${loopVar.sourceVar}*`;
        if (schemaInfo.description) {
          contents += `\n\n${schemaInfo.description}`;
        }
        if (projectContext.samples) {
          const sampleValues = getSampleValues(
            projectContext.samples,
            schemaPath
          );
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
    const schemaInfo = getSchemaPropertyInfo(
      projectContext.schema,
      pathInfo.basePath
    );
    if (schemaInfo) {
      // Determine if this is a wildcard array access (items[*].name returns array)
      const isWildcardAccess = pathInfo.path.includes('[*]');
      const displayType = isWildcardAccess
        ? `${schemaInfo.type}[]`
        : schemaInfo.type;

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
        const sampleValues = getSampleValues(
          projectContext.samples,
          pathInfo.basePath
        );
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
