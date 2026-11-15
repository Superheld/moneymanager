// Das Vorsorgeziel anlegen und ändern.
//
// Sechs Angaben, und jede ist eine ANNAHME des Nutzers — keine davon hat einen Vorgabewert
// ausser der Bezeichnung. Eine vorbelegte Rendite läse sich als Empfehlung, und die App
// weiss nicht, wie jemand sein Geld anlegt.
//
// Beim Ändern gilt alles ab dem laufenden Monat (`vorsorgezielFestlegen`); der Satz dazu
// steht im Dialog, weil er sagt, was „Speichern" hier tut.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { minorZuMajor, type Vorsorgesicht } from "../../../application";
import { vorsorgezielFestlegen } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

/** Eine Zahl aus einem Textfeld; Unlesbares wird NaN und fällt im Use-Case auf. */
function zahl(text: string): number {
  const t = text.trim().replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
}

export function VorsorgeDialog({
  sicht,
  heute,
  onClose,
  onGespeichert,
}: {
  /** `null` legt das Ziel an. */
  sicht: Vorsorgesicht | null;
  heute: string;
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const a = sicht?.annahme;
  const major = (cent: number) => String(minorZuMajor(cent, geld.waehrung));

  const [bezeichnung, setBezeichnung] = useState(sicht?.ziel.bezeichnung ?? t("vermoegen.vorsorge.vorgabeBezeichnung"));
  // Das Feld nimmt einen Tag, gespeichert wird der Monat. Ein leeres Feld bleibt leer:
  // „in zwanzig Jahren" vorzubelegen wäre eine Annahme, die niemand getroffen hat.
  const [ab, setAb] = useState(a ? `${a.zielMonat}-01` : "");
  const [wunsch, setWunsch] = useState(a ? major(a.wunschMonatlich) : "");
  const [rente, setRente] = useState(a ? major(a.renteMonatlich) : "");
  const [jahre, setJahre] = useState(a ? String(a.entnahmeMonate / 12) : "");
  const [rendite, setRendite] = useState(a ? String(a.renditeBp / 100).replace(".", ",") : "");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await vorsorgezielFestlegen(
        {
          bezeichnung,
          zielMonat: ab.slice(0, 7),
          wunschMonatlich: geld.parse(wunsch) ?? Number.NaN,
          // Ein leeres Rentenfeld heisst „keine": das ist die vorsichtige Lesart, und
          // der Hinweis am Feld sagt es.
          renteMonatlich: rente.trim() === "" ? 0 : (geld.parse(rente) ?? Number.NaN),
          entnahmeJahre: zahl(jahre),
          // Prozent in Basispunkte; gerundet, weil 2,3 × 100 als Kommazahl nicht glatt ist.
          renditeBp: Math.round(zahl(rendite) * 100),
        },
        heute,
      );
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={sicht ? t("vermoegen.vorsorge.modalBearbeiten") : t("vermoegen.vorsorge.modalNeu")}
      subtitle={t("vermoegen.vorsorge.modalHinweis")}
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
          <input className="field" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
        </FormField>
        <FormField label={t("vermoegen.vorsorge.feldAb")} required hint={t("vermoegen.vorsorge.feldAbHinweis")}>
          <Datumsfeld ariaLabel={t("vermoegen.vorsorge.feldAb")} wert={ab} aufAenderung={setAb} heute={heute} />
        </FormField>
        <FormField label={`${t("vermoegen.vorsorge.feldWunsch")} ${geld.symbol}`} required>
          <input className="field" inputMode="decimal" value={wunsch} onChange={(e) => setWunsch(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        <FormField label={`${t("vermoegen.vorsorge.feldRente")} ${geld.symbol}`} hint={t("vermoegen.vorsorge.feldRenteHinweis")}>
          <input className="field" inputMode="decimal" value={rente} onChange={(e) => setRente(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        <FormField label={t("vermoegen.vorsorge.feldJahre")} required>
          <input className="field" inputMode="numeric" value={jahre} onChange={(e) => setJahre(e.target.value)} />
        </FormField>
        <FormField label={t("vermoegen.vorsorge.feldRendite")} required hint={t("vermoegen.vorsorge.feldRenditeHinweis")}>
          <input className="field" inputMode="decimal" value={rendite} onChange={(e) => setRendite(e.target.value)} />
        </FormField>
      </div>
      {sicht && <p className="hinweis" style={{ margin: "var(--sp-3) 0 0" }}>{t("vermoegen.vorsorge.modalAendernHinweis")}</p>}
    </Modal>
  );
}
