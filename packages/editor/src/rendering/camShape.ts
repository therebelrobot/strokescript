/**
 * Cam shape generation — converts waveform data to polar coordinates
 * for cam profile rendering.
 */

import type { ShaftShape } from '@strokescript/parser';
import type { WaveformData } from './waveform.js';
import { getShaftOriginPoint } from './shaftHole.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CamPoint {
  /** Cartesian x coordinate */
  x: number;
  /** Cartesian y coordinate */
  y: number;
  /** Angle in degrees */
  angle: number;
  /** Radius at this angle (base + amplitude) */
  radius: number;
}

export interface CamShapeData {
  points: CamPoint[];
  baseCircleRadius: number;
  maxRadius: number;
}

// ── Generator ──────────────────────────────────────────────────────────

/**
 * Convert waveform amplitude data to a cam profile in Cartesian coordinates.
 *
 * @param waveformData - Waveform data from generateWaveform()
 * @param baseRadiusMm - Base circle radius in mm
 * @param amplitudeScaleMm - Maximum amplitude in mm (used when scaling
 *   amplitudes; if the waveform amplitudes are already in mm this can be
 *   set to match the max amplitude in the data)
 * @returns CamShapeData with Cartesian points, base radius, and max radius
 */
export function generateCamShape(
  waveformData: WaveformData,
  baseRadiusMm: number,
  amplitudeScaleMm: number,
): CamShapeData {
  const points: CamPoint[] = [];
  let maxRadius = baseRadiusMm;

  for (const wp of waveformData.points) {
    const angleRad = (wp.angle * Math.PI) / 180;
    const radius = baseRadiusMm + wp.amplitude;
    const x = radius * Math.cos(angleRad);
    const y = radius * Math.sin(angleRad);

    if (radius > maxRadius) {
      maxRadius = radius;
    }

    points.push({ x, y, angle: wp.angle, radius });
  }

  return {
    points,
    baseCircleRadius: baseRadiusMm,
    maxRadius,
  };
}

/**
 * Draw a visual marker at the shaft-origin corner on a canvas context.
 *
 * Renders a small filled dot in a contrasting colour (#FF4500) at the
 * named origin corner of the shaft hole, relative to the cam/shaft centre.
 * No-op when shaftOrigin is not set or the shaft shape is 'circle'.
 *
 * @param ctx           Canvas 2D rendering context
 * @param cx            Centre x of the cam/shaft in canvas pixels
 * @param cy            Centre y of the cam/shaft in canvas pixels
 * @param scale         Scale factor: canvas pixels per mm
 * @param shaftShape    Shaft shape keyword
 * @param shaftDiameter Shaft diameter in mm
 * @param shaftOrigin   Origin string (e.g. 'top-right', '12')
 */
export function drawShaftOriginMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  shaftShape: ShaftShape,
  shaftDiameter: number,
  shaftOrigin: string,
): void {
  const pt = getShaftOriginPoint(shaftShape, shaftDiameter, shaftOrigin);
  if (pt === null) return;

  const markerX = cx + pt.x * scale;
  const markerY = cy + pt.y * scale;
  const dotRadius = Math.max(3, shaftDiameter * scale * 0.1);

  ctx.save();
  ctx.beginPath();
  ctx.arc(markerX, markerY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#FF4500';
  ctx.fill();
  ctx.restore();
}
