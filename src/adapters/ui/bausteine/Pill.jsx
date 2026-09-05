import React from 'react';

/**
 * Pill — small rounded tag for payment character, status, scenario.
 * Variant maps to the Glossar semantics (Plan/Umschichtung/Ertrag/Aufwand).
 */
export function Pill({ variant = 'neutral', children, style }) {
  const base = {
    display: 'inline-block',
    fontSize: 'var(--fs-2xs)',
    fontWeight: 'var(--fw-bold)',
    padding: '2px 10px',
    borderRadius: 'var(--r-pill)',
    // EINZELWERTE statt der Kurzform `border`, und das ist keine Stilfrage.
    // Die Varianten unten setzen `borderColor` (`plan` zusaetzlich `borderStyle`).
    // Wechselt eine Pille zur Variante `neutral` zurueck, entfernt React die
    // Langform, waehrend die Kurzform stehenbleibt — und meldet das bei jedem
    // Rerender als „Removing a style property ... when a conflicting property is
    // set". Mit drei Einzelwerten gibt es keine Kurzform, die kollidieren koennte.
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    color: 'var(--ink-3)',
    whiteSpace: 'nowrap',
    lineHeight: 1.5,
  };
  const variants = {
    neutral: {},
    plan:   { borderStyle: 'dashed', borderColor: 'var(--accent)', color: 'var(--accent-deep)' },
    ist:    { borderColor: 'color-mix(in oklab,var(--ink) 30%,var(--line))', color: 'var(--ink)' },
    um:     { borderColor: 'var(--accent)', color: 'var(--accent-deep)' },
    ertrag: { borderColor: 'color-mix(in oklab,var(--ok) 45%,var(--line))', color: 'var(--ok-deep)' },
    aufwand:{ color: 'var(--ink-3)' },
    warn:   { borderColor: 'color-mix(in oklab,var(--warn) 45%,var(--line))', color: 'var(--warn-deep)', background: 'var(--warn-wash)' },
    ok:     { borderColor: 'color-mix(in oklab,var(--ok) 45%,var(--line))', color: 'var(--ok-deep)', background: 'var(--ok-wash)' },
  };
  return <span style={{ ...base, ...(variants[variant] || {}), ...style }}>{children}</span>;
}
