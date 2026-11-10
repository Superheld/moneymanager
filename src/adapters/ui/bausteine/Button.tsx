// Der Knopf der App — vier Varianten, Mechanik von Base UI, Aussehen in `app.css` (`.btn`).
//
// **Warum Klassen statt Inline-Stil.** Bis 2026-11-10 setzte der Knopf sein ganzes
// Aussehen inline (er kam so aus der Design-System-Vorlage). Ein Inline-Stil kennt keine
// Zustände: Hover, sichtbarer Fokus und „gesperrt" lassen sich nur per CSS schreiben, und
// deshalb hatte der Knopf keinen davon. Aufgefallen ist es beim Schlüsselwechsel, wo ein
// zweiter Klick während des Laufs schaden konnte — der Knopf liess sich nicht sperren.
//
// **Warum Base UI darunter.** Ein gesperrter nativer `<button>` verliert den Fokus: der
// Browser setzt ihn auf `<body>`, und wer mit der Tastatur arbeitet, fängt oben auf der
// Seite neu an. Gesperrt wird hier aber meist GENAU der Knopf, der gerade gedrückt wurde
// (`laeuft`), oder einer, dessen eigene Handlung ihn überflüssig gemacht hat („Verbuchen",
// danach ist nichts mehr offen). Base UI sperrt mit `focusableWhenDisabled` über
// `aria-disabled` statt über das Attribut: der Fokus bleibt stehen, die Vorlesehilfe sagt
// „nicht verfügbar", und ein Klick kommt trotzdem nicht durch. Folge fürs CSS: gesperrt
// heisst dort `[data-disabled]`, NICHT `:disabled` — das native Attribut steht nie da.
//
// **Warum `type="button"` die Vorgabe ist.** Der Browser nimmt sonst `submit`, und ein
// Knopf in einem `<form>` schickt es dann ab, auch wenn er „Abbrechen" heisst. Wer ein
// Formular abschicken will, setzt `type="submit"` bewusst.
//
// **Die Variante `link`** ersetzt die frühere Klasse `.linkbtn`: eine gedämpfte
// Nebenaktion („Abbrechen", „Auswahl aufheben"). Sie stand an über fünfzig Stellen als
// roher Knopf mit eigener Klasse, weil der Katalog keinen Link-Knopf hatte. Nicht zu
// verwechseln mit `Zeilenlink` — der ist der Weg weiter und muss sich zeigen.

import { Button as BaseButton } from "@base-ui/react/button";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariante = "default" | "primary" | "ghost" | "link";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** `primary` für die eine Hauptaktion, `link` für die gedämpfte Nebenaktion. */
  variant?: ButtonVariante;
  /** Ein führendes „+" für Anlege-Aktionen. */
  plus?: boolean;
  /**
   * Etwas läuft, das dieser Knopf ausgelöst hat: er ist gesperrt und meldet sich als
   * beschäftigt (`aria-busy`). Getrennt von `disabled`, weil es eine andere Auskunft ist —
   * „geht gerade nicht" gegen „geht nicht" — und der Zeiger das zeigen soll.
   */
  laeuft?: boolean;
}

const KLASSE: Record<ButtonVariante, string> = {
  default: "btn",
  primary: "btn btn--primary",
  ghost: "btn btn--ghost",
  link: "btn btn--link",
};

export function Button({
  variant = "default",
  plus = false,
  laeuft = false,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      // Eine unbekannte Variante (aus einem Aufruf, den der Typ nicht sieht) fällt auf den
      // normalen Knopf zurück, statt ohne Aussehen dazustehen.
      className={KLASSE[variant] ?? KLASSE.default}
      type={type}
      disabled={disabled || laeuft}
      focusableWhenDisabled
      aria-busy={laeuft || undefined}
    >
      {plus && <span className="btn-plus">+</span>}
      {children}
    </BaseButton>
  );
}
