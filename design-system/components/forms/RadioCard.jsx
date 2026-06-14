import React from 'react';

/**
 * RadioCard — a selectable explainer card (used for Charakter and Topf-Art choices).
 * Selected = teal wash + filled radio. Optional tag on the right.
 */
export function RadioCard({ title, desc, selected = false, tag, onClick }) {
  return (
    <div onClick={onClick} style={{ border:'1px solid '+(selected?'var(--accent)':'var(--line)'),
      borderRadius:'var(--r-md)', padding:'11px 13px', display:'flex', flexDirection:'column', gap:3, cursor:'pointer',
      background:selected?'var(--accent-wash)':'var(--surface)' }}>
      <div style={{ fontWeight:'var(--fw-black)', fontSize:13, display:'flex', alignItems:'center', gap:8,
        color:selected?'var(--accent-deep)':'var(--ink)' }}>
        <span style={{ width:15, height:15, borderRadius:'50%', flex:'0 0 auto',
          border:'1.6px solid '+(selected?'var(--accent)':'var(--line)'),
          background:selected?'var(--accent)':'transparent', boxShadow:selected?'inset 0 0 0 3px var(--surface)':'none' }} />
        {title}{tag && <span style={{ marginLeft:'auto' }}>{tag}</span>}
      </div>
      {desc && <div style={{ fontSize:'11.5px', color:'var(--ink-3)', lineHeight:1.35, paddingLeft:22 }}>{desc}</div>}
    </div>
  );
}
