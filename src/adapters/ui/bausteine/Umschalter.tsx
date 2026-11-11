// Umschalter — eine Leiste aus zwei bis vier Knöpfen, von denen genau einer gedrückt ist:
// „Alle · Ausgaben · Einnahmen", „Fluss · Saldo · Tabelle". Mechanik von Base UI
// `ToggleGroup`, Aussehen in `app.css` (`.umschalter`).
//
// **Warum ein Baustein.** Bis 2026-11-10 stand diese Leiste dreimal von Hand da
// (Kontoauszug, Verträge, Analyse), jedes Mal mit demselben langen Inline-Stil und
// demselben `aria-pressed`-Knopf — kopiert, nicht geteilt. Und alle drei waren nur
// einzelne Knöpfe: jeder ein eigener Halt für die Tabulatortaste, keine Pfeiltasten,
// kein Name für die Gruppe. `ToggleGroup` macht daraus EINEN Halt mit Pfeiltasten und
// einem Namen (`label`).
//
// **Genau einer bleibt gedrückt.** Base UI lässt in einer Einzelwahl-Gruppe den gedrückten
// Knopf wieder lösen — dann wäre KEINE Ansicht gewählt, und der Bereich darunter stünde
// leer. Ein Klick auf den gedrückten Knopf ändert hier deshalb nichts.
//
// Nicht verwechseln mit `Registerleiste`: die wechselt, WAS gezeigt wird (ein anderes
// Register, andere Daten). Ein Umschalter zeigt dieselben Daten anders oder gefiltert, und
// er steht IN der Karte, deren Inhalt er einstellt.

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { CSSProperties } from "react";

export interface UmschalterOption<W extends string> {
  readonly wert: W;
  readonly text: string;
}

export function Umschalter<W extends string>({
  optionen,
  wert,
  aufAendern,
  label,
  style,
}: {
  optionen: readonly UmschalterOption<W>[];
  wert: W;
  aufAendern: (w: W) => void;
  /** Der Name der Gruppe für die Vorlesehilfe — die Frage, die die Knöpfe beantworten. */
  label: string;
  style?: CSSProperties;
}) {
  return (
    <ToggleGroup
      className="umschalter"
      value={[wert]}
      onValueChange={(neu) => {
        const gewaehlt = neu[0] as W | undefined;
        if (gewaehlt !== undefined && gewaehlt !== wert) aufAendern(gewaehlt);
      }}
      aria-label={label}
      style={style}
    >
      {optionen.map((o) => (
        <Toggle key={o.wert} value={o.wert} className="umschalter-knopf">
          {o.text}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
