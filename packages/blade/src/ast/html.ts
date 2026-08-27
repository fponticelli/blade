// HTML Content Model
//
// The single authority on what an HTML tag *is*: whether it can hold children,
// whether its text content is parsed as markup, which of its attributes carry a
// URL, and which namespace it belongs to.
//
// Every stage of the pipeline needs the same answers. When the parser and the
// renderer each keep their own copy they drift, and the drift is silent: a
// parser with no notion of void elements reads `<meta charset="utf-8">` as a
// container and makes the rest of `<head>` its children, while a renderer that
// knows `meta` is void emits `<meta/>` and drops those children on the floor -
// deleting the `<title>` from the page. There is exactly one copy of these
// facts, and it lives here.

/**
 * The three element namespaces a Blade template can produce.
 *
 * HTML tag and attribute names are ASCII case-insensitive; SVG and MathML names
 * are case-SENSITIVE (`viewBox`, `linearGradient`, `clipPath`, `foreignObject`).
 */
export type Namespace = 'html' | 'svg' | 'mathml';

// =============================================================================
// Void elements
// =============================================================================

/**
 * HTML void elements: they have no closing tag and can never have children.
 *
 * Per the HTML Standard, section 13.1.2. A parser must close these immediately
 * and a renderer must not emit a closing tag for them.
 */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
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

// =============================================================================
// Text content model
// =============================================================================

/**
 * Elements whose content is raw text: browsers do NOT decode character
 * references inside them.
 *
 * HTML-entity escaping is therefore actively wrong here - `&amp;` reaches the
 * JavaScript or CSS parser as the six characters `&amp;`, corrupting the value
 * and, for a `$!` raw sink, leaving `</script>` free to close the element.
 * Use {@link escapeJsString} / {@link escapeCssValue} from renderer/escape.ts.
 */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'style',
]);

/**
 * Elements whose content is escapable raw text: no markup is parsed inside
 * them, but character references ARE decoded.
 *
 * Plain HTML-body escaping is exactly right here, and nothing else is.
 */
export const ESCAPABLE_RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'textarea',
  'title',
]);

// =============================================================================
// URL-valued attributes
// =============================================================================

/**
 * Attributes whose value is a URL.
 *
 * These need scheme validation, not entity escaping: `javascript:alert(1)`
 * contains no HTML-special character at all, so escaping is structurally
 * incapable of defending them. See `sanitizeUrlAttribute` in renderer/escape.ts.
 */
export const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'src',
  'srcset',
  'action',
  'formaction',
  'poster',
  'data',
  'xlink:href',
  'ping',
  'background',
]);

// =============================================================================
// Element vocabularies
// =============================================================================

/**
 * Known HTML elements.
 *
 * Used to decide when a tag inside an SVG or MathML subtree escapes back into
 * the HTML namespace (`<foreignObject><div>`), and nothing else - an unknown
 * tag is still a perfectly valid custom element.
 */
export const HTML_ELEMENTS: ReadonlySet<string> = new Set([
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'search',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
]);

/**
 * SVG elements, spelled with their canonical - and case-significant - names.
 *
 * Lowercasing `linearGradient` or `clipPath` produces an element that does not
 * exist in the SVG namespace, which is why a lowercasing renderer draws blank
 * icons. Use {@link canonicalTagName} to recover the correct spelling.
 */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'discard',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'hatch',
  'hatchpath',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'script',
  'set',
  'stop',
  'style',
  'svg',
  'switch',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'use',
  'view',
]);

/**
 * MathML elements, spelled with their canonical names.
 */
export const MATHML_ELEMENTS: ReadonlySet<string> = new Set([
  'annotation',
  'annotation-xml',
  'maction',
  'maligngroup',
  'malignmark',
  'math',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mglyph',
  'mi',
  'mlabeledtr',
  'mlongdiv',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mprescripts',
  'mroot',
  'mrow',
  'ms',
  'mscarries',
  'mscarry',
  'msgroup',
  'msline',
  'mspace',
  'msqrt',
  'msrow',
  'mstack',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'none',
  'semantics',
]);

/** Lower-cased name to canonical spelling, for one element vocabulary. */
function canonicalIndex(names: Iterable<string>): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const name of names) {
    index.set(name.toLowerCase(), name);
  }
  return index;
}

const SVG_INDEX = canonicalIndex(SVG_ELEMENTS);
const MATHML_INDEX = canonicalIndex(MATHML_ELEMENTS);

/**
 * Tag names that exist in HTML *and* in a foreign namespace (`a`, `script`,
 * `style`, `title`).
 *
 * Their namespace is decided by their ancestry, not by their name, so
 * {@link namespaceForTag} answers `'html'` for them unless a parent namespace
 * is supplied.
 */
export const AMBIGUOUS_FOREIGN_ELEMENTS: ReadonlySet<string> = new Set(
  [...SVG_INDEX.keys(), ...MATHML_INDEX.keys()].filter(name =>
    HTML_ELEMENTS.has(name)
  )
);

// =============================================================================
// Attribute vocabularies
// =============================================================================

/**
 * SVG attributes whose canonical spelling is not all lower case, indexed by
 * their lower-cased form.
 *
 * `viewbox` is not `viewBox`: the DOM will accept the attribute and the element
 * will simply not render.
 */
export const SVG_CASE_SENSITIVE_ATTRIBUTES: ReadonlyMap<string, string> =
  canonicalIndex([
    'attributeName',
    'attributeType',
    'baseFrequency',
    'baseProfile',
    'calcMode',
    'clipPathUnits',
    'contentScriptType',
    'contentStyleType',
    'diffuseConstant',
    'edgeMode',
    'externalResourcesRequired',
    'filterRes',
    'filterUnits',
    'glyphRef',
    'gradientTransform',
    'gradientUnits',
    'kernelMatrix',
    'kernelUnitLength',
    'keyPoints',
    'keySplines',
    'keyTimes',
    'lengthAdjust',
    'limitingConeAngle',
    'markerHeight',
    'markerUnits',
    'markerWidth',
    'maskContentUnits',
    'maskUnits',
    'numOctaves',
    'pathLength',
    'patternContentUnits',
    'patternTransform',
    'patternUnits',
    'pointsAtX',
    'pointsAtY',
    'pointsAtZ',
    'preserveAlpha',
    'preserveAspectRatio',
    'primitiveUnits',
    'refX',
    'refY',
    'repeatCount',
    'repeatDur',
    'requiredExtensions',
    'requiredFeatures',
    'specularConstant',
    'specularExponent',
    'spreadMethod',
    'startOffset',
    'stdDeviation',
    'stitchTiles',
    'surfaceScale',
    'systemLanguage',
    'tableValues',
    'targetX',
    'targetY',
    'textLength',
    'viewBox',
    'viewTarget',
    'xChannelSelector',
    'yChannelSelector',
    'zoomAndPan',
  ]);

/**
 * MathML attributes whose canonical spelling is not all lower case.
 */
export const MATHML_CASE_SENSITIVE_ATTRIBUTES: ReadonlyMap<string, string> =
  canonicalIndex(['definitionURL']);

// =============================================================================
// Implied end tags
// =============================================================================

/**
 * Start tags that implicitly close an already-open element, keyed by the name
 * of the open element.
 *
 * `<ul><li>a<li>b</ul>` is not malformed HTML: the second `<li>` closes the
 * first. A parser without these rules nests the second list item inside the
 * first and reports a mismatched closing tag for the `</ul>`, which is a
 * diagnostic about a mistake the author never made.
 *
 * Derived from the "have an element in list item scope"/"generate implied end
 * tags" rules of the HTML Standard, section 13.2.6.4, restricted to the pairs a
 * template author actually writes.
 */
export const IMPLIED_END_TAGS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map<string, ReadonlySet<string>>([
  ['li', new Set(['li'])],
  ['dt', new Set(['dt', 'dd'])],
  ['dd', new Set(['dt', 'dd'])],
  ['rt', new Set(['rt', 'rp'])],
  ['rp', new Set(['rt', 'rp'])],
  ['option', new Set(['option', 'optgroup'])],
  ['optgroup', new Set(['optgroup'])],
  ['tr', new Set(['tr', 'tbody', 'tfoot', 'thead'])],
  ['td', new Set(['td', 'th', 'tr', 'tbody', 'tfoot', 'thead'])],
  ['th', new Set(['td', 'th', 'tr', 'tbody', 'tfoot', 'thead'])],
  ['thead', new Set(['tbody', 'tfoot'])],
  ['tbody', new Set(['tbody', 'tfoot'])],
  ['tfoot', new Set(['tbody'])],
  [
    'p',
    new Set([
      'address',
      'article',
      'aside',
      'blockquote',
      'details',
      'div',
      'dl',
      'fieldset',
      'figcaption',
      'figure',
      'footer',
      'form',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'header',
      'hgroup',
      'hr',
      'main',
      'menu',
      'nav',
      'ol',
      'p',
      'pre',
      'search',
      'section',
      'table',
      'ul',
    ]),
  ],
]);

// =============================================================================
// Predicates
// =============================================================================

/**
 * Whether an open `openTag` element is implicitly closed by a `startTag` start
 * tag. Case-insensitive.
 */
export function closedByStartTag(openTag: string, startTag: string): boolean {
  return (
    IMPLIED_END_TAGS.get(openTag.toLowerCase())?.has(startTag.toLowerCase()) ===
    true
  );
}

/**
 * Whether the element may be left unclosed - that is, whether an enclosing end
 * tag closes it without that being an error. Case-insensitive.
 */
export function hasOptionalEndTag(tag: string): boolean {
  return IMPLIED_END_TAGS.has(tag.toLowerCase());
}

/** Whether the tag is an HTML void element. Case-insensitive. */
export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}

/**
 * Whether the tag's content is raw text (`<script>`, `<style>`).
 * Case-insensitive.
 */
export function isRawTextElement(tag: string): boolean {
  return RAW_TEXT_ELEMENTS.has(tag.toLowerCase());
}

/**
 * Whether the tag's content is escapable raw text (`<textarea>`, `<title>`).
 * Case-insensitive.
 */
export function isEscapableRawTextElement(tag: string): boolean {
  return ESCAPABLE_RAW_TEXT_ELEMENTS.has(tag.toLowerCase());
}

/** Whether the attribute's value is a URL. Case-insensitive. */
export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

/**
 * Whether the attribute's value is an event handler - `onclick`, `oninput`.
 *
 * Its value is JavaScript source that this engine never parses, so there is no
 * encoder that can make an interpolated value mean itself there: every escape
 * a template engine could apply is a guess about a language it is not reading.
 * The compiler refuses interpolation into these, and the renderer drops one
 * that reaches it anyway.
 *
 * @param name - Attribute name as written in the template
 */
export function isEventHandlerAttribute(name: string): boolean {
  // `on` followed by at least one ASCII letter; `on` alone, and `on-foo`, are
  // ordinary attributes.
  return /^on[a-z]+$/i.test(name);
}

/** Whether the tag names a known HTML element. Case-insensitive. */
export function isHtmlElement(tag: string): boolean {
  return HTML_ELEMENTS.has(tag.toLowerCase());
}

/**
 * Whether the tag names an SVG element. Case-insensitive.
 *
 * Note this is true for the shared names in
 * {@link AMBIGUOUS_FOREIGN_ELEMENTS} (`a`, `script`, `style`, `title`) - use
 * {@link namespaceForTag} when the answer must account for ancestry.
 */
export function isSvgElement(tag: string): boolean {
  return SVG_INDEX.has(tag.toLowerCase());
}

/** Whether the tag names a MathML element. Case-insensitive. */
export function isMathmlElement(tag: string): boolean {
  return MATHML_INDEX.has(tag.toLowerCase());
}

// =============================================================================
// Namespace resolution
// =============================================================================

/**
 * The namespace an element belongs to.
 *
 * `<svg>` and `<math>` always open a foreign subtree. Inside one, a tag stays
 * foreign unless it is a known HTML element - that is how `<foreignObject>`
 * content escapes back to HTML - and an unrecognised tag stays foreign, because
 * foreign vocabularies are open-ended.
 *
 * Without a parent namespace the answer rests on the tag name alone, so the
 * names shared with HTML resolve to `'html'`; pass `parentNamespace` whenever
 * the caller is walking a tree and knows better.
 *
 * @param tag - Tag name as written in the template
 * @param parentNamespace - Namespace of the enclosing element, if known
 */
export function namespaceForTag(
  tag: string,
  parentNamespace?: Namespace
): Namespace {
  const lower = tag.toLowerCase();

  // A foreign root always wins, whatever it is nested in.
  if (lower === 'svg') return 'svg';
  if (lower === 'math') return 'mathml';

  if (parentNamespace === 'svg') {
    if (SVG_INDEX.has(lower)) return 'svg';
    return HTML_ELEMENTS.has(lower) ? 'html' : 'svg';
  }
  if (parentNamespace === 'mathml') {
    if (MATHML_INDEX.has(lower)) return 'mathml';
    return HTML_ELEMENTS.has(lower) ? 'html' : 'mathml';
  }

  // No ancestry to go on: a name shared with HTML is treated as HTML.
  if (AMBIGUOUS_FOREIGN_ELEMENTS.has(lower)) return 'html';
  if (SVG_INDEX.has(lower)) return 'svg';
  if (MATHML_INDEX.has(lower)) return 'mathml';
  return 'html';
}

/**
 * Whether the tag name must be used exactly as written rather than lower-cased.
 *
 * True for everything outside the HTML namespace. Callers that build DOM nodes
 * must consult this before normalising a tag name.
 */
export function preservesCase(
  tag: string,
  parentNamespace?: Namespace
): boolean {
  return namespaceForTag(tag, parentNamespace) !== 'html';
}

/**
 * The spelling of a tag name that should actually be used to create the element.
 *
 * HTML names are lower-cased. Foreign names are restored to their canonical,
 * case-significant spelling when we know it (`lineargradient` -> `linearGradient`)
 * and otherwise left exactly as the author wrote them, because a foreign
 * vocabulary we do not know is still case-sensitive.
 */
export function canonicalTagName(
  tag: string,
  parentNamespace?: Namespace
): string {
  const namespace = namespaceForTag(tag, parentNamespace);
  if (namespace === 'html') return tag.toLowerCase();
  const index = namespace === 'svg' ? SVG_INDEX : MATHML_INDEX;
  return index.get(tag.toLowerCase()) ?? tag;
}

/**
 * The spelling of an attribute name that should actually be set on the element.
 *
 * HTML attribute names are ASCII case-insensitive and are lower-cased. Foreign
 * attribute names are case-sensitive: known ones are restored to their canonical
 * spelling (`viewbox` -> `viewBox`) and unknown ones - including every
 * namespaced name such as `xlink:href` - are left exactly as written.
 */
export function canonicalAttributeName(
  name: string,
  namespace: Namespace
): string {
  if (namespace === 'html') return name.toLowerCase();
  // A prefixed name (`xlink:href`, `xml:space`) is already canonical.
  if (name.includes(':')) return name;
  const index =
    namespace === 'svg'
      ? SVG_CASE_SENSITIVE_ATTRIBUTES
      : MATHML_CASE_SENSITIVE_ATTRIBUTES;
  return index.get(name.toLowerCase()) ?? name;
}
