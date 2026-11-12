// CoverageTrack — der waagerechte Balken für Budgets und Rücklagen: bis zum Ziel in der
// Akzentfarbe, darüber in der Warnfarbe. Optional eine Zeile darüber mit Beschriftung und
// „ist / soll".
//
// **Mechanik von Base UI `Meter` (seit 2026-11-10).** Vorher waren es zwei `div`s: wer
// nicht hinsah, erfuhr von dem Balken nichts — für eine Vorlesehilfe gab es ihn nicht.
// Ein `meter` meldet Wert und Grenzen. `Meter` und nicht `Progress`: der Balken zeigt
// einen STAND gegen ein Ziel, keinen Fortschritt einer Aufgabe, die fertig wird.
//
// **Über dem Ziel** meldet `Meter` den Wert gekappt (ein `meter` kennt kein „mehr als
// voll"), und genau dort zählt die Überschreitung. Steht rechts ein Text („620 / 600 €"),
// wird er deshalb der Wert für die Vorlesehilfe — er sagt, um wie viel.

import { Meter } from "@base-ui/react/meter";
import type { CSSProperties, ReactNode } from "react";

export interface CoverageTrackProps {
  /** Der aktuelle Stand (verbraucht, angespart). */
  value: number;
  /** Das Ziel, gegen das der Balken füllt (Vorgabe 100). */
  max?: number;
  /** Beschriftung links über dem Balken. */
  label?: ReactNode;
  /** Text rechts über dem Balken, etwa „520 / 600 €". */
  right?: ReactNode;
  /** Überschreitung erzwingen; sonst gilt `value > max`. */
  over?: boolean;
  /**
   * Der Name des Balkens, wenn keine sichtbare Beschriftung dasteht (`label` leer) — in
   * einer Liste, deren Zeile den Namen schon trägt. Ohne ihn hiesse der Balken nichts.
   */
  name?: string;
  /**
   * Eine Marke auf derselben Skala wie `value` — ein senkrechter Strich über dem Balken
   * (seit 2026-11-11, für das Soll einer Rücklage). Ein Balken plus Strich vergleicht Ist
   * und Soll in EINER Zeile; zwei Balken untereinander liessen den Vergleich im Kopf.
   */
  marke?: number;
  style?: CSSProperties;
}

export function CoverageTrack({ value, max = 100, label, right, over, name, marke, style }: CoverageTrackProps) {
  const sicheresMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((value / sicheresMax) * 100)));
  const istUeber = over ?? value > max;
  const rechtsText = typeof right === "string" || typeof right === "number" ? String(right) : "";

  return (
    <Meter.Root
      value={Math.max(0, Math.min(value, sicheresMax))}
      max={sicheresMax}
      getAriaValueText={rechtsText ? () => rechtsText : undefined}
      aria-label={label ? undefined : name}
      style={style}
    >
      {(label || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)", marginBottom: 6 }}>
          <Meter.Label render={<span />}>{label}</Meter.Label>
          <span className="num" style={{ color: istUeber ? "var(--warn-deep)" : "var(--ink-2)", whiteSpace: "nowrap" }}>{right}</span>
        </div>
      )}
      <div style={{ position: "relative" }}>
      <Meter.Track style={{ height: 7, borderRadius: "var(--r-pill)", background: "var(--line)", overflow: "hidden" }}>
        {/* Die Breite setzen wir selbst: Base UI füllt nach dem gekappten Wert, wir nach
            dem gerundeten Anteil — und die Farbe hängt an der Überschreitung. */}
        <Meter.Indicator
          data-ueber={istUeber || undefined}
          style={{ height: "100%", width: pct + "%", borderRadius: "var(--r-pill)", background: istUeber ? "var(--warn)" : "var(--accent)" }}
        />
      </Meter.Track>
      {/* Ausserhalb der Spur, weil die ihre Füllung abschneidet (`overflow: hidden`);
          der Strich ragt oben und unten etwas über. */}
      {marke != null && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -3,
            bottom: -3,
            left: `calc(${Math.max(0, Math.min(100, (marke / sicheresMax) * 100))}% - 1px)`,
            width: 2,
            borderRadius: 1,
            background: "var(--ink)",
          }}
        />
      )}
      </div>
    </Meter.Root>
  );
}
