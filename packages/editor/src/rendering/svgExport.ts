/**
 * SVG cam export — generates a standalone SVG string for a cam profile.
 *
 * The SVG is dimensioned in mm at 1:1 scale, suitable for laser cutting
 * or CNC machining. Opens cleanly in Inkscape, Illustrator, etc.
 */

import type { ShaftShape } from '@strokescript/parser';
import type { CamShapeData } from './camShape.js';
import { generateShaftHolePoints, getPolygonSides } from './shaftHole.js';

export interface CamSVGOptions {
  /** Notation text label to engrave on the cam face */
  label?: string;
  /** Rotation direction */
  direction?: 'CW' | 'CCW';
  /** Centre hole diameter in mm (default 6) */
  centreHoleDiameter?: number;
  /** Shaft hole shape (default 'circle') */
  shaftShape?: ShaftShape;
  /** Whether to show a direction arrow (default true) */
  showDirectionArrow?: boolean;
}

/**
 * Generate an SVG string for a cam shape.
 *
 * @param camShapeData - Cam shape data from generateCamShape()
 * @param options - Export options
 * @returns Complete SVG document as a string
 */
export function generateCamSVG(
  camShapeData: CamShapeData,
  options: CamSVGOptions = {},
): string {
  const {
    label,
    direction = 'CW',
    centreHoleDiameter = 6,
    shaftShape = 'circle',
    showDirectionArrow = true,
  } = options;

  const { points, maxRadius } = camShapeData;
  if (points.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  const centreHoleRadius = centreHoleDiameter / 2;
  const margin = 5; // mm margin around the cam
  const viewSize = (maxRadius + margin) * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;

  // Build cam profile path
  const pathParts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const px = cx + points[i].x;
    const py = cy - points[i].y; // flip y for SVG (y-down)
    const cmd = i === 0 ? 'M' : 'L';
    pathParts.push(`${cmd}${px.toFixed(4)},${py.toFixed(4)}`);
  }
  pathParts.push('Z');
  const camPath = pathParts.join(' ');

  // Build direction arrow path
  let arrowSvg = '';
  if (showDirectionArrow) {
    // Place arrow on the cam face, at ~75% of base circle radius from centre
    const arrowRadius = camShapeData.baseCircleRadius * 0.55;
    const arrowSize = Math.max(1.5, maxRadius * 0.08);

    if (direction === 'CW') {
      // Clockwise arrow at the top
      const ax = cx + arrowRadius;
      const ay = cy - arrowSize;
      arrowSvg = `
  <g stroke="#333" stroke-width="0.3" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${(cx + arrowRadius - arrowSize * 1.5).toFixed(2)},${cy.toFixed(2)} A${arrowRadius.toFixed(2)},${arrowRadius.toFixed(2)} 0 0,1 ${ax.toFixed(2)},${ay.toFixed(2)}"/>
    <path d="M${(ax - arrowSize * 0.6).toFixed(2)},${(ay - arrowSize * 0.4).toFixed(2)} L${ax.toFixed(2)},${ay.toFixed(2)} L${(ax + arrowSize * 0.2).toFixed(2)},${(ay + arrowSize * 0.6).toFixed(2)}"/>
  </g>`;
    } else {
      // Counter-clockwise arrow at the top
      const ax = cx - arrowRadius;
      const ay = cy - arrowSize;
      arrowSvg = `
  <g stroke="#333" stroke-width="0.3" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${(cx - arrowRadius + arrowSize * 1.5).toFixed(2)},${cy.toFixed(2)} A${arrowRadius.toFixed(2)},${arrowRadius.toFixed(2)} 0 0,0 ${ax.toFixed(2)},${ay.toFixed(2)}"/>
    <path d="M${(ax + arrowSize * 0.6).toFixed(2)},${(ay - arrowSize * 0.4).toFixed(2)} L${ax.toFixed(2)},${ay.toFixed(2)} L${(ax - arrowSize * 0.2).toFixed(2)},${(ay + arrowSize * 0.6).toFixed(2)}"/>
  </g>`;
    }
  }

  // Build label text
  let labelSvg = '';
  if (label) {
    const fontSize = Math.max(1.5, Math.min(3, maxRadius * 0.12));
    const labelY = cy + camShapeData.baseCircleRadius * 0.3;
    labelSvg = `
  <text x="${cx.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="monospace" font-size="${fontSize.toFixed(1)}" fill="#333">${escapeXml(label)}</text>`;
  }

  // Build centre hole element based on shaft shape
  let centreHoleSvg: string;
  const sides = getPolygonSides(shaftShape);
  if (sides === 0) {
    // Circle
    centreHoleSvg = `<circle cx="${cx.toFixed(4)}" cy="${cy.toFixed(4)}" r="${centreHoleRadius.toFixed(4)}" fill="none" stroke="#000" stroke-width="0.25"/>`;
  } else {
    // Polygon — generate points centred at (cx, cy)
    const holePoints = generateShaftHolePoints(shaftShape, centreHoleDiameter);
    const polyPoints = holePoints
      .map((p) => `${(cx + p.x).toFixed(4)},${(cy + p.y).toFixed(4)}`)
      .join(' ');
    centreHoleSvg = `<polygon points="${polyPoints}" fill="none" stroke="#000" stroke-width="0.25"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${viewSize.toFixed(2)}mm"
     height="${viewSize.toFixed(2)}mm"
     viewBox="0 0 ${viewSize.toFixed(2)} ${viewSize.toFixed(2)}">
  <title>Cam Profile${label ? ': ' + escapeXml(label) : ''}</title>

  <!-- Cam profile -->
  <path d="${camPath}" fill="none" stroke="#000" stroke-width="0.25"/>

  <!-- Centre hole -->
  ${centreHoleSvg}${arrowSvg}${labelSvg}
</svg>
`;
}

/** Escape special characters for XML attribute/text content. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
