/**
 * Blade VS Code Extension
 * Client that connects to the Blade Language Server
 */

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  // Path to the server module
  // The server is bundled in out/server/server.js
  const serverModule = context.asAbsolutePath(
    path.join('out', 'server', 'server.js')
  );

  // Server options - run in Node.js
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    // Register for Blade documents
    documentSelector: [{ scheme: 'file', language: 'blade' }],
    synchronize: {
      // Synchronize configuration settings
      configurationSection: 'blade',
      // Watch for .blade files
      fileEvents: workspace.createFileSystemWatcher('**/*.blade'),
    },
  };

  // Create the language client
  client = new LanguageClient(
    'bladeLanguageServer',
    'Blade Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client, which also starts the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
