// Reading a reactive render back.
//
// Shared by every suite in this package that compares the reactive sink with
// an eager one, so that "what the mounted tree says" has exactly one
// definition. Two definitions of that is how a comparison starts quietly
// excusing a difference.

/**
 * The mounted document, without the anchors Tempo marks its dynamic regions
 * with.
 *
 * Those anchors are empty comments - the sink's bookkeeping, not content - so
 * only empty ones are removed. Stripping *every* comment, which is the obvious
 * thing to do, would also delete the comments a template asked for, and
 * `includeComments` is one of the settings the conformance corpus exists to
 * check.
 *
 * @param element - The container a render was mounted into
 * @returns The markup of its contents
 */
export function documentOf(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const anchors: Comment[] = [];
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (comment.data === '') anchors.push(comment);
  }
  for (const anchor of anchors) anchor.remove();
  return copy.innerHTML;
}

/**
 * Waits for the pass that just ran to report what went wrong in it.
 *
 * Failures are counted for a pass and delivered when the pass ends, which is a
 * microtask later - so a test that checks them synchronously checks an empty
 * list and passes for the wrong reason.
 */
export async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
