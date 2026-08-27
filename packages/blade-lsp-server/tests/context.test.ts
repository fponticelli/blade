/**
 * Position context: the answers three hand-rolled scanners used to disagree
 * about.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../src/document.js';
import {
  resolveContext,
  isInsidePropsDirective,
} from '../src/analyzer/context.js';
import type { CompletionContextKind } from '../src/types.js';

/** Resolve the context at the `|` marker, which is removed from the source. */
function at(marked: string): ReturnType<typeof resolveContext> {
  const offset = marked.indexOf('|');
  expect(offset, 'the source must carry a | cursor marker').toBeGreaterThan(-1);
  const content = marked.slice(0, offset) + marked.slice(offset + 1);
  return resolveContext(createDocument('test://ctx.blade', content), offset);
}

function kindAt(marked: string): CompletionContextKind {
  return at(marked).kind;
}

describe('context misfires the audit found', () => {
  it('does not read the @ of an email address as a directive', () => {
    // Typing `support@example.com` in template text used to offer
    // if/for/match/component/props/slot in the middle of the address.
    expect(kindAt('<p>Write to support@exa|mple.com today</p>')).toBe('text');
    expect(kindAt('<p>support@|example.com</p>')).toBe('text');
  });

  it('still reads an @ at a token boundary as a directive', () => {
    expect(kindAt('<div>\n@i|\n</div>')).toBe('directive');
    expect(kindAt('@|')).toBe('directive');
  });

  it('does not offer directives for a word that cannot become one', () => {
    expect(kindAt('<p>\n@zzz|\n</p>')).toBe('text');
  });

  it('does not treat arithmetic as the start of a tag', () => {
    // `5 < 10` earlier in a paragraph used to make everything after it look
    // like it was inside a tag.
    expect(kindAt('<p>5 < 10 and more text her|e</p>')).toBe('text');
  });

  it('bounds the tag scan to the current line', () => {
    expect(kindAt('<p>a < b</p>\nplain text her|e')).toBe('text');
  });

  it('bounds the expression scan, so a ${ in a comment does not leak', () => {
    // The unbounded backward scan ran to offset 0 and had no idea that the
    // `${` it found was inside a comment the parser never interpolates.
    expect(kindAt('<!-- ${broken -->\n<p>plain text her|e</p>')).toBe('text');
  });

  it('still calls an unterminated ${ an expression, as the parser does', () => {
    expect(kindAt('<p>${brok|en')).toBe('expression');
  });
});

describe('expression contexts', () => {
  it('detects a block expression the parser understood', () => {
    expect(kindAt('<div>${user|}</div>')).toBe('expression');
  });

  it('detects a half-typed block expression', () => {
    expect(kindAt('<div>${|}</div>')).toBe('expression');
  });

  it('detects a path expression after a dot', () => {
    expect(kindAt('<div>${user.|}</div>')).toBe('expression-path');
  });

  it('detects a path expression after an array index', () => {
    expect(kindAt('<div>${items[0].|}</div>')).toBe('expression-path');
  });

  it('detects a simple $variable in text', () => {
    expect(kindAt('<h2>$|</h2>')).toBe('expression');
    expect(kindAt('<h2>$tit|</h2>')).toBe('expression');
  });

  it('reports the partial token without its sigil', () => {
    expect(at('<h2>$tit|le</h2>').partialToken).toBe('tit');
  });

  it('treats a directive header as an expression position', () => {
    expect(kindAt('@if(us|er) {\n<i>x</i>\n}')).toBe('expression');
    expect(kindAt('@for(item of it|ems) {\n<i>x</i>\n}')).toBe('expression');
  });

  it('names the directive whose header the cursor is in', () => {
    const context = at('@for(item of it|ems) {\n<i>x</i>\n}');
    expect(context.directive?.name).toBe('for');
    expect(context.directive?.node?.kind).toBe('for');
  });

  it('treats the directive keyword itself as a directive, not its arguments', () => {
    expect(kindAt('@i|f(user) {\n<i>x</i>\n}')).toBe('directive');
  });
});

describe('tags', () => {
  it('detects a tag name being typed', () => {
    expect(kindAt('<div><|</div>')).toBe('html-tag');
    expect(kindAt('<div><di|</div>')).toBe('html-tag');
  });

  it('detects an attribute position', () => {
    expect(kindAt('<div |></div>')).toBe('html-attribute');
  });

  it('detects a component prop position and names the component', () => {
    const context = at('<UserCard |></UserCard>');
    expect(context.kind).toBe('component-prop');
    expect(context.tagName).toBe('UserCard');
  });

  it('detects an attribute position in a tag that is not closed yet', () => {
    expect(kindAt('<div class="a" |')).toBe('html-attribute');
  });

  it('does not call the inside of a quoted attribute value a tag name', () => {
    expect(kindAt('<div class="a b|"></div>')).toBe('html-attribute');
  });
});

describe('@props, one predicate', () => {
  const long =
    '@props(alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota, kappa, lambda)\n<div>x</div>';

  it('recognises the arguments of a parsed @props', () => {
    expect(kindAt('@props(ti|tle)\n<div>x</div>')).toBe('directive-argument');
  });

  it('recognises them on a line longer than any fixed window', () => {
    // Hover tested a 100-character window and completion a 50-character one, so
    // on a long @props line the two disagreed about the same offset.
    const offset = long.indexOf('lambda') + 3;
    const document = createDocument('test://props.blade', long);
    expect(resolveContext(document, offset).kind).toBe('directive-argument');
    expect(isInsidePropsDirective(document, offset)).toBe(true);
  });

  it('recognises a half-typed @props(', () => {
    expect(kindAt('@props(alpha, |')).toBe('directive-argument');
  });

  it('does not claim the @props keyword itself', () => {
    expect(kindAt('@pro|ps(alpha)\n<div>x</div>')).toBe('directive');
  });

  it('treats a template definition tag as a prop declaration position', () => {
    const context = at(
      '<template:Card ti|tle!>\n<div>x</div>\n</template:Card>'
    );
    expect(context.kind).toBe('directive-argument');
    expect(context.templateDefinition).toBe('Card');
  });
});

describe('plain text', () => {
  it('offers nothing in prose', () => {
    expect(kindAt('<div>hello wo|rld</div>')).toBe('text');
  });

  it('clamps an offset past the end of the document', () => {
    const document = createDocument('test://ctx.blade', '<div>x</div>');
    expect(resolveContext(document, 9999).offset).toBe(document.content.length);
  });
});
