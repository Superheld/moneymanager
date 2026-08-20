import React from 'react';

/**
 * FormField — label (with optional required asterisk) over an input slot, with optional hint.
 * Pass a real input, or use the Input helper for the styled display-only field.
 */
export function FormField({ label, required = false, hint, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, ...style }}>
      {label && <label style={{ fontSize:'var(--fs-2xs)', fontWeight:'var(--fw-bold)', textTransform:'uppercase',
        letterSpacing:'.04em', color:'var(--ink-3)' }}>{label}{required && <span style={{ color:'var(--accent-deep)' }}> *</span>}</label>}
      {children}
      {hint && <span style={{ fontSize:'12px', color:'var(--ink-3)' }}>{hint}</span>}
    </div>
  );
}

/** Input — styled field box. `calc` makes it a dashed teal computed field; `suffix` for units. */
export function Input({ value, placeholder, suffix, caret = false, calc = false }) {
  var filled = value != null && value !== '';
  return (
    <div style={{ border:'1px solid '+(calc?'var(--accent)':'var(--line)'), borderStyle:calc?'dashed':'solid',
      borderRadius:'var(--r-sm)', padding:'10px 12px', fontSize:'13.5px', display:'flex', alignItems:'center', gap:8,
      background:calc?'var(--accent-wash)':'var(--surface)', color:calc?'var(--accent-deep)':(filled?'var(--ink)':'var(--ink-3)'),
      fontWeight:calc?'var(--fw-bold)':'normal', fontVariantNumeric:calc?'tabular-nums':'normal' }}>
      <span>{filled?value:placeholder}</span>
      {suffix && <span style={{ marginLeft:'auto', fontSize:12, color:'var(--ink-3)', fontVariantNumeric:'tabular-nums' }}>{suffix}</span>}
      {caret && <span style={{ marginLeft:'auto', color:'var(--ink-3)' }}>▾</span>}
    </div>
  );
}
