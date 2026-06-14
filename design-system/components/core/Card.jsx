import React from 'react';

/**
 * Card — flat surface panel with hairline border. Default has no shadow
 * (set `floating` for elevated/popover surfaces). Optional title + subtitle header.
 */
export function Card({ title, subtitle, action, floating = false, pad = true, children, style }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-xl)',
      boxShadow: floating ? 'var(--shadow-card)' : 'var(--shadow-none)',
      padding: pad ? 'var(--pad-card)' : 0,
      ...style,
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: subtitle ? 'var(--sp-3)' : 'var(--sp-3)' }}>
          <div>
            {title && <div style={{ fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-h)' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
