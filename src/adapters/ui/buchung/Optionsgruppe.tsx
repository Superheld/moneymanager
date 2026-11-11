// Eine Frage mit mehreren Antworten, von denen genau eine gilt — Mechanik von Base UI
// `RadioGroup`/`Radio`, Aussehen in `app.css` (`.option`, `.optionsfeld`).
//
// **Warum hier und nicht in `bausteine/`.** Optionsfelder gibt es heute nur im
// Buchungsdialog (Gegenbein wählen, Richtung). Ein Baustein, den nur ein Bereich benutzt,
// ist ein Teil dieses Bereichs — braucht ihn ein zweiter, wandert er.
//
// **Was Base UI hier bringt, das vorher fehlte:** die Pfeiltasten. Eine Gruppe ist EIN
// Halt für die Tabulatortaste, und innerhalb wechseln die Pfeile die Antwort. Die native
// Gruppe konnte das auch, aber nur, solange alle Felder denselben `name` trugen; die
// `Richtungswahl` daneben war eine eigene `role="radiogroup"` aus Knöpfen und versprach die
// Pfeiltasten im Kommentar, ohne sie zu haben.
//
// Tests greifen über `getByRole("radio", { name })` und `toBeChecked()`.

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { CSSProperties, ReactNode } from "react";

export function Optionsgruppe<W extends string>({
  wert,
  aufAendern,
  label,
  children,
  style,
}: {
  wert: W;
  aufAendern: (w: W) => void;
  /** Die Frage — der Name der Gruppe für die Vorlesehilfe. */
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <RadioGroup
      value={wert}
      onValueChange={(v) => aufAendern(v as W)}
      aria-label={label}
      style={style}
    >
      {children}
    </RadioGroup>
  );
}

/**
 * Eine Antwort. Steht in einem `<label>`: der ganze Inhalt ist Klickfläche und Name.
 *
 * `style` gehört der Zeile — die Gegenbein-Liste zieht Trennlinien darunter, der Ausweg
 * darunter nicht.
 */
export function Option({
  wert,
  children,
  disabled,
  style,
}: {
  wert: string;
  children: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <label className="option" data-disabled={disabled || undefined} style={style}>
      <Radio.Root className="optionsfeld" value={wert} disabled={disabled}>
        <Radio.Indicator className="optionsfeld-punkt" />
      </Radio.Root>
      {children}
    </label>
  );
}
