/**
 * An `ExtensionContext` sufficient for the preview panel.
 */

import { Uri } from './vscode.js';

export interface FakeExtensionContext {
  readonly extensionUri: Uri;
  readonly subscriptions: { dispose(): void }[];
  readonly workspaceState: {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Promise<void>;
    readonly store: Map<string, unknown>;
  };
}

/**
 * Creates the context double.
 *
 * @param extensionPath - Where the extension pretends to be installed
 * @returns A context whose workspace state can be inspected
 */
export function createContext(extensionPath = '/ext'): FakeExtensionContext {
  const store = new Map<string, unknown>();
  return {
    extensionUri: Uri.file(extensionPath),
    subscriptions: [],
    workspaceState: {
      get<T>(key: string): T | undefined {
        return store.get(key) as T | undefined;
      },
      update(key: string, value: unknown): Promise<void> {
        store.set(key, value);
        return Promise.resolve();
      },
      store,
    },
  };
}
