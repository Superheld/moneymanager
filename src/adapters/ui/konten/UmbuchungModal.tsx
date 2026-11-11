// Der Dialog „Umbuchen": Geld zwischen zwei eigenen Offline-Konten verschieben.
//
// Bis 2026-11-10 stand er am Ende von `KontenScreen.tsx` (K2 der Oberflächenliste) — eine
// eigene Komponente mit eigenem Zustand, die nur den Platz in der Datei teilte.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { waehlbareKonten, type Zahlungskonto } from "../../../application";
import { umbuchungErfassen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

export function UmbuchungModal({ konten, vonId, heute, onClose, onSaved }: { konten: Zahlungskonto[]; vonId: string; heute: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Vorbelegt wird das aktive Konto nur, wenn es überhaupt in der Liste steht: ist gerade
  // ein Online-Konto gewählt, fehlt es hier, und ein `value`, das keine Option trifft,
  // zeigt im Browser stumm die erste an — gespeichert würde dann ein anderes Konto als
  // das angezeigte.
  const [von, setVon] = useState(konten.some((k) => k.id === vonId) ? vonId : konten[0]?.id ?? "");
  const [nach, setNach] = useState(konten.find((k) => k.id !== vonId)?.id ?? "");
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await umbuchungErfassen({ vonKontoId: von, nachKontoId: nach, datum, betrag: geld.parse(betrag) ?? 0, notiz });
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.umbuchung.titel")}
      subtitle={t("konten.umbuchung.untertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button><Button variant="link" onClick={onClose}>{t("konten.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("konten.umbuchung.vonKonto")} required>
          <Auswahl
            ariaLabel={t("konten.umbuchung.vonKonto")}
            wert={von}
            aufAenderung={setVon}
            optionen={waehlbareKonten(konten).map((k) => ({ wert: k.id, text: k.bezeichnung }))}
          />
        </FormField>
        <FormField label={t("konten.umbuchung.nachKonto")} required>
          <Auswahl
            ariaLabel={t("konten.umbuchung.nachKonto")}
            wert={nach}
            aufAenderung={setNach}
            optionen={waehlbareKonten(konten).map((k) => ({ wert: k.id, text: k.bezeichnung }))}
          />
        </FormField>
        <FormField label={t("konten.feldDatum")} required>
          <Datumsfeld ariaLabel={t("konten.feldDatum")} wert={datum} aufAenderung={setDatum} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        <FormField label={t("konten.feldBezeichnung")} hint={t("konten.optional")}>
          <input className="field" aria-label={t("konten.feldBezeichnung")} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.umbuchung.notizPlatzhalter")} />
        </FormField>
      </div>
    </Modal>
  );
}
