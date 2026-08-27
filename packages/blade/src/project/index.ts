/**
 * Project-based Template Compilation
 *
 * Filesystem-aware component discovery and compilation for multi-file Blade
 * template projects.
 *
 * The module is asynchronous throughout, and reads the filesystem only through
 * the {@link FileSystem} seam in `./fs.js`. Both properties are recent: it used
 * to be half synchronous and half asynchronous, and the split was load-bearing
 * - a synchronous `compileProject` could not await the schema and sample
 * loaders, so it built every project context with `schema: undefined` and made
 * the schema-driven validation unreachable.
 *
 * @module project
 */

export * from './compile.js';
export * from './discovery.js';
export * from './free-variables.js';
export * from './fs.js';
export * from './props.js';
export * from './resolver.js';
export * from './root.js';
export * from './samples.js';
export * from './schema.js';
export * from './sources.js';
export * from './utils.js';
