import { create } from 'zustand';
import { parse } from '@strokescript/parser';
import type { ParseResult, Voice, ShaftShape } from '@strokescript/parser';
import { updateMetadata, removeMetadata } from './utils/sourceUpdater';

const DEFAULT_SOURCE = 'A: [S3 D S0 D]';
const STORAGE_KEY = 'strokescript-score';

interface PersistedState {
  source: string;
  parseResult: ParseResult | null;
  kerfOffset: number;
}

function loadPersistedState(): PersistedState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as PersistedState;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

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
  max: number;
  setMax: (max: number) => void;
  scale: 'shared' | 'independent';
  setScale: (scale: 'shared' | 'independent') => void;

  // Global score header fields
  version: string;
  setVersion: (version: string) => void;
  title: string;
  setTitle: (title: string) => void;
  gap: number;
  setGap: (gap: number) => void;
  ppu: number;
  setPpu: (ppu: number) => void;

  // Shaft hole state
  shaftShape: ShaftShape;
  shaftDiameter: number;
  shaftOrigin: string;
  crossLegWidth: number;
  setShaftShape: (shape: ShaftShape) => void;
  setShaftDiameter: (d: number) => void;
  setShaftOrigin: (origin: string) => void;
  setCrossLegWidth: (w: number) => void;

  // Kerf offset for laser cutting compensation (§8)
  // Subtracted from internal cuts (shaft holes shrink)
  // Added to external cuts (cam outlines expand)
  kerfOffset: number;
  setKerfOffset: (offset: number) => void;

  // Export annotation state
  protractorMarks: boolean;
  showOriginalNotation: boolean;
  showDotNotation: boolean;
  setProtractorMarks: (v: boolean) => void;
  setShowOriginalNotation: (v: boolean) => void;
  setShowDotNotation: (v: boolean) => void;
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

// Load persisted state or fall back to defaults
const persistedState = loadPersistedState();
const initialSource = persistedState?.source ?? DEFAULT_SOURCE;
const initialParseResult = persistedState?.parseResult ?? parse(DEFAULT_SOURCE);
const initialKerfOffset = persistedState?.kerfOffset ?? 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  source: initialSource,
  parseResult: initialParseResult,
  kerfOffset: initialKerfOffset,

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
      updates.shaftOrigin = parseResult.score.shaftOrigin ?? '';
      updates.crossLegWidth = parseResult.score.crossLegWidth ?? 2;
      const meta = parseResult.score.metadata;
      if (typeof meta['rpm'] === 'number') {
        updates.rpm = meta['rpm'];
      }
      if (typeof meta['base'] === 'number') {
        updates.baseRadius = meta['base'];
      }
      if (typeof meta['max'] === 'number') {
        updates.max = meta['max'];
      }
      if (meta['scale'] === 'shared' || meta['scale'] === 'independent') {
        updates.scale = meta['scale'] as 'shared' | 'independent';
      }
      if (typeof meta['version'] === 'string' || typeof meta['version'] === 'number') {
        updates.version = String(meta['version']);
      }
      if (typeof meta['title'] === 'string' || typeof meta['title'] === 'number') {
        updates.title = String(meta['title']);
      }
      if (typeof meta['gap'] === 'number') {
        updates.gap = meta['gap'];
      }
      if (typeof meta['ppu'] === 'number') {
        updates.ppu = meta['ppu'];
      }
      if (typeof meta['kerfOffset'] === 'number') {
        updates.kerfOffset = meta['kerfOffset'];
      } else {
        updates.kerfOffset = 0;
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
  max: 0,
  setMax: (max: number) => set({ max }),
  scale: 'shared' as 'shared' | 'independent',
  setScale: (scale: 'shared' | 'independent') => set({ scale }),

  // Global score header fields
  version: '',
  setVersion: (version: string) => set({ version }),
  title: '',
  setTitle: (title: string) => set({ title }),
  gap: 0,
  setGap: (gap: number) => set({ gap }),
  ppu: 0,
  setPpu: (ppu: number) => set({ ppu }),

  // Shaft hole state
  shaftShape: 'circle' as ShaftShape,
  shaftDiameter: 6,
  shaftOrigin: '',
  crossLegWidth: 2,
  setShaftShape: (shape: ShaftShape) => set({ shaftShape: shape }),
  setShaftDiameter: (d: number) => set({ shaftDiameter: d }),
  setShaftOrigin: (origin: string) => set({ shaftOrigin: origin }),
  setCrossLegWidth: (w: number) => set({ crossLegWidth: w }),

  // Kerf offset for laser cutting compensation (§8)
  setKerfOffset: (offset: number) => {
    const clampedOffset = Math.max(0, offset);
    set({ kerfOffset: clampedOffset });
    // Also update the source so the setting is persisted in the document
    const { source } = get();
    if (clampedOffset > 0) {
      set({ source: updateMetadata(source, 'kerfOffset', clampedOffset.toString()) });
    } else {
      // Remove the line from source when kerfOffset is 0
      set({ source: removeMetadata(source, 'kerfOffset') });
    }
  },

  // Export annotation state
  protractorMarks: false,
  showOriginalNotation: false,
  showDotNotation: false,
  setProtractorMarks: (v: boolean) => set({ protractorMarks: v }),
  setShowOriginalNotation: (v: boolean) => set({ showOriginalNotation: v }),
  setShowDotNotation: (v: boolean) => set({ showDotNotation: v }),
}));

// Persist score state to localStorage on changes
useEditorStore.subscribe((state) => {
  try {
    const toPersist: PersistedState = {
      source: state.source,
      parseResult: state.parseResult,
      kerfOffset: state.kerfOffset,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
});
