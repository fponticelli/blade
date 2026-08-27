/**
 * The lint rules the settings have always advertised.
 *
 * `blade.lsp.diagnostics.unusedVariables`, `.deprecatedHelpers`, `.deepNesting`
 * and `.deepNestingThreshold` were contributed by the manifest, read into
 * configuration and consumed by nothing: `isVariableUsed` returned `true`
 * unconditionally, `getNestingDepthAtOffset` was called by nobody, and the
 * deprecated-helper generator had a comment where its body should have been.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { createDocument } from '../src/document.js';
import {
  generateDiagnostics,
  isHelperDeprecated,
  LspDiagnosticSeverityEnum,
} from '../src/providers/diagnostic.js';
import { initializeProjectContext } from '../src/project-context.js';
import { DEFAULT_LSP_CONFIG } from '../src/types.js';
import type { HelperDefinition, LspConfig } from '../src/types.js';
import { PROJECT_FIXTURES_ROOT } from '@bladets/corpus';

const fixtures = PROJECT_FIXTURES_ROOT;

function config(
  diagnostics: Partial<LspConfig['diagnostics']> = {}
): LspConfig {
  return {
    ...DEFAULT_LSP_CONFIG,
    diagnostics: { ...DEFAULT_LSP_CONFIG.diagnostics, ...diagnostics },
  };
}

function codesFor(
  content: string,
  cfg: LspConfig = config(),
  options?: Parameters<typeof generateDiagnostics>[2]
): string[] {
  const doc = createDocument('test://rules.blade', content);
  return generateDiagnostics(doc, cfg, options).map(d => d.code ?? '');
}

describe('unused variables', () => {
  it('reports a prop nothing reads', () => {
    const diagnostics = generateDiagnostics(
      createDocument('test://a.blade', '@props(used, unused)\n<p>$used</p>'),
      config()
    );
    const unused = diagnostics.filter(d => d.code === 'UNUSED_VARIABLE');
    expect(unused).toHaveLength(1);
    expect(unused[0]!.message).toContain("'unused'");
    expect(unused[0]!.range.start.line).toBe(0);
  });

  it('reports a loop index nothing reads', () => {
    const codes = codesFor(
      '@props(items)\n@for(item, index of items) {\n<li>$item</li>\n}\n'
    );
    expect(codes.filter(c => c === 'UNUSED_VARIABLE')).toHaveLength(1);
  });

  it('does not report a variable read inside a component definition', () => {
    expect(
      codesFor('<template:Card title!>\n<h2>$title</h2>\n</template:Card>')
    ).not.toContain('UNUSED_VARIABLE');
  });

  it('respects the off setting', () => {
    expect(
      codesFor('@props(unused)\n<p>x</p>', config({ unusedVariables: 'off' }))
    ).not.toContain('UNUSED_VARIABLE');
  });

  it('respects the configured severity', () => {
    const diagnostics = generateDiagnostics(
      createDocument('test://a.blade', '@props(unused)\n<p>x</p>'),
      config({ unusedVariables: 'error' })
    );
    expect(diagnostics[0]?.severity).toBe(LspDiagnosticSeverityEnum.Error);
  });
});

describe('deep nesting', () => {
  const DEEP = [
    '@if(a) {',
    ' @if(b) {',
    '  @if(c) {',
    '   @if(d) {',
    '    <i>x</i>',
    '   }',
    '  }',
    ' }',
    '}',
  ].join('\n');

  it('reports once, at the first level past the threshold', () => {
    const diagnostics = generateDiagnostics(
      createDocument('test://a.blade', DEEP),
      config({ deepNestingThreshold: 2, unusedVariables: 'off' })
    );
    const deep = diagnostics.filter(d => d.code === 'DEEP_NESTING');
    expect(deep).toHaveLength(1);
    expect(deep[0]!.range.start.line).toBe(2);
    expect(deep[0]!.message).toContain('3 levels');
  });

  it('says nothing below the threshold', () => {
    expect(
      codesFor(
        DEEP,
        config({ deepNestingThreshold: 4, unusedVariables: 'off' })
      )
    ).not.toContain('DEEP_NESTING');
  });

  it('respects the off setting', () => {
    expect(
      codesFor(
        DEEP,
        config({
          deepNesting: 'off',
          deepNestingThreshold: 1,
          unusedVariables: 'off',
        })
      )
    ).not.toContain('DEEP_NESTING');
  });
});

describe('deprecated helpers', () => {
  const helpers: HelperDefinition[] = [
    {
      name: 'oldFormat',
      signature: 'oldFormat(value): string',
      deprecated: true,
      deprecatedMessage: 'Use formatNumber instead.',
    },
    { name: 'stillFine', signature: 'stillFine(): string' },
  ];

  it('reports a call to a helper the definitions file marks deprecated', () => {
    const diagnostics = generateDiagnostics(
      createDocument('test://a.blade', '<p>${oldFormat(1)} ${stillFine()}</p>'),
      config(),
      { helpers }
    );
    const deprecated = diagnostics.filter(d => d.code === 'DEPRECATED_HELPER');
    expect(deprecated).toHaveLength(1);
    expect(deprecated[0]!.message).toContain('Use formatNumber instead.');
    expect(deprecated[0]!.range.start.line).toBe(0);
  });

  it('says nothing without a helpers definition file', () => {
    expect(codesFor('<p>${oldFormat(1)}</p>')).not.toContain(
      'DEPRECATED_HELPER'
    );
  });

  it('answers the deprecation question directly', () => {
    expect(isHelperDeprecated('oldFormat', helpers).deprecated).toBe(true);
    expect(isHelperDeprecated('stillFine', helpers).deprecated).toBe(false);
    expect(isHelperDeprecated('oldFormat', undefined).deprecated).toBe(false);
  });
});

describe('oversized files', () => {
  it('says why language features are off, and nothing else', () => {
    const doc = createDocument(
      'test://big.blade',
      '<div>' + 'x'.repeat(100) + '</div>',
      1,
      { maxFileSize: 10 }
    );
    const diagnostics = generateDiagnostics(doc, config());
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('FILE_TOO_LARGE');
  });
});

describe('potentially undefined', () => {
  it('reports a name the schema does not have', async () => {
    const projectContext = await initializeProjectContext(
      resolve(fixtures, 'with-schema')
    );
    expect(projectContext).not.toBeNull();

    const diagnostics = generateDiagnostics(
      createDocument('test://a.blade', '<p>${user.name} ${nope}</p>'),
      config(),
      { projectContext }
    );
    const undef = diagnostics.filter(d => d.code === 'POTENTIALLY_UNDEFINED');
    expect(undef.map(d => d.message)).toEqual([
      "'nope' is not declared by @props and not a property of schema.json.",
    ]);
  });

  it('says nothing about a declared prop or a helper', async () => {
    const projectContext = await initializeProjectContext(
      resolve(fixtures, 'with-schema')
    );
    const diagnostics = generateDiagnostics(
      createDocument(
        'test://a.blade',
        '@props(user)\n<p>${uppercase(user.name)}</p>'
      ),
      config(),
      { projectContext }
    );
    expect(diagnostics.map(d => d.code)).not.toContain('POTENTIALLY_UNDEFINED');
  });

  it('says nothing at all without a schema to check against', () => {
    expect(codesFor('<p>${anything}</p>')).not.toContain(
      'POTENTIALLY_UNDEFINED'
    );
  });
});
