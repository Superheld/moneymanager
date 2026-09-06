import React from 'react';

/**
 * Button — primary (teal fill), default (hairline) or ghost. Optional leading "+".
 */
export function Button({ variant = 'default', plus = false, children, onClick, style }) {
  var base = { display:'inline-flex', alignItems:'center', gap:7, borderRadius:'var(--r-md)',
    padding:'8px 13px', fontSize:'12.5px', fontWeight:'var(--fw-bold)', whiteSpace:'nowrap',
    fontFamily:'var(--font-ui)', cursor:'pointer',
    // Einzelwerte statt `border` — siehe die Begruendung in Pill.jsx: `primary` und
    // `ghost` setzen `borderColor`, `default` nicht, und der Wechsel zurueck meldete
    // bei jedem Rerender einen Konflikt zwischen Kurz- und Langform.
    borderWidth:'1px', borderStyle:'solid', borderColor:'var(--line)',
    background:'var(--surface)', color:'var(--ink-2)' };
  var variants = {
    default: {},
    primary: { background:'var(--accent)', borderColor:'var(--accent)', color:'#fff' },
    ghost:   { background:'transparent', borderColor:'transparent', color:'var(--ink-2)' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...(variants[variant]||{}), ...style }}>
      {plus && <span style={{ fontSize:'15px', lineHeight:1 }}>+</span>}{children}
    </button>
  );
}
