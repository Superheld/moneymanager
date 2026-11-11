// Eine Rücklage ausbuchen: das Geld ist ausgegeben, wofür es zurückgelegt war.
//
// Bis 2026-11-10 lag sein Zustand (sechs Felder) im `RuecklagenScreen` (K3 der
// Oberflächenliste). Als eigene Komponente beginnt er bei jedem Öffnen frisch, statt dass
// der Screen jedes Feld zurücksetzt.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hatZiel, minorZuMajor, type Ruecklage, type Ruecklagensicht } from "../../../application";
import { ruecklageAusbuchen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

export function AusbuchungDialog({
  ruecklage,
  heute,
  buchungswahl,
  onClose,
  onGespeichert,
}: {
  ruecklage: Ruecklage;
  heute: string;
  buchungswahl: Ruecklagensicht["buchungswahl"];
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [buchungId, setBuchungId] = useState("");
  const [ziel, setZiel] = useState(ruecklage.ziel == null ? "" : String(minorZuMajor(ruecklage.ziel, geld.waehrung)));
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await ruecklageAusbuchen(ruecklage, {
        datum,
        betrag: geld.parse(betrag) ?? undefined,
        istbuchungId: buchungId || undefined,
        ziel: hatZiel(ruecklage) ? (geld.parse(ziel) ?? undefined) : undefined,
      });
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("ruecklagen.modalAusbuchen")}
      subtitle={`${ruecklage.bezeichnung} · ${t(hatZiel(ruecklage) ? "ruecklagen.ausbuchenNeustart" : "ruecklagen.ausbuchenEnde")}`}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("ruecklagen.speichern")}</Button><Button variant="link" onClick={onClose}>{t("ruecklagen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("ruecklagen.feldAusDatum")} required>
          <Datumsfeld ariaLabel={t("ruecklagen.feldAusDatum")} wert={datum} aufAenderung={setDatum} />
        </FormField>
        <FormField label={`${t("ruecklagen.feldAusBetrag")} ${geld.symbol}`}>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        {/* Die Verknüpfung leistet zweierlei: sie hält fest, wofür die Rücklage
            draufging, UND sie nimmt die Ausgabe aus der Budgetbewertung. Deshalb
            steht der zweite Teil im Hinweis — sonst überrascht er später. */}
        <FormField label={t("ruecklagen.feldAusBuchung")} hint={t("ruecklagen.feldAusBuchungHinweis")}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldAusBuchung")}
            wert={buchungId}
            aufAenderung={setBuchungId}
            optionen={[
              { wert: "", text: t("ruecklagen.buchungKeine") },
              ...buchungswahl.map((b) => ({
                wert: b.id,
                text: `${b.datum} · ${geld.format(b.betrag)} ${geld.symbol}${b.bezeichnung ? ` · ${b.bezeichnung}` : ""}`,
              })),
            ]}
          />
        </FormField>
        {hatZiel(ruecklage) && (
          <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} hint={t("ruecklagen.feldNeuesZielHinweis")}>
            <input className="field" inputMode="decimal" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder={geld.format(0)} />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
