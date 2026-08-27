/**
 * `compile()` used to return `{ root, diagnostics }` whether the source parsed
 * or not, so "parsed cleanly" and "failed to parse" were the *same type*. Two
 * of the three renderer factories never looked at `diagnostics` and rendered
 * partial output; the third threw. `@if(true) { <div>hi</div>` - unclosed -
 * rendered `<div>hi</div>` from the string renderer with no complaint.
 *
 * The type now makes that state unrepresentable: only a `ValidTemplate` is
 * accepted by a renderer factory, and a template that failed to compile is a
 * `PartialTemplate`, which is structurally a different thing.
 */

import { describe, it, expect } from 'vitest';
import {
  compile,
  compileOrThrow,
  CompileError,
  DEFAULT_MAX_EXPRESSION_NODES,
} from '../src/compiler/index.js';
import { createStringRenderer } from '../src/renderer/index.js';

describe('compile() result discrimination', () => {
  it('reports success with a valid template', () => {
    const result = compile('<div>hi</div>');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.template.kind).toBe('valid');
    expect(result.template.diagnostics).toEqual([]);
    expect(result.template.root.kind).toBe('root');
  });

  it('reports failure for a template that did not parse', () => {
    const result = compile('@if(true) { <div>hi</div>');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.diagnostics.some(d => d.level === 'error')).toBe(true);
    expect(result.partial.kind).toBe('partial');
    // The partial tree is still available for tooling.
    expect(result.partial.root.children.length).toBeGreaterThan(0);
    expect(result.partial.diagnostics).toBe(result.diagnostics);
  });

  it('keeps warnings on a valid template', () => {
    const result = compile('<div>${mystery(1)}</div>', { helpers: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(
      result.template.diagnostics.map(d => [d.level, d.code])
    ).toContainEqual(['warning', 'UNKNOWN_HELPER']);
  });

  it('refuses a partial template to a renderer factory', () => {
    const result = compile('@if(true) { <div>hi</div>');
    if (result.ok) throw new Error('expected failure');
    // @ts-expect-error a PartialTemplate is not a ValidTemplate
    expect(() => createStringRenderer(result.partial)).toBeDefined();
  });

  it('renders a valid template', () => {
    const template = compileOrThrow('<div>${name}</div>');
    expect(createStringRenderer(template)({ name: 'Ada' }).html).toBe(
      '<div>Ada</div>'
    );
  });
});

describe('strict mode', () => {
  it('throws a CompileError carrying every diagnostic', () => {
    let thrown: unknown;
    try {
      compile('<div>${total +}</div>', { strict: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CompileError);
    const error = thrown as CompileError;
    expect(error.diagnostics.length).toBeGreaterThan(0);
    expect(error.diagnostics.some(d => d.level === 'error')).toBe(true);
    expect(error.message).toContain('compile');
  });

  it('does not throw for a template that compiles', () => {
    expect(() => compile('<div>ok</div>', { strict: true })).not.toThrow();
  });

  it('promotes an unknown helper from warning to error', () => {
    expect(() =>
      compile('<div>${mystery(1)}</div>', { helpers: {}, strict: true })
    ).toThrow(CompileError);
  });
});

describe('compileOrThrow()', () => {
  it('returns the valid template', () => {
    expect(compileOrThrow('<p>hi</p>').kind).toBe('valid');
  });

  it('throws on any error diagnostic', () => {
    expect(() => compileOrThrow('@if(true) { <div>hi</div>')).toThrow(
      CompileError
    );
  });
});

describe('validation runs uniformly, without an opt-in flag', () => {
  it('checks required props on inline component definitions', () => {
    const result = compile(
      '<template:Card title!><div>$title</div></template:Card><Card />'
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.diagnostics.map(d => d.code)).toContain(
      'MISSING_REQUIRED_PROP'
    );
  });

  it('reports an unknown component reference at compile time', () => {
    const result = compile('<div><Missing /></div>');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    const diagnostic = result.diagnostics.find(
      d => d.code === 'UNKNOWN_COMPONENT'
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message).toContain('Missing');
    expect(diagnostic!.location.start.line).toBe(1);
  });

  it('accepts a component the caller declares externally', () => {
    const result = compile('<div><Missing /></div>', {
      components: { Missing: { props: [] } },
    });
    expect(result.ok).toBe(true);
  });

  it('checks required props of an externally declared component', () => {
    const result = compile('<Alert type="info" />', {
      components: {
        Alert: {
          props: [
            {
              name: 'message',
              required: true,
              location: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 1, offset: 0 },
              },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.diagnostics[0]!.code).toBe('MISSING_REQUIRED_PROP');
  });

  it('still reports the capitalisation rule', () => {
    const result = compile('<myWidget />');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.diagnostics[0]!.message).toContain('capital letter');
  });
});

describe('maxExpressionNodes', () => {
  const wide = (count: number): string =>
    `\${${Array.from({ length: count }, (_, i) => `p${i}`).join(' + ')}}`;

  it('is enforced at compile time', () => {
    const result = compile(wide(30), { maxExpressionNodes: 10 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    const diagnostic = result.diagnostics.find(
      d => d.code === 'EXPRESSION_TOO_LARGE'
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.level).toBe('error');
    expect(diagnostic!.message).toContain('10');
  });

  it('accepts an expression at the limit', () => {
    // 5 paths + 4 binary operators = 9 nodes.
    expect(compile(wide(5), { maxExpressionNodes: 9 }).ok).toBe(true);
  });

  it('defaults to 1000 nodes', () => {
    expect(DEFAULT_MAX_EXPRESSION_NODES).toBe(1000);
    expect(compile(wide(200)).ok).toBe(true);
  });

  it('counts a function body', () => {
    const result = compile('@@ { let f = (a) => a + b + c + d; }', {
      maxExpressionNodes: 3,
    });
    expect(result.ok).toBe(false);
  });
});
