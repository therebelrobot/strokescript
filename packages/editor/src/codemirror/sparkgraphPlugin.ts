// DEBUG: Click target diagnostics (set to false in production)
const DEBUG_CLICKS = false;
function debugClick(...args: unknown[]) {
  if (DEBUG_CLICKS) {
    console.log('[SparkgraphWidget]', ...args);
  }
}

/**
 * CodeMirror 6 plugin that inserts inline sparkgraph widgets (waveform + cam)
 * at the end of each voice line inside the editor.
 *
 * The plugin listens for document changes, re-parses the source, and creates
 * Decoration.widget() decorations at the end of voice definition lines.
 * During playback, it redraws the sparkgraph canvases on each animation frame.
 */

import {
  ViewPlugin,
  type ViewUpdate,
  Decoration,
  type DecorationSet,
  WidgetType,
  type EditorView,
} from '@codemirror/view';
import { type Extension, StateEffect } from '@codemirror/state';
import type { Voice } from '@strokescript/parser';
import { generateWaveform, generateCamShape, drawWaveformSparkgraph, drawCamSparkgraph } from '../rendering/index.js';
import { useEditorStore } from '../store.js';

// ── State effect for external updates (playback angle changes) ─────────

export const sparkgraphUpdateEffect = StateEffect.define<void>();

// ── Widget ─────────────────────────────────────────────────────────────

const WAVEFORM_W = 160;
const WAVEFORM_H = 32;
const CAM_SIZE = 32;

class SparkgraphWidget extends WidgetType {
  constructor(
    readonly voice: Voice,
    readonly voiceName: string,
  ) {
    super();
  }

  eq(other: SparkgraphWidget): boolean {
    // Re-create when the voice name or segment count changes
    return (
      this.voiceName === other.voiceName &&
      this.voice.segments.length === other.voice.segments.length
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-sparkgraph-container';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.gap = '4px';
    container.style.marginLeft = '12px';
    container.style.verticalAlign = 'middle';
    container.style.cursor = 'pointer';
    // Increase touch target for mobile (44px minimum recommended)
    container.style.padding = '8px 6px';
    container.style.marginTop = '-6px';
    container.style.marginBottom = '-6px';
    container.style.borderRadius = '4px';

    // Click handler: toggle DetailPanel for this voice
    const voiceName = this.voiceName;
    container.addEventListener('click', (e) => {
      debugClick('📍 Click event:', {
        target: e.target,
        currentTarget: e.currentTarget,
        clientX: e.clientX,
        clientY: e.clientY,
        voiceName: this.voiceName,
      });
      e.preventDefault();
      e.stopPropagation();
      const store = useEditorStore.getState();
      if (store.expandedVoice === voiceName) {
        store.setExpandedVoice(null);
      } else {
        store.setExpandedVoice(voiceName);
      }
    });

    // Debug: track touch events for mobile
    container.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      debugClick('👆 Touch start:', {
        target: e.target,
        voiceName: this.voiceName,
        touchX: touch?.clientX,
        touchY: touch?.clientY,
        containerRect: container.getBoundingClientRect(),
      });
    }, { passive: true });

    // Waveform canvas
    const waveCanvas = document.createElement('canvas');
    waveCanvas.width = WAVEFORM_W;
    waveCanvas.height = WAVEFORM_H;
    waveCanvas.className = 'cm-sparkgraph-waveform';
    waveCanvas.dataset.voice = this.voiceName;
    container.appendChild(waveCanvas);

    // Cam canvas
    const camCanvas = document.createElement('canvas');
    camCanvas.width = CAM_SIZE;
    camCanvas.height = CAM_SIZE;
    camCanvas.className = 'cm-sparkgraph-cam';
    camCanvas.dataset.voice = this.voiceName;
    container.appendChild(camCanvas);

    // Initial draw
    this.drawSparkgraphs(waveCanvas, camCanvas);

    return container;
  }

  updateDOM(dom: HTMLElement): boolean {
    const waveCanvas = dom.querySelector('.cm-sparkgraph-waveform') as HTMLCanvasElement | null;
    const camCanvas = dom.querySelector('.cm-sparkgraph-cam') as HTMLCanvasElement | null;
    if (waveCanvas && camCanvas) {
      this.drawSparkgraphs(waveCanvas, camCanvas);
      return true;
    }
    return false;
  }

  private drawSparkgraphs(waveCanvas: HTMLCanvasElement, camCanvas: HTMLCanvasElement): void {
    const state = useEditorStore.getState();
    const nowAngle = state.isPlaying || state.currentAngle > 0
      ? state.currentAngle
      : undefined;

    // Waveform
    const wCtx = waveCanvas.getContext('2d');
    if (wCtx) {
      const waveformData = generateWaveform(this.voice, 2);
      let maxAmp = 0;
      for (const p of waveformData.points) {
        if (p.amplitude > maxAmp) maxAmp = p.amplitude;
      }
      if (maxAmp === 0) maxAmp = 1;
      drawWaveformSparkgraph(wCtx, waveformData, WAVEFORM_W, WAVEFORM_H, maxAmp, nowAngle);
    }

    // Cam
    const cCtx = camCanvas.getContext('2d');
    if (cCtx) {
      const waveformData = generateWaveform(this.voice, 2);
      let maxAmp = 0;
      for (const p of waveformData.points) {
        if (p.amplitude > maxAmp) maxAmp = p.amplitude;
      }
      const storeState = useEditorStore.getState();
      const camData = generateCamShape(waveformData, 10, maxAmp || 1);
      drawCamSparkgraph(cCtx, camData, CAM_SIZE, nowAngle, storeState.shaftShape, storeState.shaftDiameter, 2, false, 'hundredths');
    }
  }

  ignoreEvent(): boolean {
    // Return true to prevent CodeMirror from handling events on this widget
    // This ensures clicks go to our handler without CM moving cursor
    return true;
  }
}

// ── Voice line detection ───────────────────────────────────────────────

/**
 * Regex to detect voice definition lines like "A: [S3 D S0 D]"
 * Captures the voice name.
 */
const VOICE_LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/;

/**
 * Find voice decorations by matching editor lines to parsed voices.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const state = useEditorStore.getState();
  const parseResult = state.parseResult;
  const voices = parseResult?.score?.voices ?? [];

  if (voices.length === 0) {
    debugClick('📭 No voices to decorate');
    return Decoration.none;
  }

  // Build a map from voice name to Voice IR
  const voiceMap = new Map<string, Voice>();
  for (const v of voices) {
    voiceMap.set(v.name, v);
  }

  const decorations: Array<{ pos: number; widget: SparkgraphWidget }> = [];

  // Scan each line of the document
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    const match = line.text.match(VOICE_LINE_RE);
    if (match) {
      const voiceName = match[1];
      const voice = voiceMap.get(voiceName);
      if (voice) {
        debugClick(`🏷️ Found voice "${voiceName}" at line ${i}, pos ${line.from}-${line.to}, widget at ${line.to}`);
        decorations.push({
          pos: line.to,
          widget: new SparkgraphWidget(voice, voiceName),
        });
      }
    }
  }

  debugClick('📊 Total decorations built:', decorations.length);

  // Sort by position (should already be sorted) and create decoration set
  decorations.sort((a, b) => a.pos - b.pos);

  return Decoration.set(
    decorations.map((d) =>
      Decoration.widget({
        widget: d.widget,
        side: 1, // after the text
      }).range(d.pos),
    ),
  );
}

// ── Redraw all sparkgraph canvases in the DOM ──────────────────────────

function redrawAllSparkgraphs(view: EditorView): void {
  const state = useEditorStore.getState();
  const voices = state.parseResult?.score?.voices ?? [];
  const voiceMap = new Map<string, Voice>();
  for (const v of voices) {
    voiceMap.set(v.name, v);
  }

  const nowAngle = state.isPlaying || state.currentAngle > 0
    ? state.currentAngle
    : undefined;

  // Find all sparkgraph canvases in the editor DOM
  const waveCanvases = view.dom.querySelectorAll('.cm-sparkgraph-waveform') as NodeListOf<HTMLCanvasElement>;
  const camCanvases = view.dom.querySelectorAll('.cm-sparkgraph-cam') as NodeListOf<HTMLCanvasElement>;

  for (const canvas of waveCanvases) {
    const voiceName = canvas.dataset.voice;
    if (!voiceName) continue;
    const voice = voiceMap.get(voiceName);
    if (!voice) continue;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    if (maxAmp === 0) maxAmp = 1;
    drawWaveformSparkgraph(ctx, waveformData, WAVEFORM_W, WAVEFORM_H, maxAmp, nowAngle);
  }

  for (const canvas of camCanvases) {
    const voiceName = canvas.dataset.voice;
    if (!voiceName) continue;
    const voice = voiceMap.get(voiceName);
    if (!voice) continue;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    const camData = generateCamShape(waveformData, 10, maxAmp || 1);
    drawCamSparkgraph(ctx, camData, CAM_SIZE, nowAngle, state.shaftShape, state.shaftDiameter, 2, false, 'hundredths');
  }
}

// ── ViewPlugin ─────────────────────────────────────────────────────────

const sparkgraphViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      // Rebuild decorations when doc changes
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
        return;
      }

      // Check for sparkgraph update effects (playback angle changes)
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(sparkgraphUpdateEffect)) {
            // Redraw canvases in-place without rebuilding decorations
            redrawAllSparkgraphs(update.view);
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

export function sparkgraphExtension(): Extension {
  return [sparkgraphViewPlugin];
}
