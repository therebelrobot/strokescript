import { useEditorStore } from './store';
import { Editor } from './components/Editor';
import { DetailPanel } from './components/DetailPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { TransportBar } from './components/TransportBar';
import { Sidebar } from './components/Sidebar';

export function App() {
  const parseResult = useEditorStore((s) => s.parseResult);
  const expandedVoice = useEditorStore((s) => s.expandedVoice);

  const voices = parseResult?.score?.voices ?? [];
  const expandedVoiceData = expandedVoice
    ? voices.find((v) => v.name === expandedVoice) ?? null
    : null;

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">StrokeScript Editor</span>
      </header>

      <div className="app__body">
        <div className="app__center">
          <main className="app__main">
            <Editor />
          </main>

          {expandedVoiceData && (
            <DetailPanel voice={expandedVoiceData} />
          )}

          <DiagnosticsPanel />
        </div>

        <Sidebar />
      </div>

      <TransportBar />
    </div>
  );
}
