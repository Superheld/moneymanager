// Einen Vermögenswert oder eine Schuld anlegen und bearbeiten.
//
// Zwei Dialoge in einer Datei, weil sie dasselbe tun und sich nur in den Feldern
// unterscheiden: Bezeichnung und Art, bei der Schuld dazu die beiden Verweise. Der WERT
// steht in keinem von beiden — er ist eine Beobachtung mit Stichtag und hat seinen
// eigenen Dialog (`BeobachtungDialog`). Ein Feld „aktueller Wert" hier wäre genau das
// Überschreiben, das die Reihe verhindern soll.
//
// Jeder Dialog trägt seinen Zustand selbst (wie `RuecklageDialog`): der Screen sagt nur,
// für welchen Eintrag.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  VERBINDLICHKEITSARTEN,
  VERMOEGENSARTEN,
  type Schuldzeile,
  type Verbindlichkeitsart,
  type Vermoegensart,
  type Vermoegenswertzeile,
} from "../../../application";
import {
  schuldAendern,
  schuldAnlegen,
  schuldFuehren,
  vermoegenswertAendern,
  vermoegenswertAnlegen,
  vermoegenswertFuehren,
} from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Kaestchen } from "../bausteine/Kaestchen";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht } from "../bausteine/einstellungenKontext";

export function VermoegenswertDialog({
  zeile,
  vorsorgeziel,
  onClose,
  onGespeichert,
}: {
  /** `null` legt einen neuen an. */
  zeile: Vermoegenswertzeile | null;
  /** Das Vorsorgeziel, wenn es eines gibt — nur dann steht die Zuordnung zur Wahl. */
  vorsorgeziel?: { readonly id: string; readonly bezeichnung: string };
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const g = zeile?.gegenstand;
  const [zurVorsorge, setZurVorsorge] = useState(Boolean(g?.vorsorgezielId));
  const [bezeichnung, setBezeichnung] = useState(g?.bezeichnung ?? "");
  const [art, setArt] = useState<Vermoegensart>(g?.art ?? "immobilie");
  const [gefuehrt, setGefuehrt] = useState(zeile?.gefuehrt ?? true);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    // Ohne Ziel bleibt stehen, was gespeichert ist: die Maske zeigt das Kästchen dann
    // nicht, und ein unsichtbares Feld darf nichts ändern.
    const vorsorgezielId = vorsorgeziel ? (zurVorsorge ? vorsorgeziel.id : undefined) : g?.vorsorgezielId;
    try {
      if (g) {
        await vermoegenswertAendern(g.id, { bezeichnung, art, vorsorgezielId });
        // Nur wenn sich die Angabe geändert hat: sonst schriebe jedes Bearbeiten ein
        // zweites Mal, ohne dass jemand etwas dazu gesagt hätte.
        if (gefuehrt !== zeile.gefuehrt) await vermoegenswertFuehren(g.id, gefuehrt);
      } else {
        await vermoegenswertAnlegen({ bezeichnung, art, vorsorgezielId });
      }
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={g ? t("vermoegen.modalVermoegenswertBearbeiten") : t("vermoegen.modalVermoegenswertNeu")}
      subtitle={g ? undefined : t("vermoegen.modalStammHinweis")}
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
        <FormField label={t("vermoegen.feldBezeichnung")} required>
          <input className="field" autoFocus value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
        </FormField>
        <FormField label={t("vermoegen.feldArt")}>
          <Auswahl
            ariaLabel={t("vermoegen.feldArt")}
            wert={art}
            aufAenderung={(v) => setArt(v as Vermoegensart)}
            optionen={VERMOEGENSARTEN.map((a) => ({ wert: a, text: t(`vermoegen.art.${a}`) }))}
          />
        </FormField>
        {vorsorgeziel && (
          <FormField hint={t("vermoegen.vorsorge.zaehltHinweis", { name: vorsorgeziel.bezeichnung })}>
            <Kaestchen an={zurVorsorge} aufAendern={setZurVorsorge}>{t("vermoegen.vorsorge.zaehlt")}</Kaestchen>
          </FormField>
        )}
        {/* Erst beim Bearbeiten: was gerade angelegt wird, wird auch geführt. */}
        {g && (
          <FormField hint={t("vermoegen.gefuehrtHinweisVermoegenswert")}>
            <Kaestchen an={gefuehrt} aufAendern={setGefuehrt}>{t("vermoegen.gefuehrt")}</Kaestchen>
          </FormField>
        )}
      </div>
    </Modal>
  );
}

export function SchuldDialog({
  zeile,
  vertraege,
  vermoegenswerte,
  onClose,
  onGespeichert,
}: {
  /** `null` legt eine neue an. */
  zeile: Schuldzeile | null;
  vertraege: readonly { readonly id: string; readonly name: string }[];
  vermoegenswerte: readonly Vermoegenswertzeile[];
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const v = zeile?.verbindlichkeit;
  const [bezeichnung, setBezeichnung] = useState(v?.bezeichnung ?? "");
  const [art, setArt] = useState<Verbindlichkeitsart>(v?.art ?? "immobilienkredit");
  // Ein Verweis, dessen Ziel es nicht mehr gibt, startet leer — sonst stünde im Feld
  // eine Wahl, die die Liste nicht kennt, und das Speichern wiese sie ab.
  const [vertragId, setVertragId] = useState(
    v?.vertragId && vertraege.some((x) => x.id === v.vertragId) ? v.vertragId : "",
  );
  const [gegenstandId, setGegenstandId] = useState(
    v?.gegenstandId && vermoegenswerte.some((x) => x.gegenstand.id === v.gegenstandId) ? v.gegenstandId : "",
  );
  const [gefuehrt, setGefuehrt] = useState(zeile?.gefuehrt ?? true);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    const eingabe = {
      bezeichnung,
      art,
      vertragId: vertragId || undefined,
      gegenstandId: gegenstandId || undefined,
    };
    try {
      if (v) {
        await schuldAendern(v.id, eingabe);
        if (gefuehrt !== zeile.gefuehrt) await schuldFuehren(v.id, gefuehrt);
      } else {
        await schuldAnlegen(eingabe);
      }
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={v ? t("vermoegen.modalSchuldBearbeiten") : t("vermoegen.modalSchuldNeu")}
      subtitle={v ? undefined : t("vermoegen.modalSchuldHinweis")}
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
        <FormField label={t("vermoegen.feldBezeichnung")} required>
          <input className="field" autoFocus value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
        </FormField>
        <FormField label={t("vermoegen.feldArt")}>
          <Auswahl
            ariaLabel={t("vermoegen.feldArt")}
            wert={art}
            aufAenderung={(w) => setArt(w as Verbindlichkeitsart)}
            optionen={VERBINDLICHKEITSARTEN.map((a) => ({ wert: a, text: t(`vermoegen.schuldArt.${a}`) }))}
          />
        </FormField>
        <FormField label={t("vermoegen.feldVertrag")} hint={t("vermoegen.feldVertragHinweis")}>
          <Auswahl
            ariaLabel={t("vermoegen.feldVertrag")}
            wert={vertragId}
            aufAenderung={setVertragId}
            optionen={[{ wert: "", text: t("vermoegen.vertragKeiner") }, ...vertraege.map((x) => ({ wert: x.id, text: x.name }))]}
          />
        </FormField>
        <FormField label={t("vermoegen.feldVermoegenswert")} hint={t("vermoegen.feldVermoegenswertHinweis")}>
          <Auswahl
            ariaLabel={t("vermoegen.feldVermoegenswert")}
            wert={gegenstandId}
            aufAenderung={setGegenstandId}
            optionen={[
              { wert: "", text: t("vermoegen.vermoegenswertKeiner") },
              ...vermoegenswerte.map((x) => ({ wert: x.gegenstand.id, text: x.gegenstand.bezeichnung })),
            ]}
          />
        </FormField>
        {v && (
          <FormField hint={t("vermoegen.gefuehrtHinweisSchuld")}>
            <Kaestchen an={gefuehrt} aufAendern={setGefuehrt}>{t("vermoegen.gefuehrt")}</Kaestchen>
          </FormField>
        )}
      </div>
    </Modal>
  );
}
