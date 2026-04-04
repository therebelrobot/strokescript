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

  it('handles case-insensitive primitives — uppercase only', () => {
    // Only UPPERCASE primitive letters (S D L E Q H) produce PRIMITIVE tokens.
    // Lowercase versions are now treated as IDENTIFIER tokens so that names like
    // s1, d2, lfo etc. can be used as voice names without ambiguity.
    const { tokens, diagnostics } = tokenize('s3 d l0');
    expect(diagnostics).toHaveLength(0);

    // No PRIMITIVE tokens — all three are lowercase identifiers
    const primitives = tokens.filter((t) => t.type === TokenType.PRIMITIVE);
    expect(primitives).toHaveLength(0);

    // Each word tokenises as a single IDENTIFIER
    const identifiers = tokens.filter((t) => t.type === TokenType.IDENTIFIER);
    expect(identifiers.map((t) => t.value)).toEqual(['s3', 'd', 'l0']);
  });

  it('skips inline comments after a value', () => {
    const { tokens, diagnostics } = tokenize('S3 # this is a comment\nD');
    expect(diagnostics).toHaveLength(0);

    const types = tokens
      .filter((t) => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
      .map((t) => t.type);
    expect(types).toEqual([TokenType.PRIMITIVE, TokenType.NUMBER, TokenType.PRIMITIVE]);
  });

  it('skips full-line # comment producing no content tokens', () => {
    const { tokens, diagnostics } = tokenize('# this is a full-line comment\nS3');
    expect(diagnostics).toHaveLength(0);

    const types = tokens
      .filter((t) => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
      .map((t) => t.type);
    expect(types).toEqual([TokenType.PRIMITIVE, TokenType.NUMBER]);
  });

  it('skips multiple consecutive comment lines', () => {
    const { tokens, diagnostics } = tokenize(
      '# first comment\n# second comment\n# third comment\nS3 D'
    );
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

  describe('shaft-origin tokenization', () => {
    it('tokenizes shaft-origin header key as IDENTIFIER UNKNOWN IDENTIFIER', () => {
      const { tokens, diagnostics } = tokenize('shaft-origin');
      const errors = diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);

      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(3);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('shaft');
      expect(nonEof[1].type).toBe(TokenType.UNKNOWN);
      expect(nonEof[1].value).toBe('-');
      expect(nonEof[2].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[2].value).toBe('origin');
    });

    it('tokenizes hyphenated value top-right without error diagnostics', () => {
      const { tokens, diagnostics } = tokenize('top-right');
      const errors = diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);

      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(3);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('top');
      expect(nonEof[1].type).toBe(TokenType.UNKNOWN);
      expect(nonEof[1].value).toBe('-');
      expect(nonEof[2].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[2].value).toBe('right');
    });

    it('tokenizes clock-position value 12 as NUMBER', () => {
      const { tokens, diagnostics } = tokenize('12');
      expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('12');
    });

    it('tokenizes decimal clock-position value 1.5 as NUMBER', () => {
      const { tokens, diagnostics } = tokenize('1.5');
      expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('1.5');
    });
  });

  describe('multi-character and alphanumeric identifiers', () => {
    it('tokenizes a multi-letter non-primitive name "cam" as IDENTIFIER', () => {
      const { tokens, diagnostics } = tokenize('cam');
      expect(diagnostics).toHaveLength(0);
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('cam');
    });

    it('tokenizes "cam1" as a single IDENTIFIER token (non-primitive start + digit)', () => {
      const { tokens, diagnostics } = tokenize('cam1');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(1);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('cam1');
    });

    it('tokenizes "voice_2" as a single IDENTIFIER token (underscore included in alpha)', () => {
      const { tokens, diagnostics } = tokenize('voice_2');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(1);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('voice_2');
    });

    it('tokenizes "A1" as a single IDENTIFIER token (non-primitive letter + digit)', () => {
      // "A" is not in the PRIMITIVES set (S D L E Q H), so it reads the full word
      const { tokens, diagnostics } = tokenize('A1');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(1);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('A1');
    });

    it('tokenizes "S4" as PRIMITIVE + NUMBER (two separate tokens — not a valid voice name)', () => {
      // Tokenizer deliberately keeps S4 as two separate tokens so [S4 D] sequences parse
      // correctly as a primitive with amplitude. Because S1, S4, D2, etc. tokenise as
      // PRIMITIVE + NUMBER (not as a single IDENTIFIER), the parser does NOT accept them
      // as voice names. Only IDENTIFIER tokens (lowercase-starting) are valid voice names.
      const { tokens, diagnostics } = tokenize('S4');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(2);
      expect(nonEof[0].type).toBe(TokenType.PRIMITIVE);
      expect(nonEof[0].value).toBe('S');
      expect(nonEof[1].type).toBe(TokenType.NUMBER);
      expect(nonEof[1].value).toBe('4');
    });

    it('tokenizes "s1" as a single IDENTIFIER token (lowercase primitive letter + digit)', () => {
      // "s" is lowercase — even though uppercase "S" is a primitive, lowercase must
      // produce an IDENTIFIER so that voice names like s1 are valid.
      const { tokens, diagnostics } = tokenize('s1');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(1);
      expect(nonEof[0].type).toBe(TokenType.IDENTIFIER);
      expect(nonEof[0].value).toBe('s1');
    });

    it('tokenizes "S8" as PRIMITIVE + NUMBER (uppercase S is a primitive — unchanged)', () => {
      // Inside sequences like [S8 D S0 D], S is UPPERCASE → PRIMITIVE; 8 → NUMBER.
      // This behaviour must NOT be disturbed by the s1 fix.
      const { tokens, diagnostics } = tokenize('S8');
      expect(diagnostics).toHaveLength(0);
      const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
      expect(nonEof).toHaveLength(2);
      expect(nonEof[0].type).toBe(TokenType.PRIMITIVE);
      expect(nonEof[0].value).toBe('S');
      expect(nonEof[1].type).toBe(TokenType.NUMBER);
      expect(nonEof[1].value).toBe('8');
    });

    it('tokenizes "voice: [S3 D]" giving IDENTIFIER COLON LBRACKET ...', () => {
      const { tokens, diagnostics } = tokenize('voice: [S3 D]');
      expect(diagnostics).toHaveLength(0);
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('voice');
      expect(tokens[1].type).toBe(TokenType.COLON);
    });
  });
});
