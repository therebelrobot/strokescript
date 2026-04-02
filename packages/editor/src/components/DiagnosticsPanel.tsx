import { useState } from 'react';
import type { Diagnostic } from '@strokescript/parser';
import { useEditorStore } from '../store';

export function DiagnosticsPanel() {
  const parseResult = useEditorStore((s) => s.parseResult);
  const [collapsed, setCollapsed] = useState(false);

  const diagnostics: Diagnostic[] = parseResult?.diagnostics ?? [];

  if (diagnostics.length === 0) return null;

  return (
    <div className={`diagnostics-panel ${collapsed ? 'diagnostics-panel--collapsed' : ''}`}>
      <button
        className="diagnostics-panel__header"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>{collapsed ? '▶' : '▼'} Diagnostics ({diagnostics.length})</span>
      </button>
      {!collapsed && (
        <ul className="diagnostics-panel__list">
          {diagnostics.map((diag, i) => (
            <li key={i} className={`diagnostics-panel__item diagnostics-panel__item--${diag.severity}`}>
              <span className="diagnostics-panel__icon">
                {diag.severity === 'error' ? '❌' : '⚠️'}
              </span>
              <span className="diagnostics-panel__pos">
                {diag.pos.line}:{diag.pos.column}
              </span>
              <span className="diagnostics-panel__message">
                {diag.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
