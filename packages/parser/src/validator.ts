import { Score, Voice, Segment, Diagnostic, Position, ShaftShape, SHAFT_ORIGIN_VALUES } from './types.js';

const VALID_SHAFT_SHAPES: readonly ShaftShape[] = [
  'circle', 'tri', 'square', 'pent', 'hex', 'hept', 'oct', 'cross',
];

const dummyPos: Position = { offset: 0, line: 1, column: 1 };

/**
 * Compute what amplitude a curve type produces at its start and end.
 *
 * - S (sine): interpolates from previous amplitude to target → start = prev, end = target
 * - D (dwell): holds at constant amplitude → start = target, end = target
 * - L (linear): linearly from previous to target → start = prev, end = target
 * - E (ease): like sine with easing → start = prev, end = target
 * - Q (quick/snap): rapid transition → start = prev, end = target
 * - H (hold-step): instant jump → discontinuous by design
 * - Custom curves: treated like S (interpolating)
 */
function getSegmentEndpoints(
  seg: Segment,
  prevAmplitude: number
): { start: number; end: number } {
  const target = seg.amplitude;
  switch (seg.curveType) {
    case 'D':
      return { start: target, end: target };
    case 'H':
      // Discontinuous — start is prev, end is target (jump)
      return { start: prevAmplitude, end: target };
    case 'S':
    case 'L':
    case 'E':
    case 'Q':
    default:
      // All interpolating types: start from prev, end at target
      return { start: prevAmplitude, end: target };
  }
}

export function validate(score: Score): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Validate shaft configuration
  if (!VALID_SHAFT_SHAPES.includes(score.shaft)) {
    diagnostics.push({
      message: `Invalid shaft shape '${score.shaft}'. Must be one of: ${VALID_SHAFT_SHAPES.join(', ')}`,
      severity: 'error',
      pos: dummyPos,
    });
  }

  if (score.shaftDiameter <= 0) {
    diagnostics.push({
      message: `shaft-diameter must be > 0, got ${score.shaftDiameter}`,
      severity: 'error',
      pos: dummyPos,
    });
  }

  // Validate scale
  const rawScale = score.metadata['scale'];
  if (rawScale !== undefined) {
    const scaleStr = String(rawScale);
    if (scaleStr !== 'shared' && scaleStr !== 'independent') {
      diagnostics.push({
        message: `Invalid scale '${scaleStr}'. Must be 'shared' or 'independent'.`,
        severity: 'error',
        pos: dummyPos,
      });
    }
  }

  // Check shaft-diameter < 2 × base (if base is specified in metadata)
  const baseVal = score.metadata['base'];
  if (baseVal !== undefined) {
    const base = typeof baseVal === 'number' ? baseVal : parseFloat(String(baseVal));
    if (!isNaN(base) && base > 0 && score.shaftDiameter >= 2 * base) {
      diagnostics.push({
        message: `shaft-diameter (${score.shaftDiameter}) must be less than 2 × base (${2 * base})`,
        severity: 'error',
        pos: dummyPos,
      });
    }
  }

  // Validate shaft-origin
  const rawOrigin = score.metadata['shaft-origin'];
  if (rawOrigin !== undefined) {
    if (score.shaft === 'circle' || score.shaft === 'cross') {
      diagnostics.push({
        message: `shaft-origin has no effect when shaft is '${score.shaft}'`,
        severity: 'warning',
        pos: dummyPos,
      });
    } else {
      const validValues = SHAFT_ORIGIN_VALUES[score.shaft];
      const originVal = score.shaftOrigin ?? String(rawOrigin);
      if (validValues && !validValues.includes(originVal)) {
        diagnostics.push({
          message: `shaft-origin '${originVal}' is not valid for shaft shape '${score.shaft}'`,
          severity: 'error',
          pos: dummyPos,
        });
      }
    }
  }

  // Validate cross-leg-width when shaft is cross
  if (score.shaft === 'cross') {
    const clw = score.crossLegWidth ?? 2;
    if (clw <= 0) {
      diagnostics.push({
        message: `cross-leg-width must be > 0, got ${clw}`,
        severity: 'error',
        pos: dummyPos,
      });
    } else if (clw >= score.shaftDiameter) {
      diagnostics.push({
        message: `cross-leg-width (${clw}) must be less than shaft-diameter (${score.shaftDiameter})`,
        severity: 'error',
        pos: dummyPos,
      });
    }
  }

  for (const voice of score.voices) {
    validateVoice(voice, diagnostics);
  }

  return diagnostics;
}

function validateVoice(voice: Voice, diagnostics: Diagnostic[]): void {
  const segs = voice.segments;
  if (segs.length === 0) return;

  // Check non-negative amplitudes
  for (const seg of segs) {
    if (seg.amplitude < 0) {
      diagnostics.push({
        message: `Voice '${voice.name}': segment ${seg.curveType} has negative amplitude ${seg.amplitude}`,
        severity: 'error',
        pos: dummyPos,
      });
    }
  }

  // Check positive non-zero arc (proxy for weight check)
  for (const seg of segs) {
    if (seg.arcDegrees <= 0) {
      diagnostics.push({
        message: `Voice '${voice.name}': segment ${seg.curveType} has non-positive arc ${seg.arcDegrees}°`,
        severity: 'error',
        pos: dummyPos,
      });
    }
  }

  // Check continuity at segment boundaries
  // We need to figure out the "previous amplitude" for the first segment.
  // Due to seam closure, the first segment's previous amplitude is the last segment's end amplitude.
  // We'll do a two-pass: first compute end amplitudes, then check boundaries.

  // First pass: compute endpoints for each segment
  // We need prev amplitude for each segment. For the first segment, prev = last segment's end.
  // This is circular, so we iterate until stable.

  // Start by assuming prev for first segment is 0 (will be corrected by seam check)
  const endpoints: { start: number; end: number }[] = [];
  let prev = 0;

  // First compute with prev=0 to get the last segment's end
  for (const seg of segs) {
    const ep = getSegmentEndpoints(seg, prev);
    endpoints.push(ep);
    prev = ep.end;
  }

  // Now prev is the end amplitude of the last segment.
  // Recompute with correct initial prev
  const lastEnd = prev;
  endpoints.length = 0;
  prev = lastEnd;

  for (const seg of segs) {
    const ep = getSegmentEndpoints(seg, prev);
    endpoints.push(ep);
    prev = ep.end;
  }

  // Check continuity at each boundary (i → i+1)
  for (let i = 0; i < segs.length - 1; i++) {
    const endOfCurrent = endpoints[i].end;
    const startOfNext = endpoints[i + 1].start;

    // H segments are exempt from continuity
    if (segs[i].curveType === 'H' || segs[i + 1].curveType === 'H') {
      continue;
    }

    if (Math.abs(endOfCurrent - startOfNext) > 1e-9) {
      // Drops (high→low) are valid for Q-type quick-strike patterns; rises are not.
      const severity = startOfNext > endOfCurrent ? 'error' : 'warning';
      diagnostics.push({
        message: `Voice '${voice.name}': discontinuity at segment boundary ${i}→${i + 1}: end=${endOfCurrent}, start=${startOfNext}`,
        severity,
        pos: dummyPos,
      });
    }
  }

  // Seam closure: last segment end must equal first segment start
  if (segs.length > 0) {
    const lastSeg = segs[segs.length - 1];
    const firstSeg = segs[0];

    if (lastSeg.curveType !== 'H' && firstSeg.curveType !== 'H') {
      const seamEnd = endpoints[endpoints.length - 1].end;
      const seamStart = endpoints[0].start;

      if (Math.abs(seamEnd - seamStart) > 1e-9) {
        // Drops at the seam (high→low wrap-around) are valid quick-strike patterns; rises are not.
        const severity = seamStart > seamEnd ? 'error' : 'warning';
        diagnostics.push({
          message: `Voice '${voice.name}': seam discontinuity: end=${seamEnd}, start=${seamStart}. The amplitude at 360° must equal the amplitude at 0°.`,
          severity,
          pos: dummyPos,
        });
      }
    }
  }
}
