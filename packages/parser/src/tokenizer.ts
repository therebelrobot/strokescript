import { Token, TokenType, Position, Diagnostic } from './types.js';

const PRIMITIVES = new Set(['S', 'D', 'L', 'E', 'Q', 'H']);

function isAlpha(ch: string): boolean {
  return /^[A-Za-z_]$/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isAlphaNum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

export function tokenize(input: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  function pos(): Position {
    return { offset, line, column };
  }

  function peek(): string {
    return offset < input.length ? input[offset] : '';
  }

  function peekAt(delta: number): string {
    const idx = offset + delta;
    return idx < input.length ? input[idx] : '';
  }

  function advance(): string {
    const ch = input[offset];
    offset++;
    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  function readWhile(pred: (ch: string) => boolean): string {
    let result = '';
    while (offset < input.length && pred(input[offset])) {
      result += advance();
    }
    return result;
  }

  function readNumber(): string {
    let num = readWhile(isDigit);
    if (peek() === '.' && isDigit(peekAt(1))) {
      num += advance(); // consume '.'
      num += readWhile(isDigit);
    }
    return num;
  }

  function readIdentifier(): string {
    return readWhile(isAlphaNum);
  }

  while (offset < input.length) {
    const ch = peek();

    // Skip spaces and tabs (not newlines)
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance();
      continue;
    }

    // Comments: # to end of line
    if (ch === '#') {
      readWhile((c) => c !== '\n');
      continue;
    }

    // Newline
    if (ch === '\n') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.NEWLINE, value: '\n', pos: p });
      continue;
    }

    // --- separator
    if (ch === '-' && peekAt(1) === '-' && peekAt(2) === '-') {
      const p = pos();
      advance();
      advance();
      advance();
      tokens.push({ type: TokenType.DASH_DASH_DASH, value: '---', pos: p });
      continue;
    }

    // Single-character tokens
    if (ch === '[') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.LBRACKET, value: '[', pos: p });
      continue;
    }
    if (ch === ']') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.RBRACKET, value: ']', pos: p });
      continue;
    }
    if (ch === '(') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.LPAREN, value: '(', pos: p });
      continue;
    }
    if (ch === ')') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.RPAREN, value: ')', pos: p });
      continue;
    }
    if (ch === '@') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.AT, value: '@', pos: p });
      continue;
    }
    if (ch === '*') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.STAR, value: '*', pos: p });
      continue;
    }
    if (ch === ':') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.COLON, value: ':', pos: p });
      continue;
    }
    if (ch === ',') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.COMMA, value: ',', pos: p });
      continue;
    }
    if (ch === '=') {
      const p = pos();
      advance();
      tokens.push({ type: TokenType.EQUALS, value: '=', pos: p });
      continue;
    }

    // Dot: check if it's a decimal number start (e.g. .5) or just DOT
    if (ch === '.') {
      if (isDigit(peekAt(1))) {
        // It's a number like .5
        const p = pos();
        advance(); // consume '.'
        const frac = readWhile(isDigit);
        tokens.push({ type: TokenType.NUMBER, value: '.' + frac, pos: p });
      } else {
        const p = pos();
        advance();
        tokens.push({ type: TokenType.DOT, value: '.', pos: p });
      }
      continue;
    }

    // Numbers
    if (isDigit(ch)) {
      const p = pos();
      const num = readNumber();
      tokens.push({ type: TokenType.NUMBER, value: num, pos: p });
      continue;
    }

    // Letters: identifiers, primitives, CW/CCW
    if (isAlpha(ch)) {
      const p = pos();
      const upper = ch.toUpperCase();

      // If this is a primitive letter (S, D, L, E, Q, H) and the next char
      // is NOT a letter, emit it as a single PRIMITIVE token.
      // This ensures "S3" tokenizes as PRIMITIVE "S" + NUMBER "3",
      // while "scale" tokenizes as IDENTIFIER "scale".
      if (PRIMITIVES.has(upper) && !isAlpha(peekAt(1))) {
        advance();
        tokens.push({ type: TokenType.PRIMITIVE, value: upper, pos: p });
        continue;
      }

      // Read full identifier (multi-char word)
      const word = readIdentifier();
      const wordUpper = word.toUpperCase();

      if (wordUpper === 'CCW') {
        tokens.push({ type: TokenType.CCW, value: 'CCW', pos: p });
      } else if (wordUpper === 'CW') {
        tokens.push({ type: TokenType.CW, value: 'CW', pos: p });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: word, pos: p });
      }
      continue;
    }

    // Unknown character
    const p = pos();
    const unknown = advance();
    diagnostics.push({
      message: `Unexpected character: '${unknown}'`,
      severity: 'error',
      pos: p,
    });
    tokens.push({ type: TokenType.UNKNOWN, value: unknown, pos: p });
  }

  tokens.push({ type: TokenType.EOF, value: '', pos: pos() });
  return { tokens, diagnostics };
}
