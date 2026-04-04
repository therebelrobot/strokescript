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
import { generateShaftHolePoints, getPolygonSides, getShaftOriginPoint } from './shaftHole.js';
import { generateProtractorMarks } from './protractorMarks.js';
import { useEditorStore } from '../store.js';

export interface CamDXFOptions {
  /** Centre hole diameter in mm (default 6) */
  centreHoleDiameter?: number;
  /** Shaft hole shape (default 'circle') */
  shaftShape?: ShaftShape;
  /** Origin corner identifier (e.g. 'top-right', '12') — marks the zero-degree reference point */
  shaftOrigin?: string;
  /** Width of each arm of the cross shape in mm (default 2); only used when shaftShape is 'cross' */
  crossLegWidth?: number;
  /**
   * Whether to include protractor reference marks inside the cam.
   * Emits LINE entities for tick marks and TEXT entities for @offset labels
   * on the PROTRACTOR_MARKS layer, placed between the shaft hole and base circle.
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
   * Optional notation text to render as a DXF TEXT entity below the cam circle,
   * on the NOTATION layer. Supports multi-line strings (split by '\n'); each
   * line is emitted as a separate TEXT entity offset by 3 mm.
   */
  notation?: string;
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
  const {
    centreHoleDiameter = 6,
    shaftShape = 'circle',
    shaftOrigin,
    protractorMarks = false,
    protractorDensity = 'hundredths',
    crossLegWidth = 2,
    notation,
  } = options;
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
  const extraLayerCount = (protractorMarks ? 1 : 0) + (notation ? 1 : 0);
  const layerCount = 3 + extraLayerCount;
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
    '70', String(layerCount),
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
    '0', 'LAYER',
    '2', 'SHAFT_ORIGIN',
    '70', '0',
    '62', '30',         // orange
    '6', 'CONTINUOUS',
  );
  if (protractorMarks) {
    lines.push(
      '0', 'LAYER',
      '2', 'PROTRACTOR_MARKS',
      '70', '0',
      '62', '9',          // light grey (colour index 9)
      '6', 'CONTINUOUS',
      '370', '5',         // lineweight 0.05 mm (hairline)
    );
  }
  if (notation) {
    lines.push(
      '0', 'LAYER',
      '2', 'NOTATION',
      '70', '0',
      '62', '9',          // light grey (colour index 9)
      '6', 'CONTINUOUS',
    );
  }
  lines.push(
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

  // Centre hole — circle, cross, or polygon depending on shaft shape
  if (shaftShape === 'cross') {
    // Cross: 12-corner square-cut polygon as closed LWPOLYLINE.
    // Coordinates centred at (0, 0). r = shaftDiameter/2, w = crossLegWidth.
    const crossPoints = generateShaftHolePoints(shaftShape, centreHoleDiameter, 64, crossLegWidth);
    lines.push(
      '0', 'LWPOLYLINE',
      '8', '0',                             // layer 0
      '62', '7',                            // colour: white
      '90', String(crossPoints.length),     // number of vertices (12)
      '70', '1',                            // closed polyline flag
    );
    for (const p of crossPoints) {
      lines.push(
        '10', p.x.toFixed(6),
        '20', p.y.toFixed(6),
      );
    }
  } else {
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
  }

  // Shaft-origin marker — small circle at the named origin corner
  if (shaftOrigin && shaftShape !== 'circle') {
    const pt = getShaftOriginPoint(shaftShape, centreHoleDiameter, shaftOrigin);
    if (pt !== null) {
      lines.push(
        '0', 'CIRCLE',
        '8', 'SHAFT_ORIGIN',  // layer
        '62', '30',            // colour: orange
        '10', pt.x.toFixed(6), // centre x
        '20', pt.y.toFixed(6), // centre y
        '30', '0.0',           // centre z
        '40', '0.5',           // radius
      );
    }
  }

  // Protractor reference marks — tick lines and @offset text labels
  if (protractorMarks) {
    const kerfOffset = useEditorStore.getState().kerfOffset;
    const shaftRadius = centreHoleRadius;
    const marks = generateProtractorMarks(camShapeData.baseCircleRadius, shaftRadius, protractorDensity, kerfOffset);

    // LINE entities for tick marks (long ticks first, then short)
    for (const tick of [...marks.longTicks, ...marks.shortTicks]) {
      const rad = (tick.angleDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      lines.push(
        '0', 'LINE',
        '8', 'PROTRACTOR_MARKS',
        '62', '9',                              // colour: light grey
        '370', '5',                             // lineweight 0.05 mm
        '10', (tick.innerR * cosA).toFixed(6),  // start x
        '20', (tick.innerR * sinA).toFixed(6),  // start y
        '30', '0.0',                            // start z
        '11', (tick.outerR * cosA).toFixed(6),  // end x
        '21', (tick.outerR * sinA).toFixed(6),  // end y
        '31', '0.0',                            // end z
      );
    }

    // TEXT entities for @offset labels — centred at label position
    for (const lbl of marks.labels) {
      const rad = (lbl.angleDeg * Math.PI) / 180;
      const lx = (lbl.r * Math.cos(rad)).toFixed(6);
      const ly = (lbl.r * Math.sin(rad)).toFixed(6);
      lines.push(
        '0', 'TEXT',
        '8', 'PROTRACTOR_MARKS',
        '62', '9',                          // colour: light grey
        '10', lx,                           // first alignment point x
        '20', ly,                           // first alignment point y
        '30', '0.0',                        // z
        '40', marks.fontSize.toFixed(4),    // text height
        '1', lbl.text,                      // text string
        '72', '1',                          // horizontal justification: centre
        '11', lx,                           // second alignment point x (used for centred text)
        '21', ly,                           // second alignment point y
        '31', '0.0',                        // z
        '73', '2',                          // vertical justification: middle
      );
    }
  }

  // Notation text entities — below the cam circle on the NOTATION layer
  // §8.7: text must be larger than kerf to engrave properly on laser cutter
  if (notation) {
    const kerfOffset = useEditorStore.getState().kerfOffset;
    const notationFontSize = Math.max(kerfOffset + 0.8, 2);
    const notationLines = notation.split('\n');
    const baseY = -(camShapeData.baseCircleRadius + 3);
    const lineSpacing = Math.max(notationFontSize * 1.4, 3);
    for (let i = 0; i < notationLines.length; i++) {
      const ly = (baseY - i * lineSpacing).toFixed(6);
      lines.push(
        '0', 'TEXT',
        '8', 'NOTATION',
        '62', '9',              // colour: light grey
        '10', '0.0',            // first alignment point x
        '20', ly,               // first alignment point y
        '30', '0.0',            // z
        '40', notationFontSize.toFixed(4), // text height: kerf-aware mm
        '1', notationLines[i],  // text string
        '72', '1',              // horizontal justification: centre
        '11', '0.0',            // second alignment point x
        '21', ly,               // second alignment point y
        '31', '0.0',            // z
        '73', '2',              // vertical justification: middle
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
