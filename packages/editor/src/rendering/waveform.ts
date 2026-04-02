/**
 * Waveform data generation for StrokeScript voices.
 *
 * Generates point arrays for plotting amplitude vs angle waveforms
 * from the compiled IR segments.
 */

import type { Voice } from '@strokescript/parser';
import { interpolate } from './interpolate.js';

// ── Colour palette per curve type ──────────────────────────────────────

const CURVE_COLORS: Record<string, string> = {
  S: '#3B82F6', // blue
  D: '#9CA3AF', // grey
  L: '#F59E0B', // amber
  E: '#10B981', // green
  Q: '#EF4444', // red
  H: '#8B5CF6', // purple
};

const CUSTOM_CURVE_COLOR = '#14B8A6'; // teal

function colorForCurve(curveType: string): string {
  return CURVE_COLORS[curveType] ?? CUSTOM_CURVE_COLOR;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface WaveformPoint {
  /** Angle in degrees, 0 to 360 */
  angle: number;
  /** Amplitude at this angle */
  amplitude: number;
  /** Normalised position over the full revolution, 0 to 1 */
  t: number;
  /** Index of the segment this point falls within */
  segmentIndex: number;
  /** Curve type of the segment */
  curveType: string;
}

export interface WaveformSegmentInfo {
  curveType: string;
  startAngle: number;
  endAngle: number;
  amplitude: number;
  color: string;
}

export interface WaveformData {
  points: WaveformPoint[];
  segments: WaveformSegmentInfo[];
}

// ── Generator ──────────────────────────────────────────────────────────

/**
 * Generate waveform data from a compiled Voice IR.
 *
 * @param voice - Compiled voice from the parser
 * @param resolution - Points per degree (default 1 → 360 total points)
 * @returns WaveformData with sampled points and segment metadata
 */
export function generateWaveform(
  voice: Voice,
  resolution: number = 1,
): WaveformData {
  const points: WaveformPoint[] = [];
  const segmentInfos: WaveformSegmentInfo[] = [];
  const segments = voice.segments;

  if (segments.length === 0) {
    return { points: [], segments: [] };
  }

  // Determine prevAmplitude for the first segment: it's the end amplitude
  // of the last segment (since the cam is a loop — seam continuity).
  // The last segment's end amplitude IS its target amplitude.
  let prevAmplitude = segments[segments.length - 1].amplitude;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const arcDegrees = seg.endAngle - seg.startAngle;
    const totalPoints = Math.max(1, Math.round(arcDegrees * resolution));

    segmentInfos.push({
      curveType: seg.curveType,
      startAngle: seg.startAngle,
      endAngle: seg.endAngle,
      amplitude: seg.amplitude,
      color: colorForCurve(seg.curveType),
    });

    for (let p = 0; p <= totalPoints; p++) {
      // Skip the first point of subsequent segments to avoid duplicates
      // at boundaries (the previous segment's last point IS this boundary).
      if (i > 0 && p === 0) continue;

      const tSeg = totalPoints > 0 ? p / totalPoints : 1;
      const angle = seg.startAngle + arcDegrees * tSeg;
      const amplitude = interpolate(
        seg.curveType,
        tSeg,
        prevAmplitude,
        seg.amplitude,
        seg.controlPoints,
      );

      points.push({
        angle,
        amplitude,
        t: angle / 360,
        segmentIndex: i,
        curveType: seg.curveType,
      });
    }

    prevAmplitude = seg.amplitude;
  }

  return { points, segments: segmentInfos };
}
