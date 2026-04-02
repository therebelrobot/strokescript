import { describe, it, expect } from 'vitest';
import { tokenize } from '../tokenizer.js';
import { parseTokens } from '../parser.js';
import { compile } from '../compiler.js';

function compileInput(input: string) {
  const { tokens } = tokenize(input);
  const { ast } = parseTokens(tokens);
  return compile(ast);
}

describe('compiler', () => {
  it('compiles flat sequence: 4 equal segments → 90° each', () => {
    const { score, diagnostics } = compileInput('[S3 D S0 D]');

    const voice = score.voices[0];
    expect(voice.segments).toHaveLength(4);

    for (const seg of voice.segments) {
      expect(seg.arcDegrees).toBeCloseTo(90, 5);
    }

    // Check arc assignments
    expect(voice.segments[0].startAngle).toBeCloseTo(0, 5);
    expect(voice.segments[0].endAngle).toBeCloseTo(90, 5);
    expect(voice.segments[1].startAngle).toBeCloseTo(90, 5);
    expect(voice.segments[1].endAngle).toBeCloseTo(180, 5);
    expect(voice.segments[2].startAngle).toBeCloseTo(180, 5);
    expect(voice.segments[2].endAngle).toBeCloseTo(270, 5);
    expect(voice.segments[3].startAngle).toBeCloseTo(270, 5);
    expect(voice.segments[3].endAngle).toBeCloseTo(360, 5);
  });

  it('compiles weighted segments: S3@2 D@1 → 240° + 120°', () => {
    const { score } = compileInput('[S3@2 D@1]');
    const voice = score.voices[0];
    expect(voice.segments).toHaveLength(2);
    expect(voice.segments[0].arcDegrees).toBeCloseTo(240, 5);
    expect(voice.segments[1].arcDegrees).toBeCloseTo(120, 5);
  });

  it('expands repeats: [S3 D]*4 → 8 segments', () => {
    const { score } = compileInput('[S3 D]*4');
    const voice = score.voices[0];
    expect(voice.segments).toHaveLength(8);

    // Each of the 8 segments should get 45°
    for (const seg of voice.segments) {
      expect(seg.arcDegrees).toBeCloseTo(45, 5);
    }
  });

  it('flattens nested groups', () => {
    const { score } = compileInput('[S3 [L1 D1] S0]');
    const voice = score.voices[0];

    // S3 takes 1/3 (120°), nested group takes 1/3 (120° split into 2×60°), S0 takes 1/3 (120°)
    expect(voice.segments).toHaveLength(4);
    expect(voice.segments[0].arcDegrees).toBeCloseTo(120, 5); // S3
    expect(voice.segments[1].arcDegrees).toBeCloseTo(60, 5); // L1 (half of nested)
    expect(voice.segments[2].arcDegrees).toBeCloseTo(60, 5); // D1 (half of nested)
    expect(voice.segments[3].arcDegrees).toBeCloseTo(120, 5); // S0
  });

  it('resolves voice references with phase offset', () => {
    const input = `A: [S3 D S0 D]\nB: A@0.5`;
    const { score, diagnostics } = compileInput(input);

    expect(score.voices).toHaveLength(2);
    const voiceA = score.voices[0];
    const voiceB = score.voices[1];

    // B should have same number of segments as A
    expect(voiceB.segments).toHaveLength(voiceA.segments.length);

    // B's segments should be sorted ascending by startAngle.
    // With a 180° offset, A's segment at [180°→270°] wraps to [0°→90°],
    // so the first segment of B starts at 0°.
    expect(voiceB.segments[0].startAngle).toBeCloseTo(0, 5);
    expect(voiceB.segments[0].endAngle).toBeCloseTo(90, 5);

    // A's first segment (S3 at [0°→90°]) should appear at [180°→270°] in B
    const s3seg = voiceB.segments.find(
      (s) => s.startAngle >= 180 - 0.01 && s.startAngle <= 180 + 0.01,
    );
    expect(s3seg).toBeDefined();
    expect(s3seg!.curveType).toBe('S');
    expect(s3seg!.amplitude).toBe(3);
    expect(s3seg!.endAngle).toBeCloseTo(270, 5);
  });

  it('resolves D amplitude inheritance', () => {
    const { score } = compileInput('[S3 D S0 D]');
    const voice = score.voices[0];

    expect(voice.segments[0].amplitude).toBe(3); // S3
    expect(voice.segments[1].amplitude).toBe(3); // D inherits from S3
    expect(voice.segments[2].amplitude).toBe(0); // S0
    expect(voice.segments[3].amplitude).toBe(0); // D inherits from S0
  });

  it('compiles metadata from header', () => {
    const input = `rpm: 33\nbase: 20mm\n---\n[S3 D S0 D]`;
    const { score } = compileInput(input);
    expect(score.metadata['rpm']).toBe(33);
    expect(score.metadata['base']).toBe(20);
  });

  it('extracts shaft and shaft-diameter from metadata', () => {
    const input = `shaft: hex\nshaft-diameter: 8\n---\n[S3 D S0 D]`;
    const { score, diagnostics } = compileInput(input);
    expect(score.shaft).toBe('hex');
    expect(score.shaftDiameter).toBe(8);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('defaults shaft to circle and shaftDiameter to 6 when not specified', () => {
    const { score } = compileInput('[S3 D S0 D]');
    expect(score.shaft).toBe('circle');
    expect(score.shaftDiameter).toBe(6);
  });

  it('produces diagnostic for invalid shaft shape', () => {
    const input = `shaft: star\n---\n[S3 D S0 D]`;
    const { diagnostics } = compileInput(input);
    const shaftErrors = diagnostics.filter((d) => d.message.includes('Invalid shaft shape'));
    expect(shaftErrors).toHaveLength(1);
    expect(shaftErrors[0].severity).toBe('error');
  });
});
