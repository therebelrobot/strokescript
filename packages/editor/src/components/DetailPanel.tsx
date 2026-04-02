import { useRef, useEffect, useCallback } from 'react';
import type { Voice } from '@strokescript/parser';
import { useEditorStore } from '../store';
import {
  generateWaveform,
  generateCamShape,
  drawWaveformSparkgraph,
  drawCamSparkgraph,
  generateCamSVG,
  generateCamDXF,
} from '../rendering';

interface DetailPanelProps {
  voice: Voice;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DetailPanel({ voice }: DetailPanelProps) {
  const setExpandedVoice = useEditorStore((s) => s.setExpandedVoice);
  const currentAngle = useEditorStore((s) => s.currentAngle);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const shaftShape = useEditorStore((s) => s.shaftShape);
  const shaftDiameter = useEditorStore((s) => s.shaftDiameter);

  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);

  const waveWidth = 600;
  const waveHeight = 200;
  const camSize = 200;
  const baseRadius = 10;

  // Draw large waveform
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    if (maxAmp === 0) maxAmp = 1;

    drawWaveformSparkgraph(
      ctx,
      waveformData,
      waveWidth,
      waveHeight,
      maxAmp,
      isPlaying ? currentAngle : undefined,
    );
  }, [voice, currentAngle, isPlaying]);

  // Draw large cam shape on canvas (reuse the same renderer as inline sparkgraphs)
  useEffect(() => {
    const canvas = camCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    const camData = generateCamShape(waveformData, baseRadius, maxAmp || 1);
    const nowAngle = isPlaying || currentAngle > 0 ? currentAngle : undefined;
    drawCamSparkgraph(ctx, camData, camSize, nowAngle, shaftShape, shaftDiameter);
  }, [voice, currentAngle, isPlaying, shaftShape, shaftDiameter]);

  const handleExportSVG = useCallback(() => {
    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    const camData = generateCamShape(waveformData, baseRadius, maxAmp || 1);
    const svg = generateCamSVG(camData, {
      label: voice.name,
      direction: voice.direction,
      centreHoleDiameter: shaftDiameter,
      shaftShape,
    });
    downloadBlob(svg, `${voice.name}-cam.svg`, 'image/svg+xml');
  }, [voice, shaftShape, shaftDiameter]);

  const handleExportDXF = useCallback(() => {
    const waveformData = generateWaveform(voice, 2);
    let maxAmp = 0;
    for (const p of waveformData.points) {
      if (p.amplitude > maxAmp) maxAmp = p.amplitude;
    }
    const camData = generateCamShape(waveformData, baseRadius, maxAmp || 1);
    const dxf = generateCamDXF(camData, {
      centreHoleDiameter: shaftDiameter,
      shaftShape,
    });
    downloadBlob(dxf, `${voice.name}-cam.dxf`, 'application/dxf');
  }, [voice, shaftShape, shaftDiameter]);

  const handleCopyNotation = useCallback(() => {
    const notation = voice.segments
      .map((s) => `${s.curveType}${s.amplitude}`)
      .join('.');
    navigator.clipboard.writeText(notation).catch(() => {
      // Fallback: silently fail
    });
  }, [voice]);

  return (
    <div className="detail-panel">
      <div className="detail-panel__header">
        <h3>Voice: {voice.name} ({voice.direction})</h3>
        <button
          className="detail-panel__close"
          onClick={() => setExpandedVoice(null)}
        >
          ✕
        </button>
      </div>

      <div className="detail-panel__content">
        <div className="detail-panel__visuals">
          <div className="detail-panel__waveform">
            <h4>Waveform</h4>
            <canvas ref={waveCanvasRef} width={waveWidth} height={waveHeight} />
          </div>
          <div className="detail-panel__cam">
            <h4>Cam Shape</h4>
            <canvas ref={camCanvasRef} width={camSize} height={camSize} />
          </div>
        </div>

        <div className="detail-panel__segments">
          <h4>Segments</h4>
          <table className="segment-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Curve</th>
                <th>Amplitude</th>
                <th>Arc°</th>
                <th>Start°</th>
                <th>End°</th>
              </tr>
            </thead>
            <tbody>
              {voice.segments.map((seg, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{seg.curveType}</td>
                  <td>{seg.amplitude}</td>
                  <td>{seg.arcDegrees.toFixed(1)}</td>
                  <td>{seg.startAngle.toFixed(1)}</td>
                  <td>{seg.endAngle.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="detail-panel__actions">
          <button onClick={handleExportSVG}>Export SVG</button>
          <button onClick={handleExportDXF}>Export DXF</button>
          <button onClick={handleCopyNotation}>Copy Notation</button>
        </div>
      </div>
    </div>
  );
}
