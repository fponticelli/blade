# Data Model: @bladets/tempo

**Date**: 2025-12-02
**Feature**: 010-blade-tempo-package

## Overview

This package is a transformation library (no persistent storage). The data model describes the types that flow through the system from compiled template input to Tempo Renderable output.

## Core Types

### Input Types (from @bladets/template)

```typescript
// Already defined in @bladets/template
import type {
  CompiledTemplate,
  TemplateNode,
  ExprAst,
  RootNode,
  ComponentDefinition,
} from '@bladets/template';
```

### Input Types (from @tempots/dom)

```typescript
// Already defined in @tempots/dom
import type {
  Renderable,
  Signal,
  Prop,
} from '@tempots/dom';
```

### Package Types

#### TempoRenderOptions

Configuration for creating a Tempo renderer from a Blade template.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| helpers | `HelperRegistry` | No | `{}` | Custom helper functions for expressions |
| globals | `Record<string, unknown>` | No | `{}` | Global variables accessible in template |
| includeSourceTracking | `boolean` | No | `false` | Add rd-source attributes for debugging |
| sourceTrackingPrefix | `string` | No | `'rd-'` | Prefix for source tracking attributes |
| onError | `(error: Error, location: SourceLocation) => void` | No | console.warn | Error handler for runtime expression failures |

```typescript
interface TempoRenderOptions {
  helpers?: HelperRegistry;
  globals?: Record<string, unknown>;
  includeSourceTracking?: boolean;
  sourceTrackingPrefix?: string;
  onError?: (error: Error, location: SourceLocation) => void;
}
```

#### TempoRenderer

Factory function type returned by `createTempoRenderer`.

```typescript
type TempoRenderer<T> = (data: Signal<T> | Prop<T>) => Renderable;
```

#### RenderContext (internal)

Internal context passed through node converters during rendering.

| Field | Type | Description |
|-------|------|-------------|
| dataSignal | `Signal<unknown>` | The reactive data source |
| scope | `Scope` | Current variable scope (locals + globals) |
| helpers | `HelperRegistry` | Registered helper functions |
| config | `RenderConfig` | Rendering configuration |
| components | `Map<string, ComponentDefinition>` | Available component definitions |
| slots | `Map<string, Renderable>` | Slot content from parent |
| onError | `ErrorHandler` | Error callback |

```typescript
interface RenderContext {
  dataSignal: Signal<unknown>;
  scope: Scope;
  helpers: HelperRegistry;
  config: RenderConfig;
  components: Map<string, ComponentDefinition>;
  slots: Map<string, Renderable>;
  onError: (error: Error, location: SourceLocation) => void;
}
```

#### NodeConverter (internal)

Function signature for converting a Blade AST node to a Tempo Renderable.

```typescript
type NodeConverter<T extends TemplateNode> = (
  node: T,
  ctx: RenderContext
) => Renderable;
```

## Type Relationships

```
┌──────────────────────┐
│  CompiledTemplate    │ (from @bladets/template)
│  - root: RootNode    │
│  - diagnostics       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐     ┌─────────────────────┐
│ createTempoRenderer  │────▶│   TempoRenderer<T>  │
│ (options)            │     │   (factory fn)      │
└──────────────────────┘     └──────────┬──────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │  Signal<T> / Prop<T> │ (user provides)
                             └──────────┬───────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │     Renderable       │ (Tempo output)
                             │  - mounts to DOM     │
                             │  - reacts to signal  │
                             └──────────────────────┘
```

## Node Conversion Matrix

| Blade Node Type | Output Renderable Type | Reactive Behavior |
|-----------------|------------------------|-------------------|
| TextNode (literal) | `text(string)` | Static |
| TextNode (expr) | Signal-derived text | Updates on signal change |
| ElementNode | `html.*` element | Attributes may be reactive |
| IfNode | `when(signal, ...)` | Branch switches on signal |
| ForNode | `foreach(signal, ...)` | List updates on signal |
| MatchNode | Nested `when` | Pattern re-evaluated |
| LetNode | Local signal creation | Scoped computation |
| ComponentNode | Nested Renderable | Isolated data context |
| FragmentNode | `fragment(...)` | Children may be reactive |
| SlotNode | Content projection | From parent context |
| CommentNode | No-op or `text` | Static |

## Validation Rules

1. **Template must be compiled**: Input must be a valid `CompiledTemplate` with no errors
2. **Signal must be provided**: Data signal is required at render time
3. **Helper functions must be pure**: Side effects in helpers may cause unpredictable behavior
4. **Component names must exist**: Referenced components must be in template's component map

## State Transitions

This package is stateless per render. Each call to the TempoRenderer creates fresh Renderables. Signal state is managed by @tempots/dom.

```
┌─────────────┐     createTempoRenderer()     ┌─────────────────┐
│  Template   │ ─────────────────────────────▶│ TempoRenderer   │
│  (static)   │                               │ (factory)       │
└─────────────┘                               └────────┬────────┘
                                                       │
                                    renderer(signal)   │
                                                       ▼
                                              ┌─────────────────┐
                                              │   Renderable    │
                                              │   (mounted)     │
                                              └────────┬────────┘
                                                       │
                                    signal.value = x   │ (automatic)
                                                       ▼
                                              ┌─────────────────┐
                                              │   DOM Updates   │
                                              │   (by Tempo)    │
                                              └─────────────────┘
```
