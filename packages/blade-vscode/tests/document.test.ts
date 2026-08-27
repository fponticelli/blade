/**
 * The two Content-Security-Policies, and the isolation between them.
 */

import { describe, it, expect } from 'vitest';
import { buildPreviewDocument, panelCsp } from '../src/preview/document.js';

const CSP_SOURCE = 'https://file+.vscode-resource.vscode-cdn.net';

function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(' ');
    map.set(
      space === -1 ? trimmed : trimmed.slice(0, space),
      space === -1 ? '' : trimmed.slice(space + 1)
    );
  }
  return map;
}

function policyOf(document: string): Map<string, string> {
  const match =
    /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(
      document
    );
  if (!match || match[1] === undefined) throw new Error('no CSP in document');
  return directives(match[1]);
}

describe('panelCsp', () => {
  const policy = directives(panelCsp(CSP_SOURCE, 'NONCE'));

  it('names base-uri and form-action, neither of which falls back to default-src', () => {
    // Without base-uri an injected `<base href="https://attacker/">` retargets
    // every relative URL in the panel; without form-action an injected form
    // exfiltrates on one click. `default-src 'none'` covers neither.
    expect(policy.has('base-uri')).toBe(true);
    expect(policy.get('form-action')).toBe("'none'");
  });

  it('refuses plugins and allows only nonced scripts', () => {
    expect(policy.get('object-src')).toBe("'none'");
    expect(policy.get('script-src')).toBe("'nonce-NONCE'");
    expect(policy.get('script-src')).not.toContain('unsafe-inline');
  });

  it('permits images and fonts, which a srcdoc frame inherits', () => {
    // A `srcdoc` document inherits its embedder's policy, so the panel's policy
    // is enforced on the preview frame too: without img-src here, every image
    // in every previewed template is blocked no matter what the inner policy
    // says. There used to be no img-src and no font-src anywhere.
    expect(policy.get('img-src')).toContain(CSP_SOURCE);
    expect(policy.get('img-src')).toContain('data:');
    expect(policy.get('font-src')).toContain(CSP_SOURCE);
  });

  it('allows the preview frame itself', () => {
    expect(policy.get('frame-src')).toBe("'self'");
  });
});

describe('buildPreviewDocument', () => {
  const document = buildPreviewDocument('<p>hello</p>', {
    cspSource: CSP_SOURCE,
    baseHref: 'https://file+.vscode-resource.vscode-cdn.net/project/',
  });

  it('is a whole document carrying the rendered markup', () => {
    expect(document).toContain('<!DOCTYPE html>');
    expect(document).toContain('<p>hello</p>');
  });

  it('forbids scripting outright', () => {
    expect(policyOf(document).get('script-src')).toBe("'none'");
  });

  it('permits images, fonts and inline styles and nothing else', () => {
    const policy = policyOf(document);
    expect(policy.get('default-src')).toBe("'none'");
    expect(policy.get('img-src')).toContain('data:');
    expect(policy.get('style-src')).toContain("'unsafe-inline'");
    expect(policy.get('object-src')).toBe("'none'");
    expect(policy.get('frame-src')).toBe("'none'");
    expect(policy.get('form-action')).toBe("'none'");
  });

  it('emits its base element before anything an injected one could follow', () => {
    const base = document.indexOf('<base href=');
    const body = document.indexOf('<body>');
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(body);
    // Only the first `<base href>` in a document has any effect, so a second
    // one inside the rendered markup is inert.
    expect(document.indexOf('<base', base + 1)).toBe(-1);
  });

  it('escapes the base URL rather than interpolating it', () => {
    const escaped = buildPreviewDocument('', {
      cspSource: CSP_SOURCE,
      baseHref: '/a"><script>alert(1)</script>',
    });
    expect(escaped).not.toContain('<script>alert(1)</script>');
    expect(escaped).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('omits the base element when the project has no webview URL', () => {
    const none = buildPreviewDocument('<p></p>', {
      cspSource: CSP_SOURCE,
      baseHref: null,
    });
    expect(none).not.toContain('<base');
  });
});
