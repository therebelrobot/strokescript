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

export type ShaftShape = 'circle' | 'tri' | 'square' | 'pent' | 'hex' | 'hept' | 'oct' | 'cross';

// ── Shaft Origin Values ─────────────────────────────────────────────

export const SHAFT_ORIGIN_VALUES: Readonly<Record<ShaftShape, readonly string[]>> = {
  circle: [],
  square: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
  tri: ['12', '4', '8'],
  pent: ['12', '2.4', '4.8', '7.2', '9.6'],
  hex: ['12', '2', '4', '6', '8', '10'],
  hept: ['12', '1.7', '3.4', '5.1', '6.9', '8.6', '10.3'],
  oct: ['12', '1.5', '3', '4.5', '6', '7.5', '9', '10.5'],
  cross: [],
} as const;

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
  shaftOrigin?: string;
  /** Width of each arm of the cross, in mm. Only meaningful when shaft === 'cross'. Defaults to 2. */
  crossLegWidth?: number;
  scale?: 'shared' | 'independent';
}

// ── Result ──────────────────────────────────────────────────────────

export interface ParseResult {
  score: Score | null;
  diagnostics: Diagnostic[];
}
