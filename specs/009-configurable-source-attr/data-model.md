# Data Model: Configurable Source Attribute

**Feature**: 009-configurable-source-attr
**Date**: 2025-11-27

## Overview

This feature modifies existing configuration entities. No new data entities are introduced.

## Modified Entities

### RenderConfig (existing)

Configuration object for template rendering behavior.

**Modified Fields**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sourceTrackingPrefix` | `string` | `"rd-"` | Prefix for source tracking attribute names. Now validated. |

**Validation Rules**:

1. Empty string is valid (results in unprefixed attributes)
2. Non-empty prefix must match pattern: `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`
3. Invalid prefix throws `RenderConfigError` before rendering begins

### RenderConfigError (new)

Error type for configuration validation failures.

```typescript
interface RenderConfigError {
  name: 'RenderConfigError';
  message: string;
  field: string;       // Which config field failed validation
  value: unknown;      // The invalid value provided
}
```

## Derived Attributes

The following HTML attributes are generated based on `sourceTrackingPrefix`:

| Base Name | Generated Attribute |
|-----------|---------------------|
| `source` | `${prefix}source` |
| `source-op` | `${prefix}source-op` |
| `source-note` | `${prefix}source-note` |

## Relationships

```
RenderOptions
    └── config: RenderConfig
            └── sourceTrackingPrefix: string → validates → generates attribute names
```

## State Transitions

N/A - Configuration is immutable during a render operation.
