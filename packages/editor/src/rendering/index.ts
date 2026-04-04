/**
 * StrokeScript rendering engine — barrel export.
 *
 * Re-exports all rendering modules from a single entry point.
 */

// Curve interpolation
export { interpolate } from './interpolate.js';

// Waveform data generation
export type {
  WaveformPoint,
  WaveformSegmentInfo,
  WaveformData,
} from './waveform.js';
export { generateWaveform } from './waveform.js';

// Cam shape generation
export type { CamPoint, CamShapeData } from './camShape.js';
export { generateCamShape } from './camShape.js';

// Shaft hole geometry
export type { ShaftHolePoint } from './shaftHole.js';
export { generateShaftHolePoints, getPolygonSides } from './shaftHole.js';

// Canvas sparkgraph renderers
export {
  drawWaveformSparkgraph,
  drawCamSparkgraph,
} from './canvasRenderer.js';

// Protractor marks geometry
export type {
  ProtractorTick,
  ProtractorLabel,
  ProtractorMarksData,
} from './protractorMarks.js';
export { generateProtractorMarks } from './protractorMarks.js';

// SVG cam export
export type { CamSVGOptions } from './svgExport.js';
export { generateCamSVG } from './svgExport.js';

// DXF cam export
export type { CamDXFOptions } from './dxfExport.js';
export { generateCamDXF } from './dxfExport.js';

// Bulk export
export type { BulkExportOptions, ExportFormat } from './bulkExport.js';
export {
  generateExportZip,
  exportAllAsZip,
  generateExportFilename,
} from './bulkExport.js';
