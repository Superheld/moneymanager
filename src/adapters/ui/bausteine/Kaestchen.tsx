// Ein Kästchen zum Ankreuzen — Mechanik von Base UI `Checkbox`, Aussehen in `app.css`
// (`.kaestchen`).
//
// **Warum ein Baustein statt `<input type="checkbox">`.** Das native Kästchen stand an
// rund zwanzig Stellen, jede mit eigenem `accentColor`, eigener Hülle und eigenem Abstand —
// manche mit, manche ohne Akzentfarbe, also in der App in zwei Farben. Und es folgt dem
// Betriebssystem, nicht den Tokens: dieselbe Lücke, aus der `Auswahl` entstanden ist.
//
// **Wie es heisst.** Mit Text (`children`) steht es in einem `<label>`, und der Text ist
// sein Name — ein Klick auf den Text kreuzt an, wie beim nativen. Ohne Text (in einer
// Tabellenzelle, im Spaltenkopf) gibt es nichts, was es benennt; dann ist `label` Pflicht,
// sonst meldet eine Vorlesehilfe nur „Kontrollkästchen". `label` neben `children` geht
// auch: dann gilt `label`, für den Fall, dass der sichtbare Text mehr sagt als den Namen.
//
// **Base UI rendert ein `<span role="checkbox">` und ein verstecktes `<input>`.** Tests
// greifen deshalb über die Rolle und `toBeChecked()`, nicht über `.checked` — das gibt es
// am `span` nicht.

import { Checkbox } from "@base-ui/react/checkbox";
import { useId, type CSSProperties, type ReactNode } from "react";

export interface KaestchenProps {
  readonly an: boolean;
  readonly aufAendern: (an: boolean) => void;
  /** Der sichtbare Text daneben — und damit der Name. */
  readonly children?: ReactNode;
  /** Der Name, wenn kein Text daneben steht (oder der Text mehr sagt als den Namen). */
  readonly label?: string;
  readonly disabled?: boolean;
  readonly title?: string;
  /**
   * Text, der über mehrere Zeilen läuft, richtet das Kästchen an der ERSTEN Zeile aus statt
   * an der Mitte — sonst steht es neben dem zweiten Satz und nicht neben dem Namen.
   */
  readonly oben?: boolean;
  /** Für die Hülle: Schriftgrösse, Farbe, Abstand am Ort. */
  readonly style?: CSSProperties;
  /** Zusätzliche Klasse an der Hülle (etwa: beim Drucken ausblenden). */
  readonly className?: string;
}

/** Der Haken — derselbe Strich wie `uebernehmen` in `IconButton`. */
function Haken() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function Kaestchen({ an, aufAendern, children, label, disabled, title, oben, style, className }: KaestchenProps) {
  const namensId = useId();
  // Steht das Kästchen in einem `<label>`, verweist Base UI per `aria-labelledby` auf das
  // GANZE Label — und `aria-labelledby` gewinnt gegen `aria-label`. Ein eigener Name
  // daneben bliebe damit wirkungslos, das Kästchen hiesse wie der Absatz neben ihm. Er
  // kommt deshalb als eigenes, unsichtbares Element, auf das der Verweis zeigt.
  const eigenerName = label !== undefined && children !== undefined;
  const feld = (
    <Checkbox.Root
      className="kaestchen-feld"
      checked={an}
      onCheckedChange={(neu) => aufAendern(neu)}
      disabled={disabled}
      aria-label={eigenerName ? undefined : label}
      aria-labelledby={eigenerName ? namensId : undefined}
      // Ohne Text gibt es keine Hülle, die den Hinweis tragen könnte.
      title={children === undefined ? title : undefined}
    >
      <Checkbox.Indicator className="kaestchen-haken">
        <Haken />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );

  if (children === undefined) return feld;

  return (
    <label
      className={["kaestchen", oben && "kaestchen--oben", className].filter(Boolean).join(" ")}
      title={title}
      data-disabled={disabled || undefined}
      style={style}
    >
      {feld}
      {eigenerName && <span id={namensId} hidden>{label}</span>}
      {children}
    </label>
  );
}
