/**
 * The validator's two switches - over `TemplateNode` and over `ExprAst` - used
 * to omit their `never` guards, and both of them had already drifted: an
 * unknown helper inside a `@let` arrow body produced no diagnostic at all
 * because `validateExpr` had no `function` case, and helper lookup used
 * `name in registry`, which answers yes for every inherited member of
 * `Object.prototype`.
 *
 * Both walks now run on `ast/visitor.ts`, so a new node or expression kind is a
 * compile error in exactly one place, and helper lookup uses the same
 * allowlist the evaluator enforces at runtime.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTemplate,
  checkRequiredProps,
} from '../src/validation/index.js';
import type { HelperRegistry } from '../src/evaluator/index.js';
import type { PropDeclaration, SourceLocation } from '../src/ast/types.js';

const AT_ORIGIN: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function declare(name: string, required: boolean): PropDeclaration {
  return { name, required, defaultValue: undefined, location: AT_ORIGIN };
}

describe('expression coverage', () => {
  it('validates the body of a @let arrow function', () => {
    const result = validateTemplate('@@ { let f = (a) => mystery(a); }', {
      helpers: {},
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('validates array literal elements', () => {
    const result = validateTemplate('<p>${[mystery(1), 2]}</p>', {
      helpers: {},
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('validates the object of a member access', () => {
    const result = validateTemplate('<p>${mystery(1)[0]}</p>', {
      helpers: {},
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('validates a @props default value expression', () => {
    const result = validateTemplate('@props(size = mystery(1))\n<p>$size</p>', {
      helpers: {},
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('validates a component prop value', () => {
    const source =
      '<template:Card title!><p>$title</p></template:Card><Card title=${mystery(1)} />';
    const result = validateTemplate(source, { helpers: {}, strict: true });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('validates slot fallback content', () => {
    const source =
      '<template:Card><slot><p>${mystery(1)}</p></slot></template:Card><Card />';
    const result = validateTemplate(source, { helpers: {}, strict: true });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });
});

describe('helper lookup uses the runtime allowlist', () => {
  it('does not accept an inherited registry member as a helper', () => {
    const registry: HelperRegistry = {};
    const result = validateTemplate('<p>${toString(1)}</p>', {
      helpers: registry,
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('does not accept a non-function own member as a helper', () => {
    const registry = { notAFunction: 42 } as unknown as HelperRegistry;
    const result = validateTemplate('<p>${notAFunction(1)}</p>', {
      helpers: registry,
      strict: true,
    });
    expect(result.errors.map(e => e.code)).toContain('UNKNOWN_HELPER');
  });

  it('accepts an own function-valued member', () => {
    const registry: HelperRegistry = { real: () => () => 1 };
    const result = validateTemplate('<p>${real(1)}</p>', {
      helpers: registry,
      strict: true,
    });
    expect(result.errors).toEqual([]);
  });
});

describe('checkRequiredProps is the one required-prop check', () => {
  it('reports each missing required prop once', () => {
    const diagnostics = checkRequiredProps({
      componentName: 'Card',
      declared: [
        declare('title', true),
        declare('body', true),
        declare('footer', false),
      ],
      provided: ['title'],
      location: AT_ORIGIN,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('MISSING_REQUIRED_PROP');
    expect(diagnostics[0]!.message).toContain('body');
  });

  it('says nothing when every required prop is provided', () => {
    expect(
      checkRequiredProps({
        componentName: 'Card',
        declared: [declare('title', true)],
        provided: ['title', 'extra'],
        location: AT_ORIGIN,
      })
    ).toEqual([]);
  });

  it('names the declaring file when the component came from one', () => {
    const diagnostics = checkRequiredProps({
      componentName: 'Card',
      declared: [declare('title', true)],
      provided: [],
      location: AT_ORIGIN,
      definedIn: 'components/card.blade',
    });
    expect(diagnostics[0]!.message).toContain('components/card.blade:1');
  });
});
