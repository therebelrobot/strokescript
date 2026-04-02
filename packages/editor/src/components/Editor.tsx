import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { strokescriptLanguage } from '../codemirror/language';
import { sparkgraphExtension, sparkgraphUpdateEffect } from '../codemirror/sparkgraphPlugin';
import { highlightExtension, highlightUpdateEffect } from '../codemirror/highlightPlugin';
import { useEditorStore } from '../store';

const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#16213e',
    color: '#e0e0e0',
    height: '100%',
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
  '.cm-content': {
    caretColor: '#3B82F6',
    padding: '8px 0',
  },
  '.cm-cursor': {
    borderLeftColor: '#3B82F6',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#3B82F640',
  },
  '.cm-gutters': {
    backgroundColor: '#0f1a33',
    color: '#6b7280',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#1e3a5f',
  },
  '.cm-activeLine': {
    backgroundColor: '#1e3a5f30',
  },
  '.cm-line': {
    padding: '0 8px',
  },
  // Syntax highlighting overrides for dark theme
  '.ͼb': { color: '#7c3aed' },  // comment
  '.ͼc': { color: '#3B82F6' },  // keyword
  '.ͼd': { color: '#f59e0b' },  // number
  '.ͼe': { color: '#10b981' },  // string
  // Sparkgraph widget styles
  '.cm-sparkgraph-waveform': {
    borderRadius: '4px',
    background: '#0a1628',
  },
  '.cm-sparkgraph-cam': {
    borderRadius: '4px',
    background: '#0a1628',
  },
  // Active segment highlight
  '.cm-active-segment': {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: '2px',
  },
}, { dark: true });

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const source = useEditorStore((s) => s.source);
  const setSource = useEditorStore((s) => s.setSource);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentAngle = useEditorStore((s) => s.currentAngle);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        strokescriptLanguage,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        darkTheme,
        sparkgraphExtension(),
        highlightExtension(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSource = update.state.doc.toString();
            setSource(newSource);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount — source updates flow from the editor, not into it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external source changes (e.g. template loads) into CodeMirror
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== source) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: source },
      });
    }
  }, [source]);

  // Dispatch sparkgraph + highlight update effects during playback
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Dispatch effects to trigger sparkgraph redraws and highlight updates
    view.dispatch({
      effects: [
        sparkgraphUpdateEffect.of(undefined),
        highlightUpdateEffect.of(undefined),
      ],
    });
  }, [currentAngle, isPlaying]);

  return (
    <div className="editor-container" ref={containerRef} />
  );
}
