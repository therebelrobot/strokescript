/**
 * DXF cam export — hand-written minimal DXF serializer.
 *
 * Outputs a DXF file with LWPOLYLINE for the cam profile and CIRCLE for
 * the centre hole. Coordinates are in mm. Compatible with AutoCAD, Fusion
 * 360, and other standard CAD software.
 *
 * No external dependencies required.
 */

import type { ShaftShape } from '@strokescript/parser';
import type { CamShapeData } from './camShape.js';
import { generateShaftHolePoints, getPolygonSides } from './shaftHole.js';

export interface CamDXFOptions {
  /** Centre hole diameter in mm (default 6) */
  centreHoleDiameter?: number;
  /** Shaft hole shape (default 'circle') */
  shaftShape?: ShaftShape;
}

/**
 * Generate a DXF string for a cam shape.
 *
 * @param camShapeData - Cam shape data from generateCamShape()
 * @param options - Export options
 * @returns Complete DXF file content as a string
 */
export function generateCamDXF(
  camShapeData: CamShapeData,
  options: CamDXFOptions = {},
): string {
  const { centreHoleDiameter = 6, shaftShape = 'circle' } = options;
  const centreHoleRadius = centreHoleDiameter / 2;
  const { points } = camShapeData;

  const lines: string[] = [];

  // ── HEADER section ─────────────────────────────────────────────────
  lines.push(
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$INSUNITS',
    '70', '4',          // 4 = millimetres
    '9', '$ACADVER',
    '1', 'AC1015',      // AutoCAD 2000 format
    '0', 'ENDSEC',
  );

  // ── TABLES section (minimal — required for some parsers) ───────────
  lines.push(
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LTYPE',
    '70', '1',
    '0', 'LTYPE',
    '2', 'CONTINUOUS',
    '70', '0',
    '3', 'Solid line',
    '72', '65',
    '73', '0',
    '40', '0.0',
    '0', 'ENDTAB',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '2',
    '0', 'LAYER',
    '2', '0',
    '70', '0',
    '62', '7',          // white
    '6', 'CONTINUOUS',
    '0', 'LAYER',
    '2', 'CAM_PROFILE',
    '70', '0',
    '62', '1',          // red
    '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
  );

  // ── ENTITIES section ───────────────────────────────────────────────
  lines.push(
    '0', 'SECTION',
    '2', 'ENTITIES',
  );

  // Cam profile as LWPOLYLINE (closed)
  if (points.length > 0) {
    lines.push(
      '0', 'LWPOLYLINE',
      '8', 'CAM_PROFILE',  // layer
      '62', '1',            // colour: red
      '90', String(points.length), // number of vertices
      '70', '1',            // closed polyline flag
    );

    for (const p of points) {
      lines.push(
        '10', p.x.toFixed(6),
        '20', p.y.toFixed(6),
      );
    }
  }

  // Centre hole — circle or polygon depending on shaft shape
  const sides = getPolygonSides(shaftShape);
  if (sides === 0) {
    // Circle
    lines.push(
      '0', 'CIRCLE',
      '8', '0',              // layer 0
      '62', '7',             // colour: white
      '10', '0.0',           // centre x
      '20', '0.0',           // centre y
      '30', '0.0',           // centre z
      '40', centreHoleRadius.toFixed(6), // radius
    );
  } else {
    // Polygon as closed LWPOLYLINE
    const holePoints = generateShaftHolePoints(shaftShape, centreHoleDiameter);
    lines.push(
      '0', 'LWPOLYLINE',
      '8', '0',              // layer 0
      '62', '7',             // colour: white
      '90', String(holePoints.length), // number of vertices
      '70', '1',             // closed polyline flag
    );
    for (const p of holePoints) {
      lines.push(
        '10', p.x.toFixed(6),
        '20', p.y.toFixed(6),
      );
    }
  }

  lines.push(
    '0', 'ENDSEC',
  );

  // ── EOF ────────────────────────────────────────────────────────────
  lines.push('0', 'EOF');

  return lines.join('\n') + '\n';
}
