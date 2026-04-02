/**
 * Curve interpolation functions for StrokeScript primitives.
 *
 * Each function computes the amplitude at parameter t (0→1) within a segment,
 * transitioning from prevAmplitude to targetAmplitude using the specified curve.
 */

/**
 * Solve a cubic Bézier defined by control points (x1,y1,x2,y2) using the
 * CSS cubic-bezier model: start (0,0), end (1,1), two interior controls.
 * Given an input x (time), returns the corresponding y (progress 0→1).
 *
 * Uses Newton's method with bisection fallback.
 */
function solveCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  // Clamp x to [0, 1]
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Bernstein coefficients for the x(t) polynomial:
  //   x(t) = 3*(1-t)^2*t*x1 + 3*(1-t)*t^2*x2 + t^3
  // Expanded: x(t) = (3*x1)*t - (6*x1 + 3*x2 - 3)*t^2 ... etc
  // We need to find t such that x(t) = x.

  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;

  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  function sampleX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleXDerivative(t: number): number {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  // Newton's method
  let t = x; // initial guess
  for (let i = 0; i < 8; i++) {
    const currentX = sampleX(t) - x;
    if (Math.abs(currentX) < 1e-7) {
      return sampleY(t);
    }
    const derivative = sampleXDerivative(t);
    if (Math.abs(derivative) < 1e-7) break;
    t -= currentX / derivative;
  }

  // Bisection fallback
  let lo = 0;
  let hi = 1;
  t = x;

  for (let i = 0; i < 20; i++) {
    const currentX = sampleX(t);
    if (Math.abs(currentX - x) < 1e-7) {
      return sampleY(t);
    }
    if (currentX < x) {
      lo = t;
    } else {
      hi = t;
    }
    t = (lo + hi) * 0.5;
  }

  return sampleY(t);
}

/**
 * Interpolate amplitude at parameter t within a segment.
 *
 * @param curveType - Primitive type letter (S, D, L, E, Q, H) or custom name
 * @param t - Normalised position within the segment, 0 to 1
 * @param prevAmplitude - Amplitude at the start of this segment (end of previous)
 * @param targetAmplitude - Target amplitude for this segment
 * @param controlPoints - Bézier control points for custom curves [x1, y1, x2, y2]
 * @returns Amplitude value at position t
 */
export function interpolate(
  curveType: string,
  t: number,
  prevAmplitude: number,
  targetAmplitude: number,
  controlPoints?: [number, number, number, number] | null,
): number {
  // Clamp t
  t = Math.max(0, Math.min(1, t));

  const delta = targetAmplitude - prevAmplitude;

  switch (curveType) {
    case 'S': {
      // Smooth sinusoidal rise/fall
      const progress = 0.5 * (1 - Math.cos(Math.PI * t));
      return prevAmplitude + delta * progress;
    }

    case 'D': {
      // Dwell — constant at target amplitude
      return targetAmplitude;
    }

    case 'L': {
      // Linear interpolation
      return prevAmplitude + delta * t;
    }

    case 'E': {
      // Smoothstep / Hermite ease in-out: 3t² - 2t³
      const progress = t * t * (3 - 2 * t);
      return prevAmplitude + delta * progress;
    }

    case 'Q': {
      // Quick/snap — fast initial ramp, easing at end: 1 - (1-t)³
      const progress = 1 - (1 - t) * (1 - t) * (1 - t);
      return prevAmplitude + delta * progress;
    }

    case 'H': {
      // Hold-step — holds previous value, jumps at very end
      return t < 1 ? prevAmplitude : targetAmplitude;
    }

    default: {
      // Custom Bézier curve
      if (controlPoints) {
        const [x1, y1, x2, y2] = controlPoints;
        const progress = solveCubicBezier(x1, y1, x2, y2, t);
        return prevAmplitude + delta * progress;
      }
      // Fallback to linear if no control points provided
      return prevAmplitude + delta * t;
    }
  }
}
