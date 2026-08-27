import { describe, it, expect } from 'vitest';
import {
  Tokenizer,
  TokenType,
  type Token,
} from '../../src/parser/tokenizer.js';

function tokenize(
  source: string,
  base?: {
    line: number;
    column: number;
    offset: number;
  }
) {
  return new Tokenizer(source, base).tokenize();
}

function types(source: string): TokenType[] {
  return tokenize(source)
    .tokens.filter(t => t.type !== TokenType.EOF)
    .map(t => t.type);
}

function values(source: string): string[] {
  return tokenize(source)
    .tokens.filter(t => t.type !== TokenType.EOF)
    .map(t => t.value);
}

describe('Tokenizer - basics', () => {
  it('tokenizes a path expression', () => {
    expect(types('$order.items[0]')).toEqual([
      TokenType.DOLLAR,
      TokenType.IDENTIFIER,
      TokenType.DOT,
      TokenType.IDENTIFIER,
      TokenType.LBRACKET,
      TokenType.NUMBER,
      TokenType.RBRACKET,
    ]);
  });

  it('tokenizes operators', () => {
    expect(types('a + b * c == d && e || f ?? g ? h : i')).toEqual([
      TokenType.IDENTIFIER,
      TokenType.PLUS,
      TokenType.IDENTIFIER,
      TokenType.STAR,
      TokenType.IDENTIFIER,
      TokenType.EQ_EQ,
      TokenType.IDENTIFIER,
      TokenType.AMP_AMP,
      TokenType.IDENTIFIER,
      TokenType.PIPE_PIPE,
      TokenType.IDENTIFIER,
      TokenType.QUESTION_QUESTION,
      TokenType.IDENTIFIER,
      TokenType.QUESTION,
      TokenType.IDENTIFIER,
      TokenType.COLON,
      TokenType.IDENTIFIER,
    ]);
  });

  it('emits LT/GT for angle brackets - it lexes expressions, not HTML', () => {
    expect(types('a < b > c <= d >= e')).toEqual([
      TokenType.IDENTIFIER,
      TokenType.LT,
      TokenType.IDENTIFIER,
      TokenType.GT,
      TokenType.IDENTIFIER,
      TokenType.LT_EQ,
      TokenType.IDENTIFIER,
      TokenType.GT_EQ,
      TokenType.IDENTIFIER,
    ]);
  });

  it('always terminates with EOF', () => {
    const { tokens } = tokenize('$a');
    expect(tokens[tokens.length - 1]?.type).toBe(TokenType.EOF);
  });
});

// Finding 2: never advance past a character without a token AND an error
describe('Tokenizer - unclassifiable characters', () => {
  it('reports a single & instead of dropping it', () => {
    const { tokens, errors } = tokenize('$a & $b');
    expect(tokens.map(t => t.type)).toContain(TokenType.ERROR);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('&');
    expect(errors[0]?.offset).toBe(3);
  });

  it('reports a single | instead of dropping it', () => {
    const { errors } = tokenize('$a | $b');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('|');
  });

  it('reports every otherwise unknown character', () => {
    for (const char of [';', '~', '^', '@', '`', '\\', '#', '=']) {
      const { tokens, errors } = tokenize(`$a ${char} $b`);
      expect(
        errors,
        `expected an error for ${JSON.stringify(char)}`
      ).toHaveLength(1);
      const errorTokens = tokens.filter(t => t.type === TokenType.ERROR);
      expect(errorTokens).toHaveLength(1);
      expect(errorTokens[0]?.value).toBe(char);
    }
  });

  it('preserves every character of the source across the token stream', () => {
    const source = '$a & $b ; 12';
    const { tokens } = tokenize(source);
    const covered = tokens
      .filter(t => t.type !== TokenType.EOF)
      .map(t => source.slice(t.start.offset, t.end.offset))
      .join('');
    expect(covered).toBe(source.replace(/\s+/g, ''));
  });

  it('keeps non-ASCII letters inside identifiers', () => {
    expect(values('$user.naïve')).toEqual(['$', 'user', '.', 'naïve']);
    expect(values('$données')).toEqual(['$', 'données']);
    const { errors } = tokenize('$user.naïve');
    expect(errors).toEqual([]);
  });

  it('reports a non-letter non-ASCII character', () => {
    const { errors } = tokenize('$a § $b');
    expect(errors).toHaveLength(1);
  });
});

// Finding 1: the tokenizer must never throw
describe('Tokenizer - never throws', () => {
  it('reports an unterminated string instead of throwing', () => {
    const { tokens, errors } = tokenize('"abc');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/unterminated/i);
    expect(tokens[0]?.type).toBe(TokenType.ERROR);
    expect(tokens[0]?.value).toBe('"abc');
  });

  it('reports an unterminated string that ends with a backslash', () => {
    const { errors } = tokenize('"abc\\');
    expect(errors).toHaveLength(1);
  });
});

// Finding 3b: no arbitrary call cap
describe('Tokenizer - no artificial size limit', () => {
  it('tokenizes sources longer than 1000 characters', () => {
    const source = '1 + '.repeat(300) + '1';
    const { tokens, errors } = tokenize(source);
    expect(errors).toEqual([]);
    expect(tokens.filter(t => t.type === TokenType.NUMBER)).toHaveLength(301);
  });
});

// Finding 4: template keywords are not expression keywords
describe('Tokenizer - keywords', () => {
  it('lexes template grammar words as plain identifiers', () => {
    for (const word of [
      'if',
      'else',
      'for',
      'of',
      'match',
      'when',
      'let',
      'props',
      'component',
      'slot',
    ]) {
      expect(types(word), word).toEqual([TokenType.IDENTIFIER]);
    }
  });

  it('still lexes the expression literals', () => {
    expect(types('true false null')).toEqual([
      TokenType.TRUE,
      TokenType.FALSE,
      TokenType.NULL,
    ]);
  });

  it('treats literals as identifiers after a dot or a dollar', () => {
    expect(types('$data.true')).toEqual([
      TokenType.DOLLAR,
      TokenType.IDENTIFIER,
      TokenType.DOT,
      TokenType.IDENTIFIER,
    ]);
    expect(types('$true')).toEqual([TokenType.DOLLAR, TokenType.IDENTIFIER]);
  });
});

// Finding 7: positions are recorded, never derived by subtraction
describe('Tokenizer - positions', () => {
  it('records the start of a multi-line string, not its end', () => {
    const source = '"a\nb" + 1';
    const { tokens } = tokenize(source);
    const str = tokens[0] as Token;
    expect(str.type).toBe(TokenType.STRING);
    expect(str.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(str.end).toEqual({ line: 2, column: 3, offset: 5 });
  });

  it('never produces a column below 1 or a negative offset', () => {
    const source = '"a\nb"\n  $x.y\n  + 1';
    const { tokens } = tokenize(source);
    for (const token of tokens) {
      expect(token.start.column).toBeGreaterThanOrEqual(1);
      expect(token.start.offset).toBeGreaterThanOrEqual(0);
      expect(token.end.offset).toBeGreaterThanOrEqual(token.start.offset);
    }
  });

  it('slices back to the token text for every token', () => {
    const source = '$a.b == "x\\ny" ? -1 : f(2, [3])';
    const { tokens } = tokenize(source);
    for (const token of tokens) {
      if (token.type === TokenType.EOF) continue;
      expect(source.slice(token.start.offset, token.end.offset)).toBe(
        token.value
      );
    }
  });

  it('reports positions across lines', () => {
    const { tokens } = tokenize('$a\n  + $b');
    const plus = tokens.find(t => t.type === TokenType.PLUS);
    expect(plus?.start).toEqual({ line: 2, column: 3, offset: 5 });
  });
});

// Finding 6: base positions
describe('Tokenizer - base position', () => {
  it('rebases every token onto the enclosing document', () => {
    const { tokens } = tokenize('$a', { line: 3, column: 12, offset: 57 });
    expect(tokens[0]?.start).toEqual({ line: 3, column: 12, offset: 57 });
    expect(tokens[1]?.start).toEqual({ line: 3, column: 13, offset: 58 });
  });

  it('resets the column when a newline is crossed', () => {
    const { tokens } = tokenize('$a\n$b', { line: 3, column: 12, offset: 57 });
    const second = tokens.filter(t => t.type === TokenType.DOLLAR)[1];
    expect(second?.start).toEqual({ line: 4, column: 1, offset: 60 });
  });

  it('rebases error positions too', () => {
    const { errors } = tokenize('~', { line: 2, column: 5, offset: 30 });
    expect(errors[0]).toMatchObject({ line: 2, column: 5, offset: 30 });
  });
});
