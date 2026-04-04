import { describe, it, expect } from 'vitest';
import { tokenize } from '../tokenizer.js';
import { parseTokens } from '../parser.js';
import { compile } from '../compiler.js';
import { validate } from '../validator.js';
import type { Score } from '../types.js';

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    metadata: {},
    shaft: 'circle',
    shaftDiameter: 6,
    voices: [],
    ...overrides,
  };
}

function validateInput(input: string) {
  const { tokens } = tokenize(input);
  const { ast } = parseTokens(tokens);
  const { score } = compile(ast);
  return validate(score);
}

describe('validator', () => {
  it('passes a valid continuous sequence: [S3 D3 S0 D0]', () => {
    const diagnostics = validateInput('[S3 D3 S0 D0]');
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('detects segment-boundary drop in [D3 D0] as a warning, not an error', () => {
    // D3 holds at 3, D0 holds at 0 → segment-boundary drop (3→0) → warning
    // (There is also a seam rise 0→3 which is legitimately an error, tested separately)
    const diagnostics = validateInput('[D3 D0]');
    const segBoundaryErrors = diagnostics.filter(
      (d) => d.severity === 'error' && d.message.includes('segment boundary')
    );
    const segBoundaryWarnings = diagnostics.filter(
      (d) => d.severity === 'warning' && d.message.includes('discontinuity')
    );
    expect(segBoundaryErrors).toHaveLength(0);
    expect(segBoundaryWarnings.length).toBeGreaterThan(0);
    expect(segBoundaryWarnings[0].message).toContain('discontinuity');
  });

  it('[Q8 D0]*2 compiles without errors (drops are valid quick-strike patterns)', () => {
    // Q8 snaps to 8, D0 dwells at 0 — the 8→0 drop is intentional and must not error
    const diagnostics = validateInput('[Q8 D0]*2');
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('[Q4 D8]*2 is an error (instantaneous rise is not valid)', () => {
    // Q4 snaps to 4, D8 dwells at 8 — the 4→8 rise at the segment boundary is invalid
    const diagnostics = validateInput('[Q4 D8]*2');
    const errors = diagnostics.filter(
      (d) => d.severity === 'error' && d.message.includes('discontinuity')
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows H segments to be discontinuous', () => {
    // H3: jump to 3, D3: hold at 3, H0: jump to 0, D0: hold at 0
    const diagnostics = validateInput('[H3 D3 H0 D0]');
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('validates seam closure: [S3 D3 S0 D0] closes properly', () => {
    const diagnostics = validateInput('[S3 D3 S0 D0]');
    const seamErrors = diagnostics.filter(
      (d) => d.severity === 'error' && d.message.includes('seam')
    );
    expect(seamErrors).toHaveLength(0);
  });

  it('detects negative amplitudes', () => {
    const score: Score = {
      metadata: {},
      shaft: 'circle',
      shaftDiameter: 6,
      voices: [
        {
          name: 'test',
          segments: [
            {
              curveType: 'S',
              amplitude: -1,
              startAngle: 0,
              endAngle: 360,
              arcDegrees: 360,
              controlPoints: null,
            },
          ],
          direction: 'CW',
          totalArc: 360 as const,
        },
      ],
    };
    const diagnostics = validate(score);
    const errors = diagnostics.filter((d) => d.message.includes('negative'));
    expect(errors.length).toBeGreaterThan(0);
  });

  describe('shaft-origin validation', () => {
    it('warns when shaft-origin is specified with circle shaft', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': 'top-right' },
        shaft: 'circle',
        shaftOrigin: 'top-right',
      });
      const diagnostics = validate(score);
      const warnings = diagnostics.filter((d) => d.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].message).toContain('no effect');
    });

    it('does not error (only warns) when shaft-origin is used with circle', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': '12' },
        shaft: 'circle',
        shaftOrigin: '12',
      });
      const diagnostics = validate(score);
      const errors = diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('shaft-origin'),
      );
      expect(errors).toHaveLength(0);
    });

    it('errors when shaft-origin value is invalid for hex shape', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': 'top-right' },
        shaft: 'hex',
        shaftDiameter: 6,
        shaftOrigin: 'top-right',
      });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe(
        `shaft-origin 'top-right' is not valid for shaft shape 'hex'`,
      );
    });

    it('passes when shaft-origin value is valid for hex (clock 12)', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': 12 },
        shaft: 'hex',
        shaftDiameter: 6,
        shaftOrigin: '12',
      });
      const diagnostics = validate(score);
      const errors = diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('shaft-origin'),
      );
      expect(errors).toHaveLength(0);
    });

    it('passes when shaft-origin value is valid for square (top-left)', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': 'top-left' },
        shaft: 'square',
        shaftDiameter: 6,
        shaftOrigin: 'top-left',
      });
      const diagnostics = validate(score);
      const errors = diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('shaft-origin'),
      );
      expect(errors).toHaveLength(0);
    });

    it('errors with correct message format for invalid value', () => {
      const score = makeScore({
        metadata: { 'shaft-origin': '3' },
        shaft: 'hex',
        shaftDiameter: 6,
        shaftOrigin: '3',
      });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(`shaft-origin '3' is not valid for shaft shape 'hex'`);
    });

    it('does not produce shaft-origin diagnostic when not explicitly set', () => {
      const score = makeScore({
        metadata: {},
        shaft: 'hex',
        shaftDiameter: 6,
        shaftOrigin: '12',
      });
      const diagnostics = validate(score);
      const originDiag = diagnostics.filter((d) => d.message.includes('shaft-origin'));
      expect(originDiag).toHaveLength(0);
    });
  });

  describe('scale validation', () => {
    it('passes when scale is "shared"', () => {
      const score = makeScore({ metadata: { scale: 'shared' } });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error' && d.message.includes('scale'));
      expect(errors).toHaveLength(0);
    });

    it('passes when scale is "independent"', () => {
      const score = makeScore({ metadata: { scale: 'independent' } });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error' && d.message.includes('scale'));
      expect(errors).toHaveLength(0);
    });

    it('passes when scale is not specified', () => {
      const score = makeScore({ metadata: {} });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.message.includes('scale'));
      expect(errors).toHaveLength(0);
    });

    it('errors when scale is a numeric value', () => {
      const score = makeScore({ metadata: { scale: 1 } });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error' && d.message.includes('scale'));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Invalid scale '1'");
    });

    it('errors when scale is an unrecognised string', () => {
      const score = makeScore({ metadata: { scale: 'global' } });
      const diagnostics = validate(score);
      const errors = diagnostics.filter((d) => d.severity === 'error' && d.message.includes('scale'));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Invalid scale 'global'");
      expect(errors[0].message).toContain("'shared' or 'independent'");
    });
  });
});
