/**
 * The document rendered template output is shown in.
 *
 * Output rendered from an arbitrary workspace `.blade` file with arbitrary
 * workspace JSON is untrusted markup. It used to be assigned to
 * `previewContent.innerHTML` in the *privileged* page - the one holding
 * `acquireVsCodeApi()` - with nothing between it and script execution but a CSP
 * that omitted `base-uri`, `form-action` and `object-src`, and a nonce built
 * from `Math.random()`. Any later change that switched to `insertAdjacentHTML`
 * inside a nonce-bearing wrapper, or that added `'unsafe-inline'` to make some
 * preview feature work, would have turned that into arbitrary script execution
 * against the extension's message channel.
 *
 * So the markup does not go in that page at all. It is built here into a whole
 * document, given its own `script-src 'none'` policy, and handed to a
 * `sandbox`ed `<iframe srcdoc>` - a unique origin with no scripting, no forms,
 * no top-level navigation and no way to reach the panel's API. A `srcdoc`
 * document also *inherits* its embedder's policy, so the panel's CSP applies to
 * it as well and the two are enforced together.
 */

import { escapeHtml } from './utils.js';

export interface PreviewDocumentOptions {
  /** `webview.cspSource`: the origin local resources are served from. */
  readonly cspSource: string;
  /**
   * Base URL relative `src`/`href` attributes resolve against - the project
   * root, as a webview URI.
   *
   * Without it the preview's CSP blocked every image in every previewed
   * template: the policy named no `img-src` and no `font-src`, neither of which
   * falls back to anything but `default-src 'none'`, so `<img src="logo.png">`
   * rendered as a broken-image placeholder with no error reported anywhere.
   * Emitted first in `<head>`, so an injected second `<base>` is ignored by the
   * parser, and constrained by `base-uri` besides.
   */
  readonly baseHref: string | null;
}

/**
 * Builds the sandboxed document for one render.
 *
 * @param html - The rendered markup
 * @param options - Resource origin and base URL
 * @returns A complete HTML document for `iframe.srcdoc`
 */
export function buildPreviewDocument(
  html: string,
  options: PreviewDocumentOptions
): string {
  const base =
    options.baseHref === null
      ? ''
      : `\n  <base href="${escapeHtml(options.baseHref)}">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">${base}
  <meta http-equiv="Content-Security-Policy" content="${previewCsp(options.cspSource)}">
  <style>
    html, body { margin: 0; padding: 16px; box-sizing: border-box; }
    body {
      background: transparent;
      color: var(--vscode-editor-foreground, #ccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
    }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * The inner frame's policy.
 *
 * Images and fonts are allowed - that is the point of the frame - and nothing
 * else is. Scripts, plugins, nested frames and form submissions are refused
 * outright rather than restricted, because none of them has any business in a
 * template preview.
 */
function previewCsp(cspSource: string): string {
  return [
    `default-src 'none'`,
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `media-src ${cspSource} https: data:`,
    `script-src 'none'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `form-action 'none'`,
    `base-uri ${cspSource}`,
  ].join('; ');
}

/**
 * The privileged panel's own policy.
 *
 * `base-uri` and `form-action` are named explicitly because neither falls back
 * to `default-src`: without them an injected `<base href="https://attacker/">`
 * retargets every relative URL in the panel, and an injected `<form>` around
 * plausible-looking inputs exfiltrates on one click. The image and font sources
 * are here as well as in the inner policy because a `srcdoc` frame inherits its
 * embedder's policy and both are enforced.
 *
 * @param cspSource - `webview.cspSource`
 * @param nonce - The nonce the panel's own script carries
 * @returns The policy string for the panel's `<meta>` tag
 */
export function panelCsp(cspSource: string, nonce: string): string {
  return [
    `default-src 'none'`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource} data:`,
    `media-src ${cspSource} https: data:`,
    `frame-src 'self'`,
    `object-src 'none'`,
    `base-uri ${cspSource}`,
    `form-action 'none'`,
  ].join('; ');
}
