// Depots in der Analyse — „wie war es über einen Zeitraum".
//
// Die Gegenstück-Karte zur Übersicht: dort steht der Stand, hier die Entwicklung. Die
// Grenze ist dieselbe wie überall in dieser App und entscheidet, wo Neues hingehört.
//
// Eine Warnung steht im Kern (`wertentwicklung`) und gilt auch hier: das ist eine reine
// Wertbetrachtung, keine Rendite. Zukäufe und Entnahmen im Zeitraum stecken mit drin und
// sind aus den Beständen allein nicht herauszurechnen.

import { useTranslation } from "react-i18next";
import { depotEntwicklung, type Depotsicht, type Positionszeile } from "../../../application";
import { Card, DataTable } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";

interface Props {
  sicht: Depotsicht;
  von: string;
  bis: string;
}

export function DepotAnsicht({ sicht, von, bis }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  const entwicklung = depotEntwicklung(sicht, von, bis);

  // Nur die Punkte im Zeitraum: ein Verlauf, der die ganze Reihe zeigt, beantwortet eine
  // andere Frage als die gestellte.
  const punkte = sicht.reihe.filter((w) => w.stichtag >= von && w.stichtag <= bis);

  const spalten = [
    {
      key: "name",
      label: t("depot.spaltePapier"),
      render: (p: Positionszeile) => (
        <span>
          {p.name ?? p.kennung}
          {p.isin && (
            <span className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--sp-2)" }}>
              {p.isin}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "stueck",
      label: t("depot.spalteStueck"),
      align: "right" as const,
      // Nicht über `useGeld`: eine Stückzahl ist kein Geld, und mit Währungszeichen
      // formatiert wäre sie eine Behauptung, die niemand gemacht hat.
      render: (p: Positionszeile) => (p.stueck == null ? "—" : p.stueck.toLocaleString()),
    },
    {
      key: "kurs",
      label: t("depot.spalteKurs"),
      align: "right" as const,
      render: (p: Positionszeile) => (p.kurs == null ? "—" : p.kurs.toLocaleString()),
    },
    {
      key: "wert",
      label: t("depot.spalteWert"),
      align: "right" as const,
      render: (p: Positionszeile) => (p.wert == null ? "—" : geld.formatMitSymbol(p.wert)),
    },
    {
      key: "ergebnis",
      label: t("depot.spalteErgebnis"),
      align: "right" as const,
      render: (p: Positionszeile) => {
        const e = p.ergebnis;
        // Ohne Einstandsangabe der Bank gibt es kein Ergebnis — der Normalfall bei
        // Papieren, die von einer anderen Bank übertragen wurden. Eine Null stünde dort
        // für „keine Veränderung" und wäre falsch.
        if (e.veraenderung == null) return <span className="muted">—</span>;
        return (
          <span className={e.veraenderung < 0 ? "err" : undefined}>
            {geld.formatMitSymbol(e.veraenderung)}
            {e.anteil != null && (
              <span className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--sp-2)" }}>
                {t("depot.anteil", { prozent: (e.anteil * 100).toFixed(1) })}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={sicht.depot.bezeichnung}
      subtitle={
        entwicklung.veraenderung != null
          ? t("depot.entwicklung", {
              betrag: geld.formatMitSymbol(entwicklung.veraenderung),
              von: entwicklung.von?.stichtag ?? von,
              bis: entwicklung.bis?.stichtag ?? bis,
            })
          : t("depot.entwicklungFehlt")
      }
    >
      {punkte.length > 1 && (
        <SaldoVerlaufChart
          labels={punkte.map((w) => w.stichtag)}
          werte={punkte.map((w) => w.gesamtwert)}
          legende={t("depot.verlaufLegende")}
        />
      )}
      {punkte.length <= 1 && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t("depot.zuWenigPunkte")}
        </div>
      )}

      {sicht.positionen.length > 0 && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div className="nlbl">
            {t("depot.positionenTitel", { datum: sicht.aktuell?.stichtag ?? "—" })}
          </div>
          <DataTable columns={spalten} rows={[...sicht.positionen]} />
        </div>
      )}
    </Card>
  );
}
