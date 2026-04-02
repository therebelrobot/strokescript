// ── Position & Diagnostics ──────────────────────────────────────────

export interface Position {
  offset: number;
  line: number;
  column: number;
}

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning';
  pos: Position;
  endPos?: Position;
}

// ── Tokens ──────────────────────────────────────────────────────────

export enum TokenType {
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  PRIMITIVE = 'PRIMITIVE',
  NUMBER = 'NUMBER',
  AT = 'AT',
  STAR = 'STAR',
  DOT = 'DOT',
  COLON = 'COLON',
  DASH_DASH_DASH = 'DASH_DASH_DASH',
  IDENTIFIER = 'IDENTIFIER',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  EQUALS = 'EQUALS',
  CW = 'CW',
  CCW = 'CCW',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: Position;
}

// ── AST Nodes ───────────────────────────────────────────────────────

export interface SegmentNode {
  kind: 'segment';
  type: 'primitive' | 'custom';
  curveType: string;
  amplitude: number | null; // null means "inherit from previous" (D without value)
  weight: number;
  pos: Position;
}

export interface GroupNode {
  kind: 'group';
  segments: (SegmentNode | GroupNode)[];
  repeat: number;
  weight: number;
  pos: Position;
}

export interface ReferenceNode {
  kind: 'reference';
  targetVoice: string;
  phaseOffset: number;
  pos: Position;
}

export interface VoiceNode {
  kind: 'voice';
  name: string;
  body: GroupNode | ReferenceNode;
  direction: 'CW' | 'CCW' | null;
  pos: Position;
}

export interface CustomCurveDefNode {
  kind: 'customCurveDef';
  name: string;
  controlPoints: [number, number, number, number];
  pos: Position;
}

export interface ScoreHeaderNode {
  kind: 'scoreHeader';
  metadata: Record<string, string | number>;
  customCurves: CustomCurveDefNode[];
  pos: Position;
}

export interface ScoreNode {
  kind: 'score';
  header: ScoreHeaderNode | null;
  voices: VoiceNode[];
  pos: Position;
}

// ── IR (Compiled, flat) ─────────────────────────────────────────────

export type ShaftShape = 'circle' | 'tri' | 'square' | 'pent' | 'hex' | 'hept' | 'oct';

export interface Segment {
  curveType: string;
  amplitude: number;
  startAngle: number;
  endAngle: number;
  arcDegrees: number;
  controlPoints: [number, number, number, number] | null;
}

export interface Voice {
  name: string;
  segments: Segment[];
  direction: 'CW' | 'CCW';
  totalArc: 360;
}

export interface Score {
  metadata: Record<string, string | number>;
  voices: Voice[];
  shaft: ShaftShape;
  shaftDiameter: number;
}

// ── Result ──────────────────────────────────────────────────────────

export interface ParseResult {
  score: Score | null;
  diagnostics: Diagnostic[];
}
