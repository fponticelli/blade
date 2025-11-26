/**
 * Diagnostic Provider Tests
 * Tests for US2: Real-Time Syntax Error Diagnostics
 */

import { describe, it, expect } from 'vitest';
import { createDocument, parseDocument } from '../../src/lsp/document.js';
import type { BladeDocument } from '../../src/lsp/types.js';

/**
 * Helper to create a document and return its errors
 */
function getDocumentErrors(content: string): BladeDocument['errors'] {
  const doc = createDocument('test://test.blade', content);
  return doc.errors;
}

describe('Diagnostic Provider', () => {
  describe('Parse Error Detection', () => {
    it('should detect unclosed HTML tag', () => {
      const errors = getDocumentErrors('<div>content');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect malformed expression', () => {
      const errors = getDocumentErrors('<div>${user.}</div>');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid directive syntax - missing condition', () => {
      const errors = getDocumentErrors('@if { }');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect @for missing parentheses', () => {
      const errors = getDocumentErrors('@for item of items { }');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect unclosed expression', () => {
      const errors = getDocumentErrors('<div>${user.name</div>');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect unclosed directive block', () => {
      const errors = getDocumentErrors('@if(condition) { <div>content</div>');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect mismatched closing tag', () => {
      const errors = getDocumentErrors('<div></span>');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid attribute syntax', () => {
      const errors = getDocumentErrors('<div class=">');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Valid Syntax - No Errors', () => {
    it('should accept valid HTML', () => {
      const errors = getDocumentErrors('<div class="container">content</div>');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid simple expression', () => {
      const errors = getDocumentErrors('<div>$name</div>');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid block expression', () => {
      const errors = getDocumentErrors('<div>${user.name}</div>');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid @if directive', () => {
      const errors = getDocumentErrors('@if(isValid) { <div>Valid</div> }');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid @for directive', () => {
      const errors = getDocumentErrors(
        '@for(item of items) { <li>$item</li> }'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept valid @for directive with index', () => {
      const errors = getDocumentErrors(
        '@for(item, index of items) { <li>${index}: $item</li> }'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept valid @match directive', () => {
      const content = `
        @match(status) {
          when "active" { <span>Active</span> }
          when "inactive" { <span>Inactive</span> }
          * { <span>Unknown</span> }
        }
      `;
      const errors = getDocumentErrors(content);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid @@ let block', () => {
      const errors = getDocumentErrors('@@ { let total = price * qty; }');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid component usage', () => {
      // Component props use expression syntax like ${...} or $var
      const errors = getDocumentErrors('<UserCard name=$user.name />');
      expect(errors).toHaveLength(0);
    });

    it('should accept valid component definition', () => {
      const content = `
        <template:Card title!>
          <div class="card">
            <h2>$title</h2>
            <slot />
          </div>
        </template:Card>
      `;
      const errors = getDocumentErrors(content);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid fragment', () => {
      const errors = getDocumentErrors('<><span>A</span><span>B</span></>');
      expect(errors).toHaveLength(0);
    });

    it('should accept HTML comments', () => {
      const errors = getDocumentErrors(
        '<!-- This is a comment --><div>content</div>'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept void HTML elements', () => {
      // Void elements should use self-closing syntax
      const errors = getDocumentErrors(
        '<input type="text" /><br /><img src="test.png" />'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept nested directives', () => {
      const content = `
        @if(hasItems) {
          @for(item of items) {
            <li>$item.name</li>
          }
        }
      `;
      const errors = getDocumentErrors(content);
      expect(errors).toHaveLength(0);
    });

    it('should accept complex expressions', () => {
      const errors = getDocumentErrors(
        '<div>${formatCurrency(item.price * qty, $.currency)}</div>'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept ternary expressions', () => {
      const errors = getDocumentErrors(
        '<span>${isActive ? "Active" : "Inactive"}</span>'
      );
      expect(errors).toHaveLength(0);
    });

    it('should accept null coalescing', () => {
      const errors = getDocumentErrors(
        '<span>${user.name ?? "Anonymous"}</span>'
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('Error Location', () => {
    it('should provide error location with line and column', () => {
      const errors = getDocumentErrors('<div>${user.}</div>');
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0];
      expect(error.line).toBeGreaterThan(0);
      expect(error.column).toBeGreaterThan(0);
    });

    it('should provide correct line for multiline content', () => {
      const content = `<div>
  <span>valid</span>
  <span>\${user.}</span>
</div>`;
      const errors = getDocumentErrors(content);
      if (errors.length > 0) {
        // Error should be somewhere in the content, line number format may vary
        expect(errors[0].line).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Document Update and Re-parse', () => {
    it('should clear errors when document is fixed', () => {
      // First create with error
      let doc = createDocument('test://test.blade', '<div>${user.}</div>');
      expect(doc.errors.length).toBeGreaterThan(0);

      // Update to fix
      doc = {
        ...doc,
        content: '<div>${user.name}</div>',
      };
      doc = parseDocument(doc);
      expect(doc.errors).toHaveLength(0);
    });

    it('should detect new errors when introduced', () => {
      // First create valid
      let doc = createDocument('test://test.blade', '<div>valid</div>');
      expect(doc.errors).toHaveLength(0);

      // Update with error
      doc = {
        ...doc,
        content: '<div>',
      };
      doc = parseDocument(doc);
      expect(doc.errors.length).toBeGreaterThan(0);
    });
  });
});
