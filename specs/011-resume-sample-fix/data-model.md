# Data Model: Resume Sample Fix

**Date**: 2025-12-08
**Feature**: 011-resume-sample-fix

## Overview

This feature is a bug fix that doesn't introduce new data models. It modifies the existing parser behavior for handling `<style>` and `<script>` tags.

## Existing Entities (Reference)

### Template AST Nodes

The parser produces AST nodes defined in [ast/types.ts](../../packages/blade/src/ast/types.ts):

| Node Type | Description | Affected by Fix |
|-----------|-------------|-----------------|
| `ElementNode` | HTML elements including `<style>` | Yes - children parsing |
| `TextNode` | Text content with expression segments | Yes - raw content handling |
| `TextSegment` | Literal or expression segment | Yes - expression extraction |

### Text Segments (within TextNode)

```typescript
type TextSegment =
  | { kind: 'literal'; value: string; location: SourceLocation }
  | { kind: 'expression'; expr: ExprAst; location: SourceLocation };
```

For raw content (style/script), segments will be:
- `literal` - CSS/JS code between expressions
- `expression` - `${...}` interpolations

## Sample Data (Resume)

The resume sample uses this data structure from `samples/resume/samples/data.json`:

```typescript
interface ResumeData {
  fontFamily?: string;           // Optional, uses 'Arial' fallback
  textColor: string;             // Required, e.g., "#4a4fb5"
  borderColor: string;           // Required, e.g., "#4a4fb5"

  includeWatermark: boolean;
  watermark: {
    text: string;
    color: string;
    transparency: number;
  };

  includeHeader: boolean;
  header: BannerConfig;

  includeFooter: boolean;
  footer: BannerConfig;
}

interface BannerConfig {
  shape: 'columns-1-image' | 'columns-1-text' | 'columns-2' | 'columns-3';
  showAgencyLogo: boolean;
  agencyLogo: string | null;
  showAgencyName: boolean;
  agencyName: string;
  agencyDetails: ContactDetails;
  recruiterDetails: ContactDetails;
}

interface ContactDetails {
  showAddressLine1: boolean;
  addressLine1: string | null;
  showAddressLine2: boolean;
  addressLine2: string | null;
  showAddressLine3?: boolean;
  addressLine3?: string | null;
  showPhoneNumber: boolean;
  phoneNumber: string;
  showUrl: boolean;
  url: string;
  showEmailAddress: boolean;
  emailAddress: string;
  showLinkedIn: boolean;
  linkedIn: string;
  showName?: boolean;
  name?: string;
}
```

## No Schema Changes Required

This fix modifies parser behavior only. The AST structure remains unchanged - `<style>` elements will still produce `ElementNode` with `TextNode` children, but the parsing logic for extracting those children changes.
