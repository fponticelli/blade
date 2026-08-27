import { describe, it, expect } from 'vitest';
import {
  VOID_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  ESCAPABLE_RAW_TEXT_ELEMENTS,
  URL_ATTRIBUTES,
  SVG_ELEMENTS,
  MATHML_ELEMENTS,
  AMBIGUOUS_FOREIGN_ELEMENTS,
  SVG_CASE_SENSITIVE_ATTRIBUTES,
  isVoidElement,
  isRawTextElement,
  isEscapableRawTextElement,
  isUrlAttribute,
  isSvgElement,
  isMathmlElement,
  namespaceForTag,
  preservesCase,
  canonicalTagName,
  canonicalAttributeName,
  closedByStartTag,
  hasOptionalEndTag,
  IMPLIED_END_TAGS,
} from '../../src/ast/html.js';

describe('void elements', () => {
  it('contains exactly the HTML void elements', () => {
    expect([...VOID_ELEMENTS].sort()).toEqual([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);
  });

  it('recognises void elements regardless of case', () => {
    expect(isVoidElement('meta')).toBe(true);
    expect(isVoidElement('META')).toBe(true);
    expect(isVoidElement('Br')).toBe(true);
    expect(isVoidElement('IMG')).toBe(true);
  });

  it('does not treat containers as void', () => {
    // The regression: the parser used to swallow <title> as a child of <meta>.
    expect(isVoidElement('title')).toBe(false);
    expect(isVoidElement('head')).toBe(false);
    expect(isVoidElement('div')).toBe(false);
    expect(isVoidElement('script')).toBe(false);
  });

  it('does not treat unknown or custom tags as void', () => {
    expect(isVoidElement('my-widget')).toBe(false);
    expect(isVoidElement('')).toBe(false);
  });
});

describe('raw text elements', () => {
  it('contains script and style only', () => {
    expect([...RAW_TEXT_ELEMENTS].sort()).toEqual(['script', 'style']);
  });

  it('recognises raw text elements case-insensitively', () => {
    expect(isRawTextElement('script')).toBe(true);
    expect(isRawTextElement('SCRIPT')).toBe(true);
    expect(isRawTextElement('Style')).toBe(true);
    expect(isRawTextElement('textarea')).toBe(false);
    expect(isRawTextElement('div')).toBe(false);
  });
});

describe('escapable raw text elements', () => {
  it('contains textarea and title only', () => {
    expect([...ESCAPABLE_RAW_TEXT_ELEMENTS].sort()).toEqual([
      'textarea',
      'title',
    ]);
  });

  it('recognises escapable raw text elements case-insensitively', () => {
    expect(isEscapableRawTextElement('textarea')).toBe(true);
    expect(isEscapableRawTextElement('TEXTAREA')).toBe(true);
    expect(isEscapableRawTextElement('Title')).toBe(true);
    expect(isEscapableRawTextElement('script')).toBe(false);
  });

  it('is disjoint from the raw text set', () => {
    for (const tag of ESCAPABLE_RAW_TEXT_ELEMENTS) {
      expect(RAW_TEXT_ELEMENTS.has(tag)).toBe(false);
    }
  });
});

describe('URL attributes', () => {
  it('contains the attributes whose value is a URL', () => {
    expect([...URL_ATTRIBUTES].sort()).toEqual([
      'action',
      'background',
      'data',
      'formaction',
      'href',
      'ping',
      'poster',
      'src',
      'srcset',
      'xlink:href',
    ]);
  });

  it('recognises URL attributes case-insensitively', () => {
    expect(isUrlAttribute('href')).toBe(true);
    expect(isUrlAttribute('HREF')).toBe(true);
    expect(isUrlAttribute('XLink:Href')).toBe(true);
    expect(isUrlAttribute('formAction')).toBe(true);
  });

  it('does not claim ordinary attributes', () => {
    expect(isUrlAttribute('class')).toBe(false);
    expect(isUrlAttribute('title')).toBe(false);
    expect(isUrlAttribute('id')).toBe(false);
  });
});

describe('namespaces', () => {
  it('classifies plain HTML tags as html', () => {
    expect(namespaceForTag('div')).toBe('html');
    expect(namespaceForTag('INPUT')).toBe('html');
    expect(namespaceForTag('my-widget')).toBe('html');
  });

  it('classifies SVG tags as svg', () => {
    expect(namespaceForTag('svg')).toBe('svg');
    expect(namespaceForTag('path')).toBe('svg');
    expect(namespaceForTag('linearGradient')).toBe('svg');
    expect(namespaceForTag('clipPath')).toBe('svg');
    expect(namespaceForTag('foreignObject')).toBe('svg');
    expect(namespaceForTag('feGaussianBlur')).toBe('svg');
  });

  it('classifies MathML tags as mathml', () => {
    expect(namespaceForTag('math')).toBe('mathml');
    expect(namespaceForTag('mfrac')).toBe('mathml');
    expect(namespaceForTag('annotation-xml')).toBe('mathml');
  });

  it('matches foreign tag names case-insensitively', () => {
    // A template author may have written `<lineargradient>`; it is still SVG.
    expect(namespaceForTag('LINEARGRADIENT')).toBe('svg');
    expect(namespaceForTag('foreignobject')).toBe('svg');
    expect(namespaceForTag('MFRAC')).toBe('mathml');
  });

  it('resolves tags shared with HTML to html without a parent namespace', () => {
    for (const tag of AMBIGUOUS_FOREIGN_ELEMENTS) {
      expect(namespaceForTag(tag)).toBe('html');
    }
    expect(namespaceForTag('a')).toBe('html');
    expect(namespaceForTag('title')).toBe('html');
    expect(namespaceForTag('script')).toBe('html');
    expect(namespaceForTag('style')).toBe('html');
  });

  it('resolves shared tags to the parent namespace when one is given', () => {
    expect(namespaceForTag('a', 'svg')).toBe('svg');
    expect(namespaceForTag('title', 'svg')).toBe('svg');
    expect(namespaceForTag('annotation', 'mathml')).toBe('mathml');
  });

  it('keeps unknown descendants inside a foreign parent namespace', () => {
    // Foreign content has no fixed vocabulary; an unrecognised child of an
    // <svg> subtree is still created in the SVG namespace.
    expect(namespaceForTag('whatever', 'svg')).toBe('svg');
    expect(namespaceForTag('whatever', 'mathml')).toBe('mathml');
  });

  it('escapes back to HTML from an SVG foreignObject subtree', () => {
    expect(namespaceForTag('div', 'svg')).toBe('html');
    expect(namespaceForTag('span', 'mathml')).toBe('html');
  });

  it('always starts a new foreign subtree on svg/math regardless of parent', () => {
    expect(namespaceForTag('svg', 'html')).toBe('svg');
    expect(namespaceForTag('math', 'svg')).toBe('mathml');
  });

  it('exposes the raw element sets', () => {
    expect(SVG_ELEMENTS.has('feGaussianBlur')).toBe(true);
    expect(SVG_ELEMENTS.has('div')).toBe(false);
    expect(MATHML_ELEMENTS.has('msqrt')).toBe(true);
    expect(MATHML_ELEMENTS.has('div')).toBe(false);
  });
});

describe('case preservation', () => {
  it('reports that HTML tags may be lowercased', () => {
    expect(preservesCase('DIV')).toBe(false);
    expect(preservesCase('input')).toBe(false);
  });

  it('reports that foreign tags must not be lowercased', () => {
    expect(preservesCase('linearGradient')).toBe(true);
    expect(preservesCase('foreignObject')).toBe(true);
    expect(preservesCase('mfrac')).toBe(true);
  });

  it('honours a parent namespace for shared tag names', () => {
    expect(preservesCase('a')).toBe(false);
    expect(preservesCase('a', 'svg')).toBe(true);
  });

  it('canonicalises HTML tag names to lower case', () => {
    expect(canonicalTagName('DIV')).toBe('div');
    expect(canonicalTagName('Input')).toBe('input');
  });

  it('canonicalises foreign tag names to their case-sensitive spelling', () => {
    // This is the fix for blank icons: `lineargradient` in the SVG namespace
    // is not the same element as `linearGradient`.
    expect(canonicalTagName('lineargradient')).toBe('linearGradient');
    expect(canonicalTagName('FOREIGNOBJECT')).toBe('foreignObject');
    expect(canonicalTagName('clippath')).toBe('clipPath');
    expect(canonicalTagName('fegaussianblur')).toBe('feGaussianBlur');
    expect(canonicalTagName('animatetransform')).toBe('animateTransform');
  });

  it('leaves already-canonical foreign names untouched', () => {
    expect(canonicalTagName('linearGradient')).toBe('linearGradient');
    expect(canonicalTagName('svg')).toBe('svg');
  });

  it('canonicalises a shared tag according to its namespace', () => {
    expect(canonicalTagName('A')).toBe('a');
    expect(canonicalTagName('A', 'svg')).toBe('a');
  });
});

describe('attribute case preservation', () => {
  it('exposes the case-sensitive SVG attribute table', () => {
    expect(SVG_CASE_SENSITIVE_ATTRIBUTES.get('viewbox')).toBe('viewBox');
    expect(SVG_CASE_SENSITIVE_ATTRIBUTES.get('preserveaspectratio')).toBe(
      'preserveAspectRatio'
    );
  });

  it('lowercases HTML attribute names', () => {
    expect(canonicalAttributeName('CLASS', 'html')).toBe('class');
    expect(canonicalAttributeName('dataFoo', 'html')).toBe('datafoo');
  });

  it('restores case-sensitive SVG attribute names', () => {
    expect(canonicalAttributeName('viewbox', 'svg')).toBe('viewBox');
    expect(canonicalAttributeName('VIEWBOX', 'svg')).toBe('viewBox');
    expect(canonicalAttributeName('gradienttransform', 'svg')).toBe(
      'gradientTransform'
    );
    expect(canonicalAttributeName('patternunits', 'svg')).toBe('patternUnits');
  });

  it('leaves unknown foreign attributes exactly as written', () => {
    // SVG/MathML attribute names are case-sensitive; when we have no canonical
    // spelling the author's own spelling is the best answer, never lower case.
    expect(canonicalAttributeName('myCustomAttr', 'svg')).toBe('myCustomAttr');
    expect(canonicalAttributeName('someThing', 'mathml')).toBe('someThing');
  });

  it('preserves xlink and xml prefixed attributes verbatim', () => {
    expect(canonicalAttributeName('xlink:href', 'svg')).toBe('xlink:href');
    expect(canonicalAttributeName('xml:space', 'svg')).toBe('xml:space');
  });
});

describe('predicates are total over the element sets', () => {
  it('classifies every void element as an HTML element', () => {
    for (const tag of VOID_ELEMENTS) {
      expect(namespaceForTag(tag)).toBe('html');
    }
  });

  it('classifies every non-ambiguous SVG element as svg', () => {
    for (const tag of SVG_ELEMENTS) {
      if (AMBIGUOUS_FOREIGN_ELEMENTS.has(tag.toLowerCase())) continue;
      expect(isSvgElement(tag)).toBe(true);
      expect(namespaceForTag(tag)).toBe('svg');
    }
  });

  it('classifies every MathML element as mathml', () => {
    for (const tag of MATHML_ELEMENTS) {
      expect(isMathmlElement(tag)).toBe(true);
      expect(namespaceForTag(tag)).toBe('mathml');
    }
  });
});

describe('implied end tags', () => {
  it('closes a list item at the next list item', () => {
    expect(closedByStartTag('li', 'li')).toBe(true);
    expect(closedByStartTag('li', 'span')).toBe(false);
  });

  it('closes a paragraph at a block-level start tag', () => {
    expect(closedByStartTag('p', 'div')).toBe(true);
    expect(closedByStartTag('p', 'p')).toBe(true);
    expect(closedByStartTag('p', 'span')).toBe(false);
    expect(closedByStartTag('p', 'em')).toBe(false);
  });

  it('closes table cells and rows', () => {
    expect(closedByStartTag('td', 'td')).toBe(true);
    expect(closedByStartTag('td', 'tr')).toBe(true);
    expect(closedByStartTag('tr', 'tr')).toBe(true);
    expect(closedByStartTag('tr', 'td')).toBe(false);
  });

  it('closes options', () => {
    expect(closedByStartTag('option', 'option')).toBe(true);
    expect(closedByStartTag('option', 'optgroup')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(closedByStartTag('LI', 'Li')).toBe(true);
    expect(hasOptionalEndTag('TD')).toBe(true);
  });

  it('knows which elements may be left unclosed', () => {
    for (const tag of IMPLIED_END_TAGS.keys()) {
      expect(hasOptionalEndTag(tag)).toBe(true);
    }
    expect(hasOptionalEndTag('div')).toBe(false);
    expect(hasOptionalEndTag('span')).toBe(false);
  });

  it('never claims a void element has an optional end tag', () => {
    for (const tag of VOID_ELEMENTS) {
      expect(hasOptionalEndTag(tag)).toBe(false);
    }
  });
});
