/**
 * Utility functions for preview feature
 * Feature: 007-vscode-preview-mode
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Find the project root containing samples/ folder from a file path.
 * Walks up the directory tree looking for a directory with samples/ subfolder.
 *
 * @param filePath - Path to the .blade file
 * @returns Project root path or null if not found
 */
export function findProjectRoot(filePath: string): string | null {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const samplesPath = path.join(dir, 'samples');
    const indexPath = path.join(dir, 'index.blade');

    // Project root has samples/ folder or index.blade
    if (fs.existsSync(samplesPath) || fs.existsSync(indexPath)) {
      return dir;
    }

    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Check if a .blade file is a component (not index.blade).
 *
 * @param filePath - Path to the .blade file
 * @returns True if this is a component file
 */
export function isComponentFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName !== 'index.blade' && fileName.endsWith('.blade');
}

/**
 * Generate a hash for a project path (for workspace state keys).
 *
 * @param projectPath - Path to the project root
 * @returns A simple hash string
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

/**
 * Create a debounced function that delays execution until after the
 * specified wait time has elapsed since the last call.
 *
 * @param fn - Function to debounce
 * @param wait - Milliseconds to wait (default: 300ms)
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number = 300
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, wait);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * Get the nonce for webview script security.
 *
 * @returns A random nonce string
 */
export function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
