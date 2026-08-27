/**
 * Project-based Template Compilation for Blade
 *
 * Compiles a Blade project: the entry file and every component it discovered,
 * with dot-notation namespacing, component reference validation and prop
 * checking across the whole reachable graph.
 *
 * {@link compileProjectSources} is pure - it is a function of the bytes
 * {@link readProjectSources} gathered - so every check below can be tested
 * from an inline string map instead of a directory on disk.
 */

import { relative } from 'path';
import type {
  ComponentDefinition,
  ComponentInfo,
  ComponentNode,
  Diagnostic,
  ProjectResult,
  RootNode,
  SourceLocation,
  ValidTemplate,
} from '../ast/types.js';
import { compile } from '../compiler/index.js';
import type { TemplateParseResult } from '../parser/index.js';
import { parseTemplate } from '../parser/index.js';
import type { ComponentRegistry } from '../validation/index.js';
import { createDiagnostic } from '../validation/index.js';
import { componentPropsFrom, createUndeclaredPropDiagnostic } from './props.js';
import type { ComponentPropsResult } from './props.js';
import {
  collectComponentUsages,
  createMissingComponentDiagnostic,
  createProjectContext,
} from './resolver.js';
import { readProjectSources } from './sources.js';
import type { ProjectLoadOptions, ProjectSources } from './sources.js';

/**
 * Compiles a Blade project from a directory.
 *
 * Asynchronous, and every part of the module below it is too. The split - a
 * synchronous `compileProject` over asynchronous schema and sample loaders -
 * was not cosmetic: a synchronous function cannot await a loader, so the
 * project context was built with `schema: undefined` and `samples: new Map()`
 * unconditionally, and the schema-driven validation that reads them could
 * never run for any project.
 *
 * @param projectPath - Path to the project root (must contain the entry file)
 * @param options - Entry point, filesystem and discovery bounds
 * @returns The compilation result with AST, context, warnings, and errors
 * @throws {PathEscapeError} If `entry` resolves outside the project root
 * @throws Error If the project root doesn't exist or has no entry file
 */
export async function compileProject(
  projectPath: string,
  options?: ProjectLoadOptions
): Promise<ProjectResult> {
  return compileProjectSources(await readProjectSources(projectPath, options));
}

/**
 * One component of the project, ready to be compiled.
 *
 * The parse yields the props and the body that the registry needs *before*
 * anything can be compiled against it - a component cannot be checked until
 * every component is known - and `compile()` parses again, because the one
 * semantic pass takes a source string. Two parses per component, where the
 * previous version read each file three times and parsed it twice, and then
 * validated only the entry file.
 */
interface ComponentFile {
  /** Path relative to the project root. */
  readonly path: string;
  readonly tagName: string;
  readonly source: string;
  readonly parsed: TemplateParseResult;
  readonly props: ComponentPropsResult;
}

/** What {@link collectFileDiagnostics} needs to know about the file it reports on. */
interface FileIdentity {
  readonly path: string;
  /** Undefined for the entry file, which is not a component. */
  readonly tagName: string | undefined;
  readonly props: ComponentPropsResult | undefined;
}

/**
 * Compiles a project from sources already read.
 *
 * Pure: no filesystem, no clock, no globals. Every call does the whole job -
 * see {@link createProjectCompiler} for the version that keeps what it already
 * computed.
 *
 * @param sources - What {@link readProjectSources} gathered
 * @returns The compilation result
 */
export function compileProjectSources(sources: ProjectSources): ProjectResult {
  return new IncrementalProjectCompiler().compile(sources);
}

/**
 * A project compile that reuses the work it already did.
 *
 * {@link compileProjectSources} parses and compiles every component on every
 * call. That is the right shape for a build, and the wrong one for a live
 * preview or a language server, where the *only* thing that changed since the
 * last call is the buffer the user is typing into: a twenty-component project
 * paid twenty parses and twenty compiles per keystroke burst to rebuild a
 * byte-identical component set.
 *
 * A compiler holds the per-component work, keyed by the bytes it was computed
 * from. A component is re-parsed when its own source or path changes, and
 * re-compiled when any component changes - because a component is checked
 * *against* the registry of all of them, so a sibling's props can change its
 * diagnostics. The entry file is compiled every time; it is the one that
 * changed.
 *
 * Correct by construction rather than by invalidation: nothing here reads a
 * clock or an mtime, and a cached value is reused only when the exact input
 * that produced it comes back.
 */
export interface ProjectCompiler {
  /**
   * Compiles a project, reusing everything still valid from previous calls.
   *
   * @param sources - What {@link readProjectSources} gathered
   * @returns The compilation result
   */
  compile(sources: ProjectSources): ProjectResult;
}

/**
 * Creates a {@link ProjectCompiler}.
 *
 * One per project root: handing it a different root or entry point discards
 * everything it held, so a shared instance across projects would cache nothing.
 *
 * @returns A compiler that reuses per-component work across calls
 *
 * @example
 * ```typescript
 * const compiler = createProjectCompiler();
 * // Every keystroke: one entry-file compile, the components reused.
 * const result = compiler.compile(await readProjectSources(root, { io }));
 * ```
 */
export function createProjectCompiler(): ProjectCompiler {
  return new IncrementalProjectCompiler();
}

/** One component's phase-1 result, and the bytes it came from. */
interface ParsedComponent {
  readonly source: string;
  readonly path: string;
  readonly parsed: TemplateParseResult;
  readonly props: ComponentPropsResult;
}

/** One component's phase-2 result, and the registry generation it was checked against. */
interface CompiledComponent {
  readonly registryVersion: number;
  readonly usages: ReadonlyMap<string, ComponentNode[]>;
  readonly diagnostics: readonly Diagnostic[];
  readonly definition: ComponentDefinition;
}

class IncrementalProjectCompiler implements ProjectCompiler {
  /** Absolute root the cached values describe; null before the first call. */
  private root: string | null = null;
  private entry: string | null = null;
  /**
   * Bumped whenever the component set changes.
   *
   * A component's diagnostics depend on every other component, so one edit
   * invalidates them all - but only when a component file changed, never when
   * the entry buffer did.
   */
  private registryVersion = 0;
  private readonly parsed = new Map<string, ParsedComponent>();
  private readonly compiled = new Map<string, CompiledComponent>();

  compile(sources: ProjectSources): ProjectResult {
    if (this.root !== sources.root || this.entry !== sources.entry) {
      // A different project entirely: nothing held describes it.
      this.root = sources.root;
      this.entry = sources.entry;
      this.parsed.clear();
      this.compiled.clear();
      this.registryVersion++;
    }

    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const report = (diagnostic: Diagnostic): void => {
      (diagnostic.level === 'error' ? errors : warnings).push(diagnostic);
    };

    for (const diagnostic of sources.diagnostics) report(diagnostic);

    // -- Phase 1: parse every component once, for its props and its body -----
    const components = this.parseComponents(sources);

    // -- The registry every file is checked against -------------------------
    const registry: ComponentRegistry = Object.create(
      null
    ) as ComponentRegistry;
    for (const [tagName, file] of components) {
      registry[tagName] = {
        props: file.props.props,
        // The body is what tells the validator which slots the component
        // declares, so that a `<slot:hedaer>` fill matching none of them is
        // reported instead of silently rendering the fallback.
        body: file.parsed.value,
        definedIn: file.path,
      };
    }

    // -- Phase 2: compile every file against it -----------------------------
    const entryResult = compile(sources.entrySource, {
      components: registry,
      // Only the entry file is rendered with the project's data; a component is
      // rendered with props, which the schema says nothing about.
      schema: sources.schema?.schema,
    });
    const entryRoot = entryResult.ok
      ? entryResult.template.root
      : entryResult.partial.root;

    // One traversal per file answers every question asked about component
    // usage: which names occur, where each occurrence is, and what the
    // reference graph looks like. The previous version walked the entry AST
    // once per referenced component to find its first location, and again per
    // component to find all its usages - O(R x N) where one pass does.
    const entryUsages = collectComponentUsages(entryRoot);
    for (const diagnostic of collectFileDiagnostics(
      { path: sources.entry, tagName: undefined, props: undefined },
      entryRoot,
      entryUsages,
      entryResult.ok
        ? entryResult.template.diagnostics
        : entryResult.diagnostics,
      sources,
      registry
    )) {
      report(diagnostic);
    }

    const definitions = new Map<string, ComponentDefinition>();
    const usagesByComponent = new Map<
      string,
      ReadonlyMap<string, ComponentNode[]>
    >();

    for (const [tagName, file] of components) {
      let memo = this.compiled.get(tagName);
      if (memo === undefined || memo.registryVersion !== this.registryVersion) {
        const result = compile(file.source, { components: registry });
        const root = result.ok ? result.template.root : result.partial.root;
        const usages = collectComponentUsages(root);
        memo = {
          registryVersion: this.registryVersion,
          usages,
          diagnostics: collectFileDiagnostics(
            file,
            root,
            usages,
            result.ok ? result.template.diagnostics : result.diagnostics,
            sources,
            registry
          ),
          definition: {
            name: tagName,
            props: root.props,
            body: root.children,
            location: root.location,
          },
        };
        this.compiled.set(tagName, memo);
      }

      usagesByComponent.set(tagName, memo.usages);
      for (const diagnostic of memo.diagnostics) report(diagnostic);
      definitions.set(tagName, memo.definition);
    }

    reportCycles(sources, entryUsages, usagesByComponent, report);
    reportSampleMismatches(sources, report);

    const context = createProjectContext({
      rootPath: sources.root,
      entry: sources.entry,
      schema: sources.schema?.schema,
      samples: sampleData(sources),
      components: contextComponents(sources, components),
    });

    return {
      ast: entryRoot,
      context: { ...context, warnings, errors },
      warnings,
      errors,
      success: errors.length === 0,
      // A project that produced an error has no renderable template, and saying
      // so with `null` is what stops a caller rendering one anyway.
      template:
        errors.length === 0 && entryResult.ok
          ? mergeComponents(entryResult.template, definitions)
          : null,
    };
  }

  /**
   * Every readable component, parsed - reusing the parse when the bytes and the
   * path are the ones the cached value was computed from.
   */
  private parseComponents(
    sources: ProjectSources
  ): ReadonlyMap<string, ComponentFile> {
    const files = new Map<string, ComponentFile>();
    let changed = false;

    for (const [tagName, source] of sources.components) {
      // An unreadable component was already reported by the loader.
      if (source.source === null) continue;

      let memo = this.parsed.get(tagName);
      if (
        memo === undefined ||
        memo.source !== source.source ||
        memo.path !== source.path
      ) {
        const parsed = parseTemplate(source.source);
        memo = {
          source: source.source,
          path: source.path,
          parsed,
          props: componentPropsFrom(parsed),
        };
        this.parsed.set(tagName, memo);
        changed = true;
      }

      files.set(tagName, {
        path: memo.path,
        tagName,
        source: memo.source,
        parsed: memo.parsed,
        props: memo.props,
      });
    }

    for (const tagName of this.parsed.keys()) {
      if (files.has(tagName)) continue;
      this.parsed.delete(tagName);
      this.compiled.delete(tagName);
      changed = true;
    }

    if (changed) this.registryVersion++;
    return files;
  }
}

/**
 * Every finding about one file: its own diagnostics, the components it calls
 * that do not exist, and the props it reads without declaring.
 *
 * Returned rather than reported through a callback, so that one file's findings
 * are a value a {@link ProjectCompiler} can hold on to and replay.
 *
 * Diagnostics are stamped with the file they index, because a project compile
 * reports on files other than the one the caller named. Validation used to run
 * on the entry file alone: a typo in `card.blade`'s own markup - `<Buton/>` -
 * produced no diagnostic at all, and the project compiled successfully right
 * up until something rendered `Card`.
 */
function collectFileDiagnostics(
  file: FileIdentity,
  root: RootNode,
  usages: ReadonlyMap<string, ComponentNode[]>,
  diagnostics: readonly Diagnostic[],
  sources: ProjectSources,
  registry: ComponentRegistry
): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  const report = (diagnostic: Diagnostic): void => {
    found.push(diagnostic);
  };

  for (const diagnostic of diagnostics) {
    // The project reports an unresolved component itself, with the path it
    // looked for and the root it searched; the compiler's flatter version of
    // the same finding would be a second error for one problem.
    if (diagnostic.code === 'UNKNOWN_COMPONENT') continue;
    report(withFile(diagnostic, file.path));
  }

  for (const [tagName, occurrences] of usages) {
    if (tagName === tagName.toLowerCase()) continue;
    // A component defined inline with `<template:Name>` is bound by the
    // compiler and has no file on disk to look for.
    if (root.components.has(tagName)) continue;
    if (tagName in registry) continue;

    for (const usage of occurrences) {
      report(
        withFile(
          createMissingComponentDiagnostic(
            tagName,
            usage.location,
            sources.root
          ),
          file.path
        )
      );
    }
  }

  if (file.props === undefined || file.tagName === undefined) return found;

  if (file.props.inferred) {
    for (const declaration of file.props.props) {
      report(
        withFile(
          createUndeclaredPropDiagnostic(
            declaration.name,
            file.tagName,
            declaration.location
          ),
          file.path
        )
      );
    }
  }

  for (const warning of file.props.warnings) {
    report(
      withFile(
        createDiagnostic(
          'warning',
          `[${file.tagName}] ${warning.message}`,
          pointAt(warning.line, warning.column),
          'INVALID_PROPS'
        ),
        file.path
      )
    );
  }

  return found;
}

/**
 * Reports every component reference cycle reachable from the entry file.
 *
 * A warning rather than an error, deliberately: `<Comment>` rendering a reply
 * thread by calling itself is a correct program, and recursion here terminates
 * on the data, not on the graph. What the warning buys is that a cycle is
 * *visible* - an unbounded one is otherwise found by the renderer's depth
 * limit at run time, or by a hang. `CIRCULAR_COMPONENT` has been a declared
 * diagnostic code all along, with nothing that produced it.
 */
function reportCycles(
  sources: ProjectSources,
  entryUsages: ReadonlyMap<string, ComponentNode[]>,
  edges: ReadonlyMap<string, ReadonlyMap<string, ComponentNode[]>>,
  report: (diagnostic: Diagnostic) => void
): void {
  const reported = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const finished = new Set<string>();

  const visit = (tagName: string): void => {
    if (onStack.has(tagName)) {
      const cycle = stack.slice(stack.indexOf(tagName));
      const key = [...cycle].sort().join('>');
      if (reported.has(key)) return;
      reported.add(key);

      const caller = stack[stack.length - 1] ?? tagName;
      const usage = edges.get(caller)?.get(tagName)?.[0];
      report(
        withFile(
          createDiagnostic(
            'warning',
            `Component reference cycle: ${[...cycle, tagName].join(' -> ')}.\n` +
              `  Rendering it recurses, and terminates only on the data.`,
            usage?.location ?? pointAt(1, 1),
            'CIRCULAR_COMPONENT'
          ),
          sources.components.get(caller)?.path ?? caller
        )
      );
      return;
    }
    if (finished.has(tagName)) return;

    stack.push(tagName);
    onStack.add(tagName);
    for (const next of edges.get(tagName)?.keys() ?? []) {
      if (edges.has(next)) visit(next);
    }
    onStack.delete(tagName);
    stack.pop();
    finished.add(tagName);
  };

  for (const tagName of entryUsages.keys()) {
    if (edges.has(tagName)) visit(tagName);
  }
}

/**
 * Validates every sample the project ships against its schema.
 *
 * This is the advertised feature that could not run: the project context's
 * schema was hard-coded to `undefined`, so every guard that reads it fell
 * through and no sample was ever checked against anything.
 */
function reportSampleMismatches(
  sources: ProjectSources,
  report: (diagnostic: Diagnostic) => void
): void {
  if (!sources.schema || !sources.samples) return;

  for (const sample of sources.samples.samples) {
    for (const error of sources.schema.validate(sample.data)) {
      report(
        withFile(
          createDiagnostic(
            'warning',
            `Sample '${sample.name}' does not match schema.json at ${error.path}: ${error.message}`,
            pointAt(1, 1),
            'SAMPLE_SCHEMA_MISMATCH'
          ),
          relative(sources.root, sample.filePath)
        )
      );
    }
  }
}

/** The discovered components, with the props each file actually declares. */
function contextComponents(
  sources: ProjectSources,
  files: ReadonlyMap<string, ComponentFile>
): Map<string, ComponentInfo> {
  const components = new Map<string, ComponentInfo>();
  for (const [tagName, source] of sources.components) {
    const file = files.get(tagName);
    components.set(tagName, {
      ...source.info,
      props: file?.props.props,
      propsInferred: file?.props.inferred ?? false,
    });
  }
  return components;
}

function sampleData(sources: ProjectSources): ReadonlyMap<string, unknown> {
  const samples = new Map<string, unknown>();
  for (const sample of sources.samples?.samples ?? []) {
    samples.set(sample.name, sample.data);
  }
  return samples;
}

/**
 * The entry template with every discovered component merged into its map.
 *
 * Inline `<template:Name>` definitions win: a file that declares a component
 * of its own means that one, whatever a sibling file is called.
 */
function mergeComponents(
  entry: ValidTemplate,
  definitions: ReadonlyMap<string, ComponentDefinition>
): ValidTemplate {
  const components = new Map(entry.root.components);
  for (const [tagName, definition] of definitions) {
    if (!components.has(tagName)) components.set(tagName, definition);
  }
  return { ...entry, root: { ...entry.root, components } };
}

function withFile(diagnostic: Diagnostic, file: string): Diagnostic {
  return diagnostic.file === undefined ? { ...diagnostic, file } : diagnostic;
}

function pointAt(line: number, column: number): SourceLocation {
  return {
    start: { line, column, offset: 0 },
    end: { line, column, offset: 0 },
  };
}
