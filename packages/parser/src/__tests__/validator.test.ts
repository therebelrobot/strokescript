import { describe, it, expect } from 'vitest';
import { tokenize } from '../tokenizer.js';
import { parseTokens } from '../parser.js';
import { compile } from '../compiler.js';
import { validate } from '../validator.js';
import type { Score } from '../types.js';

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

  it('detects discontinuity in [D3 D0] (dwell jump)', () => {
    // D3 holds at 3, D0 holds at 0 → boundary discontinuity 3→0
    const diagnostics = validateInput('[D3 D0]');
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('discontinuity');
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
});
