import {
  Token,
  TokenType,
  Position,
  Diagnostic,
  SegmentNode,
  GroupNode,
  VoiceNode,
  ReferenceNode,
  CustomCurveDefNode,
  ScoreHeaderNode,
  ScoreNode,
} from './types.js';

export class Parser {
  private tokens: Token[];
  private current = 0;
  private diagnostics: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    // Filter out UNKNOWN tokens (already reported by tokenizer)
    this.tokens = tokens;
  }

  parse(): { ast: ScoreNode; diagnostics: Diagnostic[] } {
    const ast = this.parseScore();
    return { ast, diagnostics: this.diagnostics };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.current] ?? this.eof();
  }

  private peekType(): TokenType {
    return this.peek().type;
  }

  private peekAhead(n: number): Token {
    return this.tokens[this.current + n] ?? this.eof();
  }

  private advance(): Token {
    const tok = this.tokens[this.current];
    if (this.current < this.tokens.length) this.current++;
    return tok;
  }

  private check(type: TokenType): boolean {
    return this.peekType() === type;
  }

  private match(...types: TokenType[]): Token | null {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  private expect(type: TokenType, message?: string): Token | null {
    if (this.check(type)) {
      return this.advance();
    }
    const tok = this.peek();
    this.error(message ?? `Expected ${type} but got ${tok.type} '${tok.value}'`, tok.pos);
    return null;
  }

  private error(message: string, pos: Position): void {
    this.diagnostics.push({ message, severity: 'error', pos });
  }

  private warning(message: string, pos: Position): void {
    this.diagnostics.push({ message, severity: 'warning', pos });
  }

  private eof(): Token {
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { type: TokenType.EOF, value: '', pos: { offset: 0, line: 1, column: 1 } };
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE)) {
      this.advance();
    }
  }

  private isAtEnd(): boolean {
    return this.check(TokenType.EOF);
  }

  // ── Score ───────────────────────────────────────────────────────

  private parseScore(): ScoreNode {
    const pos = this.peek().pos;
    this.skipNewlines();

    // Try to detect if there's a header (look for --- separator)
    let header: ScoreHeaderNode | null = null;
    const hasSeparator = this.hasDashDashDash();

    if (hasSeparator) {
      header = this.parseHeader();
    }

    // Parse voices or standalone sequence
    const voices = this.parseVoices();

    return { kind: 'score', header, voices, pos };
  }

  private hasDashDashDash(): boolean {
    // Scan ahead to find a --- separator
    for (let i = this.current; i < this.tokens.length; i++) {
      if (this.tokens[i].type === TokenType.DASH_DASH_DASH) return true;
    }
    return false;
  }

  // ── Header ──────────────────────────────────────────────────────

  private parseHeader(): ScoreHeaderNode {
    const pos = this.peek().pos;
    const metadata: Record<string, string | number> = {};
    const customCurves: CustomCurveDefNode[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.DASH_DASH_DASH)) {
      this.skipNewlines();
      if (this.check(TokenType.DASH_DASH_DASH)) break;
      if (this.isAtEnd()) break;

      // Custom curve: @name = B(...)
      if (this.check(TokenType.AT)) {
        const curveDef = this.parseCustomCurveDef();
        if (curveDef) customCurves.push(curveDef);
        continue;
      }

      // Metadata line: identifier : value
      // Support hyphenated keys like "shaft-diameter" by composing them
      if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.PRIMITIVE)) {
        const keyTok = this.advance();
        let key = keyTok.value;

        // Compose hyphenated keys: key-part-part (e.g., shaft-diameter)
        while (
          this.check(TokenType.UNKNOWN) &&
          this.peek().value === '-' &&
          (this.peekAhead(1).type === TokenType.IDENTIFIER || this.peekAhead(1).type === TokenType.PRIMITIVE)
        ) {
          this.advance(); // consume '-'
          const nextPart = this.advance(); // consume next word
          key += '-' + nextPart.value;
        }

        if (this.match(TokenType.COLON)) {
          // Read the rest of the line as value
          let valueStr = '';
          while (
            !this.isAtEnd() &&
            !this.check(TokenType.NEWLINE) &&
            !this.check(TokenType.DASH_DASH_DASH)
          ) {
            const t = this.advance();
            valueStr += (valueStr ? ' ' : '') + t.value;
          }
          valueStr = valueStr.trim();
          // Normalise hyphenated value fragments (e.g. "top - right" → "top-right")
          valueStr = valueStr.replace(/ - /g, '-');
          // Try to parse as number
          const numVal = Number(valueStr);
          if (valueStr !== '' && !isNaN(numVal) && isFinite(numVal)) {
            metadata[key] = numVal;
          } else {
            metadata[key] = valueStr;
          }
          // Strip unit suffixes like "mm" for numeric values
          const unitMatch = valueStr.match(/^(\d+(?:\.\d+)?)\s*mm$/i);
          if (unitMatch) {
            metadata[key] = Number(unitMatch[1]);
          }
        } else {
          this.error(`Expected ':' after metadata key '${key}'`, keyTok.pos);
        }
        this.skipNewlines();
        continue;
      }

      // Skip unknown lines
      this.advance();
    }

    // Consume ---
    this.match(TokenType.DASH_DASH_DASH);
    this.skipNewlines();

    return { kind: 'scoreHeader', metadata, customCurves, pos };
  }

  // ── Custom Curve Definition ─────────────────────────────────────

  private parseCustomCurveDef(): CustomCurveDefNode | null {
    const pos = this.peek().pos;
    this.expect(TokenType.AT); // consume @

    const nameTok = this.match(TokenType.IDENTIFIER);
    if (!nameTok) {
      this.error('Expected custom curve name after @', pos);
      this.skipToNewline();
      return null;
    }

    if (!this.match(TokenType.EQUALS)) {
      this.error(`Expected '=' after custom curve name '${nameTok.value}'`, this.peek().pos);
      this.skipToNewline();
      return null;
    }

    // Expect B(x1, y1, x2, y2)
    const bTok = this.match(TokenType.IDENTIFIER);
    if (!bTok || bTok.value !== 'B') {
      this.error("Expected 'B' for Bézier curve definition", this.peek().pos);
      this.skipToNewline();
      return null;
    }

    if (!this.match(TokenType.LPAREN)) {
      this.error("Expected '(' after 'B'", this.peek().pos);
      this.skipToNewline();
      return null;
    }

    const nums: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        if (!this.match(TokenType.COMMA)) {
          this.error(`Expected ',' between control point values`, this.peek().pos);
          break;
        }
      }
      const neg = this.check(TokenType.UNKNOWN) && this.peek().value === '-';
      if (neg) this.advance();
      const numTok = this.match(TokenType.NUMBER);
      if (!numTok) {
        this.error('Expected number in Bézier control points', this.peek().pos);
        break;
      }
      nums.push(neg ? -Number(numTok.value) : Number(numTok.value));
    }

    this.match(TokenType.RPAREN);
    this.skipNewlines();

    if (nums.length < 4) {
      return null;
    }

    return {
      kind: 'customCurveDef',
      name: nameTok.value,
      controlPoints: [nums[0], nums[1], nums[2], nums[3]],
      pos,
    };
  }

  // ── Voices ──────────────────────────────────────────────────────

  private parseVoices(): VoiceNode[] {
    const voices: VoiceNode[] = [];

    this.skipNewlines();

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      // Check if this is a named voice: IDENTIFIER COLON ...
      // Voice names must begin with a lowercase-starting IDENTIFIER token.
      // PRIMITIVE tokens (S, D, L, E, Q, H) are reserved for curve syntax
      // and must never be used as voice names.
      if (
        this.check(TokenType.IDENTIFIER) &&
        this.peekAhead(1).type === TokenType.COLON
      ) {
        const voice = this.parseNamedVoice();
        if (voice) voices.push(voice);
      } else if (this.check(TokenType.LBRACKET) || this.check(TokenType.PRIMITIVE) || this.check(TokenType.AT)) {
        // Standalone sequence (single-voice shorthand)
        const voice = this.parseStandaloneVoice();
        if (voice) voices.push(voice);
      } else {
        // Skip unrecognized token
        const tok = this.advance();
        this.error(`Unexpected token '${tok.value}'`, tok.pos);
      }
    }

    return voices;
  }

  private parseNamedVoice(): VoiceNode | null {
    const pos = this.peek().pos;
    const nameTok = this.advance(); // identifier (lowercase-starting)
    const voiceName = nameTok.value;
    this.advance(); // colon

    // Check for reference: A@0.5
    if (
      this.check(TokenType.IDENTIFIER) &&
      this.peekAhead(1).type === TokenType.AT
    ) {
      const ref = this.parseReference();
      const direction = this.parseDirection();
      this.skipNewlines();
      if (ref) {
        return { kind: 'voice', name: voiceName, body: ref, direction, pos };
      }
      return null;
    }

    // Otherwise parse sequence
    const body = this.parseSequenceOrShorthand();
    const direction = this.parseDirection();
    this.skipNewlines();

    if (body) {
      return { kind: 'voice', name: voiceName, body, direction, pos };
    }
    return null;
  }

  private parseStandaloneVoice(): VoiceNode | null {
    const pos = this.peek().pos;
    const body = this.parseSequenceOrShorthand();
    const direction = this.parseDirection();
    this.skipNewlines();

    if (body) {
      return { kind: 'voice', name: '_default', body, direction, pos };
    }
    return null;
  }

  private parseReference(): ReferenceNode | null {
    const pos = this.peek().pos;
    const targetTok = this.advance(); // identifier
    const targetName = targetTok.value;
    this.advance(); // @
    const numTok = this.match(TokenType.NUMBER);
    if (!numTok) {
      this.error('Expected phase offset number after @', this.peek().pos);
      return null;
    }
    return {
      kind: 'reference',
      targetVoice: targetName,
      phaseOffset: Number(numTok.value),
      pos,
    };
  }

  private parseDirection(): 'CW' | 'CCW' | null {
    if (this.match(TokenType.CW)) return 'CW';
    if (this.match(TokenType.CCW)) return 'CCW';
    return null;
  }

  // ── Sequence / Shorthand ────────────────────────────────────────

  private parseSequenceOrShorthand(): GroupNode | null {
    if (this.check(TokenType.LBRACKET)) {
      return this.parseGroup();
    }

    // Shorthand: S3.D.L0.D  (primitives/custom separated by dots, no brackets)
    if (this.check(TokenType.PRIMITIVE) || this.check(TokenType.AT)) {
      return this.parseShorthand();
    }

    this.error('Expected sequence starting with [ or a primitive', this.peek().pos);
    return null;
  }

  private parseShorthand(): GroupNode {
    const pos = this.peek().pos;
    const segments: (SegmentNode | GroupNode)[] = [];

    // Parse first segment
    const seg = this.parseSegment();
    if (seg) segments.push(seg);

    // Parse subsequent .segment patterns
    while (this.match(TokenType.DOT)) {
      const s = this.parseSegment();
      if (s) segments.push(s);
    }

    return { kind: 'group', segments, repeat: 1, weight: 1, pos };
  }

  // ── Group ───────────────────────────────────────────────────────

  private parseGroup(): GroupNode {
    const pos = this.peek().pos;
    this.expect(TokenType.LBRACKET);

    const segments: (SegmentNode | GroupNode)[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.RBRACKET)) {
      if (this.check(TokenType.NEWLINE)) {
        this.advance();
        continue;
      }

      if (this.check(TokenType.LBRACKET)) {
        // Nested group
        const nested = this.parseGroup();
        segments.push(nested);
      } else if (this.check(TokenType.PRIMITIVE) || this.check(TokenType.AT)) {
        const seg = this.parseSegment();
        if (seg) segments.push(seg);
      } else {
        const tok = this.advance();
        this.error(`Unexpected token '${tok.value}' in segment group`, tok.pos);
      }
    }

    this.expect(TokenType.RBRACKET, "Expected ']' to close group");

    // Check for repeat *N
    let repeat = 1;
    if (this.match(TokenType.STAR)) {
      const numTok = this.match(TokenType.NUMBER);
      if (numTok) {
        repeat = Math.max(1, Math.floor(Number(numTok.value)));
      } else {
        this.error('Expected number after *', this.peek().pos);
      }
    }

    // Check for weight @N on the group
    let weight = 1;
    if (this.check(TokenType.AT) && this.peekAhead(1).type === TokenType.NUMBER) {
      this.advance(); // @
      const wTok = this.advance(); // number
      weight = Number(wTok.value);
    }

    return { kind: 'group', segments, repeat, weight, pos };
  }

  // ── Segment ─────────────────────────────────────────────────────

  private parseSegment(): SegmentNode | null {
    // Custom curve reference: @name:amplitude[@weight]
    if (this.check(TokenType.AT)) {
      return this.parseCustomRef();
    }

    // Primitive: S3, D, L0@2, etc.
    if (this.check(TokenType.PRIMITIVE)) {
      return this.parsePrimitive();
    }

    const tok = this.peek();
    this.error(`Expected segment (primitive or custom curve), got '${tok.value}'`, tok.pos);
    this.advance();
    return null;
  }

  private parsePrimitive(): SegmentNode {
    const pos = this.peek().pos;
    const primTok = this.advance();
    const curveType = primTok.value.toUpperCase();

    // Optional amplitude
    let amplitude: number | null = null;
    if (this.check(TokenType.NUMBER)) {
      amplitude = Number(this.advance().value);
    }

    // Optional weight @N
    let weight = 1;
    if (this.check(TokenType.AT) && this.peekAhead(1).type === TokenType.NUMBER) {
      this.advance(); // @
      weight = Number(this.advance().value);
    }

    return {
      kind: 'segment',
      type: 'primitive',
      curveType,
      amplitude,
      weight,
      pos,
    };
  }

  private parseCustomRef(): SegmentNode | null {
    const pos = this.peek().pos;
    this.advance(); // @

    const nameTok = this.match(TokenType.IDENTIFIER);
    if (!nameTok) {
      this.error('Expected custom curve name after @', pos);
      return null;
    }

    // Expect : amplitude
    let amplitude: number | null = null;
    if (this.match(TokenType.COLON)) {
      const numTok = this.match(TokenType.NUMBER);
      if (numTok) {
        amplitude = Number(numTok.value);
      } else {
        this.error('Expected amplitude after :', this.peek().pos);
      }
    }

    // Optional weight @N
    let weight = 1;
    if (this.check(TokenType.AT) && this.peekAhead(1).type === TokenType.NUMBER) {
      this.advance(); // @
      weight = Number(this.advance().value);
    }

    return {
      kind: 'segment',
      type: 'custom',
      curveType: nameTok.value,
      amplitude,
      weight,
      pos,
    };
  }

  // ── Utilities ───────────────────────────────────────────────────

  private skipToNewline(): void {
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE)) {
      this.advance();
    }
    this.match(TokenType.NEWLINE);
  }
}

export function parseTokens(tokens: Token[]): { ast: ScoreNode; diagnostics: Diagnostic[] } {
  const parser = new Parser(tokens);
  return parser.parse();
}
