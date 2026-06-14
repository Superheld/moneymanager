import React from 'react';

function fmt(n){return Math.round(n).toLocaleString('de-DE');}

/**
 * Vessel — Topf füllstand "behälter". Fills from the bottom to the coverage %,
 * with a dashed goal line near the top. Teal when ≥50% covered, amber below.
 */
export function Vessel({ value, target, label, art, height = 78 }) {
  var pct = Math.max(0, Math.min(100, Math.round((value / target) * 100)));
  var warn = pct < 50;
  return (
    <div>
      {(label || art) && <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        {label && <span style={{ fontWeight:'var(--fw-black)', fontSize:'13px' }}>{label}</span>}
        {art && <span style={{ fontSize:'var(--fs-2xs)', fontWeight:'var(--fw-bold)', padding:'2px 9px', borderRadius:'var(--r-pill)',
          border:'1px solid '+(art==='Puffer'?'var(--line)':'color-mix(in oklab,var(--ok) 45%,var(--line))'),
          color:art==='Puffer'?'var(--ink-3)':'var(--ok-deep)' }}>{art}</span>}
      </div>}
      <div style={{ position:'relative', width:'100%', height:height, border:'1.5px solid var(--line)', borderTop:'none',
        borderRadius:'0 0 var(--r-lg) var(--r-lg)', overflow:'hidden', background:'var(--surface)' }}>
        <div style={{ position:'absolute', left:0, right:0, top:'8%', borderTop:'1.5px dashed var(--accent-deep)' }} />
        <div style={{ position:'absolute', left:0, right:0, bottom:0, height:pct+'%',
          background:warn?'var(--warn-wash)':'var(--accent-wash)', borderTop:'2px solid '+(warn?'var(--warn)':'var(--accent)') }} />
        <span style={{ position:'absolute', left:8, bottom:6, fontSize:'11px', fontWeight:'var(--fw-bold)',
          color:'var(--ink-2)', fontVariantNumeric:'tabular-nums' }}>{fmt(value)} €</span>
      </div>
    </div>
  );
}
