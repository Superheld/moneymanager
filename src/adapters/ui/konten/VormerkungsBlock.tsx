// Was die Bank kennt und noch nicht gebucht hat — über den Buchungen, abgesetzt.
//
// ## Warum sie SICHTBAR sind und nicht nur wirken
//
// Vormerkungen fliessen in die Liquiditätsvorschau ein: sie sind sicherer als jede
// Vertragsrate, weil sie bereits geschehen sind und nur noch nicht verbucht. Ohne sie
// begänne die Vorschau mit Geld, über das niemand mehr verfügt.
//
// Sie nur wirken zu lassen wäre der bequemere Weg gewesen und der schlechtere: bei der
// ersten Abweichung zwischen Kontostand und Vorschau stünde eine Zahl da, deren Herkunft
// niemand sieht. In einer Finanz-App ist das schlimmer als eine fehlende Zahl — man
// glaubt ihr nicht mehr, und dann auch den anderen nicht.
//
// ## Warum ein eigener Block und keine Zeilen in der Tabelle
//
// Eine Vormerkung ist keine Buchung. Sie hat keine Kategorie, keinen Vertrag, kein
// Journal, sie lässt sich nicht bearbeiten und verschwindet in ein bis drei Tagen von
// selbst — als Zeile zwischen echten Buchungen böte sie überall Griffe an, die ins Leere
// greifen. Der abgesetzte Block sagt schon durch seine Form, dass hier etwas anderes
// steht.

import { useTranslation } from "react-i18next";
import type { Vormerkung } from "../../../application";
import { vormerkungslast } from "../../../application";
import { Card, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";

export function VormerkungsBlock({ vormerkungen }: { vormerkungen: readonly Vormerkung[] }) {
  const { t } = useTranslation();
  const { format: geld } = useGeld();

  // KEIN Block, wenn nichts offen ist. Eine dauerhafte Zeile „keine Vormerkungen" wäre
  // nach zwei Wochen unsichtbar, und dann fiele auch der Fall nicht mehr auf, in dem
  // wirklich etwas ansteht — dieselbe Überlegung wie bei der Handlungsbedarf-Karte.
  if (vormerkungen.length === 0) return null;

  const last = vormerkungslast(vormerkungen);

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("konten.vormerkungen.titel")}
      subtitle={t("konten.vormerkungen.untertitel", { betrag: geld(last.betrag), anzahl: last.anzahl })}
    >
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {vormerkungen.map((v) => (
          <li
            key={v.id}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--sp-3)",
              padding: "var(--sp-2) 0",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            {/* Ohne Datum ist die Vormerkung nicht kaputt, sondern ohne Termin — manche
                Banken melden ihre so. Ein erfundenes Datum wäre schlechter als der
                ehrliche Strich. */}
            <span className="muted" style={{ fontSize: "var(--fs-xs)", minWidth: "5.5rem" }}>
              {v.datum ?? t("konten.vormerkungen.ohneDatum")}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.gegenpartei || t("konten.vormerkungen.ohneGegenpartei")}
              </div>
              {v.verwendungszweck && (
                <div
                  className="muted"
                  style={{ fontSize: "var(--fs-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {v.verwendungszweck}
                </div>
              )}
            </span>
            {/* `INFO` heisst: die Bank wird das NICHT buchen. Sie zählt deshalb nicht in
                die Summe oben — angezeigt wird sie trotzdem, denn sie erklärt, was man im
                Online-Banking sieht. */}
            {v.buchungsstand === "INFO" && <Pill>{t("konten.vormerkungen.nurInfo")}</Pill>}
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--fw-semi)" }}>
              {geld(v.betrag)}
            </span>
          </li>
        ))}
      </ul>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
        {t("konten.vormerkungen.hinweis")}
      </div>
    </Card>
  );
}
