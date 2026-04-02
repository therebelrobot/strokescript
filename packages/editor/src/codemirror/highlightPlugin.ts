/**
 * CodeMirror 6 plugin for highlighting the currently active segment text
 * during playback.
 *
 * During playback, determines which segment is active based on currentAngle,
 * maps it back to source text positions, and applies a Decoration.mark()
 * with a CSS class for visual highlighting.
 */

import {
  ViewPlugin,
  type ViewUpdate,
  Decoration,
  type DecorationSet,
  type EditorView,
} from '@codemirror/view';
import { type Extension, StateEffect } from '@codemirror/state';
import { useEditorStore, getActiveSegmentIndex } from '../store.js';

// ── State effect for triggering highlight updates ──────────────────────

export const highlightUpdateEffect = StateEffect.define<void>();

// ── Segment text detection ─────────────────────────────────────────────

/**
 * Regex to detect voice definition lines like "A: [S3 D S0 D]"
 * Captures the voice name.
 */
const VOICE_LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/;

/**
 * Given a voice line's text content (after the "A: " prefix), find the
 * character ranges of each segment token in the bracket body.
 *
 * For "A: [S3 D S0 D]", this finds the positions of "S3", "D", "S0", "D"
 * within the full line text.
 */
function findSegmentRanges(lineText: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  // Find the bracket body
  const bracketStart = lineText.indexOf('[');
  if (bracketStart === -1) return ranges;

  // Match segment tokens within brackets: S3, D, S0, L2, E5, Q3, H, D0, etc.
  // Also handles custom curve references like @gentle:2
  const segmentTokenRe = /(@?[A-Za-z_][A-Za-z0-9_]*(?::[\d.]+)?[\d.]*|[SDLEQH][\d.]*)/g;

  // Only search within the brackets content
  const bodyStart = bracketStart + 1;
  const bracketEnd = lineText.indexOf(']', bodyStart);
  const body = bracketEnd !== -1 ? lineText.slice(bodyStart, bracketEnd) : lineText.slice(bodyStart);

  let match: RegExpExecArray | null;
  while ((match = segmentTokenRe.exec(body)) !== null) {
    ranges.push({
      from: bodyStart + match.index,
      to: bodyStart + match.index + match[0].length,
    });
  }

  return ranges;
}

// ── Build decorations ──────────────────────────────────────────────────

function buildHighlightDecorations(view: EditorView): DecorationSet {
  const state = useEditorStore.getState();
  const { currentAngle, isPlaying, parseResult } = state;

  // Only highlight during playback or when scrubbing (angle > 0)
  if (!isPlaying && currentAngle === 0) {
    return Decoration.none;
  }

  const voices = parseResult?.score?.voices ?? [];
  if (voices.length === 0) {
    return Decoration.none;
  }

  const marks: Array<{ from: number; to: number }> = [];

  // Scan each line for voice definitions
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    const match = line.text.match(VOICE_LINE_RE);
    if (!match) continue;

    const voiceName = match[1];
    const voice = voices.find((v) => v.name === voiceName);
    if (!voice) continue;

    const activeIdx = getActiveSegmentIndex(voice, currentAngle);
    if (activeIdx < 0) continue;

    // Find segment token ranges in this line
    const segRanges = findSegmentRanges(line.text);
    if (activeIdx < segRanges.length) {
      const range = segRanges[activeIdx];
      marks.push({
        from: line.from + range.from,
        to: line.from + range.to,
      });
    }
  }

  if (marks.length === 0) {
    return Decoration.none;
  }

  // Sort by position
  marks.sort((a, b) => a.from - b.from);

  const activeSegmentMark = Decoration.mark({
    class: 'cm-active-segment',
  });

  return Decoration.set(
    marks.map((m) => activeSegmentMark.range(m.from, m.to)),
  );
}

// ── ViewPlugin ─────────────────────────────────────────────────────────

const highlightViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildHighlightDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = buildHighlightDecorations(update.view);
        return;
      }

      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(highlightUpdateEffect)) {
            this.decorations = buildHighlightDecorations(update.view);
            return;
          }
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// ── Export ──────────────────────────────────────────────────────────────

export function highlightExtension(): Extension {
  return [highlightViewPlugin];
}
