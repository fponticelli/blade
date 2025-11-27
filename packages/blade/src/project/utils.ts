/**
 * Utility functions for project-based template compilation
 */

/**
 * Convert a string to PascalCase.
 *
 * Handles various input formats:
 * - kebab-case: form-input → FormInput
 * - snake_case: form_input → FormInput
 * - camelCase: formInput → FormInput
 * - lowercase: button → Button
 * - Already PascalCase: Button → Button
 *
 * @param str - Input string to convert
 * @returns PascalCase version of the string
 *
 * @example
 * toPascalCase('form-input') // → 'FormInput'
 * toPascalCase('form_input') // → 'FormInput'
 * toPascalCase('formInput') // → 'FormInput'
 * toPascalCase('button') // → 'Button'
 * toPascalCase('Button') // → 'Button'
 */
export function toPascalCase(str: string): string {
  if (!str) return '';

  // Split by common delimiters (hyphens, underscores)
  // Also split on camelCase boundaries (lowercase followed by uppercase)
  const words = str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Insert hyphen at camelCase boundaries
    .split(/[-_]+/) // Split on hyphens and underscores
    .filter(word => word.length > 0);

  // Capitalize first letter of each word
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert a PascalCase component name to a lowercase filename.
 *
 * @param componentName - PascalCase component name
 * @returns Lowercase filename (without extension)
 *
 * @example
 * toFilename('Button') // → 'button'
 * toFilename('FormInput') // → 'forminput'
 */
export function toFilename(componentName: string): string {
  return componentName.toLowerCase();
}

/**
 * Check if a string is a valid component name (starts with uppercase).
 *
 * @param name - Name to check
 * @returns True if valid component name
 */
export function isValidComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * Parse a dot-notation component name into segments.
 *
 * @param tagName - Dot-notation tag name (e.g., 'Components.Form.Input')
 * @returns Array of segments (e.g., ['Components', 'Form', 'Input'])
 *
 * @example
 * parseComponentPath('Button') // → ['Button']
 * parseComponentPath('Components.Form.Input') // → ['Components', 'Form', 'Input']
 */
export function parseComponentPath(tagName: string): string[] {
  return tagName.split('.').filter(s => s.length > 0);
}

/**
 * Convert dot-notation segments to a filesystem path.
 *
 * @param segments - Array of path segments
 * @returns Relative path to component file (without extension)
 *
 * @example
 * segmentsToPath(['Button']) // → 'button'
 * segmentsToPath(['Components', 'Form', 'Input']) // → 'components/form/input'
 */
export function segmentsToPath(segments: string[]): string {
  return segments.map(s => s.toLowerCase()).join('/');
}

/**
 * Check if a filename is a hidden file (starts with dot).
 *
 * @param name - Filename to check
 * @returns True if hidden file
 */
export function isHiddenFile(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Get the basename of a file path without extension.
 *
 * @param filePath - Full file path
 * @returns Filename without extension
 *
 * @example
 * getBasename('/path/to/button.blade') // → 'button'
 * getBasename('components/form/input.blade') // → 'input'
 */
export function getBasename(filePath: string): string {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] ?? '';
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}
