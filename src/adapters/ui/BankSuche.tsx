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
  const [aktiv, setAktiv] = useState(0);
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
            setAktiv(0);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
          onKeyDown={(e) => {
            // Eine Vorschlagsliste, die man nur mit der Maus bedienen kann, unterbricht
            // das Ausfüllen eines Formulars — hoch/runter/Enter/Esc gehören dazu.
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOffen(true);
              setAktiv((i) => Math.min(i + 1, treffer.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAktiv((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && offen && treffer[aktiv]) {
              e.preventDefault();
              waehle(treffer[aktiv]);
            } else if (e.key === "Escape") {
              setOffen(false);
            }
          }}
        />
      </FormField>

      {offen && treffer.length > 0 && (
        // Eigene Fläche statt der DS-Card: die setzt ihre Flächenfarbe inline, eine
        // Klasse „card" gibt es im Stylesheet nicht — die Liste stand deshalb ohne
        // Hintergrund über dem Formular und war unlesbar. Hier dieselben Tokens von
        // Hand, plus die Schatten-Stufe für schwebende Flächen.
        <ul
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            padding: "var(--sp-1) 0",
            listStyle: "none",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {treffer.map((b, i) => (
            <li key={b.blz}>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "var(--sp-2) var(--sp-3)",
                  background: i === aktiv ? "var(--surface-2)" : "transparent",
                  color: "var(--ink)",
                  border: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
                onMouseEnter={() => setAktiv(i)}
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
