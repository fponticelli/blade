// Character-reference decoding for DOM sinks
//
// Author-written text in a template is HTML *source*: `Tom &amp; Jerry` means
// three words and one ampersand. A string sink writes it verbatim, because that
// is already the representation it needs. Every DOM sink has to decode it
// first, because `createTextNode` shows `&amp;` as five characters - and there
// is now more than one DOM sink, so the decoder lives here rather than inside
// one of them.

/**
 * Decoded forms of author-written text, keyed by the source that produced them.
 *
 * Decoding runs the platform's own HTML parser, which is the only complete
 * implementation of the character-reference table there is - a hand-written one
 * would be missing entries the day it was written, and every miss would render
 * `&Zopf;` as the six characters the author did not type. It is also the one
 * thing here that costs real work, and the answer depends on nothing but the
 * string, so it is memoised for the life of the process.
 */
const decodedText = new Map<string, string>();

/** Bound on {@link decodedText}, so a long-lived process cannot grow forever. */
const MAX_DECODE_CACHE = 4096;

let decoderElement: HTMLTextAreaElement | null = null;

/**
 * Decodes character references in author-written text.
 *
 * A detached `<textarea>` is used rather than an element that parses markup:
 * its content model is escapable raw text, so the source cannot introduce
 * elements, scripts or event handlers on the way through - only its character
 * references are decoded.
 *
 * @param source - Author-written text, as HTML source
 * @returns The same text with character references resolved
 */
export function decodeHtmlText(source: string): string {
  if (!source.includes('&')) return source;
  const cached = decodedText.get(source);
  if (cached !== undefined) return cached;

  decoderElement ??= document.createElement('textarea');
  decoderElement.innerHTML = source;
  const decoded = decoderElement.value;

  if (decodedText.size >= MAX_DECODE_CACHE) decodedText.clear();
  decodedText.set(source, decoded);
  return decoded;
}
