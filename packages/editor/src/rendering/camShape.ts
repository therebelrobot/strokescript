/**
 * Cam shape generation — converts waveform data to polar coordinates
 * for cam profile rendering.
 */

import type { WaveformData } from './waveform.js';

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
