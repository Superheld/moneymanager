import React from 'react';

/**
 * LiveResult — the teal "live computed" box inside create dialogs. Shows the derived
 * figure (Ansparrate, Plan-Wirkung, geglätteter Abfluss) as the user fills the form.
 */
export function LiveResult({ label, value, sub, children }) {
  return (
    <div style={{ border:'1px solid var(--accent)', borderRadius:'var(--r-md)', background:'var(--accent-wash)', padding:'14px 16px' }}>
      <div style={{ fontSize:'var(--fs-2xs)', fontWeight:'var(--fw-black)', color:'var(--accent-deep)',
        textTransform:'uppercase', letterSpacing:'.05em', marginBottom:9, display:'flex', alignItems:'center', gap:7 }}>
        <span style={{ width:9, height:9, borderRadius:'50%', background:'var(--accent)' }} />{label}
      </div>
      {(value || sub) && <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
        {value && <span style={{ fontSize:26, fontWeight:'var(--fw-black)', color:'var(--accent-deep)',
          letterSpacing:'-.02em', fontVariantNumeric:'tabular-nums' }}>{value}</span>}
        {sub && <span style={{ fontSize:'12.5px', color:'var(--ink-2)' }}>{sub}</span>}
      </div>}
      {children}
    </div>
  );
}
