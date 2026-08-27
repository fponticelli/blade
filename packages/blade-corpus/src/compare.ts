// Comparing one document against another.
//
// The three sinks produce different *media*: characters, DOM nodes, and a live
// tree. Comparing them means deciding what "the same" is, and getting that
// decision wrong in either direction ruins the corpus - too strict and every
// case needs a per-sink expectation, too loose and a real divergence is
// normalised away.
//
// The decision made here is: the same parse. `<br/>` and `<br>`, `&#39;` and
// `'`, `&copy;` and `©` are one document written three ways, and the reader
// only ever sees the document. So the node-building sinks are compared against
// the *parse* of the string sink's output rather than against its markup, and
// nothing else is normalised - not whitespace, not attribute order, not empty
// text nodes. Anything that survives this is a real disagreement.

import type { CorpusCase, RendererId } from './types.js';
import { RENDERER_IDS } from './types.js';

/**
 * The serialised form of a list of rendered nodes.
 *
 * @param nodes - What a node-building sink produced
 * @returns The markup of those nodes, in document order
 */
export function serializeNodes(nodes: readonly Node[]): string {
  const host = document.createElement('div');
  for (const node of nodes) host.appendChild(node);
  return host.innerHTML;
}

/**
 * HTML put through the parser and written back out.
 *
 * The normalisation, and the only one: it is what an HTML parser does, so two
 * strings that agree afterwards describe the same document to every reader.
 *
 * @param html - Markup produced by a serialising sink
 * @returns The same document, spelled the way the parser spells it
 */
export function reserializeHtml(html: string): string {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.innerHTML;
}

/**
 * Markup parsed as a whole HTML document and written back out.
 *
 * {@link reserializeHtml} parses in *fragment* context, which is right for the
 * corpus - every case there is a fragment - and wrong for a page: the fragment
 * parser discards `<html>`, `<head>` and `<body>`, which several of the shipped
 * samples are built out of, while the DOM sink creates them as ordinary
 * elements and keeps them. Comparing a page needs a parse that has somewhere to
 * put them.
 *
 * Applied to BOTH sides of a comparison, never to one, so nothing is
 * normalised in one medium that is not normalised in the other.
 *
 * @param html - Markup produced by a sink, or serialised from its nodes
 * @returns The same page, spelled the way the document parser spells it
 */
export function asDocument(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').documentElement
    .outerHTML;
}

/**
 * The document every node-building sink must produce for a case.
 *
 * Derived from the string expectation, so a case states its output once. A
 * case may override it - see {@link CorpusCase.expectedDomOuterHtml} - and
 * then it has to say why.
 *
 * @param corpusCase - The case being checked
 * @returns Serialised markup the DOM and reactive sinks must match
 */
export function expectedDocumentFor(corpusCase: CorpusCase): string {
  return (
    corpusCase.expectedDomOuterHtml ?? reserializeHtml(corpusCase.expectedHtml)
  );
}

/** Whether the case is expected to fail compilation rather than render. */
export function isCompileFailure(corpusCase: CorpusCase): boolean {
  return (corpusCase.expectedDiagnostics ?? []).some(
    diagnostic => diagnostic.level === 'error'
  );
}

/**
 * Whether a renderer is driven through this case.
 *
 * @param corpusCase - The case being checked
 * @param renderer - The renderer asking
 */
export function includesRenderer(
  corpusCase: CorpusCase,
  renderer: RendererId
): boolean {
  return corpusCase.excludedFrom?.[renderer] === undefined;
}

/** One renderer a case is deliberately not driven through. */
export interface Exclusion {
  readonly caseName: string;
  readonly renderer: RendererId;
  readonly reason: string;
}

/**
 * Every exclusion in the corpus, so a suite can print the list.
 *
 * A short list of deliberate design decisions is healthy; a growing one is a
 * pile of unfixed divergences, and printing it is what makes the difference
 * visible.
 *
 * @param cases - The corpus
 */
export function exclusionsIn(cases: readonly CorpusCase[]): Exclusion[] {
  const exclusions: Exclusion[] = [];
  for (const corpusCase of cases) {
    for (const renderer of RENDERER_IDS) {
      const reason = corpusCase.excludedFrom?.[renderer];
      if (reason !== undefined) {
        exclusions.push({ caseName: corpusCase.name, renderer, reason });
      }
    }
  }
  return exclusions;
}
