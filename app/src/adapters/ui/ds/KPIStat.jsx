import React from 'react';

/**
 * KPIStat — a single headline figure with label + meta.
 * `size="hero"` is the one big focus number; `size="chip"` is a compact tile.
 * `tone` colors the value (plan=teal, warn=amber, default=ink).
 */
export function KPIStat({ label, value, unit, meta, tone = 'default', size = 'chip', tag, style }) {
  const toneColor = { default: 'var(--ink)', plan: 'var(--accent-deep)', warn: 'var(--warn-deep)', ok: 'var(--ok-deep)' }[tone];
  const valueSize = size === 'hero' ? 'var(--fs-display)' : (size === 'tile' ? 'var(--fs-h1)' : 'var(--fs-h2)');
  const unitSize = size === 'hero' ? 28 : 15;

  const wrap = size === 'chip' ? {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-lg)', padding: '13px 16px', minWidth: 128,
  } : {};

  return (
    <div style={{ ...wrap, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semi)', color: 'var(--ink-3)' }}>
        {label}{tag}
      </div>
      <div className="num" style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: size === 'hero' ? 6 : 5, lineHeight: 1 }}>
        <span style={{ fontSize: valueSize, fontWeight: 'var(--fw-black)', letterSpacing: 'var(--ls-tight)', color: toneColor }}>{value}</span>
        {unit && <span style={{ fontSize: unitSize, fontWeight: 'var(--fw-bold)', color: tone === 'default' ? 'var(--ink-2)' : toneColor }}>{unit}</span>}
      </div>
      {meta && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginTop: 7 }}>{meta}</div>}
    </div>
  );
}
