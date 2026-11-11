// Eine Rücklage anlegen oder bearbeiten.
//
// Bis 2026-11-10 lag sein Zustand (zehn Felder) im `RuecklagenScreen` (K3 der
// Oberflächenliste): der Screen musste beim Öffnen jedes Feld einzeln zurücksetzen und
// beim Bearbeiten wieder füllen. Als eigene Komponente mit eigenem Zustand beginnt jeder
// Dialog frisch — der Screen sagt nur, für welche Rücklage.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hatZiel, minorZuMajor, waehlbareKonten, type Ruecklage, type Zahlungskonto } from "../../../application";
import { ruecklageAktualisieren, ruecklageAnlegen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

/** Die beiden Formen einer Rücklage — die Wahl im Dialog, nicht im Datenmodell. */
type Form = "ziel" | "rate";

export function RuecklageDialog({
  ruecklage,
  heute,
  konten,
  onClose,
  onGespeichert,
}: {
  /** `null` legt eine neue an. */
  ruecklage: Ruecklage | null;
  heute: string;
  konten: readonly Zahlungskonto[];
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const r = ruecklage;
  const [form, setForm] = useState<Form>(r ? (hatZiel(r) ? "ziel" : "rate") : "ziel");
  const [bezeichnung, setBezeichnung] = useState(r?.bezeichnung ?? "");
  const [ziel, setZiel] = useState(r?.ziel == null ? "" : String(minorZuMajor(r.ziel, geld.waehrung)));
  const [fristMonate, setFristMonate] = useState(r?.fristMonate == null ? "" : String(r.fristMonate));
  const [rate, setRate] = useState(r?.rate == null ? "" : String(minorZuMajor(r.rate, geld.waehrung)));
  const [beginn, setBeginn] = useState(r?.beginn ?? heute);
  const [kontoId, setKontoId] = useState(r?.kontoId ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    // Nur die Felder DER GEWÄHLTEN FORM gehen mit. Sonst schickte ein Formularwechsel
    // beides los, und der Use-Case wiese es als Widerspruch ab — mit einer Meldung über
    // ein Feld, das gerade gar nicht zu sehen ist.
    const eingabe = {
      bezeichnung,
      ziel: form === "ziel" ? (geld.parse(ziel) ?? 0) : undefined,
      fristMonate: form === "ziel" ? Number(fristMonate) || 0 : undefined,
      rate: form === "rate" ? (geld.parse(rate) ?? 0) : undefined,
      beginn,
      kontoId: kontoId || undefined,
    };
    try {
      if (r) await ruecklageAktualisieren(r.id, eingabe);
      else await ruecklageAnlegen(eingabe);
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={r ? t("ruecklagen.modalBearbeiten") : t("ruecklagen.modalAnlegen")}
      subtitle={t("ruecklagen.modalUntertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("ruecklagen.speichern")}</Button><Button variant="link" onClick={onClose}>{t("ruecklagen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("ruecklagen.feldBezeichnung")} required>
          <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder={t("ruecklagen.feldBezeichnungPlatzhalter")} />
        </FormField>

        {/* Die Form ist eine Wahl mit zwei sichtbaren Möglichkeiten und kein
            Kästchen: „hat ein Ziel" beantwortet die Frage nur in einer Richtung,
            und die andere Form müsste man erraten. */}
        <FormField label={t("ruecklagen.feldForm")} hint={t(`ruecklagen.formHinweis.${form}`)}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldForm")}
            wert={form}
            aufAenderung={(v) => setForm(v as Form)}
            optionen={[
              { wert: "ziel", text: t("ruecklagen.form.ziel") },
              { wert: "rate", text: t("ruecklagen.form.rate") },
            ]}
          />
        </FormField>

        {form === "ziel" ? (
          <>
            <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} required hint={t("ruecklagen.feldZielHinweis")}>
              <input className="field" inputMode="decimal" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder={geld.format(0)} />
            </FormField>
            <FormField label={t("ruecklagen.feldFrist")} required hint={t("ruecklagen.feldFristHinweis")}>
              <input className="field" inputMode="numeric" value={fristMonate} onChange={(e) => setFristMonate(e.target.value)} placeholder="96" />
            </FormField>
          </>
        ) : (
          <FormField label={`${t("ruecklagen.feldRate")} ${geld.symbol}`} required hint={t("ruecklagen.feldRateHinweis")}>
            <input className="field" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={geld.format(0)} />
          </FormField>
        )}

        <FormField label={t("ruecklagen.feldBeginn")}>
          <Datumsfeld ariaLabel={t("ruecklagen.feldBeginn")} wert={beginn} aufAenderung={setBeginn} />
        </FormField>
        <FormField label={t("ruecklagen.feldKonto")} hint={t("ruecklagen.feldKontoHinweis")}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldKonto")}
            wert={kontoId}
            aufAenderung={setKontoId}
            optionen={[{ wert: "", text: t("ruecklagen.kontoKeins") }, ...waehlbareKonten(konten, kontoId).map((k) => ({ wert: k.id, text: k.bezeichnung }))]}
          />
        </FormField>
      </div>
    </Modal>
  );
}
