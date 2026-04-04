import { describe, it, expect } from 'vitest';
import { tokenize } from '../tokenizer.js';
import { parseTokens } from '../parser.js';
import type { SegmentNode, GroupNode } from '../types.js';

function parseInput(input: string) {
  const { tokens } = tokenize(input);
  return parseTokens(tokens);
}

describe('parser', () => {
  it('parses a simple sequence [S3 D S0 D]', () => {
    const { ast, diagnostics } = parseInput('[S3 D S0 D]');
    expect(diagnostics).toHaveLength(0);
    expect(ast.voices).toHaveLength(1);

    const voice = ast.voices[0];
    expect(voice.name).toBe('_default');
    expect(voice.body.kind).toBe('group');

    const group = voice.body as GroupNode;
    expect(group.segments).toHaveLength(4);

    const seg0 = group.segments[0] as SegmentNode;
    expect(seg0.curveType).toBe('S');
    expect(seg0.amplitude).toBe(3);

    const seg1 = group.segments[1] as SegmentNode;
    expect(seg1.curveType).toBe('D');
    expect(seg1.amplitude).toBeNull(); // D without value

    const seg2 = group.segments[2] as SegmentNode;
    expect(seg2.curveType).toBe('S');
    expect(seg2.amplitude).toBe(0);

    const seg3 = group.segments[3] as SegmentNode;
    expect(seg3.curveType).toBe('D');
    expect(seg3.amplitude).toBeNull();
  });

  it('parses weighted segments: [S3@2 D L0]', () => {
    const { ast, diagnostics } = parseInput('[S3@2 D L0]');
    expect(diagnostics).toHaveLength(0);

    const group = ast.voices[0].body as GroupNode;
    const seg0 = group.segments[0] as SegmentNode;
    expect(seg0.curveType).toBe('S');
    expect(seg0.amplitude).toBe(3);
    expect(seg0.weight).toBe(2);

    const seg1 = group.segments[1] as SegmentNode;
    expect(seg1.weight).toBe(1); // default weight
  });

  it('parses nested groups: [S3 [L1 D1] S0]', () => {
    const { ast, diagnostics } = parseInput('[S3 [L1 D1] S0]');
    expect(diagnostics).toHaveLength(0);

    const group = ast.voices[0].body as GroupNode;
    expect(group.segments).toHaveLength(3);

    // Middle element should be a nested group
    const nested = group.segments[1] as GroupNode;
    expect(nested.kind).toBe('group');
    expect(nested.segments).toHaveLength(2);
  });

  it('parses repeats: [S3 D]*4', () => {
    const { ast, diagnostics } = parseInput('[S3 D]*4');
    expect(diagnostics).toHaveLength(0);

    const group = ast.voices[0].body as GroupNode;
    expect(group.repeat).toBe(4);
    expect(group.segments).toHaveLength(2);
  });

  it('parses shorthand notation: S3.D.L0.D', () => {
    const { ast, diagnostics } = parseInput('S3.D.L0.D');
    expect(diagnostics).toHaveLength(0);

    const group = ast.voices[0].body as GroupNode;
    expect(group.segments).toHaveLength(4);

    const seg0 = group.segments[0] as SegmentNode;
    expect(seg0.curveType).toBe('S');
    expect(seg0.amplitude).toBe(3);
  });

  it('parses score format with header', () => {
    const input = `rpm: 33
base: 20mm
---
A: [S3 D S0 D]
B: A@0.5`;

    const { ast, diagnostics } = parseInput(input);

    // Header
    expect(ast.header).not.toBeNull();
    expect(ast.header!.metadata['rpm']).toBe(33);
    expect(ast.header!.metadata['base']).toBe(20);

    // Voices
    expect(ast.voices).toHaveLength(2);
    expect(ast.voices[0].name).toBe('A');
    expect(ast.voices[1].name).toBe('B');
    expect(ast.voices[1].body.kind).toBe('reference');
  });

  it('parses named voices', () => {
    const input = `A: [S3 D S0 D]\nB: [D S3 D S0]`;
    const { ast, diagnostics } = parseInput(input);
    expect(diagnostics).toHaveLength(0);
    expect(ast.voices).toHaveLength(2);
    expect(ast.voices[0].name).toBe('A');
    expect(ast.voices[1].name).toBe('B');
  });

  it('parses direction markers', () => {
    const { ast, diagnostics } = parseInput('[Q3 D S0 D] CW');
    expect(diagnostics).toHaveLength(0);
    expect(ast.voices[0].direction).toBe('CW');
  });

  it('parses custom curve references: [@gentle:3 D S0 D]', () => {
    const { ast, diagnostics } = parseInput('[@gentle:3 D S0 D]');
    expect(diagnostics).toHaveLength(0);

    const group = ast.voices[0].body as GroupNode;
    const seg0 = group.segments[0] as SegmentNode;
    expect(seg0.type).toBe('custom');
    expect(seg0.curveType).toBe('gentle');
    expect(seg0.amplitude).toBe(3);
  });

  describe('shaft-origin header parsing', () => {
    it('parses shaft-origin with numeric clock position', () => {
      const input = `shaft: hex\nshaft-origin: 12\n---\n[S3 D S0 D]`;
      const { ast } = parseInput(input);
      expect(ast.header).not.toBeNull();
      // 12 is a valid number, stored as number
      expect(ast.header!.metadata['shaft-origin']).toBe(12);
    });

    it('parses shaft-origin with decimal clock position', () => {
      const input = `shaft: oct\nshaft-origin: 1.5\n---\n[S3 D S0 D]`;
      const { ast } = parseInput(input);
      expect(ast.header).not.toBeNull();
      expect(ast.header!.metadata['shaft-origin']).toBe(1.5);
    });

    it('parses shaft-origin with hyphenated value and normalises it', () => {
      const input = `shaft: square\nshaft-origin: top-right\n---\n[S3 D S0 D]`;
      const { ast } = parseInput(input);
      expect(ast.header).not.toBeNull();
      // Value should be normalised from "top - right" to "top-right"
      expect(ast.header!.metadata['shaft-origin']).toBe('top-right');
    });

    it('parses shaft-origin alongside shaft and shaft-diameter', () => {
      const input = `shaft: hex\nshaft-diameter: 8\nshaft-origin: 6\n---\n[S3 D S0 D]`;
      const { ast } = parseInput(input);
      expect(ast.header).not.toBeNull();
      expect(ast.header!.metadata['shaft']).toBe('hex');
      expect(ast.header!.metadata['shaft-diameter']).toBe(8);
      expect(ast.header!.metadata['shaft-origin']).toBe(6);
    });
  });

  describe('complex voice names', () => {
    it('parses a multi-letter voice name "cam"', () => {
      const { ast, diagnostics } = parseInput('cam: [S3 D S0 D]');
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(1);
      expect(ast.voices[0].name).toBe('cam');
    });

    it('parses a voice name with trailing digit "cam1"', () => {
      const { ast, diagnostics } = parseInput('cam1: [S3 D S0 D]');
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(1);
      expect(ast.voices[0].name).toBe('cam1');
    });

    it('parses a voice name with underscore "voice_2"', () => {
      const { ast, diagnostics } = parseInput('voice_2: [S3 D S0 D]');
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(1);
      expect(ast.voices[0].name).toBe('voice_2');
    });

    it('parses a non-primitive letter + digit voice name "A1"', () => {
      const { ast, diagnostics } = parseInput('A1: [S3 D S0 D]');
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(1);
      expect(ast.voices[0].name).toBe('A1');
    });

    it('parses a score with multiple valid lowercase voice names', () => {
      const input = `cam1: [S3 D S0 D]\nvoice_2: [S3 D S0 D]\na1: [D S3 D S0]`;
      const { ast, diagnostics } = parseInput(input);
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(3);
      expect(ast.voices[0].name).toBe('cam1');
      expect(ast.voices[1].name).toBe('voice_2');
      expect(ast.voices[2].name).toBe('a1');
    });

    it('produces errors for primitive-letter + digit as voice name (e.g. "S1:", "D2:")', () => {
      // S tokenises as PRIMITIVE — S1: must NOT be treated as a named voice
      const { ast: ast1, diagnostics: d1 } = parseInput('S1: [S3 D S0 D]');
      expect(d1.some((d) => d.severity === 'error')).toBe(true);
      expect(ast1.voices.every((v) => v.name !== 'S1')).toBe(true);

      const { ast: ast2, diagnostics: d2 } = parseInput('D2: [S3 D S0 D]');
      expect(d2.some((d) => d.severity === 'error')).toBe(true);
      expect(ast2.voices.every((v) => v.name !== 'D2')).toBe(true);
    });

    it('parses a phase-offset reference targeting a valid lowercase voice "cam@0.5"', () => {
      const input = `cam: [S3 D S0 D]\nB: cam@0.5`;
      const { ast, diagnostics } = parseInput(input);
      expect(diagnostics).toHaveLength(0);
      expect(ast.voices).toHaveLength(2);
      expect(ast.voices[1].body.kind).toBe('reference');
    });
  });
});
