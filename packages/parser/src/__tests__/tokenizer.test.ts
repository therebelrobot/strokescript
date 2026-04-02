import { describe, it, expect } from 'vitest';
import { tokenize } from '../tokenizer.js';
import { TokenType } from '../types.js';

describe('tokenizer', () => {
  it('tokenizes a basic sequence: [S3 D S0 D]', () => {
    const { tokens, diagnostics } = tokenize('[S3 D S0 D]');
    expect(diagnostics).toHaveLength(0);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.LBRACKET,
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 3
      TokenType.PRIMITIVE, // D
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 0
      TokenType.PRIMITIVE, // D
      TokenType.RBRACKET,
      TokenType.EOF,
    ]);

    // Check primitive values are uppercased
    const primitives = tokens.filter((t) => t.type === TokenType.PRIMITIVE);
    expect(primitives.map((t) => t.value)).toEqual(['S', 'D', 'S', 'D']);
  });

  it('tokenizes weighted segments: S3@2', () => {
    const { tokens, diagnostics } = tokenize('S3@2');
    expect(diagnostics).toHaveLength(0);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 3
      TokenType.AT, // @
      TokenType.NUMBER, // 2
      TokenType.EOF,
    ]);
  });

  it('tokenizes nested groups: [S3 [L1 D1] S0]', () => {
    const { tokens, diagnostics } = tokenize('[S3 [L1 D1] S0]');
    expect(diagnostics).toHaveLength(0);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.LBRACKET,
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 3
      TokenType.LBRACKET,
      TokenType.PRIMITIVE, // L
      TokenType.NUMBER, // 1
      TokenType.PRIMITIVE, // D
      TokenType.NUMBER, // 1
      TokenType.RBRACKET,
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 0
      TokenType.RBRACKET,
      TokenType.EOF,
    ]);
  });

  it('tokenizes repeat: [S3 D]*4', () => {
    const { tokens, diagnostics } = tokenize('[S3 D]*4');
    expect(diagnostics).toHaveLength(0);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.LBRACKET,
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 3
      TokenType.PRIMITIVE, // D
      TokenType.RBRACKET,
      TokenType.STAR,
      TokenType.NUMBER, // 4
      TokenType.EOF,
    ]);
  });

  it('tokenizes shorthand notation: S3.D.L0.D', () => {
    const { tokens, diagnostics } = tokenize('S3.D.L0.D');
    expect(diagnostics).toHaveLength(0);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.PRIMITIVE, // S
      TokenType.NUMBER, // 3
      TokenType.DOT,
      TokenType.PRIMITIVE, // D
      TokenType.DOT,
      TokenType.PRIMITIVE, // L
      TokenType.NUMBER, // 0
      TokenType.DOT,
      TokenType.PRIMITIVE, // D
      TokenType.EOF,
    ]);
  });

  it('handles case-insensitive primitives', () => {
    const { tokens, diagnostics } = tokenize('s3 d l0');
    expect(diagnostics).toHaveLength(0);

    const primitives = tokens.filter((t) => t.type === TokenType.PRIMITIVE);
    expect(primitives.map((t) => t.value)).toEqual(['S', 'D', 'L']);
  });

  it('skips comments', () => {
    const { tokens, diagnostics } = tokenize('S3 # this is a comment\nD');
    expect(diagnostics).toHaveLength(0);

    const types = tokens
      .filter((t) => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
      .map((t) => t.type);
    expect(types).toEqual([TokenType.PRIMITIVE, TokenType.NUMBER, TokenType.PRIMITIVE]);
  });

  it('tokenizes --- separator', () => {
    const { tokens, diagnostics } = tokenize('---');
    expect(diagnostics).toHaveLength(0);
    expect(tokens[0].type).toBe(TokenType.DASH_DASH_DASH);
  });

  it('tokenizes CW and CCW', () => {
    const { tokens } = tokenize('[S3 D] CW');
    expect(tokens.find((t) => t.type === TokenType.CW)).toBeTruthy();

    const { tokens: tokens2 } = tokenize('[S3 D] CCW');
    expect(tokens2.find((t) => t.type === TokenType.CCW)).toBeTruthy();
  });

  it('tokenizes decimal numbers', () => {
    const { tokens } = tokenize('1.5');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe('1.5');
  });

  it('tracks positions correctly', () => {
    const { tokens } = tokenize('[S3]');
    expect(tokens[0].pos).toEqual({ offset: 0, line: 1, column: 1 });
    expect(tokens[1].pos).toEqual({ offset: 1, line: 1, column: 2 }); // S
    expect(tokens[2].pos).toEqual({ offset: 2, line: 1, column: 3 }); // 3
    expect(tokens[3].pos).toEqual({ offset: 3, line: 1, column: 4 }); // ]
  });
});
