import React from 'react';
import { ScenarioChip } from './ScenarioChip.jsx';

/**
 * PageHeader — the standard screen top: a context bar (date + ScenarioChip) above a
 * title/subtitle row with optional right-aligned controls. Use at the top of every screen.
 */
export function PageHeader({ title, subtitle, date = 'Sonntag, 14. Juni 2026', scenario = 'Basis', right }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, fontSize:'12px',
        fontWeight:'var(--fw-bold)', letterSpacing:'.05em', textTransform:'uppercase', color:'var(--accent-deep)' }}>
        {date}<ScenarioChip name={scenario} />
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20, marginBottom:24 }}>
        <div>
          <h1 style={{ margin:0, fontSize:'var(--fs-h1)', fontWeight:'var(--fw-black)', letterSpacing:'-.02em' }}>{title}</h1>
          {subtitle && <div style={{ fontSize:'13px', color:'var(--ink-3)', marginTop:5 }}>{subtitle}</div>}
        </div>
        {right && <div style={{ display:'flex', gap:9, alignItems:'center', flex:'0 0 auto' }}>{right}</div>}
      </div>
    </div>
  );
}
