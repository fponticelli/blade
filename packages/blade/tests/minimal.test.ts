import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler/index.js';

describe('Minimal test', () => {
  it('should compile empty string', async () => {
    const result = await compile('');
    expect(result).toBeDefined();
  });
});
