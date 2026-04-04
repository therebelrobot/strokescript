/**
 * SVG cam export — generates a standalone SVG string for a cam profile.
 *
 * The SVG is dimensioned in mm at 1:1 scale, suitable for laser cutting
 * or CNC machining. Opens cleanly in Inkscape, Illustrator, etc.
 *
 * Text handling: All text elements are converted to filled SVG paths
 * using opentype.js to extract glyph outlines from Roboto Mono font.
 * This produces clean, readable text ideal for laser cutting:
 *   - Proper filled glyphs (not stroke-based)
 *   - Crisp rendering at any scale
 *   - Clean SVG path data compatible with all cutting software
 */

import type { ShaftShape } from '@strokescript/parser';
import type { CamShapeData } from './camShape.js';
import { generateShaftHolePoints, getPolygonSides, getShaftOriginPoint } from './shaftHole.js';
import { generateProtractorMarks } from './protractorMarks.js';
import { textToPath } from './textToPath.js';
import { useEditorStore } from '../store.js';


export interface CamSVGOptions {
  /** Notation text label to engrave on the cam face */
  label?: string;
  /** Rotation direction */
  direction?: 'CW' | 'CCW';
  /** Centre hole diameter in mm (default 6) */
  centreHoleDiameter?: number;
  /** Shaft hole shape (default 'circle') */
  shaftShape?: ShaftShape;
  /** Origin corner identifier (e.g. 'top-right', '12') — marks the zero-degree reference point */
  shaftOrigin?: string;
  /** Width of each arm of the cross shape in mm (default 2); only used when shaftShape is 'cross' */
  crossLegWidth?: number;
  /** Whether to show a direction arrow (default true) */
  showDirectionArrow?: boolean;
  /**
   * Whether to include protractor reference marks inside the cam.
   * Emits hairline tick marks and @offset labels between the shaft hole
   * and the base circle so the cam orientation can be read at a glance.
   * All elements use stroke-width 0.01 mm (score line on Glowforge).
   * Default: false.
   */
  protractorMarks?: boolean;
  /**
   * Tick density for protractor marks when protractorMarks is true.
   * 'quarters' (4 ticks), 'eighths' (8 ticks), 'tenths' (10 ticks),
   * 'hundredths' (100 ticks). Default: 'hundredths'.
   */
  protractorDensity?: 'quarters' | 'eighths' | 'tenths' | 'hundredths';
  /**
   * Optional notation text to render as SVG paths below the cam
   * circle. Supports multi-line strings (split by '\n'). Each line is emitted
   * as a separate path element offset by one line-height.
   * Note: Text is converted to paths using the browser's SVG text-to-path API
   * for cutting software compatibility.
   */
  notation?: string;
}

/**
 * Generate an SVG string for a cam shape.
 *
 * @param camShapeData - Cam shape data from generateCamShape()
 * @param options - Export options
 * @returns Complete SVG document as a string (async due to font loading)
 */
export async function generateCamSVG(
  camShapeData: CamShapeData,
  options: CamSVGOptions = {},
): Promise<string> {
  const {
    label,
    direction = 'CW',
    centreHoleDiameter = 6,
    shaftShape = 'circle',
    shaftOrigin,
    showDirectionArrow = true,
    protractorMarks = false,
    protractorDensity = 'hundredths',
    crossLegWidth = 2,
    notation,
  } = options;

  const { points, maxRadius } = camShapeData;
  if (points.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  // Get kerf offset from store for laser cutting compensation (§8)
  const kerfOffset = useEditorStore.getState().kerfOffset;

  const centreHoleRadius = centreHoleDiameter / 2;
  const margin = 5; // mm margin around the cam
  const viewSize = (maxRadius + kerfOffset + margin) * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;

  // Build cam profile path with kerf offset applied (external cut: expand outward)
  // For external cuts, we offset each point outward from the cam center
  const pathParts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const baseX = points[i].x;
    const baseY = points[i].y;
    const dist = Math.sqrt(baseX * baseX + baseY * baseY);
    // Normalize direction and add kerf offset outward
    const scale = dist > 0.001 ? (dist + kerfOffset) / dist : 1;
    const px = cx + baseX * scale;
    const py = cy - baseY * scale; // flip y for SVG (y-down)
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

  // Build label text (converted to path for cutting software compatibility)
  // §8.7: text must be larger than kerf to engrave properly on laser cutter
  const labelFontSize = Math.max(kerfOffset + 0.8, Math.min(3, maxRadius * 0.12));
  let labelSvg = '';
  if (label) {
    const labelY = cy + camShapeData.baseCircleRadius * 0.3;
    labelSvg = '  ' + await textToPath(label, cx, labelY, { fontSize: labelFontSize, textAnchor: 'middle' });
  }

  // Build centre hole element based on shaft shape
  // Internal cut: SUBTRACT kerf offset (hole shrinks when material is removed)
  const kerfedHoleDiameter = Math.max(0, centreHoleDiameter - kerfOffset * 2);
  const kerfedHoleRadius = kerfedHoleDiameter / 2;
  let centreHoleSvg: string;
  if (shaftShape === 'cross') {
    // Cross: 12-corner square-cut polygon — emit as <path> with M/L/Z, no arcs.
    // r = shaftDiameter/2 (half of tip-to-tip span), w = crossLegWidth.
    const crossPoints = generateShaftHolePoints(shaftShape, kerfedHoleDiameter, 64, crossLegWidth);
    const crossPath = crossPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(cx + p.x).toFixed(4)},${(cy + p.y).toFixed(4)}`)
      .join(' ') + ' Z';
    centreHoleSvg = `<path d="${crossPath}" fill="none" stroke="#000" stroke-width="0.25"/>`;
  } else {
    const sides = getPolygonSides(shaftShape);
    if (sides === 0) {
      // Circle
      centreHoleSvg = `<circle cx="${cx.toFixed(4)}" cy="${cy.toFixed(4)}" r="${kerfedHoleRadius.toFixed(4)}" fill="none" stroke="#000" stroke-width="0.25"/>`;
    } else {
      // Polygon — generate points centred at (cx, cy)
      const holePoints = generateShaftHolePoints(shaftShape, kerfedHoleDiameter);
      const polyPoints = holePoints
        .map((p) => `${(cx + p.x).toFixed(4)},${(cy + p.y).toFixed(4)}`)
        .join(' ');
      centreHoleSvg = `<polygon points="${polyPoints}" fill="none" stroke="#000" stroke-width="0.25"/>`;
    }
  }

  // Build shaft-origin marker
  let originMarkSvg = '';
  if (shaftOrigin && shaftShape !== 'circle') {
    const pt = getShaftOriginPoint(shaftShape, centreHoleDiameter, shaftOrigin);
    if (pt !== null) {
      const ox = (cx + pt.x).toFixed(4);
      const oy = (cy + pt.y).toFixed(4);
      originMarkSvg = `\n  <circle cx="${ox}" cy="${oy}" r="1.5" fill="#FF4500"/>`;
    }
  }

  // Build protractor reference marks
  // Use kerfed hole radius to account for kerf compensation
  let protractorSvg = '';
  if (protractorMarks) {
    const marks = generateProtractorMarks(camShapeData.baseCircleRadius, kerfedHoleRadius, protractorDensity, kerfOffset);
    const HAIRLINE = '0.01mm';
    const tickParts: string[] = [];

    // Tick lines — all long ticks then all short ticks
    for (const tick of [...marks.longTicks, ...marks.shortTicks]) {
      const rad = (tick.angleDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const x1 = (cx + tick.innerR * cosA).toFixed(4);
      const y1 = (cy - tick.innerR * sinA).toFixed(4); // SVG y-down: negate sin
      const x2 = (cx + tick.outerR * cosA).toFixed(4);
      const y2 = (cy - tick.outerR * sinA).toFixed(4);
      tickParts.push(
        `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="${HAIRLINE}"/>`,
      );
    }

    // Text labels (converted to path for cutting software compatibility)
    const labelParts: string[] = [];
    for (const lbl of marks.labels) {
      const rad = (lbl.angleDeg * Math.PI) / 180;
      const lx = cx + lbl.r * Math.cos(rad);
      const ly = cy - lbl.r * Math.sin(rad); // SVG y-down
      // textToPath returns filled path elements
      labelParts.push('  ' + await textToPath(lbl.text, lx, ly, {
        fontSize: marks.fontSize,
        textAnchor: 'middle',
      }));
    }

    protractorSvg = `\n  <!-- Protractor reference marks -->\n` +
      `  <g id="protractor-marks">\n` +
      tickParts.join('\n') + '\n' +
      labelParts.join('\n') + '\n' +
      `  </g>`;
  }

  // Build notation text elements below the cam (converted to path for cutting software compatibility)
  // §8.7: text must be larger than kerf to engrave properly on laser cutter
  const notationFontSize = Math.max(kerfOffset + 0.8, 2);
  let notationSvg = '';
  if (notation) {
    const notationLines = notation.split('\n');
    const lineHeight = Math.max(notationFontSize * 1.4, 2.5); // mm, scaled with font
    const notationY = cy + camShapeData.baseCircleRadius + 3;
    const notationPromises = notationLines.map((line, i) =>
      textToPath(line, cx, notationY + i * lineHeight, { fontSize: notationFontSize, textAnchor: 'middle' }),
    );
    const notationPaths = await Promise.all(notationPromises);
    notationSvg = '\n' + notationPaths.map(p => '  ' + p).join('\n');
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
  ${centreHoleSvg}${originMarkSvg}${protractorSvg}${arrowSvg}${labelSvg}${notationSvg}
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
