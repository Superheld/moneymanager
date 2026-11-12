// Card — die Fläche um einen Inhalt: Haarlinie, Hintergrund, Innenabstand. Ohne Schatten,
// ausser `floating`. Optional ein Kopf mit Titel, Untertitel und einer Aktion rechts.
//
// Seit 2026-11-10 TypeScript statt `.jsx` mit handgeschriebener `.d.ts`. Base UI hat dafür
// kein Gegenstück — eine Karte ist Aussehen, keine Mechanik. Warum Inhalt in einer Karte
// steht und nie in einer Karte IN einer Karte, steht in `../CLAUDE.md`.

import type { CSSProperties, ReactNode, Ref } from "react";

export interface CardProps {
  /** Titel im Kopf, fett. */
  title?: ReactNode;
  /** Gedämpfte Zeile unter dem Titel. */
  subtitle?: ReactNode;
  /** Rechts im Kopf — eine Legende, ein Knopf. */
  action?: ReactNode;
  /** Mit weichem Schatten statt flach (für schwebende Flächen). */
  floating?: boolean;
  /** Innenabstand (Vorgabe an). */
  pad?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  /** Für den Aufrufer, der die Karte ins Bild holen will (React 19: `ref` ist eine Prop). */
  ref?: Ref<HTMLDivElement>;
}

export function Card({ title, subtitle, action, floating = false, pad = true, children, style, ref }: CardProps) {
  return (
    <div
      ref={ref}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-xl)",
        boxShadow: floating ? "var(--shadow-card)" : "var(--shadow-none)",
        padding: pad ? "var(--pad-card)" : 0,
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: "var(--sp-3)" }}>
          <div>
            {title && <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>{title}</div>}
            {subtitle && <div className="hinweis" style={{ marginTop: 3 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
