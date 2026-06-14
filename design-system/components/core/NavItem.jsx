import React from 'react';

/**
 * NavItem — a sidebar navigation row. Active state uses the teal wash.
 */
export function NavItem({ label, active = false, onClick, style }) {
  return (
    <a onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '9px 11px', borderRadius: 'var(--r-md)',
      fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semi)',
      color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
      background: active ? 'var(--accent-wash)' : 'transparent',
      textDecoration: 'none', cursor: 'pointer', ...style,
    }}>
      <span style={{
        width: 9, height: 9, borderRadius: 3, flex: '0 0 auto',
        border: '1.6px solid currentColor',
        background: active ? 'var(--accent)' : 'transparent',
        borderColor: active ? 'var(--accent)' : 'currentColor',
        opacity: active ? 1 : 0.55,
      }} />
      {label}
    </a>
  );
}
