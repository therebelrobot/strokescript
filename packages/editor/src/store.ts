import { create } from 'zustand';
import { parse } from '@strokescript/parser';
import type { ParseResult, Voice, ShaftShape } from '@strokescript/parser';

const DEFAULT_SOURCE = 'A: [S3 D S0 D]';

export interface EditorState {
  // Source text
  source: string;
  setSource: (source: string) => void;

  // Parse result (cached)
  parseResult: ParseResult | null;

  // Playback state
  isPlaying: boolean;
  currentAngle: number; // 0-360
  rpm: number;
  setRpm: (rpm: number) => void;
  setAngle: (angle: number) => void;
  play: () => void;
  stop: () => void;
  tick: (deltaMs: number) => void;

  // UI state
  expandedVoice: string | null;
  setExpandedVoice: (name: string | null) => void;

  // Sidebar state
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  baseRadius: number;
  setBaseRadius: (r: number) => void;

  // Shaft hole state
  shaftShape: ShaftShape;
  shaftDiameter: number;
  setShaftShape: (shape: ShaftShape) => void;
  setShaftDiameter: (d: number) => void;
}

/**
 * Given an angle and a voice, return the index of the active segment
 * (the segment whose startAngle..endAngle range contains the angle).
 * Returns -1 if no segment matches.
 */
export function getActiveSegmentIndex(voice: Voice, angle: number): number {
  const normAngle = ((angle % 360) + 360) % 360;
  for (let i = 0; i < voice.segments.length; i++) {
    const seg = voice.segments[i];
    if (normAngle >= seg.startAngle && normAngle < seg.endAngle) {
      return i;
    }
  }
  // Edge case: angle is exactly 360 (or 0 after wrap) — belongs to last segment
  if (voice.segments.length > 0) {
    const last = voice.segments[voice.segments.length - 1];
    if (normAngle >= last.startAngle && normAngle <= last.endAngle) {
      return voice.segments.length - 1;
    }
  }
  return -1;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  source: DEFAULT_SOURCE,
  parseResult: parse(DEFAULT_SOURCE),

  setSource: (source: string) => {
    let parseResult: ParseResult | null = null;
    try {
      parseResult = parse(source);
    } catch {
      parseResult = { score: null, diagnostics: [] };
    }
    // Sync sidebar settings from parsed score metadata
    const updates: Partial<EditorState> = { source, parseResult };
    if (parseResult?.score) {
      updates.shaftShape = parseResult.score.shaft;
      updates.shaftDiameter = parseResult.score.shaftDiameter;
      const meta = parseResult.score.metadata;
      if (typeof meta['rpm'] === 'number') {
        updates.rpm = meta['rpm'];
      }
      if (typeof meta['base'] === 'number') {
        updates.baseRadius = meta['base'];
      }
    }
    set(updates);
  },

  isPlaying: false,
  currentAngle: 0,
  rpm: 60,

  setRpm: (rpm: number) => set({ rpm }),

  setAngle: (angle: number) => {
    set({ currentAngle: ((angle % 360) + 360) % 360 });
  },

  play: () => set({ isPlaying: true }),

  stop: () => set({ isPlaying: false, currentAngle: 0 }),

  tick: (deltaMs: number) => {
    const { rpm, currentAngle } = get();
    // degrees per second = rpm / 60 * 360
    const degreesPerMs = (rpm / 60) * 360 / 1000;
    const newAngle = (currentAngle + degreesPerMs * deltaMs) % 360;
    set({ currentAngle: newAngle });
  },

  expandedVoice: null,
  setExpandedVoice: (name: string | null) => set({ expandedVoice: name }),

  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  baseRadius: 10,
  setBaseRadius: (r: number) => set({ baseRadius: r }),

  // Shaft hole state
  shaftShape: 'circle' as ShaftShape,
  shaftDiameter: 6,
  setShaftShape: (shape: ShaftShape) => set({ shaftShape: shape }),
  setShaftDiameter: (d: number) => set({ shaftDiameter: d }),
}));
