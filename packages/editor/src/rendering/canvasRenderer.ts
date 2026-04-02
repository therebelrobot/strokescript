/**
 * Canvas sparkgraph renderers for inline waveform and cam shape display.
 *
 * Waveform: oscilloscope-style scrolling viewport centered on nowAngle.
 * Cam: the cam shape rotates; the follower stays fixed at 12 o'clock.
 */

import type { ShaftShape } from '@strokescript/parser';
import type { WaveformData } from './waveform.js';
import type { CamShapeData } from './camShape.js';
import { generateShaftHolePoints } from './shaftHole.js';

// ── Waveform Sparkgraph ────────────────────────────────────────────────

/** Degrees of waveform visible in the viewport at once. */
const VIEWPORT_DEGREES = 120;

/**
 * Draw a scrolling waveform sparkgraph — an oscilloscope-style viewport
 * where the waveform scrolls leftward past a fixed "now" line.
 *
 * @param ctx        Canvas 2D rendering context
 * @param waveformData  Waveform data from generateWaveform()
 * @param width      Canvas width in pixels (~160)
 * @param height     Canvas height in pixels (~32)
 * @param maxAmplitude  Y-axis maximum for scaling
 * @param nowAngle   Playback position in degrees (undefined = show full static)
 */
export function drawWaveformSparkgraph(
  ctx: CanvasRenderingContext2D,
  waveformData: WaveformData,
  width: number,
  height: number,
  maxAmplitude: number,
  nowAngle?: number,
): void {
  const { points, segments } = waveformData;
  if (points.length === 0) return;

  ctx.clearRect(0, 0, width, height);

  const effectiveMax = maxAmplitude > 0 ? maxAmplitude : 1;
  const padding = 1;
  const plotHeight = height - padding * 2;

  function amplitudeToY(amplitude: number): number {
    return height - padding - (amplitude / effectiveMax) * plotHeight;
  }

  // If no nowAngle, render the full static waveform (legacy / non-playing mode)
  if (nowAngle === undefined) {
    const plotWidth = width;
    function angleToX(angle: number): number {
      return (angle / 360) * plotWidth;
    }

    // Draw filled segments
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const segPoints = points.filter((p) => p.segmentIndex === si);
      if (segPoints.length === 0) continue;

      ctx.beginPath();
      const firstX = angleToX(segPoints[0].angle);
      ctx.moveTo(firstX, height - padding);
      for (const p of segPoints) {
        ctx.lineTo(angleToX(p.angle), amplitudeToY(p.amplitude));
      }
      const lastX = angleToX(segPoints[segPoints.length - 1].angle);
      ctx.lineTo(lastX, height - padding);
      ctx.closePath();
      ctx.fillStyle = seg.color + '80';
      ctx.fill();

      // Stroke top curve
      ctx.beginPath();
      for (let i = 0; i < segPoints.length; i++) {
        const x = angleToX(segPoints[i].angle);
        const y = amplitudeToY(segPoints[i].amplitude);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Segment boundary ticks
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 0.5;
    for (const seg of segments) {
      const x = angleToX(seg.startAngle);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 4);
      ctx.stroke();
    }
    return;
  }

  // ── Scrolling / oscilloscope mode ──
  // "now" is at the far left; viewport extends forward from the current angle
  const viewStart = nowAngle;
  const viewEnd = nowAngle + VIEWPORT_DEGREES;

  // Map viewport-relative angle to x position
  function viewAngleToX(angle: number): number {
    return ((angle - viewStart) / VIEWPORT_DEGREES) * width;
  }

  // Normalise angle to 0..360 range
  function normAngle(a: number): number {
    return ((a % 360) + 360) % 360;
  }

  // Get amplitude at an arbitrary angle by finding the closest waveform point
  // For the viewport, we need to handle wrap-around
  function getPointsInRange(rangeStart: number, rangeEnd: number) {
    const result: Array<{ viewAngle: number; amplitude: number; segmentIndex: number }> = [];

    for (const p of points) {
      // The point's canonical angle is p.angle (0..360)
      // We need to check if it falls within our viewport when considering wrapping
      let viewAngle = p.angle;

      // Try the canonical angle and ±360 offsets to handle wrap
      for (const offset of [0, 360, -360]) {
        const candidate = p.angle + offset;
        if (candidate >= rangeStart && candidate <= rangeEnd) {
          viewAngle = candidate;
          result.push({
            viewAngle,
            amplitude: p.amplitude,
            segmentIndex: p.segmentIndex,
          });
          break;
        }
      }
    }

    // Sort by viewAngle for proper rendering order
    result.sort((a, b) => a.viewAngle - b.viewAngle);
    return result;
  }

  const viewPoints = getPointsInRange(viewStart, viewEnd);

  if (viewPoints.length === 0) return;

  // Draw filled segments in the viewport
  // Group consecutive points by segment
  let currentSegIdx = -1;
  let segBatch: typeof viewPoints = [];

  function flushSegBatch() {
    if (segBatch.length === 0) return;
    const segIdx = segBatch[0].segmentIndex;
    const seg = segments[segIdx];
    if (!seg) return;

    ctx.beginPath();
    const firstX = viewAngleToX(segBatch[0].viewAngle);
    ctx.moveTo(firstX, height - padding);
    for (const p of segBatch) {
      ctx.lineTo(viewAngleToX(p.viewAngle), amplitudeToY(p.amplitude));
    }
    const lastX = viewAngleToX(segBatch[segBatch.length - 1].viewAngle);
    ctx.lineTo(lastX, height - padding);
    ctx.closePath();
    ctx.fillStyle = seg.color + '80';
    ctx.fill();

    // Stroke top
    ctx.beginPath();
    for (let i = 0; i < segBatch.length; i++) {
      const x = viewAngleToX(segBatch[i].viewAngle);
      const y = amplitudeToY(segBatch[i].amplitude);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const p of viewPoints) {
    if (p.segmentIndex !== currentSegIdx) {
      flushSegBatch();
      segBatch = [p];
      currentSegIdx = p.segmentIndex;
    } else {
      segBatch.push(p);
    }
  }
  flushSegBatch();

  // Draw segment boundary ticks (in viewport range)
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 0.5;
  for (const seg of segments) {
    for (const offset of [0, 360, -360]) {
      const tickAngle = seg.startAngle + offset;
      if (tickAngle >= viewStart && tickAngle <= viewEnd) {
        const x = viewAngleToX(tickAngle);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 4);
        ctx.stroke();
      }
    }
  }

  // Draw "now" line at left edge
  const nowX = viewAngleToX(nowAngle);
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nowX, 0);
  ctx.lineTo(nowX, height);
  ctx.stroke();

  // Draw follower dot at the intersection of the "now" line and the waveform
  const nowNorm = normAngle(nowAngle);
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < points.length; i++) {
    const diff = Math.abs(points[i].angle - nowNorm);
    const diffWrap = 360 - diff;
    const d = Math.min(diff, diffWrap);
    if (d < minDiff) {
      minDiff = d;
      closestIdx = i;
    }
  }

  // Interpolate between the two nearest points for a smoother position
  let nowAmplitude = points[closestIdx].amplitude;
  if (points.length > 1) {
    const cp = points[closestIdx];
    // Determine which neighbour to interpolate with
    let neighbourIdx: number;
    const angleDelta = nowNorm - cp.angle;
    // Handle wrap-around when choosing neighbour direction
    const wrappedDelta = ((angleDelta + 180) % 360 + 360) % 360 - 180;
    if (wrappedDelta >= 0) {
      neighbourIdx = (closestIdx + 1) % points.length;
    } else {
      neighbourIdx = (closestIdx - 1 + points.length) % points.length;
    }
    const np = points[neighbourIdx];
    // Compute angular gap handling wrap-around
    let gap = np.angle - cp.angle;
    if (gap > 180) gap -= 360;
    if (gap < -180) gap += 360;
    if (Math.abs(gap) > 0.0001) {
      const t = wrappedDelta / gap;
      const tClamped = Math.max(0, Math.min(1, t));
      nowAmplitude = cp.amplitude + (np.amplitude - cp.amplitude) * tClamped;
    }
  }

  const dotY = amplitudeToY(nowAmplitude);
  ctx.beginPath();
  ctx.arc(nowX, dotY, 3, 0, 2 * Math.PI);
  ctx.fillStyle = '#EF4444';
  ctx.fill();
}

// ── Cam Sparkgraph ─────────────────────────────────────────────────────

/**
 * Draw a cam sparkgraph with the cam rotating and a fixed follower at 12 o'clock.
 *
 * @param ctx        Canvas 2D rendering context
 * @param camShapeData  Cam shape data from generateCamShape()
 * @param size       Canvas size in pixels (~32, square)
 * @param nowAngle   Playback position in degrees (undefined = static)
 * @param shaftShape Shaft hole shape (default 'circle')
 * @param shaftDiameter Shaft hole diameter in mm (default 6)
 */
export function drawCamSparkgraph(
  ctx: CanvasRenderingContext2D,
  camShapeData: CamShapeData,
  size: number,
  nowAngle?: number,
  shaftShape: ShaftShape = 'circle',
  shaftDiameter: number = 6,
): void {
  const { points, baseCircleRadius, maxRadius } = camShapeData;
  if (points.length === 0) return;

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const padding = 2;
  const availableRadius = (size / 2) - padding;

  // Scale factor: map maxRadius → availableRadius
  const scale = maxRadius > 0 ? availableRadius / maxRadius : 1;

  // Base rotation: -π/2 puts 0° at 12 o'clock (standard math has 0° at 3 o'clock)
  // Cam rotates by +nowAngle so the cam point at nowAngle arrives at 12 o'clock
  // (the follower stays fixed at 12 o'clock)
  const baseRotation = -Math.PI / 2;
  const rotationRad = baseRotation + (nowAngle !== undefined ? (nowAngle * Math.PI) / 180 : 0);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);

  // Draw base circle (dashed) — rotates with cam
  const basePixelRadius = baseCircleRadius * scale;
  ctx.beginPath();
  ctx.arc(0, 0, basePixelRadius, 0, 2 * Math.PI);
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw cam outline as filled polygon — rotates with cam
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = points[i].x * scale;
    const py = -points[i].y * scale; // flip y for screen coords
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();

  ctx.fillStyle = '#3B82F620';
  ctx.fill();
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw shaft hole — rotates with cam
  const shaftHolePoints = generateShaftHolePoints(shaftShape, shaftDiameter * scale);
  ctx.beginPath();
  for (let i = 0; i < shaftHolePoints.length; i++) {
    const px = shaftHolePoints[i].x;
    const py = shaftHolePoints[i].y;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  // Draw follower at 12 o'clock (FIXED, does not rotate)
  if (nowAngle !== undefined) {
    // Find the radius at the current angle
    const angleNorm = ((nowAngle % 360) + 360) % 360;
    let closestPoint = points[0];
    let minDiff = Infinity;
    for (const p of points) {
      const diff = Math.abs(p.angle - angleNorm);
      const diffWrap = Math.abs(p.angle - angleNorm + 360) % 360;
      const d = Math.min(diff, diffWrap);
      if (d < minDiff) {
        minDiff = d;
        closestPoint = p;
      }
    }

    const followerRadius = closestPoint.radius * scale;

    // 12 o'clock = top center = (cx, cy - followerRadius)
    const followerX = cx;
    const followerY = cy - followerRadius;

    // Draw follower dot
    ctx.beginPath();
    ctx.arc(followerX, followerY, 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#EF4444';
    ctx.fill();

    // Draw a thin guide line from center to follower
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(followerX, followerY);
    ctx.strokeStyle = '#EF444440';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}
