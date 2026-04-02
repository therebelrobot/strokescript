/**
 * Bulk cam export — export all voices as ZIP archives containing SVG/DXF files.
 *
 * Uses JSZip for client-side ZIP generation.
 */

import type { Voice, ShaftShape } from '@strokescript/parser';
import JSZip from 'jszip';
import { generateWaveform } from './waveform.js';
import { generateCamShape } from './camShape.js';
import { generateCamSVG } from './svgExport.js';
import { generateCamDXF } from './dxfExport.js';

export interface BulkExportOptions {
  /** Base radius for cam generation */
  baseRadius: number;
  /** Shaft hole shape */
  shaftShape: ShaftShape;
  /** Shaft hole diameter in mm */
  shaftDiameter: number;
}

export type ExportFormat = 'svg' | 'dxf' | 'both';

/**
 * Generate a ZIP archive containing all voice exports.
 *
 * @param voices - Array of voices to export
 * @param format - Export format ('svg', 'dxf', or 'both')
 * @param options - Export options
 * @returns ZIP file as a Blob
 */
export async function generateExportZip(
  voices: Voice[],
  format: ExportFormat,
  options: BulkExportOptions,
): Promise<Blob> {
  const zip = new JSZip();

  for (const voice of voices) {
    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    const camData = generateCamShape(waveformData, options.baseRadius, maxAmp || 1);

    // Add SVG if requested
    if (format === 'svg' || format === 'both') {
      const svg = generateCamSVG(camData, {
        label: voice.name,
        direction: voice.direction,
        centreHoleDiameter: options.shaftDiameter,
        shaftShape: options.shaftShape,
      });
      zip.file(`${voice.name}-cam.svg`, svg);
    }

    // Add DXF if requested
    if (format === 'dxf' || format === 'both') {
      const dxf = generateCamDXF(camData, {
        centreHoleDiameter: options.shaftDiameter,
        shaftShape: options.shaftShape,
      });
      zip.file(`${voice.name}-cam.dxf`, dxf);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Trigger download of a blob as a file.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all voices as a ZIP file.
 *
 * @param voices - Array of voices to export
 * @param format - Export format ('svg', 'dxf', or 'both')
 * @param options - Export options
 * @param zipName - Name of the ZIP file (default: 'cams.zip')
 */
export async function exportAllAsZip(
  voices: Voice[],
  format: ExportFormat,
  options: BulkExportOptions,
  zipName = 'cams.zip',
): Promise<void> {
  if (voices.length === 0) {
    return;
  }

  const zipBlob = await generateExportZip(voices, format, options);
  downloadBlob(zipBlob, zipName);
}

/**
 * Generate a timestamped filename for the export.
 */
export function generateExportFilename(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `cams-${date}-${time}.zip`;
}
