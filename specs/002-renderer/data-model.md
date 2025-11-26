# Data Model: Template Renderer

**Feature**: 002-renderer
**Date**: 2025-11-25

## Overview

This document defines the data structures and type definitions for the template renderer.

## Core Types

### RenderContext

Extends EvaluationContext with resource tracking.

```typescript
interface RenderContext {
  // From EvaluationContext
  scope: Scope;
  helpers: HelperRegistry;
  config: EvaluatorConfig;

  // Renderer additions
  renderConfig: RenderConfig;
  limits: ResourceLimits;

  // Runtime tracking
  currentLoopNesting: number;
  totalIterations: number;
  componentDepth: number;

  // Metadata collection
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;

  // Component context
  components: Map<string, ComponentDefinition>;
  slots: Map<string, TemplateNode[]>;  // Caller's slot content
}
```

### RenderConfig (existing, augmented)

```typescript
interface RenderConfig {
  includeComments: boolean;        // Render HTML comments
  includeSourceTracking: boolean;  // Add rd-source attributes
  preserveWhitespace: boolean;     // Preserve all whitespace
  htmlEscape: boolean;             // Escape expression values
  sourceTrackingPrefix: string;    // Default: "rd-"
  includeOperationTracking: boolean; // Add rd-source-op
  includeNoteGeneration: boolean;  // Add rd-source-note
}
```

### RenderResult (existing)

```typescript
interface RenderResult {
  html: string;
  metadata: RuntimeMetadata;
}
```

### RuntimeMetadata (existing)

```typescript
interface RuntimeMetadata {
  pathsAccessed: Set<string>;
  helpersUsed: Set<string>;
  renderTime: number;
  iterationCount: number;
  recursionDepth: number;
}
```

### ResourceLimits (existing)

```typescript
interface ResourceLimits {
  maxLoopNesting: number;         // Default: 5
  maxIterationsPerLoop: number;   // Default: 1000
  maxTotalIterations: number;     // Default: 10000
  maxFunctionCallDepth: number;   // Default: 10
  maxExpressionNodes: number;     // Default: 1000
  maxRecursionDepth: number;      // Default: 50
  maxComponentDepth: number;      // Default: 10
}
```

## Error Types

### RenderError

```typescript
class RenderError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly code: string,
    public readonly cause?: Error
  );
}
```

**Error Codes**:
- `LOOP_NESTING_EXCEEDED`: Loop nesting depth exceeded
- `ITERATION_LIMIT_EXCEEDED`: Too many iterations
- `COMPONENT_DEPTH_EXCEEDED`: Component nesting too deep
- `UNKNOWN_COMPONENT`: Component not defined
- `RENDER_FAILED`: General rendering failure

### ResourceLimitError

```typescript
class ResourceLimitError extends RenderError {
  constructor(
    limitType: 'loopNesting' | 'iterations' | 'componentDepth',
    current: number,
    max: number,
    location: SourceLocation
  );
}
```

## Scope Types

### Scope (from evaluator, unchanged)

```typescript
interface Scope {
  locals: Record<string, unknown>;  // Template-local variables
  data: unknown;                    // Render data
  globals: Record<string, unknown>; // Global configuration
}
```

### Scope Operations

```typescript
// Create child scope for loops
function createLoopScope(
  parent: Scope,
  itemVar: string,
  itemValue: unknown,
  indexVar?: string,
  indexValue?: number
): Scope;

// Create isolated scope for components
function createComponentScope(
  props: Record<string, unknown>,
  globals: Record<string, unknown>
): Scope;

// Add let declaration to scope
function addToScope(
  scope: Scope,
  name: string,
  value: unknown,
  isGlobal: boolean
): Scope;
```

## Attribute Rendering

### Attribute Value Resolution

```typescript
type ResolvedAttribute =
  | { kind: 'present'; name: string }           // Boolean true
  | { kind: 'value'; name: string; value: string } // String value
  | { kind: 'omit' };                           // null/undefined/false

function resolveAttribute(
  attr: AttributeNode,
  context: RenderContext
): ResolvedAttribute;
```

## Source Tracking

### PathTracker

```typescript
interface PathTracker {
  paths: Set<string>;
  operations: Set<string>;

  track(path: string): void;
  trackOperation(op: string): void;

  getSourceAttribute(): string | null;      // "path1,path2"
  getOperationAttribute(): string | null;   // "op1,op2"
}
```

## State Transitions

### Render Context Lifecycle

```
Initial State
    │
    ▼
┌─────────────────────┐
│  Create Context     │ ← RenderOptions + Template + Data
│  (reset counters)   │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Render Root        │ ← RootNode.children
│  (iterate children) │
└─────────────────────┘
    │
    ├──► For Each Child Node ──┐
    │                          │
    ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Check Limits       │    │  Render Node        │
│  (throw if exceed)  │    │  (type-specific)    │
└─────────────────────┘    └─────────────────────┘
    │                          │
    ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Update Counters    │    │  Collect Metadata   │
│  (iterations, etc)  │    │  (paths, helpers)   │
└─────────────────────┘    └─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Return Result      │ ← html + metadata
└─────────────────────┘
```

### Loop Scope Lifecycle

```
@for(item of items)
    │
    ▼
┌─────────────────────┐
│  Check Nesting Limit │
│  Increment nesting   │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Evaluate items expr │ ← Array or Object
└─────────────────────┘
    │
    ├──► For Each Item ──────────────┐
    │                                │
    ▼                                ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Check Iteration    │    │  Create Loop Scope  │
│  Limits             │    │  (item, index)      │
└─────────────────────┘    └─────────────────────┘
                               │
                               ▼
                       ┌─────────────────────┐
                       │  Render Body        │
                       │  (with loop scope)  │
                       └─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Decrement nesting   │
│  Continue rendering  │
└─────────────────────┘
```

### Component Scope Lifecycle

```
<MyComponent prop={value}>
    │
    ▼
┌─────────────────────┐
│  Check Component    │
│  Depth Limit        │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Evaluate Props     │ ← In caller's scope
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Create Isolated    │ ← Props only, no parent
│  Component Scope    │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Store Slot Content │ ← Caller's children
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Render Component   │ ← Component definition
│  Body               │    with isolated scope
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  Decrement depth    │
│  Restore context    │
└─────────────────────┘
```

## Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| loopNesting | <= limits.maxLoopNesting | ResourceLimitError |
| totalIterations | <= limits.maxTotalIterations | ResourceLimitError |
| componentDepth | <= limits.maxComponentDepth | ResourceLimitError |
| component name | exists in components map | RenderError(UNKNOWN_COMPONENT) |
| expression | valid per evaluator | EvaluationError (propagated) |
