/**
 * Preview command handler
 * Feature: 007-vscode-preview-mode
 */

import * as vscode from 'vscode';
import { PreviewPanelManager } from '../preview/panel';

/**
 * Open the Blade preview panel for the active editor.
 *
 * @param context - The extension context
 */
export function openPreview(context: vscode.ExtensionContext): void {
  const manager = PreviewPanelManager.getInstance(context);
  manager.show();
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
    openPreview(context);
  });
}
