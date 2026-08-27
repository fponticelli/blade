#!/usr/bin/env node
// Runs the Blade language server on stdio.
//
// A three-line launcher rather than a `bin` pointing straight at
// `dist/server.js`, because the built entry is a bundler artefact with no
// shebang: npm's POSIX shim would hand it to the shell instead of to Node.
// Importing it is enough - the module opens the connection at import time.
import '../dist/server.js';
