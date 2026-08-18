// Bank suchen statt Bankleitzahl und FinTS-Adresse abtippen.
//
// Bewusst kein `<datalist>`: das rendert alle 1735 Einträge in den DOM und liefert keine
// Kontrolle darüber, was ausgewählt wurde — hier hängt aber mehr als ein Text daran
// (BLZ und Endpunkt). Deshalb eine kleine eigene Vorschlagsliste über gefilterten
// Treffern.
//
// Fehlt die Liste (sie ist gitignoriert und entsteht lokal über `npm run bankenliste`),
// erscheint der Hinweis und die Felder werden von Hand gefüllt. Kein Fehler.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bankenliste, bankenSuchen, type Bankeintrag } from "../fints/bankenliste";
import { FormField } from "./ds";

export function BankSuche({ onWaehlen }: { onWaehlen: (b: Bankeintrag) => void }) {
  const { t } = useTranslation();
  const [alle, setAlle] = useState<Bankeintrag[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void bankenliste().then(setAlle);
  }, []);

  useEffect(() => {
    // Klick daneben schließt die Liste — sonst bleibt sie über dem Formular stehen.
    const zu = (e: MouseEvent) => {
      if (huelle.current && !huelle.current.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, []);

  const treffer = bankenSuchen(alle, eingabe);

  function waehle(b: Bankeintrag) {
    onWaehlen(b);
    setEingabe(`${b.name}, ${b.ort}`);
    setOffen(false);
  }

  return (
    <div ref={huelle} style={{ position: "relative" }}>
      <FormField
        label={t("bankabruf.feldBankSuche")}
        hint={alle.length === 0 ? t("bankabruf.bankenlisteFehlt") : t("bankabruf.feldBankSucheHinweis")}
      >
        <input
          className="field"
          value={eingabe}
          disabled={alle.length === 0}
          placeholder={t("bankabruf.feldBankSuchePlatzhalter")}
          onChange={(e) => {
            setEingabe(e.target.value);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
        />
      </FormField>

      {offen && treffer.length > 0 && (
        <ul
          className="card"
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {treffer.map((b) => (
            <li key={b.blz}>
              <button
                type="button"
                className="row-btn"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "var(--sp-2) var(--sp-3)",
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                }}
                onClick={() => waehle(b)}
              >
                <div>{b.name}</div>
                <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {b.blz} · {b.ort} · {b.version}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
