/**
 * Settings and logging.
 *
 * `blade.trace.server` has been contributed since the first release and gated
 * nothing: sixteen unconditional log calls sat on the per-request path, one of
 * them formatting the first five completion labels purely to log them.
 */

import { describe, it, expect } from 'vitest';
import { readConfig } from '../src/protocol.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_LSP_CONFIG } from '../src/types.js';

describe('readConfig', () => {
  it('applies every default for an empty section', () => {
    expect(readConfig({})).toEqual(DEFAULT_LSP_CONFIG);
    expect(readConfig(undefined)).toEqual(DEFAULT_LSP_CONFIG);
  });

  it('reads the contributed settings', () => {
    const config = readConfig({
      lsp: {
        diagnostics: {
          enabled: false,
          unusedVariables: 'error',
          deprecatedHelpers: 'off',
          deepNesting: 'hint',
          deepNestingThreshold: 7,
        },
        completion: {
          dataSchemaPath: 'schemas/data.json',
          helpersDefinitionPath: 'helpers.json',
          snippets: false,
        },
      },
      trace: { server: 'verbose' },
    });

    expect(config.diagnostics.enabled).toBe(false);
    expect(config.diagnostics.unusedVariables).toBe('error');
    expect(config.diagnostics.deepNestingThreshold).toBe(7);
    expect(config.completion.dataSchemaPath).toBe('schemas/data.json');
    expect(config.completion.snippets).toBe(false);
    expect(config.trace).toBe('verbose');
  });

  it('treats an empty path setting as unset', () => {
    // An empty string is how VS Code spells "not set" for a path setting.
    const config = readConfig({
      lsp: { completion: { dataSchemaPath: '', helpersDefinitionPath: '' } },
    });
    expect(config.completion.dataSchemaPath).toBeUndefined();
    expect(config.completion.helpersDefinitionPath).toBeUndefined();
  });

  it('falls back to the default for a value of the wrong shape', () => {
    const config = readConfig({
      lsp: {
        diagnostics: { enabled: 'yes', deepNestingThreshold: 'four' },
        completion: { snippets: 1 },
      },
      trace: { server: 'loud' },
    });

    expect(config.diagnostics.enabled).toBe(true);
    expect(config.diagnostics.deepNestingThreshold).toBe(4);
    expect(config.completion.snippets).toBe(true);
    expect(config.trace).toBe('off');
  });

  it('reads potentiallyUndefined, which the manifest does not contribute yet', () => {
    expect(readConfig({}).diagnostics.potentiallyUndefined).toBe('hint');
    expect(
      readConfig({ lsp: { diagnostics: { potentiallyUndefined: 'off' } } })
        .diagnostics.potentiallyUndefined
    ).toBe('off');
  });
});

describe('Logger', () => {
  function sink() {
    const lines: string[] = [];
    return {
      lines,
      error: (message: string) => lines.push(`E ${message}`),
      log: (message: string) => lines.push(`L ${message}`),
    };
  }

  it('never builds a message it will not print', () => {
    const out = sink();
    const logger = new Logger(out, 'off');
    let built = 0;

    logger.info(() => {
      built++;
      return 'expensive';
    });
    logger.verbose(() => {
      built++;
      return 'expensive';
    });

    expect(built).toBe(0);
    expect(out.lines).toEqual([]);
  });

  it('prints info at messages, verbose only at verbose', () => {
    const out = sink();
    const logger = new Logger(out, 'messages');
    logger.info(() => 'a');
    logger.verbose(() => 'b');
    expect(out.lines).toEqual(['L [blade] a']);

    logger.setLevel('verbose');
    logger.verbose(() => 'b');
    expect(out.lines).toEqual(['L [blade] a', 'L [blade] b']);
  });

  it('always reports errors', () => {
    const out = sink();
    new Logger(out, 'off').error('broke', new Error('why'));
    expect(out.lines[0]).toContain('E [blade] broke');
    expect(out.lines[0]).toContain('why');
  });
});
