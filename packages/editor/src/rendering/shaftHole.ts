/**
 * Shaft hole geometry generation for cam centre holes.
 *
 * Supports circle and regular polygon shapes (tri, square, pent, hex, hept, oct).
 * All shapes are centred at (0, 0). The diameter is the circumscribed circle diameter.
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
 * @param shape      Shaft shape keyword
 * @param diameter   Circumscribed circle diameter in the caller's unit (mm or px)
 * @param resolution For circles, number of points (default 64)
 * @returns Array of (x, y) points forming the shape
 */
export function generateShaftHolePoints(
  shape: ShaftShape,
  diameter: number,
  resolution: number = 64,
): ShaftHolePoint[] {
  const radius = diameter / 2;
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
