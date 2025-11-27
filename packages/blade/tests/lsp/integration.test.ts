/**
 * LSP Integration Tests
 * Tests the full LSP completion flow using realistic template content
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../src/lsp/document.js';
import {
  getCompletionContext,
  getCompletions,
} from '../../src/lsp/providers/completion.js';

// The actual content from samples/start/index.blade
const INDEX_BLADE_CONTENT = `@props(title, subtitle?, items)

<template:Card title! subtitle="Default">
  <div class="card">
    <h2>$title</h2>
    @if(subtitle) {
      <p class="subtitle">\${subtitle}</p>
    }
    <slot />
  </div>
</template:Card>

<Card title=$title>
  @for(item, index of items) {
    <li>\${index + 1}. $item</li>
  }
</Card>
`;

/**
 * Helper to get completions at a specific line and column (1-based)
 */
function getCompletionsAt(content: string, line: number, column: number) {
  const doc = createDocument('test://index.blade', content);

  // Convert line/column to offset
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }
  offset += column - 1;

  const context = getCompletionContext(doc, offset);
  const completions = getCompletions(context, doc.scope);

  return { context, completions, doc };
}

/**
 * Helper to insert a character and get completions at that position
 */
function insertAndGetCompletions(content: string, line: number, column: number, insertChar: string) {
  const lines = content.split('\n');
  const lineContent = lines[line - 1] ?? '';
  lines[line - 1] = lineContent.slice(0, column - 1) + insertChar + lineContent.slice(column - 1);
  const newContent = lines.join('\n');

  // Get completions at position after inserted character
  return getCompletionsAt(newContent, line, column + insertChar.length);
}

describe('LSP Integration Tests - index.blade', () => {
  describe('Document Parsing', () => {
    it('should parse index.blade without errors', () => {
      const doc = createDocument('test://index.blade', INDEX_BLADE_CONTENT);

      // Should have parsed successfully
      expect(doc.ast).not.toBeNull();
      expect(doc.errors.length).toBe(0);
    });

    it('should extract @props variables into scope', () => {
      const doc = createDocument('test://index.blade', INDEX_BLADE_CONTENT);

      // Check that props are in the scope
      const propsAtStart = doc.scope.variables.get(0);
      expect(propsAtStart).toBeDefined();

      const propNames = propsAtStart?.map(v => v.name) ?? [];
      expect(propNames).toContain('title');
      expect(propNames).toContain('subtitle');
      expect(propNames).toContain('items');
    });

    it('should mark @props variables as kind "prop"', () => {
      const doc = createDocument('test://index.blade', INDEX_BLADE_CONTENT);

      const propsAtStart = doc.scope.variables.get(0) ?? [];
      const titleVar = propsAtStart.find(v => v.name === 'title');

      expect(titleVar?.kind).toBe('prop');
    });
  });

  describe('Expression Context Detection', () => {
    it('should detect expression context when typing $ on line 5', () => {
      // Line 5: "    <h2>$title</h2>"
      // Insert $ after <h2>
      const { context } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      expect(context.contextKind).toBe('expression');
    });

    it('should detect expression context inside ${} on line 7', () => {
      // Line 7: "      <p class="subtitle">${subtitle}</p>"
      // Position inside ${}
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line7 = lines[6]; // 0-indexed
      const dollarPos = line7.indexOf('${');

      const { context } = getCompletionsAt(INDEX_BLADE_CONTENT, 7, dollarPos + 3);

      expect(context.contextKind).toBe('expression');
    });

    it('should detect expression context inside ${} on line 15', () => {
      // Line 15: "    <li>${index + 1}. $item</li>"
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line15 = lines[14]; // 0-indexed
      const dollarPos = line15.indexOf('${');

      const { context } = getCompletionsAt(INDEX_BLADE_CONTENT, 15, dollarPos + 3);

      expect(context.contextKind).toBe('expression');
    });
  });

  describe('@props Completions Outside Loops', () => {
    it('should show title, subtitle, items when typing $ on line 5 (inside template)', () => {
      // Line 5 is inside <template:Card>, outside any loop
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      const labels = completions.map(c => c.label);

      expect(labels).toContain('title');
      expect(labels).toContain('subtitle');
      expect(labels).toContain('items');
    });

    it('should show props as "Component prop" detail', () => {
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      const titleCompletion = completions.find(c => c.label === 'title');
      expect(titleCompletion?.detail).toBe('Component prop');
    });

    it('should NOT show @for loop variables (item, index) outside the loop', () => {
      // Line 5 is before the @for loop on line 14
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      const labels = completions.map(c => c.label);

      expect(labels).not.toContain('item');
      expect(labels).not.toContain('index');
    });
  });

  describe('@for Loop Variable Scoping', () => {
    it('should show item and index when typing $ inside @for loop (line 15)', () => {
      // Line 15: "    <li>${index + 1}. $item</li>"
      // This is inside the @for loop
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line15 = lines[14];
      // Find position after $item to insert a new $
      const itemPos = line15.indexOf('$item');

      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 15, itemPos + 1, '$');

      const labels = completions.map(c => c.label);

      expect(labels).toContain('item');
      expect(labels).toContain('index');
    });

    it('should show item as "Loop item" and index as "Loop index"', () => {
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line15 = lines[14];
      const itemPos = line15.indexOf('$item');

      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 15, itemPos + 1, '$');

      const itemCompletion = completions.find(c => c.label === 'item');
      const indexCompletion = completions.find(c => c.label === 'index');

      expect(itemCompletion?.detail).toBe('Loop item');
      expect(indexCompletion?.detail).toBe('Loop index');
    });

    it('should also show @props variables inside the loop', () => {
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line15 = lines[14];
      const itemPos = line15.indexOf('$item');

      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 15, itemPos + 1, '$');

      const labels = completions.map(c => c.label);

      // Props should be available everywhere
      expect(labels).toContain('title');
      expect(labels).toContain('subtitle');
      expect(labels).toContain('items');
    });
  });

  describe('Helper Function Completions', () => {
    it('should show helper functions when typing $', () => {
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      const labels = completions.map(c => c.label);

      expect(labels).toContain('formatCurrency');
      expect(labels).toContain('formatDate');
      expect(labels).toContain('formatNumber');
      expect(labels).toContain('uppercase');
      expect(labels).toContain('lowercase');
    });

    it('should show helper functions with proper signatures', () => {
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 5, 9, '$');

      const formatCurrency = completions.find(c => c.label === 'formatCurrency');
      expect(formatCurrency?.detail).toContain('number');
    });
  });

  describe('Directive Context Detection', () => {
    it('should detect directive context when typing @', () => {
      // Insert @ at beginning of a new line
      const { context } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 12, 1, '@');

      expect(context.contextKind).toBe('directive');
    });

    it('should provide directive completions for @', () => {
      const { completions } = insertAndGetCompletions(INDEX_BLADE_CONTENT, 12, 1, '@');

      const labels = completions.map(c => c.label);

      expect(labels).toContain('if');
      expect(labels).toContain('for');
      expect(labels).toContain('match');
    });
  });

  describe('Scope Map Offset Adjustment', () => {
    it('should correctly adjust offsets for @props stripping', () => {
      const doc = createDocument('test://index.blade', INDEX_BLADE_CONTENT);

      // The @props line is stripped, so offsets should be adjusted
      // @props(title, subtitle?, items)\n = 32 characters
      const propsLineLength = '@props(title, subtitle?, items)\n'.length;

      // Check that there are scope entries at adjusted positions
      const offsets = Array.from(doc.scope.variables.keys()).sort((a, b) => a - b);

      // First entry should be at 0 (for props available at start)
      expect(offsets[0]).toBe(0);

      // Other entries should be > 0 (after props line)
      const nonZeroOffsets = offsets.filter(o => o > 0);
      expect(nonZeroOffsets.length).toBeGreaterThan(0);

      // The first non-zero offset should account for the props line
      expect(nonZeroOffsets[0]).toBeGreaterThanOrEqual(propsLineLength);
    });
  });

  describe('Text Context (No Completions)', () => {
    it('should detect text context in plain content', () => {
      // Use simple content where we can clearly position in text
      const content = '<div>hello world</div>';
      // Position in the middle of "hello world" text
      const { context } = getCompletionsAt(content, 1, 10);

      expect(context.contextKind).toBe('text');
    });

    it('should return no completions in text context', () => {
      const content = '<div>hello world</div>';
      const { completions } = getCompletionsAt(content, 1, 10);

      expect(completions.length).toBe(0);
    });
  });

  describe('Position Accuracy', () => {
    it('should correctly identify position at $title on line 5', () => {
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line5 = lines[4]; // 0-indexed
      const dollarPos = line5.indexOf('$title');

      // Position right after the $
      const { context } = getCompletionsAt(INDEX_BLADE_CONTENT, 5, dollarPos + 2);

      expect(context.contextKind).toBe('expression');
    });

    it('should correctly identify position at ${subtitle} on line 7', () => {
      const lines = INDEX_BLADE_CONTENT.split('\n');
      const line7 = lines[6]; // 0-indexed
      const dollarBracePos = line7.indexOf('${');

      // Position inside ${ }
      const { context } = getCompletionsAt(INDEX_BLADE_CONTENT, 7, dollarBracePos + 3);

      expect(context.contextKind).toBe('expression');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty @props', () => {
    const content = '@props()\n<div>$</div>';
    const doc = createDocument('test://test.blade', content);

    expect(doc.errors.length).toBe(0);

    const { completions } = insertAndGetCompletions(content, 2, 6, '$');

    // Should still get helper functions, just no props
    const labels = completions.map(c => c.label);
    expect(labels).toContain('formatCurrency');
    expect(labels).not.toContain('title');
  });

  it('should handle file without @props', () => {
    const content = '<div>$</div>';
    const doc = createDocument('test://test.blade', content);

    expect(doc.errors.length).toBe(0);

    const { completions } = insertAndGetCompletions(content, 1, 6, '$');

    // Should get helper functions
    const labels = completions.map(c => c.label);
    expect(labels).toContain('formatCurrency');
  });

  it('should handle nested @for loops', () => {
    const content = `@props(data)
@for(outer of data) {
  @for(inner of outer) {
    <span>$</span>
  }
}`;
    const { completions } = insertAndGetCompletions(content, 4, 11, '$');

    const labels = completions.map(c => c.label);

    // Should have both loop variables
    expect(labels).toContain('outer');
    expect(labels).toContain('inner');
    // And props
    expect(labels).toContain('data');
  });
});
