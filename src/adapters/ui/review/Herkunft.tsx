// Woher der Vorschlag einer Zeile in der Review-Inbox stammt — die kleine Erklärung unter
// dem Empfänger.
//
// Bis 2026-11-10 stand sie in `ReviewScreen.tsx` (K3 der Oberflächenliste).

import { useTranslation } from "react-i18next";
import {
  type Kategorie,
} from "../../../application";
import {
  vorschlagsbefundFuer,
  type Umsatz,
  type Vorschlagskontext,
} from "../../../application/import";
import {  Pill } from "../bausteine";

/**
 * Woher der Vorschlag dieser Zeile kommt — und beim Modell, woran es lag.
 *
 * Die Belege werden hier neu gerechnet: sie hängen am aktuellen Modell und an der
 * aktuellen Merkmalskonfiguration. Nur wenn die Neurechnung dieselbe Kategorie liefert
 * wie der gespeicherte Vorschlag, wird sie gezeigt — sonst erklärte sie etwas anderes,
 * als in der Zeile steht.
 */
export function Herkunft({
  umsatz,
  kontext,
  katById,
}: {
  umsatz: Umsatz;
  kontext: Vorschlagskontext | null;
  katById: ReadonlyMap<string, Kategorie>;
}) {
  const { t } = useTranslation();
  const quelle = umsatz.vorschlag?.quelle;
  if (!quelle) return null;

  const befund =
    kontext && quelle === "ki" ? vorschlagsbefundFuer(umsatz, kontext, umsatz.zahlungskontoId) : null;
  const passt = befund?.vorschlag?.kategorieId === umsatz.vorschlag?.kategorieId;
  // Was den Abstand zur Zweitbesten machte — die Posten, die zur Gewinnerin zogen, und
  // die Grundneigung, wenn sie mitentschied. Rohe Gewichte der Gewinnerin allein sagten
  // nicht, was den Ausschlag gab (siehe `core/klassifikator/erklaerung.ts`).
  const e = passt ? befund?.erklaerung : undefined;
  const ausschlag = e ? e.posten.filter((p) => p.differenz > 0).slice(0, 3).map((p) => p.merkmal) : [];
  if (e && e.grundneigung.differenz > 0 && ausschlag.length < 3) ausschlag.push(t("training.erklaerung.grundneigung"));

  return (
    <div style={{ marginTop: 4, display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
      <span title={t(`review.herkunftTitel.${quelle}`)}>
        {/* „ok" fuer alles, was auf einer ANGABE beruht (Umbuchung, Vertrag, Datei),
            „neutral" fuer die Schaetzung des Modells, „plan" fuer die eigene Hand. */}
        <Pill variant={quelle === "manuell" ? "plan" : quelle === "ki" ? "neutral" : "ok"}>
          {t(`review.herkunft.${quelle}`)}
        </Pill>
      </span>
      {passt && befund?.sicherheit !== undefined && (
        <span
          className="muted"
          style={{ fontSize: "var(--fs-2xs)" }}
          title={e?.kandidaten.map((k) => `${Math.round(k.wahrscheinlichkeit * 100)} % ${katById.get(k.kategorieId)?.name ?? k.kategorieId}`).join("  ")}
        >
          {t("review.begruendungSicher", { wert: `${Math.round(befund.sicherheit * 100)} %` })}
          {ausschlag.length > 0 && ` · ${t("review.begruendungAusschlag", { merkmale: ausschlag.join(", ") })}`}
        </span>
      )}
    </div>
  );
}
