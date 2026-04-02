import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../store';

export function TransportBar() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentAngle = useEditorStore((s) => s.currentAngle);
  const rpm = useEditorStore((s) => s.rpm);
  const setRpm = useEditorStore((s) => s.setRpm);
  const setAngle = useEditorStore((s) => s.setAngle);
  const play = useEditorStore((s) => s.play);
  const stop = useEditorStore((s) => s.stop);
  const tick = useEditorStore((s) => s.tick);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const animate = useCallback(
    (time: number) => {
      if (lastTimeRef.current > 0) {
        const delta = time - lastTimeRef.current;
        tick(delta);
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(animate);
    },
    [tick],
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, animate]);

  const handleToggle = () => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  };

  const handleRpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      setRpm(val);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAngle(val);
  };

  // Build segment colour stops for the scrub bar background
  const parseResult = useEditorStore((s) => s.parseResult);
  const voices = parseResult?.score?.voices ?? [];
  let scrubBackground = '#16213e';

  if (voices.length > 0) {
    // Use the first voice's segments for colour stops
    const voice = voices[0];
    const stops: string[] = [];
    const CURVE_COLORS: Record<string, string> = {
      S: '#3B82F6',
      D: '#9CA3AF',
      L: '#F59E0B',
      E: '#10B981',
      Q: '#EF4444',
      H: '#8B5CF6',
    };
    const DEFAULT_COLOR = '#14B8A6';

    for (const seg of voice.segments) {
      const color = CURVE_COLORS[seg.curveType] ?? DEFAULT_COLOR;
      const startPct = (seg.startAngle / 360) * 100;
      const endPct = (seg.endAngle / 360) * 100;
      stops.push(`${color}40 ${startPct}%`);
      stops.push(`${color}40 ${endPct}%`);
    }

    if (stops.length > 0) {
      scrubBackground = `linear-gradient(to right, ${stops.join(', ')})`;
    }
  }

  return (
    <div className="transport-bar">
      <button className="transport-bar__btn" onClick={handleToggle}>
        {isPlaying ? '■ Stop' : '▶ Play'}
      </button>

      <div className="transport-bar__scrub">
        <input
          type="range"
          min={0}
          max={360}
          step={0.5}
          value={currentAngle}
          onChange={handleScrub}
          className="transport-bar__scrub-input"
          style={{ background: scrubBackground }}
        />
      </div>

      <div className="transport-bar__angle">
        {currentAngle.toFixed(1)}°
      </div>

      <div className="transport-bar__rpm">
        <label htmlFor="rpm-input">RPM:</label>
        <input
          id="rpm-input"
          type="number"
          min={1}
          max={600}
          value={rpm}
          onChange={handleRpmChange}
          className="transport-bar__input"
        />
      </div>
    </div>
  );
}
