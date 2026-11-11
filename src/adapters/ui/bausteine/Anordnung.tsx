// Anordnung — die drei Kleinbausteine, die an Hunderten Stellen als Inline-Stil standen:
// eine Zeile mit Abstand, ein Stapel mit Abstand, eine Trennlinie.
//
// **Warum überhaupt.** Bis 2026-11-10 schrieb jede Stelle ihr `display: "flex", gap: …,
// alignItems: …` selbst — dieselbe Absicht in einem Dutzend Schreibweisen, mit `gap: 6`,
// `gap: 7`, `gap: "var(--sp-2)"` nebeneinander. Was eine Zeile IST, stand nirgends, und
// ein Abstand, der sich ändern sollte, war an zwanzig Stellen zu suchen.
//
// **Keine Utility-Sammlung.** Hier stehen genau die Formen, die es im Bestand wirklich
// gibt, mit den Abständen aus der Token-Reihe (`--sp-1` … `--sp-5`). Was davon abweicht
// (ein Raster, eine Ausrichtung, die nur eine Stelle braucht), bleibt am Ort.
//
// Der Erklärtext daneben ist eine Klasse und kein Baustein: `.hinweis` in `app.css` — er
// hängt an Elementen, die schon da sind (`div`, `span`, `p`), und ein Baustein müsste das
// Element raten.

import { Separator } from "@base-ui/react/separator";
import type { CSSProperties, ReactNode } from "react";

/** Die Abstandsstufen der Token-Reihe. */
export type Abstand = 1 | 2 | 3 | 4 | 5;

const luecke = (a: Abstand) => `var(--sp-${a})`;

/**
 * Nebeneinander, mit Abstand, und es darf umbrechen — der häufigste Fall: eine Pille
 * neben einem Namen, ein Knopf neben einer Zahl.
 *
 * `inline` macht eine `span` daraus, für eine Zeile IN einer Zeile (Tabellenzelle,
 * Überschrift); sonst ein `div`.
 */
export function Zeile({
  abstand = 2,
  ausrichtung = "center",
  umbruch = true,
  inline = false,
  style,
  children,
}: {
  abstand?: Abstand;
  ausrichtung?: "center" | "baseline" | "start" | "end";
  umbruch?: boolean;
  inline?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const stil: CSSProperties = {
    display: inline ? "inline-flex" : "flex",
    gap: luecke(abstand),
    alignItems: ausrichtung === "start" ? "flex-start" : ausrichtung === "end" ? "flex-end" : ausrichtung,
    flexWrap: umbruch ? "wrap" : "nowrap",
    ...style,
  };
  return inline ? <span style={stil}>{children}</span> : <div style={stil}>{children}</div>;
}

/** Untereinander, mit Abstand — statt eines `marginTop` an jedem Kind. */
export function Stapel({
  abstand = 3,
  style,
  children,
}: {
  abstand?: Abstand;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return <div style={{ display: "flex", flexDirection: "column", gap: luecke(abstand), ...style }}>{children}</div>;
}

/**
 * Eine Trennlinie, optional mit einem Wort in der Mitte („oder"). Base UI `Separator`:
 * eine Vorlesehilfe hört die Grenze (`role="separator"`), statt über einen leeren Kasten
 * zu stolpern. Mit Text ist die Linie Zierde und das Wort die Aussage.
 */
export function Trenner({ text, style }: { text?: string; style?: CSSProperties }) {
  if (!text) return <Separator className="trenner" style={style} />;
  return (
    <div className="trenner-mit-text" style={style}>
      <Separator className="trenner" />
      <span>{text}</span>
      <Separator className="trenner" />
    </div>
  );
}
