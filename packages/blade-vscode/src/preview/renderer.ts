/**
 * Template compilation and rendering for preview
 * Feature: 007-vscode-preview-mode
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RenderResult, RenderError, RenderWarning } from './types';

/**
 * Compile and render a Blade template with sample data.
 * Uses dynamic import to load the blade package (ESM).
 *
 * @param templateSource - The template source code
 * @param projectRoot - Path to the project root (for component resolution)
 * @param sampleData - Data to render the template with
 * @returns Render result with HTML or errors
 */
export async function renderTemplate(
  templateSource: string,
  projectRoot: string,
  sampleData: unknown
): Promise<RenderResult> {
  const startTime = Date.now();
  const errors: RenderError[] = [];
  const warnings: RenderWarning[] = [];

  try {
    // Dynamically import the blade package
    // The blade package is bundled with the extension
    const blade = await import('@fponticelli/blade');

    // Strip @props directive before compiling (it's metadata, not content)
    const propsResult = blade.parseProps(templateSource);
    const sourceToCompile = propsResult.remainingSource;

    // Discover and compile project components
    const projectComponents = await discoverAndCompileComponents(
      blade,
      projectRoot
    );

    console.log('[Preview] Project root:', projectRoot);
    console.log('[Preview] Discovered components:', Array.from(projectComponents.keys()));
    console.log('[Preview] Component count:', projectComponents.size);

    // Compile the template with project root for component resolution
    const compileResult = await blade.compile(sourceToCompile, {
      validate: true,
      projectRoot,
    });

    // Merge project components into the compiled template's components
    // Create a new mutable map with all components
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedComponents = new Map(compileResult.root.components) as Map<string, any>;
    for (const [name, def] of projectComponents) {
      if (!mergedComponents.has(name)) {
        mergedComponents.set(name, def);
      }
    }

    console.log('[Preview] Merged component names:', Array.from(mergedComponents.keys()));

    // Create a new compile result with merged components
    const mergedCompileResult = {
      ...compileResult,
      root: {
        ...compileResult.root,
        components: mergedComponents,
      },
    };

    console.log('[Preview] mergedCompileResult.root.components:', Array.from(mergedCompileResult.root.components.keys()));

    // Check for compilation diagnostics (errors and warnings)
    if (compileResult.diagnostics && compileResult.diagnostics.length > 0) {
      for (const diag of compileResult.diagnostics) {
        if (diag.level === 'error') {
          errors.push({
            message: diag.message,
            line: diag.location?.start?.line ?? null,
            column: diag.location?.start?.column ?? null,
            file: null,
            type: 'syntax',
          });
        } else {
          warnings.push({
            message: diag.message,
            line: diag.location?.start?.line ?? null,
            column: diag.location?.start?.column ?? null,
          });
        }
      }

      // If there are errors, don't attempt to render
      if (errors.length > 0) {
        return {
          success: false,
          html: null,
          errors,
          warnings,
          renderTime: Date.now() - startTime,
        };
      }
    }

    // Render the template with sample data
    // Use createStringRenderer which expects a CompiledTemplate
    // Include the standard library helpers for functions like concat, join, etc.
    const renderer = blade.createStringRenderer(mergedCompileResult);
    const renderResult = renderer(sampleData as Record<string, unknown>, {
      helpers: blade.standardLibrary,
    });

    return {
      success: true,
      html: renderResult.html,
      errors,
      warnings,
      renderTime: Date.now() - startTime,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const errorWithLocation = err as { line?: number; column?: number };

    errors.push({
      message,
      line: errorWithLocation.line ?? null,
      column: errorWithLocation.column ?? null,
      file: null,
      type: 'runtime',
    });

    return {
      success: false,
      html: null,
      errors,
      warnings,
      renderTime: Date.now() - startTime,
    };
  }
}

/**
 * Validate sample data against a project's schema (if exists).
 *
 * @param projectRoot - Path to the project root
 * @param sampleData - Data to validate
 * @returns Array of validation warnings
 */
export function validateSampleData(
  projectRoot: string,
  sampleData: unknown
): RenderWarning[] {
  const warnings: RenderWarning[] = [];
  const schemaPath = path.join(projectRoot, 'schema.json');

  if (!fs.existsSync(schemaPath)) {
    return warnings;
  }

  try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    // Basic validation: check required properties
    if (schema.required && Array.isArray(schema.required)) {
      const data = sampleData as Record<string, unknown>;
      for (const prop of schema.required) {
        if (!(prop in data)) {
          warnings.push({
            message: `Missing required property: ${prop}`,
            line: null,
            column: null,
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    warnings.push({
      message: `Schema validation failed: ${message}`,
      line: null,
      column: null,
    });
  }

  return warnings;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BladeModule = any;

/**
 * Discover and compile all component files in a project.
 * Returns a map of component name to ComponentDefinition.
 */
async function discoverAndCompileComponents(
  blade: BladeModule,
  projectRoot: string
): Promise<Map<string, unknown>> {
  const components = new Map<string, unknown>();

  try {
    // Check if project root exists
    if (!fs.existsSync(projectRoot)) {
      return components;
    }

    // Find all .blade files in the project (excluding index.blade)
    const files = fs.readdirSync(projectRoot);
    for (const file of files) {
      // Skip non-blade files, index.blade, hidden files, and directories
      if (
        !file.endsWith('.blade') ||
        file === 'index.blade' ||
        file.startsWith('.')
      ) {
        continue;
      }

      const filePath = path.join(projectRoot, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        continue;
      }

      // Convert filename to component name (PascalCase)
      // e.g., "Comment.blade" -> "Comment", "my-component.blade" -> "MyComponent"
      const baseName = file.replace('.blade', '');
      const componentName = baseName
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

      try {
        // Read and compile the component
        const source = fs.readFileSync(filePath, 'utf-8');

        // Strip @props directive
        const propsResult = blade.parseProps(source);
        const sourceToCompile = propsResult.remainingSource;

        // Compile the component
        const compiled = await blade.compile(sourceToCompile, {
          validate: false,
        });

        // Create a ComponentDefinition from the compiled result
        // The component body is the children of the root node
        // Props come from directive.props (if @props directive exists)
        const props = propsResult.directive?.props ?? [];
        const componentDef = {
          name: componentName,
          props: props.map((p: { name: string; required: boolean; defaultValue?: unknown; location: unknown }) => ({
            name: p.name,
            required: p.required,
            defaultValue: p.defaultValue,
            location: p.location,
          })),
          body: compiled.root.children,
          location: compiled.root.location,
        };

        components.set(componentName, componentDef);
      } catch (err) {
        // Skip components that fail to compile
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to compile component: ${file}`, errMsg);
      }
    }
  } catch {
    // If discovery fails, return empty map
  }

  return components;
}
