// Eine Auswahl aus einer Liste — der Ersatz für `<select className="field">`.
//
// **Warum überhaupt.** Ein natives `<select>` öffnet die Liste des Betriebssystems. Die
// ist tadellos bedienbar, folgt aber nicht dem Design der App: andere Schrift, andere
// Abstände, andere Farben, und auf jeder Plattform anders. In einer Oberfläche, in der
// alles andere aus denselben Tokens gebaut ist, ist genau das der sichtbare Bruch.
//
// **Warum nicht selbst gebaut.** Ein Auswahlfeld ist eine der undankbarsten Komponenten
// überhaupt: Tastaturbedienung samt Tippsuche, ARIA-Verdrahtung zwischen Knopf und Liste,
// Fokusfalle, Schließen bei Klick daneben, Positionierung am Rand des Fensters. Wer das
// selbst schreibt, hat am Ende eine Komponente, die mit der Maus gut aussieht und mit der
// Tastatur nicht funktioniert. Base UI liefert genau diese Mechanik und KEIN Aussehen —
// das kommt hier aus `app.css` und damit aus denselben Tokens wie der Rest.
//
// **Die Form der Schnittstelle ist Absicht.** Sie nimmt `optionen` als Liste statt
// `<option>`-Kinder: an den meisten der Stellen, die ersetzt werden, entstanden die
// Einträge ohnehin aus einem `map` über Konten, Kategorien oder Verträge. Eine Liste
// hereinzureichen ist dort weniger Code als vorher, nicht mehr.

import { Select } from "@base-ui/react/select";
import { Icon } from "./IconButton";

export interface AuswahlOption {
  readonly wert: string;
  readonly text: string;
  readonly deaktiviert?: boolean;
}

export function Auswahl({
  wert,
  aufAenderung,
  optionen,
  platzhalter,
  deaktiviert,
  ariaLabel,
  id,
}: {
  wert: string;
  aufAenderung: (wert: string) => void;
  optionen: readonly AuswahlOption[];
  /** Text, solange nichts gewählt ist. Ohne ihn steht das Feld leer da. */
  platzhalter?: string;
  deaktiviert?: boolean;
  ariaLabel?: string;
  id?: string;
}) {
  const gewaehlt = optionen.find((o) => o.wert === wert);

  return (
    <Select.Root
      // `items` gibt Base UI die Zuordnung Wert → Text. Ohne das zeigt der geschlossene
      // Knopf den WERT an, und der ist bei uns fast überall eine UUID.
      items={optionen.map((o) => ({ value: o.wert, label: o.text }))}
      value={wert}
      onValueChange={(v) => aufAenderung(String(v ?? ""))}
      disabled={deaktiviert}
    >
      <Select.Trigger className="auswahl-trigger field" id={id} aria-label={ariaLabel}>
        <Select.Value className="auswahl-wert">
          {gewaehlt ? gewaehlt.text : <span className="muted">{platzhalter ?? ""}</span>}
        </Select.Value>
        <Select.Icon className="auswahl-caret">
          <Caret />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner className="auswahl-positioner" sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup className="auswahl-popup">
            {optionen.map((o) => (
              <Select.Item key={o.wert} value={o.wert} disabled={o.deaktiviert} className="auswahl-item">
                <Select.ItemText>{o.text}</Select.ItemText>
                {/* Der Haken sitzt RECHTS und ausserhalb des Textflusses: säße er links,
                    ruckte die ganze Liste beim Öffnen um seine Breite zur Seite. */}
                <Select.ItemIndicator className="auswahl-haken">
                  <Icon name="uebernehmen" groesse={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** Derselbe Winkel wie im Hintergrundbild von `select.field` — nur als Element. */
function Caret() {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
