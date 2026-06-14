import React from 'react';

/**
 * ScenarioChip — the teal "Szenario: …" pill in the context bar. Signals which
 * plan layer is active (Plan ≠ Ist). Decorative dot + name.
 */
export function ScenarioChip({ name = 'Basis', style }) {
  return (
    <span style={{ fontSize:'11.5px', fontWeight:'var(--fw-bold)', color:'var(--accent-deep)',
      background:'var(--accent-wash)', border:'1px solid color-mix(in oklab,var(--accent) 28%,var(--line))',
      borderRadius:'var(--r-pill)', padding:'6px 12px', display:'inline-flex', alignItems:'center', gap:7,
      textTransform:'none', letterSpacing:0, ...style }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)' }} />
      {'Szenario: '+name}
    </span>
  );
}
