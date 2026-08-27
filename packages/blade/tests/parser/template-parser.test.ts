/**
 * Template parser tests.
 *
 * Organised by the defect each group pins down. Every test in here failed
 * before the parser repair: the parser threw on ordinary user mistakes, dropped
 * expression errors on the floor at fourteen call sites, mis-nested void
 * elements so the renderer deleted content, and drifted line/column away from
 * the offset on every rewind.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { parseTemplate } from '../../src/parser/index.js';
import { compile } from '../../src/compiler/index.js';
import { render } from '../../src/renderer/index.js';
import {
  walkNodes,
  expressionsOf,
  walkExpressions,
} from '../../src/ast/visitor.js';
import type {
  ElementNode,
  ForNode,
  IfNode,
  LetNode,
  MatchNode,
  PropsNode,
  SourceLocation,
  TemplateNode,
  TextNode,
  ComponentNode,
  LiteralNode,
  Diagnostic,
  RootNode,
  ValidTemplate,
} from '../../src/ast/types.js';

function first<T extends TemplateNode>(
  nodes: TemplateNode[],
  kind: T['kind']
): T {
  const node = nodes.find(n => n.kind === kind);
  expect(
    node,
    `expected a '${kind}' node in ${JSON.stringify(nodes.map(n => n.kind))}`
  ).toBeDefined();
  return node as T;
}

function messages(source: string): string[] {
  return parseTemplate(source).errors.map(e => e.message);
}

/**
 * Renders the tree a compile produced, error diagnostics or not.
 *
 * Recovery is the point of several tests below: a template that reports
 * `@slot is reserved` still has to render the text it recovered, and a renderer
 * factory - correctly - only accepts a template that compiled cleanly.
 */
function renderSource(source: string, data: unknown = {}): string {
  const result = compile(source);
  const template: ValidTemplate = result.ok
    ? result.template
    : {
        kind: 'valid',
        root: result.partial.root,
        diagnostics: result.partial.diagnostics,
      };
  return render(template, data).html;
}

/** The root of a compile, whether or not it succeeded. */
function rootOf(source: string): RootNode {
  const result = compile(source);
  return result.ok ? result.template.root : result.partial.root;
}

/** Every diagnostic a compile produced, whichever way it went. */
function diagnosticsOf(source: string): readonly Diagnostic[] {
  const result = compile(source);
  return result.ok ? result.template.diagnostics : result.diagnostics;
}

// =============================================================================
// 1. @props is a directive of the one parser
// =============================================================================

describe('TemplateParser - @props directive', () => {
  it('parses @props as a node of the template AST', () => {
    const result = parseTemplate(
      '@props(label, disabled = false, onClick?)\n<div>$label</div>'
    );

    expect(result.errors).toEqual([]);

    const props = first<PropsNode>(result.value, 'props');
    expect(props.props.map(p => p.name)).toEqual([
      'label',
      'disabled',
      'onClick',
    ]);
    expect(props.props.map(p => p.required)).toEqual([true, false, false]);
    expect(props.props[1]?.defaultValue).toMatchObject({
      kind: 'literal',
      value: false,
    });
    expect(props.props[2]?.defaultValue).toBeUndefined();
  });

  it('surfaces the declarations on the parse result and the compiled root', () => {
    const source = '@props(user, count = 1)\n<div></div>';

    expect(parseTemplate(source).props.map(p => p.name)).toEqual([
      'user',
      'count',
    ]);
    expect(rootOf(source).props.map(p => p.name)).toEqual(['user', 'count']);
  });

  it('compiles a template that declares props (it used to be an unknown directive)', () => {
    const diagnostics = diagnosticsOf('@props(name)\n<p>$name</p>');
    expect(diagnostics.filter(d => d.level === 'error')).toEqual([]);
    expect(
      renderSource('@props(name)\n<p>$name</p>', { name: 'Ada' })
    ).toContain('<p>Ada</p>');
  });

  it('accepts an empty declaration list', () => {
    const result = parseTemplate('@props()\n<div></div>');
    expect(result.errors).toEqual([]);
    expect(first<PropsNode>(result.value, 'props').props).toEqual([]);
  });

  it('parses a default value containing commas and parentheses', () => {
    const result = parseTemplate('@props(items = default(x, []))\n<div></div>');
    expect(result.errors).toEqual([]);
    expect(result.props).toHaveLength(1);
    expect(result.props[0]?.defaultValue).toMatchObject({
      kind: 'call',
      callee: 'default',
    });
  });

  it('reports exactly one error for a malformed declaration and recovers', () => {
    const result = parseTemplate('@props(123invalid)\n<div>ok</div>');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Expected a prop name');
    // Recovery leaves the rest of the template parsable.
    expect(result.value.some(n => n.kind === 'element')).toBe(true);
  });

  it('reports a second @props directive', () => {
    const result = parseTemplate('@props(a)\n@props(b)\n<div></div>');
    expect(messages('@props(a)\n@props(b)\n<div></div>')).toContain(
      'Duplicate @props directive'
    );
    expect(result.props.map(p => p.name)).toEqual(['a']);
  });

  it('gives the directive a location that spans its own source', () => {
    const source = '@props(a, b)\n<div></div>';
    const props = first<PropsNode>(parseTemplate(source).value, 'props');
    expect(
      source.slice(props.location.start.offset, props.location.end.offset)
    ).toBe('@props(a, b)');
  });

  it('renders nothing for the declaration itself', () => {
    expect(renderSource('@props(a)\n<p>x</p>', { a: 1 }).trim()).toBe(
      '<p>x</p>'
    );
  });
});

// =============================================================================
// 2. Void elements and implied end tags
// =============================================================================

describe('TemplateParser - HTML content model', () => {
  it('closes a void element at its start tag', () => {
    const result = parseTemplate(
      '<head><meta charset="utf-8"><title>T</title></head>'
    );
    expect(result.errors).toEqual([]);

    const head = first<ElementNode>(result.value, 'element');
    expect(head.children.map(c => (c as ElementNode).tag)).toEqual([
      'meta',
      'title',
    ]);
    expect((head.children[0] as ElementNode).children).toEqual([]);
  });

  it('keeps the content that follows a void element (it used to be deleted)', () => {
    expect(
      renderSource('<head><meta charset="utf-8"><title>T</title></head>')
    ).toBe('<head><meta charset="utf-8"/><title>T</title></head>');
    expect(renderSource('<div>a<br>b</div>')).toBe('<div>a<br/>b</div>');
  });

  it('reports an explicit end tag for a void element', () => {
    const result = parseTemplate('<div>a<br></br></div>');
    expect(result.errors.map(e => e.message)).toEqual([
      'Void element <br> has no closing tag',
    ]);
    expect(renderSource('<div>a<br></br></div>')).toBe('<div>a<br/></div>');
  });

  it('closes <li> at the next <li>', () => {
    const result = parseTemplate('<ul><li>a<li>b</ul>');
    expect(result.errors).toEqual([]);

    const ul = first<ElementNode>(result.value, 'element');
    expect(ul.children.map(c => (c as ElementNode).tag)).toEqual(['li', 'li']);
    expect(renderSource('<ul><li>a<li>b</ul>')).toBe(
      '<ul><li>a</li><li>b</li></ul>'
    );
  });

  it('closes <p> at the next block-level start tag', () => {
    const result = parseTemplate('<p>one<p>two</p>');
    expect(result.errors).toEqual([]);
    expect(result.value.filter(n => n.kind === 'element')).toHaveLength(2);
  });

  it('closes <td> and <tr> implicitly', () => {
    const result = parseTemplate('<table><tr><td>a<td>b</tr></table>');
    expect(result.errors).toEqual([]);
    expect(renderSource('<table><tr><td>a<td>b</tr></table>')).toBe(
      '<table><tr><td>a</td><td>b</td></tr></table>'
    );
  });

  it('reports an unclosed non-optional element rather than mis-nesting it', () => {
    expect(messages('<div><span>x</div>')).toContain('Unclosed tag: <span>');
  });

  it('reads <script> and <style> content as raw text', () => {
    const result = parseTemplate('<script>if (a < b) { run(); }</script>');
    expect(result.errors).toEqual([]);

    const script = first<ElementNode>(result.value, 'element');
    expect(script.children).toHaveLength(1);
    expect((script.children[0] as TextNode).segments[0]).toMatchObject({
      kind: 'literal',
      text: 'if (a < b) { run(); }',
    });
  });

  it('keeps interpolation inside raw text', () => {
    const result = parseTemplate('<style>body { color: ${color}; }</style>');
    expect(result.errors).toEqual([]);

    const style = first<ElementNode>(result.value, 'element');
    const text = style.children[0] as TextNode;
    expect(text.segments.map(s => s.kind)).toEqual([
      'literal',
      'expr',
      'literal',
    ]);
  });

  it('does not let a CSS brace close the enclosing directive block', () => {
    const result = parseTemplate(
      '@if($on) {\n  <style>body { color: red; }</style>\n}'
    );
    expect(result.errors).toEqual([]);

    const node = first<IfNode>(result.value, 'if');
    const style = node.branches[0]?.body.find(
      n => n.kind === 'element' && n.tag === 'style'
    ) as ElementNode;
    expect(style).toBeDefined();
    expect((style.children[0] as TextNode).segments).toHaveLength(1);
  });

  it('does not read a CSS at-rule as a directive', () => {
    const result = parseTemplate(
      '<style>@media (min-width: 40em) { body { color: red; } }</style>'
    );
    expect(result.errors).toEqual([]);
    const style = first<ElementNode>(result.value, 'element');
    expect((style.children[0] as TextNode).segments[0]).toMatchObject({
      kind: 'literal',
      text: '@media (min-width: 40em) { body { color: red; } }',
    });
  });

  it('matches element end tags case-insensitively but component names exactly', () => {
    expect(messages('<div>x</DIV>')).toEqual([]);
    expect(messages('<style>a{}</STYLE>')).toEqual([]);
    // `card` is not `Card`: the end tag closes nothing, and the component is
    // left unclosed. Both are reported.
    expect(messages('<Card>x</card>')).toEqual([
      'Unexpected closing tag </card>',
      'Unclosed tag: <Card>',
    ]);
  });

  it('reports an end tag that closes nothing where it stands', () => {
    expect(messages('<div>x</span></div>')).toEqual([
      'Unexpected closing tag </span>',
    ]);
  });
});

// =============================================================================
// 3. Total: the parser never throws
// =============================================================================

describe('TemplateParser - totality', () => {
  const brokenSources = [
    '@for(i of ) { x }',
    '<div class={ + }>x</div>',
    '@if() { x }',
    '@match($x) { _ > 1 ',
    '@let x =',
    '<div class=',
    '<',
    '</',
    '@props(',
    '@@{',
    '<template:',
    '${',
    '$!{',
    '<Comp bar=',
  ];

  for (const source of brokenSources) {
    it(`returns a partial AST for ${JSON.stringify(source)}`, () => {
      expect(() => parseTemplate(source)).not.toThrow();
      const result = parseTemplate(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(Array.isArray(result.value)).toBe(true);
    });
  }

  // Exhaustive: every 7th prefix of every sample template. ~1s here and several
  // times that on a CI runner, so it carries an explicit timeout rather than the
  // 5s default, which is tuned for unit tests. 60s is still a hard ceiling that
  // catches a genuine hang.
  it('never throws on any truncation of a sample template', () => {
    for (const source of sampleSources()) {
      for (let end = 0; end <= source.length; end += 7) {
        const prefix = source.slice(0, end);
        expect(
          () => parseTemplate(prefix),
          `prefix of length ${end}`
        ).not.toThrow();
      }
    }
  }, 60_000);

  // Same reasoning as the truncation sweep above.
  it('never throws on random mutations of a sample template', () => {
    const alphabet = [
      '<',
      '>',
      '/',
      '{',
      '}',
      '(',
      ')',
      '"',
      "'",
      '$',
      '@',
      '\\',
      '!',
      '_',
      '*',
      '\n',
    ];
    let seed = 20240611;
    const random = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };

    const sources = sampleSources();
    for (let i = 0; i < 500; i += 1) {
      const source = sources[random(sources.length)] as string;
      const start = random(source.length);
      const slice = source.slice(start, start + 1 + random(400));
      const at = random(Math.max(1, slice.length));
      const mutated =
        slice.slice(0, at) +
        (alphabet[random(alphabet.length)] as string) +
        slice.slice(at);
      expect(
        () => parseTemplate(mutated),
        JSON.stringify(mutated)
      ).not.toThrow();
    }
  }, 60_000);
});

// =============================================================================
// 4. One string-aware delimiter scanner
// =============================================================================

describe('TemplateParser - delimiter scanning', () => {
  it('does not end an interpolation at a brace inside a string literal', () => {
    const result = parseTemplate('${ concat("}", $a) }');
    expect(result.errors).toEqual([]);

    const text = first<TextNode>(result.value, 'text');
    expect(text.segments).toHaveLength(1);
    expect(text.segments[0]).toMatchObject({ kind: 'expr' });
  });

  it('does not end a @let at a semicolon inside a string literal', () => {
    const result = parseTemplate('@let x = "a;b"\n<p>$x</p>');
    expect(result.errors).toEqual([]);
    expect(first<LetNode>(result.value, 'let').value).toMatchObject({
      value: 'a;b',
    });
  });

  it('ends a @let at the brace that closes its directive block', () => {
    const result = parseTemplate('@if($on) { @let x = 1 }');
    expect(result.errors).toEqual([]);
    const node = first<IfNode>(result.value, 'if');
    expect(node.branches[0]?.body[0]).toMatchObject({
      kind: 'let',
      name: 'x',
      value: { value: 1 },
    });
  });

  it('does not end a @let at a brace inside its own expression', () => {
    const result = parseTemplate('@if($on) { @let x = len([1, 2]) }');
    expect(result.errors).toEqual([]);
    const node = first<IfNode>(result.value, 'if');
    expect(node.branches[0]?.body[0]).toMatchObject({
      kind: 'let',
      value: { kind: 'call', callee: 'len' },
    });
  });

  it('does not end a condition at a parenthesis inside a string literal', () => {
    const result = parseTemplate('@if($a == "a)b") { yes }');
    expect(result.errors).toEqual([]);
    const node = first<IfNode>(result.value, 'if');
    expect(node.branches[0]?.condition).toMatchObject({
      kind: 'binary',
      operator: '==',
    });
  });

  it('does not end an attribute expression at a brace inside a string literal', () => {
    const result = parseTemplate('<div class={concat("}", $a)}>x</div>');
    expect(result.errors).toEqual([]);
    const div = first<ElementNode>(result.value, 'element');
    expect(div.attributes[0]).toMatchObject({ kind: 'expr', name: 'class' });
  });

  it('does not end a @props default value at a comma inside a string literal', () => {
    const result = parseTemplate('@props(sep = ",", other)\n<div></div>');
    expect(result.errors).toEqual([]);
    expect(result.props.map(p => p.name)).toEqual(['sep', 'other']);
    expect(result.props[0]?.defaultValue).toMatchObject({ value: ',' });
  });

  it('reports an unterminated interpolation instead of slicing to the end', () => {
    expect(messages('<p>${ $a </p>')).toContain(
      "Unterminated interpolation: expected '}'"
    );
  });
});

// =============================================================================
// 5. Expression errors are always reported
// =============================================================================

describe('TemplateParser - expression errors', () => {
  it('reports a broken attribute expression', () => {
    expect(
      parseTemplate('<div class={$a $b}>x</div>').errors.length
    ).toBeGreaterThan(0);
  });

  it('reports a broken @if condition', () => {
    expect(parseTemplate('@if($a $b) { x }').errors.length).toBeGreaterThan(0);
  });

  it('reports a broken @let value', () => {
    expect(parseTemplate('@let x = 1 2').errors.length).toBeGreaterThan(0);
  });

  it('reports a broken component prop value', () => {
    expect(parseTemplate('<Card total={1 +} />').errors.length).toBeGreaterThan(
      0
    );
  });

  it('names the context of an expression that produces no value', () => {
    expect(messages('@for(i of ) { x }')).toContain('Invalid for iterable');
    expect(messages('@if() { x }')).toContain('Invalid if condition');
  });

  it('still produces the surrounding node so the AST is usable', () => {
    const node = first<ForNode>(
      parseTemplate('@for(i of ) { x }').value,
      'for'
    );
    expect(node.itemVar).toBe('i');
    expect(node.body.length).toBeGreaterThan(0);
  });

  it('reports expression locations in document coordinates', () => {
    const source = '<div>\n  <p>${ $user.name }</p>\n</div>';
    const result = parseTemplate(source);
    expect(result.errors).toEqual([]);

    const paths: SourceLocation[] = [];
    walkNodes(result.value, node => {
      for (const expr of expressionsOf(node)) {
        walkExpressions(expr, sub => {
          if (sub.kind === 'path') paths.push(sub.location);
        });
      }
    });

    expect(paths).toHaveLength(1);
    const location = paths[0] as SourceLocation;
    expect(source.slice(location.start.offset, location.end.offset)).toBe(
      '$user.name'
    );
    expect(location.start.line).toBe(2);
  });
});

// =============================================================================
// 6. line/column never drift from the offset
// =============================================================================

/** Re-derives line and column from an offset. */
function positionAt(
  source: string,
  offset: number
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function checkLocation(
  source: string,
  location: SourceLocation,
  what: string
): void {
  for (const end of ['start', 'end'] as const) {
    const point = location[end];
    const derived = positionAt(source, point.offset);
    expect(
      { ...derived, offset: point.offset },
      `${what} (${end}) in ${JSON.stringify(source.slice(0, 40))}`
    ).toEqual({ line: point.line, column: point.column, offset: point.offset });
  }
}

function checkAllLocations(source: string): void {
  const result = parseTemplate(source);
  walkNodes(result.value, node => {
    checkLocation(source, node.location, node.kind);
    if (node.kind === 'text') {
      for (const segment of node.segments) {
        checkLocation(source, segment.location, 'text segment');
      }
    }
    if (node.kind === 'element') {
      for (const attribute of node.attributes) {
        checkLocation(source, attribute.location, 'attribute');
      }
    }
    for (const expr of expressionsOf(node)) {
      walkExpressions(expr, sub =>
        checkLocation(source, sub.location, sub.kind)
      );
    }
  });
  for (const error of result.errors) {
    const derived = positionAt(source, error.offset);
    expect({ ...derived, offset: error.offset }).toEqual({
      line: error.line,
      column: error.column,
      offset: error.offset,
    });
  }
}

describe('TemplateParser - position integrity', () => {
  it('keeps the column consistent after an @if block', () => {
    const source = '@if($a) { yes } elsewhere is fine';
    checkAllLocations(source);

    const text = first<TextNode>(parseTemplate(source).value.slice(1), 'text');
    expect(text.location.start.offset).toBe(source.indexOf('elsewhere'));
    expect(text.location.start.column).toBe(source.indexOf('elsewhere') + 1);
  });

  it('keeps the column consistent after a simple interpolation', () => {
    checkAllLocations('$foo bar <b>x</b>');
  });

  it('keeps the column consistent across many lines', () => {
    checkAllLocations('$a\n$b line two\n<div>$c</div>\n@if($d) {\n  $e\n}\n');
  });

  it('re-derives every location in every sample template', () => {
    for (const source of sampleSources()) {
      checkAllLocations(source);
    }
  });
});

// =============================================================================
// 7. An unfound delimiter never drives the cursor backwards
// =============================================================================

describe('TemplateParser - scanner bounds', () => {
  it('reports an unterminated match case instead of churning at offset -1', () => {
    const result = parseTemplate('@match($x) { _ > 1 ');
    expect(result.errors.map(e => e.message)).toContain(
      "Unterminated match case: expected '{'"
    );
    for (const error of result.errors) {
      expect(error.offset).toBeGreaterThanOrEqual(0);
      expect(error.offset).toBeLessThanOrEqual('@match($x) { _ > 1 '.length);
    }
  });
});

// =============================================================================
// 8. Keywords need a word boundary
// =============================================================================

describe('TemplateParser - keyword boundaries', () => {
  it('does not read "elsewhere" as an else branch', () => {
    const result = parseTemplate('@if($a) { yes } elsewhere is fine');
    expect(result.errors).toEqual([]);

    const node = first<IfNode>(result.value, 'if');
    expect(node.elseBranch).toBeUndefined();
    expect(
      renderSource('@if($a) { yes } elsewhere is fine', { a: false })
    ).toContain('elsewhere is fine');
  });

  it('still reads a real else branch', () => {
    const node = first<IfNode>(
      parseTemplate('@if($a) { yes } else { no }').value,
      'if'
    );
    expect(node.elseBranch).toBeDefined();
  });

  it('does not read "letters" as a let declaration', () => {
    const result = parseTemplate('@@{ letters = 5; }');
    expect(result.value.some(n => n.kind === 'let')).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not read "trueish" as the literal true', () => {
    const result = parseTemplate('@match($x) { when trueish { a } }');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map(e => e.message)).toContain(
      "Expected a literal value in match case, got 't'"
    );
    // Recovery keeps the case, but it matches nothing - `trueish` was never a
    // value, and reading it as `true` used to make the case match silently.
    const node = first<MatchNode>(result.value, 'match');
    expect(node.cases[0]).toMatchObject({ kind: 'literal', values: [] });
  });

  it('still reads true and false as literals', () => {
    const node = first<MatchNode>(
      parseTemplate('@match($x) { when true, false { a } }').value,
      'match'
    );
    expect(node.cases[0]).toMatchObject({
      kind: 'literal',
      values: [true, false],
    });
  });
});

// =============================================================================
// 9. An @word in prose is never deleted
// =============================================================================

describe('TemplateParser - directive lookalikes in text', () => {
  it('keeps an email address intact', () => {
    const result = parseTemplate('<p>write to a@props.com</p>');
    expect(result.errors).toEqual([]);
    expect(renderSource('<p>write to a@props.com</p>')).toBe(
      '<p>write to a@props.com</p>'
    );
  });

  it('keeps the text of a reserved word and reports it', () => {
    expect(renderSource('<p>@slot machine</p>')).toBe('<p>@slot machine</p>');
    expect(messages('<p>@slot machine</p>')[0]).toContain('@slot is reserved');
  });

  it('keeps the text of a directive word used without its syntax', () => {
    expect(renderSource('<p>@if you like</p>')).toBe('<p>@if you like</p>');
    expect(messages('<p>@if you like</p>')).toContain("Expected '(' after @if");
  });

  it('leaves an ordinary @ alone', () => {
    expect(messages('<p>me @ home</p>')).toEqual([]);
    expect(renderSource('<p>me @ home</p>')).toBe('<p>me @ home</p>');
  });
});

// =============================================================================
// 10. Every text segment carries its own location
// =============================================================================

describe('TemplateParser - text segment locations', () => {
  it('gives each segment the span of its own source', () => {
    const source = '$foo bar ${ $baz } end';
    const text = first<TextNode>(parseTemplate(source).value, 'text');

    expect(text.segments).toHaveLength(4);
    const spans = text.segments.map(s =>
      source.slice(s.location.start.offset, s.location.end.offset)
    );
    expect(spans).toEqual(['$foo', ' bar ', '${ $baz }', ' end']);
  });

  it('does not report the text node start for every segment', () => {
    const source = '$foo bar <b>x</b>';
    const text = first<TextNode>(parseTemplate(source).value, 'text');
    expect(text.segments[1]?.location.start.offset).toBe(4);
  });
});

// =============================================================================
// 11. One escape decoder for every quoted value
// =============================================================================

describe('TemplateParser - quoted value escapes', () => {
  it('decodes escapes in a static attribute value', () => {
    const div = first<ElementNode>(
      parseTemplate('<div title="a\\nb">x</div>').value,
      'element'
    );
    expect(div.attributes[0]).toMatchObject({ kind: 'static', value: 'a\nb' });
  });

  it('decodes an escaped template metacharacter in an attribute value', () => {
    const div = first<ElementNode>(
      parseTemplate('<a href="mailto:me\\@example.com">x</a>').value,
      'element'
    );
    expect(div.attributes[0]).toMatchObject({ value: 'mailto:me@example.com' });
  });

  it('keeps an escaped $ from starting an interpolation', () => {
    const div = first<ElementNode>(
      parseTemplate('<div title="\\${x}">y</div>').value,
      'element'
    );
    expect(div.attributes[0]).toMatchObject({ kind: 'static', value: '${x}' });
  });

  it('decodes escapes in a component prop value', () => {
    const component = first<ComponentNode>(
      parseTemplate('<Comp bar="a\\nb" />').value,
      'component'
    );
    expect(component.props[0]?.value).toMatchObject({
      kind: 'literal',
      value: 'a\nb',
    });
  });

  it('accepts a quote inside a component prop value', () => {
    const component = first<ComponentNode>(
      parseTemplate('<Comp bar="say \\"hi\\"" />').value,
      'component'
    );
    expect((component.props[0]?.value as LiteralNode).value).toBe('say "hi"');
  });

  it('decodes escapes in a match case value', () => {
    const node = first<MatchNode>(
      parseTemplate('@match($x) { when "a\\tb" { y } }').value,
      'match'
    );
    expect(node.cases[0]).toMatchObject({ values: ['a\tb'] });
  });

  it('reports an unknown escape rather than deleting the backslash', () => {
    const result = parseTemplate('<div title="C:\\q">x</div>');
    expect(result.errors.length).toBeGreaterThan(0);
    const div = first<ElementNode>(result.value, 'element');
    expect(div.attributes[0]).toMatchObject({ value: 'C:\\q' });
  });
});

// =============================================================================
// 12. Size and depth limits
// =============================================================================

describe('TemplateParser - limits', () => {
  it('parses a 100 KB text node', () => {
    const text = 'x'.repeat(100_000);
    const result = parseTemplate(`<p>${text}</p>`);
    expect(result.errors).toEqual([]);
    const p = first<ElementNode>(result.value, 'element');
    expect((p.children[0] as TextNode).segments[0]).toMatchObject({ text });
  });

  it('parses deeply nested markup well past the old limit of 100', () => {
    const depth = 300;
    const source = '<div>'.repeat(depth) + 'x' + '</div>'.repeat(depth);
    const result = parseTemplate(source);
    expect(result.errors).toEqual([]);
  });

  it('reports exceeding the nesting limit instead of throwing', () => {
    const source = '<div>'.repeat(10) + 'x' + '</div>'.repeat(10);
    expect(() => parseTemplate(source, { maxNodeDepth: 4 })).not.toThrow();
    const result = parseTemplate(source, { maxNodeDepth: 4 });
    expect(result.errors.some(e => e.message.includes('nesting depth'))).toBe(
      true
    );
  });
});

// =============================================================================
// Regressions the repair had to preserve
// =============================================================================

describe('TemplateParser - path scanning', () => {
  it('does not take a sentence-ending full stop into an interpolation', () => {
    const source = 'Hello $name. Bye';
    const result = parseTemplate(source);
    expect(result.errors).toEqual([]);
    expect(renderSource(source, { name: 'Ada' })).toBe('Hello Ada. Bye');
  });

  it('still parses a path with segments and indices', () => {
    const result = parseTemplate('$user.orders[0].id');
    expect(result.errors).toEqual([]);
    const text = first<TextNode>(result.value, 'text');
    expect(text.segments).toHaveLength(1);
  });
});

// =============================================================================
// Helpers
// =============================================================================

const SAMPLES_ROOT = resolve(__dirname, '../../../../samples');

function sampleSources(): string[] {
  const sources: string[] = [];
  for (const dir of readdirSync(SAMPLES_ROOT)) {
    for (const file of readdirSync(resolve(SAMPLES_ROOT, dir))) {
      if (file.endsWith('.blade')) {
        sources.push(readFileSync(resolve(SAMPLES_ROOT, dir, file), 'utf-8'));
      }
    }
  }
  expect(sources.length).toBeGreaterThan(0);
  return sources;
}
