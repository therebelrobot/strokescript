import { describe, it, expect } from 'vitest';
import { parse } from '../index.js';

describe('integration', () => {
  it('parses [S3 D S0 D] end-to-end and returns valid Score with 4 segments', () => {
    const result = parse('[S3 D S0 D]');

    expect(result.score).not.toBeNull();
    const score = result.score!;
    expect(score.voices).toHaveLength(1);

    const voice = score.voices[0];
    expect(voice.segments).toHaveLength(4);
    expect(voice.totalArc).toBe(360);
    expect(voice.direction).toBe('CW');

    // Check segments
    expect(voice.segments[0].curveType).toBe('S');
    expect(voice.segments[0].amplitude).toBe(3);
    expect(voice.segments[1].curveType).toBe('D');
    expect(voice.segments[1].amplitude).toBe(3); // inherited
    expect(voice.segments[2].curveType).toBe('S');
    expect(voice.segments[2].amplitude).toBe(0);
    expect(voice.segments[3].curveType).toBe('D');
    expect(voice.segments[3].amplitude).toBe(0); // inherited

    // Arcs should sum to 360
    const totalArc = voice.segments.reduce((sum, s) => sum + s.arcDegrees, 0);
    expect(totalArc).toBeCloseTo(360, 5);
  });

  it('parses full score format', () => {
    const input = `rpm: 45
base: 15mm
max: 6mm
scale: shared
---
A: [S6 D6 S0 D0]
B: A@0.5`;

    const result = parse(input);
    expect(result.score).not.toBeNull();

    const score = result.score!;
    expect(score.metadata['rpm']).toBe(45);
    expect(score.metadata['scale']).toBe('shared');

    expect(score.voices).toHaveLength(2);
    expect(score.voices[0].name).toBe('A');
    expect(score.voices[1].name).toBe('B');

    // B is a phase-offset copy of A, segments sorted ascending by startAngle.
    // With 180° offset A's [180→270] wraps to [0→90], so first segment starts at 0.
    expect(score.voices[1].segments).toHaveLength(4);
    expect(score.voices[1].segments[0].startAngle).toBeCloseTo(0, 5);
    // A's first segment (S6 at [0→90]) appears at [180→270] in B
    const s6seg = score.voices[1].segments.find(
      (s) => s.startAngle >= 180 - 0.01 && s.startAngle <= 180 + 0.01,
    );
    expect(s6seg).toBeDefined();
    expect(s6seg!.curveType).toBe('S');
    expect(s6seg!.amplitude).toBe(6);
  });

  it('reports errors for invalid input', () => {
    const result = parse('???');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('parses shorthand notation end-to-end', () => {
    const result = parse('S3.D.L0.D');
    expect(result.score).not.toBeNull();

    const voice = result.score!.voices[0];
    expect(voice.segments).toHaveLength(4);
    expect(voice.segments[0].curveType).toBe('S');
    expect(voice.segments[2].curveType).toBe('L');
  });

  it('parses repeat notation end-to-end', () => {
    const result = parse('[S3 D]*4');
    expect(result.score).not.toBeNull();

    const voice = result.score!.voices[0];
    expect(voice.segments).toHaveLength(8); // 2 segments × 4 repeats
  });

  it('handles custom curves in score format', () => {
    const input = `@gentle = B(0.2, 0.0, 0.8, 1.0)
---
[@gentle:3 D3 S0 D0]`;

    const result = parse(input);
    expect(result.score).not.toBeNull();

    const voice = result.score!.voices[0];
    expect(voice.segments[0].curveType).toBe('gentle');
    expect(voice.segments[0].controlPoints).toEqual([0.2, 0.0, 0.8, 1.0]);
  });

  it('validates continuity and reports errors', () => {
    // D3 D0: dwell at 3 then dwell at 0 → discontinuity
    const result = parse('[D3 D0]');
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.some((e) => e.message.includes('discontinuity'))).toBe(true);
  });
});
