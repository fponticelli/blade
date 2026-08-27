// Blade - the Node entry.
//
// The project layer: discovering components on disk, loading `schema.json` and
// `samples/*.json`, and compiling a directory of `.blade` files into one
// renderable template. Everything here reaches the filesystem, through the
// {@link FileSystem} seam in `./project/fs.js`.
//
// It is a separate entry because it is the only part of this package that
// cannot run on Cloudflare Workers, Vercel Edge, Deno Deploy or in a browser.
// It used to be reachable from the default entry as `project.*`, which put a
// top-level `import "fs"` in `dist/index.js` and made the package's own first
// README example fail to load on all four.
//
// Deliberately NOT a superset of `@bladets/template`: the two surfaces stay
// orthogonal so that the import list in a consumer's file says which half of
// the package it depends on. Import the engine from `@bladets/template` and the
// project layer from here.

export type {
  ComponentPropsResult,
  ComponentSource,
  DirectoryEntry,
  DiscoveryOptions,
  FileSystem,
  FindProjectRootOptions,
  LoadedSamples,
  LoadedSchema,
  ProjectCompiler,
  ProjectContextInit,
  ProjectLoadOptions,
  ProjectSamples,
  ProjectSchema,
  ProjectSources,
  PropsWarning,
  SampleFile,
  SampleValue,
  SchemaPropertyInfo,
  SchemaValidationError,
  SkipReason,
  SkippedDirectory,
} from './project/index.js';

export {
  DEFAULT_ENTRY,
  DEFAULT_EXCLUDED_DIRECTORIES,
  DEFAULT_MAX_DEPTH,
  PathEscapeError,
  SCHEMA_FILE,
  collectComponentReferences,
  collectComponentUsages,
  collectFreeVariables,
  compileProject,
  compileProjectSchema,
  compileProjectSources,
  componentPropsFrom,
  createMemoryFileSystem,
  createMissingComponentDiagnostic,
  createProjectCompiler,
  createProjectContext,
  createUndeclaredPropDiagnostic,
  discoverComponents,
  extractSampleValues,
  extractSchemaProperties,
  findProjectRoot,
  formatSampleHint,
  getBasename,
  getSampleValues,
  getSchemaCompletions,
  getSchemaPropertyInfo,
  isHiddenFile,
  isValidComponentName,
  loadProjectSamples,
  loadProjectSamplesResult,
  loadProjectSchema,
  loadProjectSchemaResult,
  nodeFileSystem,
  parseComponentPath,
  parseComponentProps,
  readProjectSources,
  resolveComponent,
  resolveWithinRoot,
  segmentsToPath,
  toFilename,
  toPascalCase,
} from './project/index.js';
