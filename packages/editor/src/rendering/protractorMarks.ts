/**
 * Protractor marks geometry — computes angular reference tick lines and labels
 * for the annular ring between the shaft hole and the base circle of a cam.
 *
 * Angle convention (matches camShape.ts / svgExport.ts):
 *   0°   = right (3 o'clock) → @offset 0.0
 *   90°  = top  (12 o'clock) → @offset 0.25
 *   180° = left  (9 o'clock) → @offset 0.5
 *   270° = bottom (6 o'clock) → @offset 0.75
 * Angles increase counter-clockwise in math/DXF space; SVG callers must negate
 * the y-component when mapping to screen coordinates.
 */

// ── Types ──────────────────────────────────────────────────────────────

/** A single radial tick mark defined by inner/outer radii and an angle. */
export interface ProtractorTick {
  /** Inner radius in mm (closer to shaft hole) */
  innerR: number;
  /** Outer radius in mm (closer to base circle) */
  outerR: number;
  /** Angle in degrees — 0 = right (3 o'clock), positive = counter-clockwise */
  angleDeg: number;
}

/** A text label placed at a given radial distance and angle. */
export interface ProtractorLabel {
  /** Radial distance from centre in mm */
  r: number;
  /** Angle in degrees — same convention as ProtractorTick */
  angleDeg: number;
  /** Label text, e.g. "@0.25" */
  text: string;
}

/** All geometry produced for a protractor marks ring. */
export interface ProtractorMarksData {
  /** Long tick marks at every 0.25 revolution (90°) */
  longTicks: ProtractorTick[];
  /** Short tick marks at every 0.125 revolution (45°) — between long ticks */
  shortTicks: ProtractorTick[];
  /** Text labels at @0.25, @0.5, @0.75 positions (the @0 position is omitted) */
  labels: ProtractorLabel[];
  /** Suggested font size in mm, scaled to fit the ring */
  fontSize: number;
}

// ── Generator ──────────────────────────────────────────────────────────

/**
 * Compute protractor mark geometry for the annular ring between the shaft hole
 * and the base circle.
 *
 * Tick placement:
 *   - Outermost edge of ticks sits at `baseRadius - edgeGap` (just inside base circle).
 *   - Long ticks extend inward by ~18 % of the ring gap.
 *   - Short ticks extend inward by ~9 % of the ring gap.
 *   - Extra ticks (when density > eighths) extend inward by ~4.5 % of the ring gap.
 *   - Labels sit just inside the long-tick inner edge.
 *
 * @param baseRadius  Base circle radius in mm
 * @param shaftRadius Shaft hole circumscribed radius in mm (centreHoleDiameter / 2)
 * @param density     Tick density: 'quarters' (4 ticks), 'eighths' (8 ticks),
 *                    'tenths' (10 ticks), 'hundredths' (100 ticks). Default 'eighths'.
 * @returns Geometry data for ticks and labels
 */
/**
 * Compute protractor mark geometry for the annular ring between the shaft hole
 * and the base circle.
 *
 * Tick placement:
 *   - Outermost edge of ticks sits at `baseRadius - edgeGap` (just inside base circle).
 *   - Long ticks extend inward by ~18 % of the ring gap.
 *   - Short ticks extend inward by ~9 % of the ring gap.
 *   - Extra ticks (when density > eighths) extend inward by ~4.5 % of the ring gap.
 *   - Labels sit just inside the long-tick inner edge.
 *
 * @param baseRadius  Base circle radius in mm
 * @param shaftRadius Shaft hole circumscribed radius in mm (centreHoleDiameter / 2)
 * @param density     Tick density: 'quarters' (4 ticks), 'eighths' (8 ticks),
 *                    'tenths' (10 ticks), 'hundredths' (100 ticks). Default 'eighths'.
 * @param kerfOffset  Laser kerf offset in mm — tick minimums are set to exceed this
 *                    so marks remain visible after cutting (§8.6). Default 0.
 * @returns Geometry data for ticks and labels
 */
export function generateProtractorMarks(
  baseRadius: number,
  shaftRadius: number,
  density: 'quarters' | 'eighths' | 'tenths' | 'hundredths' = 'eighths',
  kerfOffset: number = 0,
): ProtractorMarksData {
  // Visual buffer beyond kerf to ensure marks remain visible after cutting
  const kerfBuffer = Math.max(0.15, kerfOffset);

  const gap = Math.max(0.1, baseRadius - shaftRadius);

  // Keep a small separation between outermost tick edge and the base circle line
  const edgeGap = Math.max(0.3, gap * 0.05);
  const outerR = baseRadius - edgeGap;

  // Tick lengths — proportional to ring gap, with minimum sizes that exceed kerf
  // §8.6: marks must be larger than kerf to remain visible after cutting
  const longTickLen = Math.max(kerfBuffer + 0.6, gap * 0.18);
  const shortTickLen = Math.max(kerfBuffer + 0.25, gap * 0.09);
  const extraTickLen = Math.max(kerfBuffer + 0.1, gap * 0.045);

  const longInnerR = outerR - longTickLen;
  const shortInnerR = outerR - shortTickLen;
  const extraInnerR = outerR - extraTickLen;

  // Determine step angle based on density
  const stepDeg = (() => {
    switch (density) {
      case 'quarters': return 90;
      case 'eighths': return 45;
      case 'tenths': return 36;
      case 'hundredths': return 3.6;
    }
  })();

  const longTicks: ProtractorTick[] = [];
  const shortTicks: ProtractorTick[] = [];

  // Generate ticks from 0° up to 360° - step (to avoid duplicate at 360°)
  for (let angleDeg = 0; angleDeg < 360; angleDeg += stepDeg) {
    // Skip 360° because it's same as 0°
    if (angleDeg >= 360) continue;

    const isQuarter = Math.abs(angleDeg % 90) < 1e-9;
    const isEighth = Math.abs(angleDeg % 45) < 1e-9;

    if (isQuarter) {
      longTicks.push({
        innerR: longInnerR,
        outerR,
        angleDeg,
      });
    } else if (isEighth) {
      shortTicks.push({
        innerR: shortInnerR,
        outerR,
        angleDeg,
      });
    } else {
      // Extra tick (for tenths/hundredths)
      shortTicks.push({
        innerR: extraInnerR,
        outerR,
        angleDeg,
      });
    }
  }

  // Font size scales with ring gap; clamp between kerf-buffered minimum and 2.5 mm
  // §8.6: text labels are cut paths that must remain visible after kerf compensation
  const fontSize = Math.max(kerfBuffer + 0.8, Math.min(2.5, gap * 0.15));

  // Labels sit just inside the long-tick inner edge to avoid overlapping ticks
  const labelGap = Math.max(0.3, fontSize * 0.6);
  const labelR = longInnerR - labelGap;

  // Labels at @0.25 / @0.5 / @0.75; @0 is intentionally omitted because the
  // shaft-origin mark already indicates that reference position.
  const labels: ProtractorLabel[] = [
    { r: labelR, angleDeg: 90, text: '@0.25' },
    { r: labelR, angleDeg: 180, text: '@0.5' },
    { r: labelR, angleDeg: 270, text: '@0.75' },
  ];

  return { longTicks, shortTicks, labels, fontSize };
}
