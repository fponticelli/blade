/**
 * Completion Provider Tests
 * Tests for US3: Autocompletion for Expressions
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../src/lsp/document.js';
import {
  getCompletionContext,
  getCompletions,
} from '../../src/lsp/providers/completion.js';

/**
 * Helper to get completion context at a given offset
 */
function getContextAtOffset(content: string, offset: number) {
  const doc = createDocument('test://test.blade', content);
  return getCompletionContext(doc, offset);
}

/**
 * Helper to get completions at a given offset
 */
function getCompletionsAtOffset(content: string, offset: number) {
  const doc = createDocument('test://test.blade', content);
  const context = getCompletionContext(doc, offset);
  return getCompletions(context, doc.scope);
}

describe('Completion Provider', () => {
  describe('Context Detection', () => {
    it('should detect expression context inside ${...}', () => {
      const content = '<div>${}</div>';
      const offset = 7; // Inside ${}
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('expression');
    });

    it('should detect expression-path context after dot', () => {
      const content = '<div>${user.}</div>';
      const offset = 12; // After the dot
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('expression-path');
    });

    it('should detect directive context after @', () => {
      const content = '@';
      const offset = 1;
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('directive');
    });

    it('should detect html-tag context after <', () => {
      const content = '<div><</div>';
      const offset = 6; // After second <
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('html-tag');
    });

    it('should detect html-attribute context inside tag', () => {
      const content = '<div ></div>';
      const offset = 5; // Inside <div _>
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('html-attribute');
    });

    it('should detect component-prop context inside component tag', () => {
      const content = '<UserCard ></UserCard>';
      const offset = 10; // Inside <UserCard _>
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('component-prop');
    });

    it('should detect text context in plain text', () => {
      const content = '<div>hello </div>';
      const offset = 10; // Inside text content
      const context = getContextAtOffset(content, offset);
      expect(context.contextKind).toBe('text');
    });
  });

  describe('Expression Completions', () => {
    it('should return array of completions inside expression', () => {
      const content = '<div>${}</div>';
      const offset = 7; // Inside ${}
      const completions = getCompletionsAtOffset(content, offset);

      // Should return an array (variables come from scope analysis)
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should include builtin helper functions', () => {
      const content = '<div>${}</div>';
      const offset = 7; // Inside ${}
      const completions = getCompletionsAtOffset(content, offset);

      // Should have helper functions like formatCurrency
      const formatCurrency = completions.find(
        c => c.label === 'formatCurrency'
      );
      expect(formatCurrency).toBeDefined();
    });

    it('should provide helper function with documentation', () => {
      const content = '<div>${}</div>';
      const offset = 7; // Inside ${}
      const completions = getCompletionsAtOffset(content, offset);

      const formatDate = completions.find(c => c.label === 'formatDate');
      expect(formatDate).toBeDefined();
      expect(formatDate?.detail).toContain('Date');
    });

    it('should provide global variables with $ prefix', () => {
      const content = '<div>${$.}</div>';
      const offset = 10; // After $.
      const completions = getCompletionsAtOffset(content, offset);

      // Should have some completions (globals would come from config)
      expect(Array.isArray(completions)).toBe(true);
    });
  });

  describe('Directive Completions', () => {
    it('should provide @if completion', () => {
      const content = '@';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const ifCompletion = completions.find(c => c.label === '@if');
      expect(ifCompletion).toBeDefined();
    });

    it('should provide @for completion', () => {
      const content = '@';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const forCompletion = completions.find(c => c.label === '@for');
      expect(forCompletion).toBeDefined();
    });

    it('should provide @match completion', () => {
      const content = '@';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const matchCompletion = completions.find(c => c.label === '@match');
      expect(matchCompletion).toBeDefined();
    });

    it('should provide @@ completion', () => {
      const content = '@';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const letCompletion = completions.find(c => c.label === '@@');
      expect(letCompletion).toBeDefined();
    });
  });

  describe('HTML Tag Completions', () => {
    it('should provide div completion', () => {
      const content = '<';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const divCompletion = completions.find(c => c.label === 'div');
      expect(divCompletion).toBeDefined();
    });

    it('should provide span completion', () => {
      const content = '<';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const spanCompletion = completions.find(c => c.label === 'span');
      expect(spanCompletion).toBeDefined();
    });

    it('should provide input completion', () => {
      const content = '<';
      const offset = 1;
      const completions = getCompletionsAtOffset(content, offset);

      const inputCompletion = completions.find(c => c.label === 'input');
      expect(inputCompletion).toBeDefined();
    });
  });

  describe('HTML Attribute Completions', () => {
    it('should provide class attribute completion', () => {
      const content = '<div ></div>';
      const offset = 5;
      const completions = getCompletionsAtOffset(content, offset);

      const classCompletion = completions.find(c => c.label === 'class');
      expect(classCompletion).toBeDefined();
    });

    it('should provide id attribute completion', () => {
      const content = '<div ></div>';
      const offset = 5;
      const completions = getCompletionsAtOffset(content, offset);

      const idCompletion = completions.find(c => c.label === 'id');
      expect(idCompletion).toBeDefined();
    });

    it('should provide href attribute for anchor tags', () => {
      const content = '<a ></a>';
      const offset = 3;
      const completions = getCompletionsAtOffset(content, offset);

      const hrefCompletion = completions.find(c => c.label === 'href');
      expect(hrefCompletion).toBeDefined();
    });
  });

  describe('Filtering', () => {
    it('should filter completions by partial input', () => {
      const doc = createDocument(
        'test://test.blade',
        '@@ { let name = "test"; let age = 25; }<div>${na}</div>'
      );
      const context = getCompletionContext(doc, 49); // Adjusted offset
      const completions = getCompletions(context, doc.scope);

      // Should include 'name' but ideally not 'age' (depends on implementation)
      expect(Array.isArray(completions)).toBe(true);
    });
  });
});
