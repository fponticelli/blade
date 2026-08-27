/**
 * Preview command handler.
 */

import * as vscode from 'vscode';
import { PreviewPanelManager } from '../preview/panel.js';

/**
 * Open the Blade preview panel for the active editor.
 *
 * @param context - The extension context
 * @returns A promise that settles when the panel has rendered
 */
export function openPreview(context: vscode.ExtensionContext): Promise<void> {
  return PreviewPanelManager.getInstance(context).show();
}

/**
 * Register the preview command.
 *
 * @param context - The extension context
 * @returns Disposable for the command
 */
export function registerPreviewCommand(
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.commands.registerCommand('blade.openPreview', () => {
    void openPreview(context);
  });
}
