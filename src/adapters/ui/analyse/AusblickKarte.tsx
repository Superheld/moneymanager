// Der Verlauf über die Gegenwart hinaus — gewesene Monate und geplante in EINER Linie.
//
// Warum eine Linie und nicht zwei: es ist derselbe Saldo. Er läuft an der Naht ohne Sprung
// weiter, und zwei Linien nebeneinander behaupteten zwei Grössen. Was sich ändert, ist die
// Verbindlichkeit — dafür ist die Strichelung da, und dafür steht in der Tabelle eine
// Pille an jeder geplanten Zeile.
//
// Was NICHT in den geplanten Saldo eingeht, steht im Kern (`planWirkung`): Rücklagen sind
// kalkulatorisch und verlassen das Konto nie, Umschichtungen wechseln nur das Konto. Beide
// mitzurechnen hiesse, jeden Monat eine Abbuchung zu erfinden, die nie kommt.

import { useTranslation } from "react-i18next";
import type { Verlaufspunkt } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";

export function AusblickKarte({ punkte }: { punkte: readonly Verlaufspunkt[] }) {
  const { t } = useTranslation();
  const geld = useGeld();
  if (punkte.length === 0) return null;

  const ersterPlan = punkte.findIndex((p) => p.plan);
  const gewesen = punkte.filter((p) => !p.plan).length;
  const geplant = punkte.length - gewesen;

  // Der tiefste Punkt der Vorschau. Er ist die Aussage, auf die es ankommt: ein Monat, der
  // bei plus endet, kann zwischendurch unten gewesen sein — und der Endstand verschweigt
  // genau das. Monatsgenau ist das noch grob; taggenau wird es erst der Liquiditätsplan.
  const tief = punkte
    .filter((p) => p.plan)
    .reduce<Verlaufspunkt | null>((t2, p) => (t2 == null || p.saldo < t2.saldo ? p : t2), null);

  return (
    <Card
      title={t("blickNachVorn.titel")}
      subtitle={t("blickNachVorn.untertitel", { zurueck: gewesen, voraus: geplant })}
    >
      <SaldoVerlaufChart
        labels={punkte.map((p) => p.monat)}
        werte={punkte.map((p) => p.saldo)}
        legende={t("blickNachVorn.legendeIst")}
        legendePlan={t("blickNachVorn.legendePlan")}
        abIndex={ersterPlan > 0 ? ersterPlan : undefined}
      />

      {tief && tief.saldo < 0 && (
        <div className="err" style={{ marginTop: "var(--sp-3)" }}>
          {t("blickNachVorn.warnungMinus", { monat: tief.monat, betrag: geld.formatMitSymbol(tief.saldo) })}
        </div>
      )}

      <div style={{ marginTop: "var(--sp-4)" }}>
        <DataTable
          columns={[
            {
              key: "monat",
              label: t("befunde.spalteMonat"),
              render: (r) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {r.monat}
                  {/* Nur die geplanten Zeilen tragen eine Pille: die gewesenen sind der
                      Normalfall, und ein Etikett an jeder Zeile beschriftet nichts mehr. */}
                  {r.plan && <Pill variant="neutral">{t("blickNachVorn.pillPlan")}</Pill>}
                </span>
              ),
            },
            {
              key: "einnahmen",
              label: `${t("befunde.spalteEinnahmen")} ${geld.symbol}`,
              align: "right",
              render: (r) => (r.einnahmen ? geld.format(r.einnahmen) : "—"),
            },
            {
              key: "ausgaben",
              label: `${t("historie.spalteAusgaben")} ${geld.symbol}`,
              align: "right",
              render: (r) => (r.ausgaben ? geld.format(r.ausgaben) : "—"),
            },
            {
              key: "netto",
              label: `${t("historie.spalteNetto")} ${geld.symbol}`,
              align: "right",
              render: (r) => (
                <span style={{ color: geldFarbe(r.netto), fontWeight: "var(--fw-bold)" }}>
                  {geld.format(r.netto, { mitVorzeichen: true })}
                </span>
              ),
            },
            {
              key: "saldo",
              label: `${t("historie.spalteSaldo")} ${geld.symbol}`,
              align: "right",
              render: (r) => (
                <span style={{ color: r.saldo < 0 ? "var(--warn-deep)" : undefined }}>
                  {geld.format(r.saldo)}
                </span>
              ),
            },
          ]}
          rows={[...punkte]}
        />
      </div>
    </Card>
  );
}
