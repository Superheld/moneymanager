// Zeilenauswahl — ein Auswahlfeld für eine Entscheidung IN einer Tabellenzeile.
//
// Der Name sagt, wo es hingehört, und das ist der ganze Zweck. Ein
// `<select className="field">` ist auf Formulare ausgelegt: volle Breite, grosse
// Innenabstände, eigene Zeile. In einer Tabellenzelle sprengt es die Zeilenhöhe und
// erzwingt eine Spaltenbreite, die der Inhalt nicht braucht.
//
// Es ist bewusst KEINE Pill-Variante, auch wenn es daneben ähnlich gross ist: eine Pille
// ist ein Etikett und sagt, was etwas IST. Hier wird gewählt, und das muss man dem Feld
// ansehen — daher Rahmen, Zeiger und der Auswahlpfeil des Systems. Wer es „Pille" nennt,
// wird es früher oder später auch wie eine bauen und die Auswahl verlieren.
//
// Passt überall dorthin, wo eine Zeile eine kleine Entscheidung trägt: Format je Konto,
// Rolle je Person, Einheit je Position.
//
// **Ein `aria-label` ist Pflicht.** In einer Tabelle steht die Beschriftung in der
// Kopfzeile und nicht am Feld; ohne den Namen meldet eine Vorlesehilfe nur „Auswahl" und
// die Spalte ist verloren. Deshalb steht er hier im Typ und nicht als Option.

import type { ReactNode } from "react";

export interface Wahlmoeglichkeit<T extends string> {
  readonly wert: T;
  readonly text: ReactNode;
  /** Erklärt, was diese Wahl bedeutet — landet im `title` der Option. */
  readonly hinweis?: string;
  /**
   * Nicht wählbar, aber sichtbar.
   *
   * Für Möglichkeiten, die es hier gerade nicht gibt: eine bestehende Wahl darf nicht
   * stumm verschwinden, weil sich die Umstände geändert haben — sonst steht in der
   * Datenbank etwas anderes als auf dem Bildschirm.
   */
  readonly gesperrt?: boolean;
}

export function Zeilenauswahl<T extends string>({
  wert,
  moeglichkeiten,
  onChange,
  label,
  hinweis,
  disabled,
}: {
  readonly wert: T;
  readonly moeglichkeiten: readonly Wahlmoeglichkeit<T>[];
  readonly onChange: (wert: T) => void | Promise<void>;
  /** Der Name des Feldes — in einer Tabelle die Spaltenüberschrift. Pflicht, siehe Kopf. */
  readonly label: string;
  /** Erklärung zur AKTUELLEN Wahl, als `title` am Feld. */
  readonly hinweis?: string;
  readonly disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      title={hinweis}
      value={wert}
      disabled={disabled}
      onChange={(e) => void onChange(e.target.value as T)}
      style={{
        font: "inherit",
        fontSize: "var(--fs-xs)",
        padding: "2px 6px",
        borderRadius: "var(--r-pill, 999px)",
        border: "1px solid var(--line)",
        background: "var(--surface)",
        color: "var(--ink-2)",
        cursor: disabled ? "default" : "pointer",
        maxWidth: "100%",
      }}
    >
      {moeglichkeiten.map((m) => (
        <option key={m.wert} value={m.wert} title={m.hinweis} disabled={m.gesperrt}>
          {m.text}
        </option>
      ))}
    </select>
  );
}
