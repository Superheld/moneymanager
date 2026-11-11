// Der Dialog, der zeigt, woran ein Vertrag erkannt wurde — die Zahlungen eines Kandidaten.
//
// Bis 2026-11-10 stand er am Anfang von `VertraegeScreen.tsx` (K3 der Oberflächenliste).

import { useTranslation } from "react-i18next";
import {
  type Vertragskandidat,
} from "../../../application";
import { Button } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { useGeld } from "../bausteine/einstellungenKontext";

/**
 * „Woran erkannt?" — die Prüfungen, die bei diesem Kandidaten angeschlagen haben, je
 * mit dem gemessenen Wert UND der Schwelle.
 *
 * Warum das sichtbar gehört: ein Vorschlag ohne Begründung lässt nur zwei Reaktionen zu
 * — blind übernehmen oder blind wegklicken. Wer sieht, dass 68 Zahlungen im 30-Tage-Takt
 * an dieselbe Gläubiger-ID gingen, entscheidet anders als bei drei Zahlungen mit
 * schwankendem Abstand. Und wenn die Erkennung danebenliegt, ist hier zu sehen, warum.
 */
export function ErkennungsDialog({ kandidat, onClose }: { kandidat: Vertragskandidat; onClose: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const b = kandidat.befund;
  const v = kandidat.vorlage;

  /**
   * Was aus der Messung als REGEL entsteht — die Zeile, die den Dialog erst schliesst.
   *
   * Die Prüfungen darüber begründen den Vorschlag, und bis hierher hörte der Dialog damit
   * auf: man las sieben gemessene Werte und erfuhr nichts darüber, was davon den Vertrag
   * erreicht. Die Antwort war „das Wenigste", ohne dass es irgendwo stand. Jetzt steht es
   * da, und zwar als das, was gleich passiert — nicht als weitere Messung.
   */
  const regelText = [
    v.betragVon !== undefined && v.betragBis !== undefined
      ? t("vertraege.erkennung.regelSpanne", {
          von: `${geld.format(v.betragVon)} ${geld.symbol}`,
          bis: `${geld.format(v.betragBis)} ${geld.symbol}`,
        })
      : null,
    v.tagVon !== undefined && v.tagBis !== undefined
      ? t("vertraege.erkennung.regelTage", { von: v.tagVon, bis: v.tagBis })
      : null,
    v.monatVon !== undefined && v.monatBis !== undefined
      ? t("vertraege.erkennung.regelMonate", { von: v.monatVon, bis: v.monatBis })
      : null,
  ]
    .filter(Boolean)
    .concat(t("vertraege.erkennung.regelHinweis"))
    .join(" · ");

  function Zeile({ label, wert }: { label: string; wert: string }) {
    return (
      <div style={{ display: "flex", gap: "var(--sp-3)", padding: "7px 0", alignItems: "baseline", borderBottom: "1px solid var(--line-soft)" }}>
        <span className="hinweis" style={{ flex: "0 0 32%", fontWeight: "var(--fw-semi)" }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-tabelle)", wordBreak: "break-word" }}>{wert}</span>
      </div>
    );
  }

  return (
    <Modal
      title={t("vertraege.erkennung.titel")}
      subtitle={kandidat.anbieter}
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t("vertraege.erkennung.schliessen")}</Button>}
    >
      <p className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-3)", maxWidth: 620 }}>
        {t("vertraege.erkennung.hinweis")}
      </p>

      <Zeile
        label={t("vertraege.erkennung.schluessel")}
        wert={
          b.schluesselArt === "glaeubigerId"
            ? t("vertraege.erkennung.schluesselGlaeubiger", { wert: b.schluesselWert })
            : t("vertraege.erkennung.schluesselName", { wert: b.schluesselWert })
        }
      />
      <Zeile
        label={t("vertraege.erkennung.termine")}
        wert={t("vertraege.erkennung.termineWert", { termine: b.termine, min: b.minTermine, von: kandidat.ersteZahlung, bis: kandidat.letzteZahlung })}
      />
      <Zeile
        label={t("vertraege.erkennung.takt")}
        wert={t("vertraege.erkennung.taktWert", {
          tage: b.medianAbstandTage,
          rhythmus: t(`vertraege.rhythmus.${kandidat.rhythmus}`),
          von: b.rhythmusFenster[0],
          bis: b.rhythmusFenster[1],
        })}
      />
      <Zeile
        label={t("vertraege.erkennung.regelmaessig")}
        wert={t("vertraege.erkennung.regelmaessigWert", { nah: b.abstaendeNah, gesamt: b.abstaendeGesamt, prozent: Math.round(b.minAnteilNah * 100) })}
      />
      <Zeile
        label={t("vertraege.erkennung.betrag")}
        wert={t("vertraege.erkennung.betragWert", {
          median: `${geld.format(kandidat.betrag)} ${geld.symbol}`,
          nah: b.betraegeNah,
          gesamt: b.betraegeGesamt,
          toleranz: `${geld.format(b.betragsToleranz)} ${geld.symbol}`,
        })}
      />
      <Zeile
        label={t("vertraege.erkennung.richtung")}
        wert={t("vertraege.erkennung.richtungWert", { charakter: t(`charakter.${kandidat.charakter}`) })}
      />
      <Zeile
        label={t("vertraege.erkennung.laufend")}
        wert={t("vertraege.erkennung.laufendWert", { tage: b.letzteVorTagen, grenze: b.beendetAbTagen })}
      />
      <Zeile
        label={t("vertraege.erkennung.zweck")}
        wert={
          b.zweckAnfang
            ? t("vertraege.erkennung.zweckWert", { wert: b.zweckAnfang })
            : t("vertraege.erkennung.zweckLeer")
        }
      />
      <Zeile label={t("vertraege.erkennung.regel")} wert={regelText} />
    </Modal>
  );
}
