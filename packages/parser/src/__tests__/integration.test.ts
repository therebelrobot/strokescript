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

  it('parses a document containing # comments', () => {
    const input = [
      '# StrokeScript document with comments',
      'rpm: 45 # rotations per minute',
      'scale: shared # how voices relate',
      '---',
      '# define voice A',
      'A: [S3 D3 S0 D0] # basic sine wave',
    ].join('\n');

    const result = parse(input);
    expect(result.score).not.toBeNull();

    const score = result.score!;
    expect(score.metadata['rpm']).toBe(45);
    expect(score.metadata['scale']).toBe('shared');
    expect(score.scale).toBe('shared');
    expect(score.voices).toHaveLength(1);
    expect(score.voices[0].name).toBe('A');
    expect(score.voices[0].segments).toHaveLength(4);
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

  describe('shaft-origin end-to-end', () => {
    it('shaft-origin numeric value for hex is reflected in compiled score', () => {
      const input = `shaft: hex\nshaft-origin: 12\n---\n[S3 D S0 D]`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      expect(result.score!.shaftOrigin).toBe('12');
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('shaft-origin decimal value for oct is accepted', () => {
      const input = `shaft: oct\nshaft-origin: 1.5\n---\n[S3 D S0 D]`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      expect(result.score!.shaftOrigin).toBe('1.5');
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('shaft-origin with circle shaft produces a warning (not error)', () => {
      const input = `shaft: circle\nshaft-origin: 12\n---\n[S3 D S0 D]`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      const warnings = result.diagnostics.filter(
        (d) => d.severity === 'warning' && d.message.includes('no effect'),
      );
      expect(warnings).toHaveLength(1);
      const errors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('shaft-origin'),
      );
      expect(errors).toHaveLength(0);
    });

    it('invalid shaft-origin for hex produces an error', () => {
      // '3' is not in hex valid values ['12', '2', '4', '6', '8', '10']
      const input = `shaft: hex\nshaft-origin: 3\n---\n[S3 D S0 D]`;
      const result = parse(input);
      const errors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('shaft-origin'),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe(`shaft-origin '3' is not valid for shaft shape 'hex'`);
    });

    it('missing shaft-origin defaults to top-right for square', () => {
      const input = `shaft: square\nshaft-diameter: 6\n---\n[S3 D S0 D]`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      expect(result.score!.shaftOrigin).toBe('top-right');
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('missing shaft-origin defaults to 12 for hex', () => {
      const input = `shaft: hex\nshaft-diameter: 6\n---\n[S3 D S0 D]`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      expect(result.score!.shaftOrigin).toBe('12');
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('complex voice names end-to-end', () => {
    it('compiles a score with multi-letter voice name "cam"', () => {
      const result = parse('cam: [S3 D S0 D]');
      expect(result.score).not.toBeNull();
      expect(result.score!.voices).toHaveLength(1);
      expect(result.score!.voices[0].name).toBe('cam');
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('compiles a score with "cam1" voice name (non-primitive letter + digit)', () => {
      const result = parse('cam1: [S3 D S0 D]');
      expect(result.score).not.toBeNull();
      expect(result.score!.voices[0].name).toBe('cam1');
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('compiles a score with "s1" voice name containing uppercase primitives in the sequence', () => {
      // "s1" is lowercase → tokenises as IDENTIFIER "s1"; the colon makes it a named voice.
      // Inside the brackets, S8, S0 are UPPERCASE → PRIMITIVE+NUMBER, D → PRIMITIVE.
      const result = parse('s1: [S8 D S0 D]');
      expect(result.score).not.toBeNull();
      expect(result.score!.voices).toHaveLength(1);
      expect(result.score!.voices[0].name).toBe('s1');
      expect(result.score!.voices[0].segments).toHaveLength(4);
      // S8 segment: amplitude 8; D inherits; S0 amplitude 0; D inherits
      expect(result.score!.voices[0].segments[0].curveType).toBe('S');
      expect(result.score!.voices[0].segments[0].amplitude).toBe(8);
      expect(result.score!.voices[0].segments[1].curveType).toBe('D');
      expect(result.score!.voices[0].segments[2].curveType).toBe('S');
      expect(result.score!.voices[0].segments[2].amplitude).toBe(0);
      expect(result.score!.voices[0].segments[3].curveType).toBe('D');
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('produces a parse error for "S1:" as a voice name (primitive letter + digit)', () => {
      // S tokenises as PRIMITIVE; S1: must NOT be treated as a named voice declaration.
      const result = parse('S1: [S8 D S0 D]');
      expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      // The voice named "S1" must not appear in the compiled score
      if (result.score) {
        expect(result.score.voices.every((v) => v.name !== 'S1')).toBe(true);
      }
    });

    it('compiles a score with "voice_2" voice name (underscore + digit)', () => {
      const result = parse('voice_2: [S3 D S0 D]');
      expect(result.score).not.toBeNull();
      expect(result.score!.voices[0].name).toBe('voice_2');
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('compiles a full score with valid lowercase voice names and phase-offset reference', () => {
      const input = `rpm: 60
base: 20mm
max: 8mm
scale: independent
---
cam1: [S3 D S0 D]
a1: [D S3 D S0]
voice_2: cam1@0.25`;

      const result = parse(input);
      expect(result.score).not.toBeNull();
      const score = result.score!;

      expect(score.metadata['rpm']).toBe(60);
      expect(score.voices).toHaveLength(3);
      expect(score.voices[0].name).toBe('cam1');
      expect(score.voices[1].name).toBe('a1');
      expect(score.voices[2].name).toBe('voice_2');

      // voice_2 is a phase-offset copy of cam1 — should have 4 compiled segments
      expect(score.voices[2].segments).toHaveLength(4);

      // No errors
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('compiles a score with valid lowercase voice used as a phase-offset target "cam@0.5"', () => {
      const input = `cam: [S3 D S0 D]\nB: cam@0.5`;
      const result = parse(input);
      expect(result.score).not.toBeNull();
      expect(result.score!.voices).toHaveLength(2);
      expect(result.score!.voices[0].name).toBe('cam');
      expect(result.score!.voices[1].name).toBe('B');
      // B is a 180° offset of cam, so it has the same 4 segments
      expect(result.score!.voices[1].segments).toHaveLength(4);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });
  });
});
