/**
 * Small utilities for the preview feature.
 *
 * Deliberately short: `findProjectRoot`, component-name derivation, sample
 * discovery and prop parsing all used to live here or next door as second
 * implementations of engine functions, and each one had drifted from the
 * definition the compiler actually uses.
 */

import { randomBytes } from 'crypto';

/**
 * A stable key for a project path, for workspace-state storage.
 *
 * @param projectPath - Path to the project root
 * @returns A short, filesystem-independent hash
 */
export function hashProjectPath(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/** A debounced function, with the timer it owns. */
export type Debounced<T extends (...args: never[]) => void> = ((
  ...args: Parameters<T>
) => void) & { cancel: () => void };

/**
 * Delays execution until `wait` ms after the last call.
 *
 * @param fn - Function to debounce
 * @param wait - Milliseconds to wait
 * @returns The debounced function, with a `cancel` that clears a pending call
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number = 300
): Debounced<T> {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>): void => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      fn(...args);
    }, wait);
  };

  debounced.cancel = (): void => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * A nonce for the webview's script CSP.
 *
 * Cryptographically random. It used to be built from `Math.random()`, which in
 * V8 is a seeded xorshift128+ - so the one value standing between markup
 * rendered from an arbitrary workspace template and script execution inside a
 * webview holding `acquireVsCodeApi()` was predictable from a handful of prior
 * outputs. Both the CSP specification and VS Code's webview guidance require a
 * cryptographically random nonce for exactly this reason.
 *
 * @returns 128 bits of randomness, base64 encoded
 */
export function getNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Escapes text for interpolation into an HTML attribute or text node.
 *
 * @param value - Text to escape
 * @returns The text with every character that can leave its context replaced
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
