import {
  ScoreNode,
  ScoreHeaderNode,
  GroupNode,
  SegmentNode,
  ReferenceNode,
  VoiceNode,
  CustomCurveDefNode,
  Diagnostic,
  Score,
  Voice,
  Segment,
  ShaftShape,
} from './types.js';

const VALID_SHAFT_SHAPES: readonly ShaftShape[] = [
  'circle', 'tri', 'square', 'pent', 'hex', 'hept', 'oct',
];

interface FlatSegment {
  curveType: string;
  type: 'primitive' | 'custom';
  amplitude: number;
  weight: number;
  controlPoints: [number, number, number, number] | null;
}

export function compile(ast: ScoreNode): { score: Score; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];

  // Collect custom curve definitions from header
  const customCurves = new Map<string, [number, number, number, number]>();
  const metadata: Record<string, string | number> = {};

  if (ast.header) {
    Object.assign(metadata, ast.header.metadata);
    for (const curve of ast.header.customCurves) {
      customCurves.set(curve.name, curve.controlPoints);
    }
  }

  // Extract shaft configuration from metadata
  let shaft: ShaftShape = 'circle';
  let shaftDiameter = 6;

  if (metadata['shaft'] !== undefined) {
    const shaftVal = String(metadata['shaft']);
    if (VALID_SHAFT_SHAPES.includes(shaftVal as ShaftShape)) {
      shaft = shaftVal as ShaftShape;
    } else {
      diagnostics.push({
        message: `Invalid shaft shape '${shaftVal}'. Must be one of: ${VALID_SHAFT_SHAPES.join(', ')}`,
        severity: 'error',
        pos: ast.header?.pos ?? { offset: 0, line: 1, column: 1 },
      });
    }
  }

  if (metadata['shaft-diameter'] !== undefined) {
    const dVal = Number(metadata['shaft-diameter']);
    if (isNaN(dVal)) {
      diagnostics.push({
        message: `Invalid shaft-diameter '${metadata['shaft-diameter']}'. Must be a number.`,
        severity: 'error',
        pos: ast.header?.pos ?? { offset: 0, line: 1, column: 1 },
      });
    } else {
      shaftDiameter = dVal;
    }
  }

  // Also check for inline custom curve definitions from voices that
  // might have custom curves defined at the top level without header
  // (handled in the header parsing already)

  // First pass: compile non-reference voices
  const compiledVoices = new Map<string, Voice>();
  const referenceVoices: VoiceNode[] = [];

  for (const voice of ast.voices) {
    if (voice.body.kind === 'reference') {
      referenceVoices.push(voice);
    } else {
      const compiled = compileVoice(voice, customCurves, diagnostics);
      if (compiled) {
        compiledVoices.set(voice.name, compiled);
      }
    }
  }

  // Second pass: resolve references
  for (const voice of referenceVoices) {
    const ref = voice.body as ReferenceNode;
    const target = compiledVoices.get(ref.targetVoice);
    if (!target) {
      diagnostics.push({
        message: `Voice reference '${ref.targetVoice}' not found`,
        severity: 'error',
        pos: ref.pos,
      });
      continue;
    }

    // Copy segments with phase offset.
    // Strategy: shift all angles by the offset, then normalise back to
    // the [0, 360] range.  If a shifted segment straddles the 360°
    // boundary it must be split into two so every segment sits cleanly
    // inside [0, 360].  Finally, sort by startAngle.
    const phaseOffsetDegrees = ref.phaseOffset * 360;
    const newSegments: Segment[] = [];

    for (const seg of target.segments) {
      const rawStart = seg.startAngle + phaseOffsetDegrees;
      const rawEnd = seg.endAngle + phaseOffsetDegrees;

      if (rawEnd <= 360) {
        // Segment stays entirely within [0, 360]
        newSegments.push({ ...seg, startAngle: rawStart, endAngle: rawEnd });
      } else if (rawStart >= 360) {
        // Segment is entirely beyond 360° – subtract 360 from both
        newSegments.push({
          ...seg,
          startAngle: rawStart - 360,
          endAngle: rawEnd - 360,
        });
      } else {
        // Segment crosses the 360° boundary – split it into two parts.
        // We must also proportionally adjust arcDegrees and, for
        // transition segments, compute the intermediate amplitude.
        const firstArc = 360 - rawStart;
        const secondArc = rawEnd - 360;
        const totalArc = seg.arcDegrees;
        const splitFraction = firstArc / totalArc;

        // Compute intermediate amplitude at the split point.
        // For D (dwell) the amplitude is constant.  For transition
        // curves we linearly approximate the amplitude at the boundary
        // because we don't have access to the full interpolation
        // function here (and the error is negligible for typical use).
        const prevSeg = target.segments[target.segments.indexOf(seg) - 1];
        const prevAmp = prevSeg !== undefined
          ? prevSeg.amplitude
          : target.segments[target.segments.length - 1].amplitude;
        const midAmp = prevAmp + (seg.amplitude - prevAmp) * splitFraction;

        newSegments.push({
          ...seg,
          startAngle: rawStart,
          endAngle: 360,
          arcDegrees: firstArc,
          amplitude: midAmp,
        });
        newSegments.push({
          ...seg,
          startAngle: 0,
          endAngle: secondArc,
          arcDegrees: secondArc,
          // amplitude stays as the original target
        });
      }
    }

    // Sort so segments run in ascending angular order
    newSegments.sort((a, b) => a.startAngle - b.startAngle);

    const compiled: Voice = {
      name: voice.name,
      segments: newSegments,
      direction: voice.direction ?? target.direction,
      totalArc: 360 as const,
    };
    compiledVoices.set(voice.name, compiled);
  }

  // Collect voices in order
  const voices: Voice[] = [];
  for (const voice of ast.voices) {
    const compiled = compiledVoices.get(voice.name);
    if (compiled) voices.push(compiled);
  }

  return {
    score: { metadata, voices, shaft, shaftDiameter },
    diagnostics,
  };
}

function compileVoice(
  voice: VoiceNode,
  customCurves: Map<string, [number, number, number, number]>,
  diagnostics: Diagnostic[]
): Voice | null {
  const body = voice.body as GroupNode;

  // Flatten and expand
  const flat = flattenGroup(body, customCurves, diagnostics);

  if (flat.length === 0) {
    diagnostics.push({
      message: `Voice '${voice.name}' has no segments`,
      severity: 'error',
      pos: voice.pos,
    });
    return null;
  }

  // Resolve D amplitudes (D without explicit amplitude inherits from previous)
  resolveAmplitudes(flat);

  // Assign arc angles based on weights
  const totalWeight = flat.reduce((sum, s) => sum + s.weight, 0);
  let angle = 0;
  const segments: Segment[] = flat.map((seg) => {
    const arcDegrees = (seg.weight / totalWeight) * 360;
    const startAngle = angle;
    angle += arcDegrees;
    const endAngle = angle;
    return {
      curveType: seg.curveType,
      amplitude: seg.amplitude,
      startAngle,
      endAngle,
      arcDegrees,
      controlPoints: seg.controlPoints,
    };
  });

  return {
    name: voice.name,
    segments,
    direction: voice.direction ?? 'CW',
    totalArc: 360 as const,
  };
}

function flattenGroup(
  group: GroupNode,
  customCurves: Map<string, [number, number, number, number]>,
  diagnostics: Diagnostic[]
): FlatSegment[] {
  const result: FlatSegment[] = [];

  // Process segments in the group
  const inner: FlatSegment[] = [];
  for (const child of group.segments) {
    if (child.kind === 'segment') {
      const seg = compileSegment(child, customCurves, diagnostics);
      if (seg) inner.push(seg);
    } else if (child.kind === 'group') {
      // Nested group: flatten it but its total weight is the group's weight
      const nested = flattenGroup(child, customCurves, diagnostics);
      // Nested group occupies the space of one segment (its weight),
      // so we need to scale the inner weights proportionally
      const nestedTotalWeight = nested.reduce((sum, s) => sum + s.weight, 0);
      const groupWeight = child.weight;
      for (const s of nested) {
        inner.push({
          ...s,
          weight: (s.weight / nestedTotalWeight) * groupWeight,
        });
      }
    }
  }

  // Apply repeat
  for (let i = 0; i < group.repeat; i++) {
    result.push(...inner.map((s) => ({ ...s })));
  }

  return result;
}

function compileSegment(
  node: SegmentNode,
  customCurves: Map<string, [number, number, number, number]>,
  diagnostics: Diagnostic[]
): FlatSegment | null {
  let controlPoints: [number, number, number, number] | null = null;

  if (node.type === 'custom') {
    const cp = customCurves.get(node.curveType);
    if (!cp) {
      diagnostics.push({
        message: `Custom curve '${node.curveType}' is not defined`,
        severity: 'error',
        pos: node.pos,
      });
    } else {
      controlPoints = cp;
    }
  }

  return {
    curveType: node.curveType,
    type: node.type,
    amplitude: node.amplitude ?? -1, // -1 sentinel for "inherit"
    weight: node.weight,
    controlPoints,
  };
}

function resolveAmplitudes(segments: FlatSegment[]): void {
  // D without explicit amplitude inherits from the previous segment's amplitude.
  // First segment defaults to 0 if no amplitude specified.
  let prevAmplitude = 0;

  for (const seg of segments) {
    if (seg.amplitude < 0) {
      // Inherit from previous
      seg.amplitude = prevAmplitude;
    }
    prevAmplitude = seg.amplitude;
  }
}
