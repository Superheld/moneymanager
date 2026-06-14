import React from 'react';

/**
 * CoverageTrack — the horizontal bar used for Deckungsgrad (Töpfe) and Budgets.
 * 0–100 fills teal; over 100 fills amber. Optional label row with "ist / soll".
 */
export function CoverageTrack({ value, max = 100, label, right, over, style }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const isOver = over != null ? over : value > max;
  return (
    <div style={style}>
      {(label || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semi)', marginBottom: 6 }}>
          <span>{label}</span>
          <span className="num" style={{ color: isOver ? 'var(--warn-deep)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>{right}</span>
        </div>
      )}
      <div style={{ height: 7, borderRadius: 'var(--r-pill)', background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 'var(--r-pill)', background: isOver ? 'var(--warn)' : 'var(--accent)' }} />
      </div>
    </div>
  );
}
