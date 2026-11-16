// Eine Rücklage mit Kategorie abschliessen: der Zyklus ist zu Ende — mit dem Kauf oder am
// Ende des Urlaubs, das ist derselbe Handgriff (ADR-0006, Paket 5).
//
// Anders als beim Ausbuchen (`AusbuchungDialog`, nur noch für den Altbestand ohne
// Kategorie) gibt es hier KEINE Buchungswahl: die Ausgaben hat die Rücklage über ihre
// Kategorie oder die Zuordnung längst gefunden. Der Dialog zeigt deshalb, wie sie am
// gewählten Tag dasteht — was frei wird oder wie weit sie im Minus ist —, und lässt nur
// noch wählen, ob sie neu beginnt oder endet. Gerechnet wird in der Anwendungsschicht
// (`abschlussvorschau`), gegen dieselbe Sicht wie die Liste.
//
// Vorbelegt ist „neu beginnen" bei einer Rücklage mit Ziel und „beenden" bei einer freien:
// das ist, was das Ausbuchen bis Paket 4 von selbst tat. Eine Vorbelegung ist hier keine
// erfundene Entscheidung — gewählt werden muss eins von beidem, und der Nutzer sieht es.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { abschlussvorschau, hatZiel, minorZuMajor, type Ruecklage, type Ruecklagensicht } from "../../../application";
import { ruecklageAbschliessen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

type Folge = "neu" | "ende";

export function AbschlussDialog({
  ruecklage,
  sicht,
  heute,
  onClose,
  onGespeichert,
}: {
  ruecklage: Ruecklage;
  sicht: Ruecklagensicht;
  heute: string;
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [datum, setDatum] = useState(heute);
  const [folge, setFolge] = useState<Folge>(hatZiel(ruecklage) ? "neu" : "ende");
  const [ziel, setZiel] = useState(ruecklage.ziel == null ? "" : String(minorZuMajor(ruecklage.ziel, geld.waehrung)));
  const [fehler, setFehler] = useState<string | null>(null);
  const vorschau = useMemo(() => abschlussvorschau(sicht, ruecklage, datum), [sicht, ruecklage, datum]);

  async function speichern() {
    setFehler(null);
    try {
      await ruecklageAbschliessen(
        ruecklage.id,
        { datum, folge, ziel: folge === "neu" && hatZiel(ruecklage) ? (geld.parse(ziel) ?? undefined) : undefined },
        heute,
      );
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("ruecklagen.modalAbschliessen")}
      subtitle={`${ruecklage.bezeichnung} · ${t("ruecklagen.abschliessenUntertitel")}`}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("ruecklagen.abschliessen")}</Button><Button variant="link" onClick={onClose}>{t("ruecklagen.abbrechen")}</Button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("ruecklagen.feldAusDatum")} required>
          <Datumsfeld ariaLabel={t("ruecklagen.feldAusDatum")} wert={datum} aufAenderung={setDatum} />
        </FormField>
        <FormField label={t("ruecklagen.feldFolge")} hint={t(`ruecklagen.folgeHinweis.${folge}`)}>
          <Auswahl
            ariaLabel={t("ruecklagen.feldFolge")}
            wert={folge}
            aufAenderung={(v) => setFolge(v as Folge)}
            optionen={[
              { wert: "neu", text: t("ruecklagen.folge.neu") },
              { wert: "ende", text: t("ruecklagen.folge.ende") },
            ]}
          />
        </FormField>
        {folge === "neu" && hatZiel(ruecklage) && (
          <FormField label={`${t("ruecklagen.feldZiel")} ${geld.symbol}`} hint={t("ruecklagen.feldNeuesZielHinweis")}>
            <input className="field" inputMode="decimal" value={ziel} onChange={(e) => setZiel(e.target.value)} placeholder={geld.format(0)} />
          </FormField>
        )}
      </div>
      {/* Der Stand am gewählten Tag: eine Einschränkung, keine Erklärung — er sagt, was
          das Abschliessen bewirkt, und steht deshalb offen da. */}
      {vorschau && (
        <div className="abschnitt" data-testid="abschlussstand">
          <div className="hinweis">
            {t("ruecklagen.abschlussStand", { angespart: geld.formatMitSymbol(vorschau.angespart), getragen: geld.formatMitSymbol(vorschau.getragen) })}
          </div>
          <div style={{ marginTop: 6 }}>
            {vorschau.ungedeckt > 0
              ? t("ruecklagen.abschlussMinus", { betrag: geld.formatMitSymbol(vorschau.ungedeckt) })
              : t("ruecklagen.abschlussFrei", { betrag: geld.formatMitSymbol(vorschau.frei) })}
          </div>
        </div>
      )}
    </Modal>
  );
}
