import { useState, useCallback } from 'react';
import { useEditorStore } from '../store';
import { updateMetadata } from '../utils/sourceUpdater';
import { exportAllAsZip, generateExportFilename } from '../rendering';
import type { ShaftShape } from '@strokescript/parser';

const SHAFT_SHAPE_OPTIONS: { value: ShaftShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'tri', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'pent', label: 'Pentagon' },
  { value: 'hex', label: 'Hexagon' },
  { value: 'hept', label: 'Heptagon' },
  { value: 'oct', label: 'Octagon' },
];

// ── Template definitions extracted from spec/STROKE_SIGNATURE_SPEC.md ──

interface Template {
  name: string;
  description: string;
  notation: string;
  category: 'single' | 'multi' | 'shorthand' | 'library';
}

const TEMPLATES: Template[] = [
  // ── Single Voice ──────────────────────────────────────────────────
  {
    name: 'Basic Sine Cam',
    description: 'Simple 4-segment rise-hold-fall-hold (§3.1)',
    notation: '[S3 D L0 D]',
    category: 'single',
  },
  {
    name: 'Four-Beat Rise & Fall',
    description: 'Sine rise to 3mm, hold, fall, hold (§7)',
    notation: '[S3 D3 S0 D0]',
    category: 'single',
  },
  {
    name: 'Weighted Segments',
    description: 'S3 gets double arc space (§3.2)',
    notation: '[S3@2 D L0]',
    category: 'single',
  },
  {
    name: 'Nested Subdivision',
    description: 'Inner group subdivides one slot (§3.3)',
    notation: '[S3 [L1 D1 L0] S0]',
    category: 'single',
  },
  {
    name: 'Repeat Pattern ×4',
    description: 'Two-segment pattern repeated 4 times (§3.4)',
    notation: '[S3 D]*4',
    category: 'single',
  },
  {
    name: 'Linear Ramp',
    description: 'Constant-velocity rise and fall',
    notation: '[L3 D L0 D]',
    category: 'single',
  },
  {
    name: 'Ease Motion',
    description: 'Asymmetric — fast in, slow out',
    notation: '[E3 D E0 D]',
    category: 'single',
  },
  {
    name: 'Quick Snap',
    description: 'Fast rise, slow return — strikes & pecks',
    notation: '[Q3 D Q0 D]',
    category: 'single',
  },
  {
    name: 'Hold Step',
    description: 'Instantaneous jump — ratchet character',
    notation: '[H3 D H0 D]',
    category: 'single',
  },
  {
    name: 'Directional Quick Snap',
    description: 'Quick snap with CW rotation (§3.5)',
    notation: '[Q3 D S0 D] CW',
    category: 'single',
  },
  {
    name: 'Asymmetric Nested Detail',
    description: 'Long rise, quick double-tap down (§7)',
    notation: '[S5@2 [Q2 D2 Q0] D0]',
    category: 'single',
  },
  {
    name: 'Valid Seam Example',
    description: 'Rise, hold, return — seam at 0 (§1.3)',
    notation: '[S3 D3 L0]',
    category: 'single',
  },
  {
    name: 'Nested with Dwell',
    description: 'Subdivision with inner dwell (§8)',
    notation: '[S3 [L1 D] S0]',
    category: 'single',
  },
  // ── Multi-Voice (Score) ───────────────────────────────────────────
  {
    name: 'Two-Voice Named',
    description: 'Two cams with offset patterns (§4.1)',
    notation: 'A: [S3 D S0 D]\nB: [D S3 D S0]',
    category: 'multi',
  },
  {
    name: 'Two-Cam Phase Offset',
    description: 'B is A shifted by half revolution (§7)',
    notation: 'rpm: 45\nbase: 15mm\nmax: 6mm\nscale: shared\n---\nA: [S6 D6 S0 D0]\nB: A@0.5',
    category: 'multi',
  },
  {
    name: 'Phase Offset Shorthand',
    description: 'B copies A offset 180° (§4.2)',
    notation: 'A: [S3 D S0 D]\nB: A@0.5',
    category: 'multi',
  },
  {
    name: 'Custom Curve with Bounce',
    description: 'Bézier bounce repeated twice (§7)',
    notation: '@bounce = B(0.4, 2.0, 0.6, -0.5)\n---\n[@bounce:4 S0]*2',
    category: 'multi',
  },
  {
    name: 'Custom Curve Inline',
    description: 'Custom gentle curve at 3mm (§3.6/§8)',
    notation: '@gentle = B(0.2, 0.0, 0.8, 1.0)\n---\n[@gentle:3 D S0 D]',
    category: 'multi',
  },
  {
    name: 'Full Score Document',
    description: 'Header, curves, 3 voices (§4.3)',
    notation:
      'rpm: 33\nbase: 20mm\nmax: 8mm\nscale: shared\n\n@gentle = B(0.2, 0.0, 0.8, 1.0)\n@snap   = B(0.9, 0.0, 1.0, 0.4)\n\n---\n\nA: [S3 D @gentle:0]*2\nB: A@0.5\nC: [Q2 D2 Q0 D0]*2 CW',
    category: 'multi',
  },
  // ── Library ───────────────────────────────────────────────────────
  {
    name: 'Cam Library',
    description: '18 cams for mixing & matching — shapes, phases, amplitudes, subdivisions',
    notation: `@gentle = B(0.2, 0.0, 0.8, 1.0)
---
A: [S3 D3 S0 D0]
B: [S3@2 D L0 D]
C: [S3 [L1 D1 L0] S0]
D: [S3 D]*4
E: [S3 D3 @gentle:0 D0]
F: [Q3 D3 Q0 D0]
G: [Q3 D S0 D] CW
H: [H3 D1 H0 D1 H3 D1 H0 D1]
I: [D4 Q0 S0 S4]
J: [L4 D2 L0 D2]
K: [E3 D3 E0 D0]
L: [S6 D6 S0 D0]
M: L@0.5
N: [S4 D4 S0 D0]
O: N@0.333
P: N@0.667
Q: [S3 D3 S0 D0]
R: Q@0.25
S: Q@0.5
T: Q@0.75`,
    category: 'library',
  },
  // ── Shorthand ─────────────────────────────────────────────────────
  {
    name: 'Compact Label Form',
    description: 'Dot-separated, no brackets (§5/§8)',
    notation: 'S3.D.L0.D',
    category: 'shorthand',
  },
  {
    name: 'Compact Sine/Dwell',
    description: 'Shorthand for simple sine cam',
    notation: 'S3.D.S0.D',
    category: 'shorthand',
  },
];

const CATEGORY_LABELS: Record<Template['category'], string> = {
  single: 'Single Voice',
  multi: 'Multi-Voice',
  shorthand: 'Shorthand',
  library: 'Cam Library',
};

export function Sidebar() {
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const rpm = useEditorStore((s) => s.rpm);
  const baseRadius = useEditorStore((s) => s.baseRadius);
  const source = useEditorStore((s) => s.source);
  const setSource = useEditorStore((s) => s.setSource);
  const shaftShape = useEditorStore((s) => s.shaftShape);
  const shaftDiameter = useEditorStore((s) => s.shaftDiameter);
  const parseResult = useEditorStore((s) => s.parseResult);

  const [clickedIdx, setClickedIdx] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const voices = parseResult?.score?.voices ?? [];
  const hasVoices = voices.length > 0;

  const handleExportSVG = useCallback(async () => {
    if (!hasVoices || isExporting) return;
    setIsExporting(true);
    try {
      await exportAllAsZip(
        voices,
        'svg',
        { baseRadius, shaftShape, shaftDiameter },
        generateExportFilename().replace('.zip', '-svg.zip')
      );
    } finally {
      setIsExporting(false);
    }
  }, [voices, hasVoices, isExporting, baseRadius, shaftShape, shaftDiameter]);

  const handleExportDXF = useCallback(async () => {
    if (!hasVoices || isExporting) return;
    setIsExporting(true);
    try {
      await exportAllAsZip(
        voices,
        'dxf',
        { baseRadius, shaftShape, shaftDiameter },
        generateExportFilename().replace('.zip', '-dxf.zip')
      );
    } finally {
      setIsExporting(false);
    }
  }, [voices, hasVoices, isExporting, baseRadius, shaftShape, shaftDiameter]);

  const handleExportBoth = useCallback(async () => {
    if (!hasVoices || isExporting) return;
    setIsExporting(true);
    try {
      await exportAllAsZip(
        voices,
        'both',
        { baseRadius, shaftShape, shaftDiameter },
        generateExportFilename()
      );
    } finally {
      setIsExporting(false);
    }
  }, [voices, hasVoices, isExporting, baseRadius, shaftShape, shaftDiameter]);


  const handleTemplateClick = useCallback(
    (template: Template, idx: number) => {
      setSource(template.notation);
      setClickedIdx(idx);
      setTimeout(() => setClickedIdx(null), 400);
    },
    [setSource],
  );

  const grouped = (['single', 'multi', 'library', 'shorthand'] as const).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    templates: TEMPLATES.filter((t) => t.category === cat),
  }));

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar--collapsed'}`}>
      <button
        className="sidebar__toggle"
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? '▶' : '◀'}
      </button>

      <div className="sidebar__content">
        {/* ── Settings Section ─────────────────────────────────── */}
        <section className="sidebar__section">
          <h3 className="sidebar__section-title">Settings</h3>

          <label className="sidebar__field">
            <span className="sidebar__field-label">RPM</span>
            <input
              className="sidebar__field-input"
              type="number"
              min={1}
              max={999}
              value={rpm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) {
                  setSource(updateMetadata(source, 'rpm', v.toString()));
                }
              }}
            />
          </label>

          <label className="sidebar__field">
            <span className="sidebar__field-label">Base Radius (mm)</span>
            <input
              className="sidebar__field-input"
              type="number"
              min={1}
              step={0.5}
              value={baseRadius}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) {
                  setSource(updateMetadata(source, 'base', v + 'mm'));
                }
              }}
            />
          </label>

          <label className="sidebar__field">
            <span className="sidebar__field-label">Shaft Shape</span>
            <select
              className="sidebar__field-input"
              value={shaftShape}
              onChange={(e) => {
                setSource(updateMetadata(source, 'shaft', e.target.value));
              }}
            >
              {SHAFT_SHAPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sidebar__field">
            <span className="sidebar__field-label">Shaft Diameter (mm)</span>
            <input
              className="sidebar__field-input"
              type="number"
              min={1}
              step={0.5}
              value={shaftDiameter}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) {
                  setSource(updateMetadata(source, 'shaft-diameter', v.toString()));
                }
              }}
            />
          </label>
        </section>
        
        {/* ── Bulk Export Section ──────────────────────────────── */}
        <section className="sidebar__section">
          <h3 className="sidebar__section-title">Bulk Export</h3>
          <p className="sidebar__export-desc">
            Export all {voices.length} cam{voices.length !== 1 ? 's' : ''} as a ZIP archive
          </p>
          <div className="sidebar__export-buttons">
            <button
              className="sidebar__export-btn"
              onClick={handleExportSVG}
              disabled={!hasVoices || isExporting}
              title="Export all cams as SVG files"
            >
              {isExporting ? 'Exporting...' : 'Export SVGs'}
            </button>
            <button
              className="sidebar__export-btn"
              onClick={handleExportDXF}
              disabled={!hasVoices || isExporting}
              title="Export all cams as DXF files"
            >
              {isExporting ? 'Exporting...' : 'Export DXFs'}
            </button>
            <button
              className="sidebar__export-btn sidebar__export-btn--primary"
              onClick={handleExportBoth}
              disabled={!hasVoices || isExporting}
              title="Export all cams as both SVG and DXF files"
            >
              {isExporting ? 'Exporting...' : 'Export Both'}
            </button>
          </div>
        </section>

        {/* ── Templates Section ────────────────────────────────── */}
        <section className="sidebar__section sidebar__section--templates">
          <h3 className="sidebar__section-title">Composition Templates</h3>

          <div className="sidebar__template-list">
            {grouped.map((group) => (
              <div key={group.category} className="sidebar__template-group">
                <h4 className="sidebar__group-label">{group.label}</h4>
                {group.templates.map((t, i) => {
                  const globalIdx = TEMPLATES.indexOf(t);
                  return (
                    <button
                      key={i}
                      className={`sidebar__template-card ${
                        clickedIdx === globalIdx
                          ? 'sidebar__template-card--active'
                          : ''
                      }`}
                      onClick={() => handleTemplateClick(t, globalIdx)}
                    >
                      <span className="sidebar__template-name">{t.name}</span>
                      <span className="sidebar__template-desc">
                        {t.description}
                      </span>
                      <code className="sidebar__template-notation">
                        {t.notation.length > 40
                          ? t.notation.slice(0, 37) + '…'
                          : t.notation}
                      </code>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
