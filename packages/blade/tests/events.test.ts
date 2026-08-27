/**
 * @vitest-environment jsdom
 *
 * `on:` event bindings.
 *
 * A template's only way to say what a control *does*. It is deliberately not an
 * attribute: an attribute carries text, and there is no text that means "this
 * function". `onclick="${x}"` is refused for exactly that reason - it would
 * have to serialise a value into JavaScript source the engine never parses -
 * while `on:click=${x}` never becomes source at all. The handler is a value,
 * bound to the element by whichever sink can hold a listener.
 *
 * Which sinks can is the other half: a string render produces characters, and
 * characters cannot carry a closure. So the string sink refuses the binding,
 * loudly, and a template compiled with `target: 'string'` refuses it at build
 * time rather than at three in the morning.
 */

import { describe, it, expect } from 'vitest';
import { compile, compileOrThrow } from '../src/compiler/index.js';
import {
  createDomRenderer,
  createStringRenderer,
  render,
} from '../src/renderer/index.js';
import type { Diagnostic, ElementNode } from '../src/ast/types.js';

function diagnostics(
  src: string,
  target?: 'dom' | 'string'
): readonly Diagnostic[] {
  const result = compile(src, target ? { target } : undefined);
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

function errorCodes(src: string, target?: 'dom' | 'string'): string[] {
  return diagnostics(src, target)
    .filter(d => d.level === 'error')
    .map(d => d.code ?? '');
}

/** The rendered DOM of a template, as real nodes. */
function mount(src: string, data: unknown = {}): HTMLElement {
  const result = createDomRenderer(compileOrThrow(src))(data);
  const host = document.createElement('div');
  for (const node of result.nodes) host.appendChild(node);
  return host;
}

// =============================================================================
// Parsing
// =============================================================================

describe('parsing an on: binding', () => {
  it('produces an event attribute, not an ordinary one', () => {
    const template = compileOrThrow('<button on:click=${go}>x</button>');
    const button = template.root.children.find(
      (n): n is ElementNode => n.kind === 'element'
    )!;
    const attribute = button.attributes[0]!;
    expect(attribute.kind).toBe('event');
    expect(attribute.name).toBe('on:click');
    if (attribute.kind !== 'event') throw new Error('unreachable');
    expect(attribute.event).toBe('click');
  });

  it('accepts every expression form an attribute value takes', () => {
    for (const source of [
      '<button on:click=${go}>x</button>',
      '<button on:click={go}>x</button>',
      '<button on:click=$go>x</button>',
    ]) {
      expect(errorCodes(source)).toEqual([]);
    }
  });

  it('keeps a custom event name exactly as written', () => {
    const template = compileOrThrow('<x-thing on:my-event=${go}/>');
    const element = template.root.children.find(
      (n): n is ElementNode => n.kind === 'element'
    )!;
    const attribute = element.attributes[0]!;
    if (attribute.kind !== 'event') throw new Error('expected an event');
    expect(attribute.event).toBe('my-event');
  });

  it('refuses a quoted value, which would be source and not a function', () => {
    expect(errorCodes('<button on:click="go()">x</button>')).toContain(
      'EVENT_NOT_AN_EXPRESSION'
    );
  });

  it('refuses a binding with no event name', () => {
    expect(errorCodes('<button on:=${go}>x</button>')).toContain(
      'EVENT_WITHOUT_NAME'
    );
  });

  it('refuses a binding on a component, which has no element to listen on', () => {
    expect(
      errorCodes(
        '<template:Card><div><slot/></div></template:Card>' +
          '<Card on:click=${go}>x</Card>'
      )
    ).toContain('EVENT_ON_COMPONENT');
  });

  it('still refuses interpolation into a legacy onclick attribute', () => {
    expect(errorCodes('<div onclick="${x}"></div>')).toContain(
      'UNENCODABLE_ATTRIBUTE'
    );
  });
});

// =============================================================================
// The target decides whether a listener can exist at all
// =============================================================================

describe('a string render', () => {
  it('emits no attribute for the binding', () => {
    const html = render(
      compileOrThrow('<button on:click=${go} id="b">x</button>'),
      { go: () => undefined }
    ).html;
    expect(html).toBe('<button id="b">x</button>');
  });

  it('says so, rather than dropping the behaviour in silence', () => {
    const warnings = render(
      compileOrThrow('<button on:click=${go}>x</button>'),
      { go: () => undefined }
    ).metadata.warnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('on:click');
  });

  it('is a compile error when the template declares the string target', () => {
    expect(errorCodes('<button on:click=${go}>x</button>', 'string')).toContain(
      'EVENT_IN_STRING_TARGET'
    );
    expect(errorCodes('<button on:click=${go}>x</button>', 'dom')).toEqual([]);
  });
});

describe('a DOM render', () => {
  it('attaches a listener that runs the handler', () => {
    let clicks = 0;
    const host = mount('<button on:click=${go}>x</button>', {
      go: () => {
        clicks++;
      },
    });
    host.querySelector('button')!.click();
    expect(clicks).toBe(1);
  });

  it('leaves no attribute behind', () => {
    const host = mount('<button on:click=${go}>x</button>', {
      go: () => undefined,
    });
    expect(host.querySelector('button')!.hasAttribute('on:click')).toBe(false);
    expect(host.innerHTML).toBe('<button>x</button>');
  });

  it('hands the handler the event', () => {
    let seen: unknown = null;
    const host = mount('<button on:click=${go}>x</button>', {
      go: (event: unknown) => {
        seen = event;
      },
    });
    host.querySelector('button')!.click();
    expect(seen).toBeInstanceOf(Event);
  });

  it('calls a handler declared as a template arrow function', () => {
    const calls: unknown[] = [];
    const result = createDomRenderer(
      compileOrThrow(
        '@@ { let go = (e) => record(e); }<button on:click=${go}>x</button>'
      )
    )(
      {},
      {
        helpers: {
          record: () => (value: unknown) => {
            calls.push(value);
            return null;
          },
        },
      }
    );
    const host = document.createElement('div');
    for (const node of result.nodes) host.appendChild(node);
    host.querySelector('button')!.click();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeInstanceOf(Event);
  });

  it('refuses a handler that is not callable', () => {
    const result = createDomRenderer(
      compileOrThrow('<button on:click=${go}>x</button>')
    )({ go: 'not a function' });
    expect(result.metadata.warnings).toHaveLength(1);
    expect(result.metadata.warnings[0]!.message).toContain('on:click');
  });

  it('attaches nothing when the handler is missing', () => {
    const host = mount('<button on:click=${go}>x</button>', {});
    // No listener, and no throw when the element is used.
    host.querySelector('button')!.click();
    expect(host.innerHTML).toBe('<button>x</button>');
  });

  it('binds one listener per element in a loop', () => {
    const seen: number[] = [];
    const host = mount(
      '@for(row of rows) { <button on:click=${pick}>${row}</button> }',
      { rows: [1, 2, 3], pick: () => seen.push(seen.length) }
    );
    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    buttons[2]!.click();
    expect(seen).toEqual([0]);
  });
});

describe('a string renderer reused after a DOM render', () => {
  it('reports the refusal on every render, not only the first', () => {
    const renderer = createStringRenderer(
      compileOrThrow('<button on:click=${go}>x</button>')
    );
    expect(renderer({ go: () => undefined }).metadata.warnings).toHaveLength(1);
    expect(renderer({ go: () => undefined }).metadata.warnings).toHaveLength(1);
  });
});
