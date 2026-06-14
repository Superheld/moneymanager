import React from 'react';

/**
 * Dialog — centered modal for create/edit flows. Renders a scrim, a header with icon +
 * title/subtitle + close, the body, and a footer (e.g. Abbrechen / Speichern).
 */
export function Dialog({ title, subtitle, onClose, footer, children }) {
  return (
    <div onClick={function(e){ if(e.target===e.currentTarget && onClose) onClose(); }}
      style={{ position:'absolute', inset:0, background:'oklch(0.3 0.02 60/.34)', display:'flex',
        alignItems:'flex-start', justifyContent:'center', padding:'48px 20px', overflow:'auto', zIndex:30 }}>
      <div style={{ width:'100%', maxWidth:680, background:'var(--surface)', border:'1px solid var(--line)',
        borderRadius:'var(--r-2xl)', boxShadow:'var(--shadow-pop)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:13, padding:'18px 22px', borderBottom:'1px solid var(--line)' }}>
          <span style={{ width:36, height:36, borderRadius:11, background:'var(--accent-wash)', color:'var(--accent-deep)',
            display:'grid', placeItems:'center', fontSize:20, fontWeight:'var(--fw-black)', flex:'0 0 auto' }}>+</span>
          <div>
            <h3 style={{ margin:0, fontSize:17, fontWeight:'var(--fw-black)' }}>{title}</h3>
            {subtitle && <div style={{ fontSize:'12.5px', color:'var(--ink-3)', marginTop:2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', width:30, height:30, borderRadius:'var(--r-sm)',
            border:'1px solid var(--line)', background:'var(--surface)', color:'var(--ink-3)', cursor:'pointer', fontSize:15 }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:15 }}>{children}</div>
        {footer && <div style={{ display:'flex', alignItems:'center', gap:10, padding:'15px 22px',
          borderTop:'1px solid var(--line)', background:'var(--cream)' }}>{footer}</div>}
      </div>
    </div>
  );
}
