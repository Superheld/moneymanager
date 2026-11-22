// Ein Depot bearbeiten: sein Verrechnungskonto und ob es zum Vorsorgeziel zählt.
//
// Mehr gibt es an einem Depot nicht zu pflegen — Bezeichnung, Bestand und Wert kommen von
// der Bank. Angelegt wird es nirgends von Hand, deshalb hat dieser Dialog nur die eine
// Rolle.
//
// **Die Kontoklasse wird hier nicht geändert, nur genannt.** Zählt das gewählte Konto über
// seine Klasse nicht zur Vorsorge, sagt der Dialog das und wo man die Klasse ändert. Eine
// Ausnahme „zählt, weil es am Depot hängt" gibt es nicht: dasselbe Konto stünde sonst in
// der Ergebnisrechnung anders da als hier.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Depotzeile, Verrechnungskontozeile } from "../../../application";
import { depotAendern } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Kaestchen } from "../bausteine/Kaestchen";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht } from "../bausteine/einstellungenKontext";

export function DepotDialog({
  zeile,
  konten,
  vorsorgeziel,
  onClose,
  onGespeichert,
}: {
  zeile: Depotzeile;
  /** Was als Verrechnungskonto zur Wahl steht (`kontenZurWahl` der Sicht). */
  konten: readonly Verrechnungskontozeile[];
  /** Das Vorsorgeziel, wenn es eines gibt — nur dann steht die Zuordnung zur Wahl. */
  vorsorgeziel?: { readonly id: string; readonly bezeichnung: string };
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const d = zeile.depot;
  // Ein Verweis auf ein Konto, das die Liste nicht kennt, startet leer — sonst stünde im
  // Feld eine Wahl, die es nicht gibt.
  const [kontoId, setKontoId] = useState(
    d.verrechnungskontoId && konten.some((k) => k.id === d.verrechnungskontoId) ? d.verrechnungskontoId : "",
  );
  const [zurVorsorge, setZurVorsorge] = useState(Boolean(vorsorgeziel && d.vorsorgezielId === vorsorgeziel.id));
  const [fehler, setFehler] = useState<string | null>(null);
  const gewaehlt = konten.find((k) => k.id === kontoId);

  async function speichern() {
    setFehler(null);
    // Ohne Ziel bleibt stehen, was gespeichert ist: das Kästchen steht dann nicht da, und
    // ein unsichtbares Feld darf nichts ändern.
    const vorsorgezielId = vorsorgeziel ? (zurVorsorge ? vorsorgeziel.id : undefined) : d.vorsorgezielId;
    try {
      await depotAendern(d.id, { verrechnungskontoId: kontoId || undefined, vorsorgezielId });
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("vermoegen.depots.modalBearbeiten")}
      subtitle={d.bezeichnung}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("vermoegen.speichern")}</Button>
          <Button variant="link" onClick={onClose}>{t("vermoegen.abbrechen")}</Button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div className="form-grid">
        <FormField label={t("vermoegen.depots.feldVerrechnungskonto")} hint={t("vermoegen.depots.feldVerrechnungskontoHinweis")}>
          <Auswahl
            ariaLabel={t("vermoegen.depots.feldVerrechnungskonto")}
            wert={kontoId}
            aufAenderung={setKontoId}
            optionen={[
              { wert: "", text: t("vermoegen.depots.verrechnungskontoKeines") },
              ...konten.map((k) => ({ wert: k.id, text: k.bezeichnung })),
            ]}
          />
        </FormField>
        {vorsorgeziel && (
          <FormField hint={t("vermoegen.depots.zaehltHinweis", { name: vorsorgeziel.bezeichnung })}>
            <Kaestchen an={zurVorsorge} aufAendern={setZurVorsorge}>{t("vermoegen.vorsorge.zaehlt")}</Kaestchen>
          </FormField>
        )}
        {/* Nur wenn es darauf ankommt: das Depot zählt, sein Konto nicht. */}
        {vorsorgeziel && zurVorsorge && gewaehlt && !gewaehlt.zaehltZurVorsorge && (
          <p className="hinweis" style={{ margin: 0 }}>
            {t("vermoegen.depots.zaehltNicht", {
              konto: gewaehlt.bezeichnung,
              klasse: t(`einstellungen.konto.klasse.${gewaehlt.klasse}`),
              vorsorge: t("einstellungen.konto.klasse.vorsorge"),
              investment: t("einstellungen.konto.klasse.investment"),
            })}
          </p>
        )}
      </div>
    </Modal>
  );
}
