/**
 * Shaft hole geometry generation for cam centre holes.
 *
 * Supports circle, regular polygon shapes (tri, square, pent, hex, hept, oct),
 * and the cross (plus) shape with square-cut arm ends.
 * All shapes are centred at (0, 0). The diameter is the circumscribed circle diameter
 * (for cross: the full arm length tip-to-tip).
 * Polygon shapes orient with one vertex at 12 o'clock (top, negative y in canvas coords).
 */

import type { ShaftShape } from '@strokescript/parser';

export interface ShaftHolePoint {
  x: number;
  y: number;
}

/**
 * Get the number of sides for a polygon shaft shape.
 * Returns 0 for circle.
 */
export function getPolygonSides(shape: ShaftShape): number {
  switch (shape) {
    case 'circle': return 0;
    case 'tri': return 3;
    case 'square': return 4;
    case 'pent': return 5;
    case 'hex': return 6;
    case 'hept': return 7;
    case 'oct': return 8;
    case 'cross': return 0; // not a regular polygon; handled separately
    default: return 0;
  }
}

/**
 * Generate the vertices/path for a shaft hole shape.
 *
 * For circle: returns points along the circle (default 64 points).
 * For polygons: returns the polygon vertices.
 *
 * All shapes are centred at (0, 0).
 * Diameter is the circumscribed circle diameter.
 * Polygons have first vertex at 12 o'clock (top, negative y in canvas coords).
 *
 * @param shape         Shaft shape keyword
 * @param diameter      Circumscribed circle diameter in the caller's unit (mm or px)
 * @param resolution    For circles, number of points (default 64)
 * @param crossLegWidth Width of each cross arm in the caller's unit (default 2); only used when shape is 'cross'
 * @returns Array of (x, y) points forming the shape
 */
export function generateShaftHolePoints(
  shape: ShaftShape,
  diameter: number,
  resolution: number = 64,
  crossLegWidth: number = 2,
): ShaftHolePoint[] {
  const radius = diameter / 2;

  // Cross shape: union of two rectangles gives a 12-corner polygon.
  // r = half the tip-to-tip span; w = arm width.
  // Points listed clockwise from top-left of the top arm.
  if (shape === 'cross') {
    const r = radius;
    const w = crossLegWidth;
    return [
      { x: -w / 2, y: -r },  // top-left of vertical arm top
      { x: w / 2, y: -r },  // top-right of vertical arm top
      { x: w / 2, y: -w / 2 },  // inner corner
      { x: r, y: -w / 2 },  // top-right of horizontal arm
      { x: r, y: w / 2 },  // bottom-right of horizontal arm
      { x: w / 2, y: w / 2 },  // inner corner
      { x: w / 2, y: r },  // bottom-right of vertical arm bottom
      { x: -w / 2, y: r },  // bottom-left of vertical arm bottom
      { x: -w / 2, y: w / 2 },  // inner corner
      { x: -r, y: w / 2 },  // bottom-left of horizontal arm
      { x: -r, y: -w / 2 },  // top-left of horizontal arm
      { x: -w / 2, y: -w / 2 },  // inner corner
    ];
  }

  const sides = getPolygonSides(shape);

  if (sides === 0) {
    // Circle: generate points along the circumference
    const points: ShaftHolePoint[] = [];
    for (let i = 0; i < resolution; i++) {
      // Start at 12 o'clock (-π/2) and go clockwise
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / resolution;
      points.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }
    return points;
  }

  // Regular polygon: vertices inscribed in the circumscribed circle
  const points: ShaftHolePoint[] = [];
  for (let i = 0; i < sides; i++) {
    // First vertex at 12 o'clock (-π/2), subsequent vertices clockwise
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    points.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Calculate the position of the shaft-origin corner vertex.
 *
 * Returns the (x, y) coordinate of the named origin corner relative to the
 * shaft/cam centre at (0, 0), in the same units as shaftDiameter.
 * Uses positive-y-down (canvas/SVG) coordinate convention.
 * Returns null for circle shapes or unrecognised origin strings.
 *
 * For square: shaftDiameter is treated as the flat-to-flat side length, so
 * halfSide = shaftDiameter / 2 and corners are at (±halfSide, ±halfSide).
 *
 * For polygon shapes (tri, pent, hex, hept, oct): clock-position strings are
 * converted to angles using circumscribed radius = shaftDiameter / 2, consistent
 * with generateShaftHolePoints().
 *
 * @param shaftShape    Shaft shape keyword
 * @param shaftDiameter Diameter in the caller's unit (mm or px)
 * @param shaftOrigin   Origin string from SHAFT_ORIGIN_VALUES
 */
export function getShaftOriginPoint(
  shaftShape: ShaftShape,
  shaftDiameter: number,
  shaftOrigin: string,
): ShaftHolePoint | null {
  if (shaftShape === 'circle') return null;

  if (shaftShape === 'square') {
    const halfSide = shaftDiameter / 2;
    switch (shaftOrigin) {
      case 'top-right': return { x: halfSide, y: -halfSide };
      case 'top-left': return { x: -halfSide, y: -halfSide };
      case 'bottom-right': return { x: halfSide, y: halfSide };
      case 'bottom-left': return { x: -halfSide, y: halfSide };
      default: return null;
    }
  }

  // Polygon shapes: clock-position strings map to vertex angles.
  // Circumscribed radius matches generateShaftHolePoints() convention.
  const sides = getPolygonSides(shaftShape);
  if (sides === 0) return null;

  const clockHour = parseFloat(shaftOrigin);
  if (isNaN(clockHour)) return null;

  // 12 o'clock = -90° (straight up); angle increases clockwise.
  const angleDeg = (clockHour / 12) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const radius = shaftDiameter / 2;

  return {
    x: radius * Math.cos(angleRad),
    y: radius * Math.sin(angleRad),
  };
}
