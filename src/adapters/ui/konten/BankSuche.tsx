// Bank suchen statt Bankleitzahl und FinTS-Adresse abtippen.
//
// Bewusst kein `<datalist>`: das rendert alle Einträge der Bankenliste in den DOM und
// liefert keine Kontrolle darüber, was ausgewählt wurde — hier hängt aber mehr als ein
// Text daran (BLZ und Endpunkt). Deshalb eine Vorschlagsliste über gefilterten Treffern.
//
// **Mechanik von Base UI `Combobox` (seit 2026-11-10).** Der Eigenbau hatte Pfeiltasten,
// Enter und Escape — aber keine Semantik: kein `combobox`, keine `listbox`, keine
// Markierung. Eine Vorlesehilfe erfuhr nicht, dass überhaupt Vorschläge erscheinen, und
// nicht, welcher markiert war. Dazu kam ein eigener Lauscher am Dokument für den Klick
// daneben. Das alles kommt jetzt von dort; was hier bleibt, ist die Suche selbst
// (`bankenSuchen`: Name, BLZ, IBAN) — Base UI filtert deshalb NICHT mit (`filter={null}`).
//
// Fehlt die Liste (sie ist gitignoriert und entsteht lokal über `npm run bankenliste`),
// erscheint der Hinweis und die Felder werden von Hand gefüllt. Kein Fehler.

import { Combobox } from "@base-ui/react/combobox";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bankenliste, bankenSuchen, type Bankeintrag } from "../../fints/bankenliste";
import { FormField } from "../bausteine";

const anzeige = (b: Bankeintrag) => `${b.name}, ${b.ort}`;

export function BankSuche({ onWaehlen }: { onWaehlen: (b: Bankeintrag) => void }) {
  const { t } = useTranslation();
  const [alle, setAlle] = useState<Bankeintrag[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Bankeintrag | null>(null);

  useEffect(() => {
    void bankenliste().then(setAlle);
  }, []);

  const treffer = bankenSuchen(alle, eingabe);

  return (
    <Combobox.Root
      items={treffer}
      filter={null}
      inputValue={eingabe}
      onInputValueChange={setEingabe}
      value={gewaehlt}
      onValueChange={(b) => {
        setGewaehlt(b);
        if (b) onWaehlen(b);
      }}
      itemToStringLabel={anzeige}
      // Der erste Treffer ist markiert, sobald es Treffer gibt — wie im Eigenbau: wer den
      // Namen tippt und Enter drückt, hat die erste Bank gewählt.
      autoHighlight
      isItemEqualToValue={(a, b) => a.blz === b.blz}
      disabled={alle.length === 0}
    >
      <FormField
        label={t("bankabruf.feldBankSuche")}
        hint={alle.length === 0 ? t("bankabruf.bankenlisteFehlt") : t("bankabruf.feldBankSucheHinweis")}
      >
        {/* Der Name steht am Feld selbst: `FormField` verbindet sein Label nur mit einem
            nativen Feld, und das Eingabefeld einer Combobox ist keins. */}
        <Combobox.Input
          className="field"
          aria-label={t("bankabruf.feldBankSuche")}
          placeholder={t("bankabruf.feldBankSuchePlatzhalter")}
        />
      </FormField>

      <Combobox.Portal>
        <Combobox.Positioner className="vorschlag-positioner" sideOffset={4} align="start">
          <Combobox.Popup className="vorschlagsliste">
            <Combobox.List>
              {(b: Bankeintrag) => (
                <Combobox.Item key={b.blz} value={b} className="vorschlag">
                  <div>{b.name}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {b.blz} · {b.ort} · {b.version}
                  </div>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
