// KPIStat — eine Kennzahl mit Beschriftung und Meta-Zeile. `size="hero"` ist die eine
// grosse Zahl eines Screens, `tile` die mittlere, `chip` die kleine Kachel mit Rahmen.
// `tone` färbt den Wert; welcher Ton wann, entscheiden `geldTon`/`warnTon` (siehe
// `geldFarbe.ts`), nicht der Aufrufer.
//
// Seit 2026-11-10 TypeScript statt `.jsx` mit handgeschriebener `.d.ts`. Base UI hat dafür
// kein Gegenstück — eine Kennzahl ist Aussehen.

import type { CSSProperties, ReactNode } from "react";

export interface KPIStatProps {
  /** Kurze Beschriftung über der Zahl. */
  label: ReactNode;
  /** Die Zahl selbst, fertig formatiert. */
  value: ReactNode;
  /** Einheit dahinter, etwa „€" oder „%". */
  unit?: string;
  /** Gedämpfte Zeile unter der Zahl. */
  meta?: ReactNode;
  /** Farbe des Werts. */
  tone?: "default" | "plan" | "warn" | "ok";
  /** hero = die eine grosse Zahl; tile = mittel; chip = kleine Kachel mit Rahmen. */
  size?: "hero" | "tile" | "chip";
  /** Eine `Pill` hinter der Beschriftung. */
  tag?: ReactNode;
  style?: CSSProperties;
}

const TON: Record<NonNullable<KPIStatProps["tone"]>, string> = {
  default: "var(--ink)",
  plan: "var(--accent-deep)",
  warn: "var(--warn-deep)",
  ok: "var(--ok-deep)",
};

export function KPIStat({ label, value, unit, meta, tone = "default", size = "chip", tag, style }: KPIStatProps) {
  const tonFarbe = TON[tone] ?? TON.default;
  const wertGroesse = size === "hero" ? "var(--fs-display)" : size === "tile" ? "var(--fs-h1)" : "var(--fs-h2)";
  // Die Einheit steht eine Stufe unter der Zahl. Bei der grossen Zahl liegt das zwischen
  // zwei Textstufen (h1 30, h2 20) und ist deshalb eine eigene Zahl, keine Stufe.
  const einheitGroesse = size === "hero" ? "28px" : "var(--fs-body)";

  const huelle: CSSProperties =
    size === "chip"
      ? { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: "13px 16px", minWidth: 128 }
      : {};

  return (
    <div style={{ ...huelle, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semi)", color: "var(--ink-3)" }}>
        {label}
        {tag}
      </div>
      <div className="num" style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: size === "hero" ? 6 : 5, lineHeight: 1 }}>
        <span style={{ fontSize: wertGroesse, fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", color: tonFarbe }}>{value}</span>
        {unit && <span style={{ fontSize: einheitGroesse, fontWeight: "var(--fw-bold)", color: tone === "default" ? "var(--ink-2)" : tonFarbe }}>{unit}</span>}
      </div>
      {meta && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 7 }}>{meta}</div>}
    </div>
  );
}
