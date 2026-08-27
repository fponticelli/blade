/**
 * Schema Loading for Blade Projects
 *
 * Loads `schema.json`, flattens it into completion entries, and validates data
 * against it.
 *
 * JSON Schema is not hand-rolled here any more. The previous version modelled
 * six keywords - type, description, properties, items, enum, default - and
 * recursed only through `properties` and `items.properties`. A file named
 * `schema.json` and documented as JSON Schema will contain `$ref`, `$defs`,
 * `allOf` and `oneOf`, and every one of those produced a property with no type
 * and no children, so whole subtrees vanished from completions; a schema whose
 * root was a `$ref` flattened to an empty list while still returning a non-null
 * result, so every downstream guard passed and completions were silently empty.
 * The accompanying validator - in `lsp/providers/diagnostic.ts` - skipped absent
 * properties outright, so a sample missing a required field validated clean, and
 * compared `typeof 42` against `"integer"`, so every integer field reported a
 * false type mismatch.
 *
 * Ajv is now the single source of schema semantics for validation. The
 * flattening below still walks the document, because "which paths can a
 * completion offer" is not a question a validator answers - but it resolves
 * `$ref` and composition first, so it walks the schema the author actually
 * wrote.
 */

import { join } from 'path';
import AjvDraft07 from 'ajv';
import AjvDraft2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject, SchemaObject, ValidateFunction } from 'ajv';
import type { Diagnostic, JsonSchema } from '../ast/types.js';
import { createDiagnostic } from '../validation/index.js';
import { nodeFileSystem } from './fs.js';
import type { FileSystem } from './fs.js';

export type { JsonSchema } from '../ast/types.js';

/** The file a project's schema lives in. */
export const SCHEMA_FILE = 'schema.json';

/** One thing a sample got wrong, in the notation the rest of the tooling uses. */
export interface SchemaValidationError {
  /** Dot/bracket path into the data, or `(root)`. */
  readonly path: string;
  readonly message: string;
}

/**
 * Loaded project schema
 */
export interface ProjectSchema {
  /** The schema document as written. */
  readonly schema: JsonSchema;
  /** Flattened property paths for completions. */
  readonly properties: readonly SchemaPropertyInfo[];
  /**
   * Validates data against the schema.
   *
   * The single implementation: sample validation, prop checks and any future
   * caller answer to the same Ajv-compiled function, so they cannot disagree
   * about what the schema means.
   */
  readonly validate: (data: unknown) => readonly SchemaValidationError[];
}

/**
 * Flattened schema property for completions
 */
export interface SchemaPropertyInfo {
  /** Dot-notation path (e.g., "user.name") */
  path: string;
  /** Property type */
  type: string;
  /** Optional description */
  description?: string;
  /** Whether the schema lists this property in its parent's `required`. */
  required: boolean;
  /** Whether this property has children */
  hasChildren: boolean;
  /** Child property names (for immediate completions) */
  childNames: string[];
}

/** A schema load attempt: what was loaded, and what went wrong. */
export interface LoadedSchema {
  /** Null when the project has no `schema.json`, or it could not be used. */
  readonly schema: ProjectSchema | null;
  /**
   * Why it could not be used. Empty when there is simply no schema file: a
   * project without one is not a project with a problem.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Loads and parses `schema.json` from a project directory.
 *
 * @param projectRoot - Path to the project root directory
 * @param io - Filesystem to read through
 * @returns The schema, or null when the project has none
 */
export async function loadProjectSchema(
  projectRoot: string,
  io: FileSystem = nodeFileSystem
): Promise<ProjectSchema | null> {
  return (await loadProjectSchemaResult(projectRoot, io)).schema;
}

/**
 * Loads `schema.json`, reporting why it could not be loaded.
 *
 * The reason used to be swallowed by a bare `catch { return null }`, so a
 * schema with a trailing comma was indistinguishable from no schema at all -
 * completions just stopped working.
 *
 * @param projectRoot - Path to the project root directory
 * @param io - Filesystem to read through
 * @returns The schema and any diagnostics about it
 */
export async function loadProjectSchemaResult(
  projectRoot: string,
  io: FileSystem = nodeFileSystem
): Promise<LoadedSchema> {
  const schemaPath = join(projectRoot, SCHEMA_FILE);

  let content: string;
  try {
    content = await io.readFile(schemaPath);
  } catch {
    // No schema file. Not a problem: a project need not describe its data.
    return { schema: null, diagnostics: [] };
  }

  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch (error) {
    return {
      schema: null,
      diagnostics: [
        schemaDiagnostic(
          `${SCHEMA_FILE} is not valid JSON: ${messageOf(error)}`
        ),
      ],
    };
  }

  if (
    typeof document !== 'object' ||
    document === null ||
    Array.isArray(document)
  ) {
    return {
      schema: null,
      diagnostics: [
        schemaDiagnostic(
          `${SCHEMA_FILE} must contain a JSON Schema object, found ${describe(document)}`
        ),
      ],
    };
  }

  const schema = document as JsonSchema;

  let compiled: ProjectSchema;
  try {
    compiled = compileProjectSchema(schema);
  } catch (error) {
    return {
      schema: null,
      diagnostics: [
        schemaDiagnostic(
          `${SCHEMA_FILE} is not a valid JSON Schema: ${messageOf(error)}`
        ),
      ],
    };
  }

  return { schema: compiled, diagnostics: [] };
}

/**
 * Builds a {@link ProjectSchema} from a schema document.
 *
 * The one place a schema becomes usable, whether it came from the project's own
 * `schema.json` or from a file named by `blade.lsp.completion.dataSchemaPath`.
 *
 * @param document - The schema, as parsed from JSON
 * @returns The compiled schema
 * @throws When the document is not a valid JSON Schema
 */
export function compileProjectSchema(document: JsonSchema): ProjectSchema {
  const validator = compileSchema(document);
  return {
    schema: document,
    properties: extractSchemaProperties(document),
    validate: data => runValidator(validator, data),
  };
}

// =============================================================================
// Validation, via Ajv
// =============================================================================

type AjvConstructor = typeof AjvDraft07;

/**
 * Interop for a CommonJS default export.
 *
 * Ajv ships CJS. Under Node's ESM loader the default import is the class;
 * under a bundler it can be the module namespace with the class on `.default`.
 * Both are handled here rather than at every call site.
 */
function interopDefault<T>(module: T): T {
  const candidate = (module as { default?: T }).default;
  return typeof candidate === 'function' ? candidate : module;
}

/** True when the document declares a draft that the 2020-12 code path serves. */
function isModernDraft(schema: JsonSchema): boolean {
  const declared = schema.$schema;
  if (declared === undefined) return false;
  return declared.includes('2020-12') || declared.includes('2019-09');
}

/**
 * Compiles the schema, choosing the dialect the document declares.
 *
 * @throws When the document is not a valid schema - which is a diagnostic, not
 * a silent empty completion list.
 */
function compileSchema(schema: JsonSchema): ValidateFunction {
  const Ajv = interopDefault<AjvConstructor>(
    isModernDraft(schema) ? AjvDraft2020 : AjvDraft07
  );
  // `strict: false` because a schema.json is written for humans and editors as
  // much as for a validator: an unknown keyword must not stop the project from
  // compiling. `logger: false` because this runs inside a language server,
  // where a library writing to stderr is noise nobody reads - anything worth
  // saying is said as a diagnostic.
  const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
  // `format` is a real constraint in the schemas people write - the shipped
  // samples use `date-time` - and ignoring it would validate them against less
  // than they declare.
  interopDefault<typeof addFormats>(addFormats)(ajv);
  return ajv.compile(asAjvSchema(schema));
}

/**
 * The schema as Ajv's own type.
 *
 * `JsonSchema` is a closed interface - which is the point of it, since an index
 * signature makes every misspelled keyword structurally valid - and Ajv's
 * `SchemaObject` is an open one, so the conversion is explicit here and nowhere
 * else.
 */
function asAjvSchema(schema: JsonSchema): SchemaObject {
  return schema as unknown as SchemaObject;
}

function runValidator(
  validator: ValidateFunction,
  data: unknown
): readonly SchemaValidationError[] {
  if (validator(data)) return [];
  return (validator.errors ?? []).map(toValidationError);
}

/** One Ajv error in this package's path notation. */
function toValidationError(error: ErrorObject): SchemaValidationError {
  const base = pointerToPath(error.instancePath);
  if (error.keyword === 'required') {
    const missing = (error.params as { missingProperty?: string })
      .missingProperty;
    if (missing !== undefined) {
      return {
        path: base === '(root)' ? missing : `${base}.${missing}`,
        message: `Missing required property '${missing}'`,
      };
    }
  }
  return { path: base, message: error.message ?? 'is invalid' };
}

/**
 * `/user/tags/0` becomes `user.tags[0]`.
 *
 * The same notation `extractSchemaProperties` and the sample loader use, so a
 * validation error names a path a reader can look up.
 */
function pointerToPath(pointer: string): string {
  if (pointer === '') return '(root)';
  let path = '';
  for (const raw of pointer.slice(1).split('/')) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (/^\d+$/.test(segment)) {
      path += `[${segment}]`;
    } else {
      path = path === '' ? segment : `${path}.${segment}`;
    }
  }
  return path;
}

/**
 * A schema that could not be used.
 *
 * A warning, not an error: the consequence of a broken `schema.json` is that
 * completions and sample validation go missing, not that the templates stop
 * being renderable - and blanking a preview over a metadata file would be a
 * worse failure than the one being fixed. What matters is that it is said out
 * loud, where a bare `catch { return null }` said nothing.
 */
function schemaDiagnostic(message: string): Diagnostic {
  return createDiagnostic(
    'warning',
    message,
    {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
    'INVALID_SCHEMA'
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

// =============================================================================
// Flattening, for completions
// =============================================================================

/**
 * One schema node with `$ref` followed and composition merged.
 *
 * The reader below never looks at a raw node: everything it needs is here,
 * which is what stops `$ref` and `allOf` from emptying a subtree.
 */
interface ResolvedSchema {
  readonly types: readonly string[];
  readonly description: string | undefined;
  readonly properties: ReadonlyMap<string, JsonSchema>;
  readonly required: ReadonlySet<string>;
  readonly items: JsonSchema | undefined;
}

const EMPTY_RESOLVED: ResolvedSchema = {
  types: [],
  description: undefined,
  properties: new Map(),
  required: new Set(),
  items: undefined,
};

/**
 * Extracts flattened property paths from a JSON Schema.
 *
 * `$ref` is resolved against the document, `allOf` is merged, and `oneOf` and
 * `anyOf` contribute the union of their branches' properties - a completion
 * list is an offer, and a property that any branch allows is worth offering.
 *
 * @param document - The schema document (the root, so that `$ref` can resolve)
 * @returns Array of flattened property info, parents before children
 */
export function extractSchemaProperties(
  document: JsonSchema
): SchemaPropertyInfo[] {
  const results: SchemaPropertyInfo[] = [];
  collectProperties(document, document, '', results, new Set());
  return results;
}

function collectProperties(
  node: JsonSchema,
  document: JsonSchema,
  prefix: string,
  results: SchemaPropertyInfo[],
  visiting: Set<JsonSchema>
): void {
  const resolved = resolveSchema(node, document, new Set());

  for (const [name, child] of resolved.properties) {
    const path = prefix ? `${prefix}.${name}` : name;
    const childResolved = resolveSchema(child, document, new Set());
    const childNames = Array.from(childResolved.properties.keys());
    const itemNames =
      childResolved.items === undefined
        ? []
        : Array.from(
            resolveSchema(
              childResolved.items,
              document,
              new Set()
            ).properties.keys()
          );

    results.push({
      path,
      type: normalizeType(childResolved.types),
      description: childResolved.description,
      required: resolved.required.has(name),
      hasChildren: childNames.length > 0 || itemNames.length > 0,
      childNames: childNames.length > 0 ? childNames : itemNames,
    });

    // A recursive schema (`$defs.Node.children.items.$ref = #/$defs/Node`) is
    // legal and would otherwise flatten forever.
    if (visiting.has(child)) continue;
    visiting.add(child);

    if (childNames.length > 0) {
      collectProperties(child, document, path, results, visiting);
    }
    if (childResolved.items !== undefined && itemNames.length > 0) {
      collectProperties(
        childResolved.items,
        document,
        `${path}[]`,
        results,
        visiting
      );
    }

    visiting.delete(child);
  }
}

/**
 * Follows `$ref` and merges composition into one view of a schema node.
 *
 * @param node - The node to resolve
 * @param document - The root document, for `$ref`
 * @param seen - Refs already followed on this chain, to stop a `$ref` cycle
 */
function resolveSchema(
  node: JsonSchema,
  document: JsonSchema,
  seen: Set<string>
): ResolvedSchema {
  const ref = node.$ref;
  if (ref !== undefined) {
    if (seen.has(ref)) return EMPTY_RESOLVED;
    seen.add(ref);
    const target = resolvePointer(ref, document);
    if (target === undefined) return EMPTY_RESOLVED;
    return resolveSchema(target, document, seen);
  }

  const types = new Set<string>();
  if (typeof node.type === 'string') types.add(node.type);
  else if (Array.isArray(node.type))
    for (const type of node.type) types.add(type);

  const properties = new Map<string, JsonSchema>();
  if (node.properties) {
    for (const [name, child] of Object.entries(node.properties)) {
      properties.set(name, child);
    }
  }

  const required = new Set<string>(node.required ?? []);
  let items = node.items;
  let description = node.description;

  // `allOf` is conjunction: everything every branch says is true here.
  // `oneOf`/`anyOf` are alternatives, so their properties are offered but their
  // `required` is not imposed - no single branch is known to apply.
  for (const [keyword, imposes] of [
    ['allOf', true],
    ['oneOf', false],
    ['anyOf', false],
  ] as const) {
    for (const branch of branchesOf(node, keyword)) {
      const merged = resolveSchema(branch, document, new Set(seen));
      for (const type of merged.types) types.add(type);
      for (const [name, child] of merged.properties) {
        if (!properties.has(name)) properties.set(name, child);
      }
      if (imposes) for (const name of merged.required) required.add(name);
      if (items === undefined) items = merged.items;
      if (description === undefined) description = merged.description;
    }
  }

  return { types: Array.from(types), description, properties, required, items };
}

function branchesOf(
  node: JsonSchema,
  keyword: 'allOf' | 'oneOf' | 'anyOf'
): readonly JsonSchema[] {
  return node[keyword] ?? [];
}

/**
 * Resolves a local JSON pointer (`#/$defs/User`) against the document.
 *
 * Remote references are not resolved: a schema that reaches across the network
 * is not something a template compiler should fetch. It resolves to nothing,
 * and the surrounding subtree simply has no known properties.
 */
function resolvePointer(
  ref: string,
  document: JsonSchema
): JsonSchema | undefined {
  if (!ref.startsWith('#')) return undefined;
  const pointer = ref.slice(1);
  if (pointer === '' || pointer === '/') return document;
  if (!pointer.startsWith('/')) return undefined;

  let current: unknown = document;
  for (const raw of pointer.slice(1).split('/')) {
    const segment = decodeURIComponent(raw)
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (
    typeof current !== 'object' ||
    current === null ||
    Array.isArray(current)
  ) {
    return undefined;
  }
  return current as JsonSchema;
}

/**
 * Gets completions for a given variable path.
 *
 * @param schema - The project schema
 * @param path - Current path (e.g., "$user" or "$user.address")
 * @returns Array of completion suggestions
 */
export function getSchemaCompletions(
  schema: ProjectSchema,
  path: string
): SchemaPropertyInfo[] {
  // Remove leading $ if present
  const normalizedPath = path.startsWith('$') ? path.slice(1) : path;

  if (!normalizedPath) {
    // Return top-level properties
    return schema.properties.filter(p => !p.path.includes('.'));
  }

  // Find properties that are direct children of the given path
  const prefix = normalizedPath + '.';
  return schema.properties.filter(p => {
    if (!p.path.startsWith(prefix)) return false;
    // Only direct children (no further dots after prefix)
    const remainder = p.path.slice(prefix.length);
    return !remainder.includes('.');
  });
}

/**
 * Gets type information for a specific path.
 *
 * @param schema - The project schema
 * @param path - Variable path (e.g., "user.name")
 * @returns Property info or null if not found
 */
export function getSchemaPropertyInfo(
  schema: ProjectSchema,
  path: string
): SchemaPropertyInfo | null {
  // Remove leading $ if present
  const normalizedPath = path.startsWith('$') ? path.slice(1) : path;
  return schema.properties.find(p => p.path === normalizedPath) ?? null;
}

/** Normalizes a resolved type set to a string representation. */
function normalizeType(types: readonly string[]): string {
  if (types.length === 0) return 'any';
  return types.join(' | ');
}
