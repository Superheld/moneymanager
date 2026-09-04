// Ein Depot im Kontobereich — Bestand statt Auszug.
//
// Ein Depot-Konto hat keine Bewegungen: gekauft und verkauft wird über das
// Verrechnungskonto, und was im Depot passiert, ist eine Wertänderung ohne Buchung. Die
// gewohnte Auszugsliste stünde hier deshalb dauerhaft leer, und der grosse Stand oben
// zeigte eine Null, während der Wert in der Übersicht danebenläge.
//
// Was stattdessen zählt: was drin liegt, was es wert ist, und wann die Bank das zuletzt
// gesagt hat. Der Verlauf gehört nicht hierher, sondern in die Analyse — dieselbe Grenze
// wie überall.

import { useDatum, useProzent } from "../bausteine/einstellungenKontext";
import { useTranslation } from "react-i18next";
import type { Depotsicht, Positionszeile, Zahlungskonto } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";

export function DepotAuszug({ konto, sicht }: { konto: Zahlungskonto; sicht: Depotsicht }) {
  const { t } = useTranslation();
  const prozent = useProzent();
  const geld = useGeld();
  const datum = useDatum();

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
                {prozent(e.anteil, 1)}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <Card style={{ marginTop: "var(--gap-card)" }} pad>
      <div style={{ marginBottom: "var(--sp-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>
            {konto.bezeichnung}
          </span>
          <Pill variant="neutral">{t(`konten.typ.${konto.typ}`)}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", marginTop: 8 }}>
          <span
            className="num"
            style={{
              fontSize: "var(--fs-h1)",
              fontWeight: "var(--fw-black)",
              letterSpacing: "var(--ls-tight)",
              lineHeight: 1,
            }}
          >
            {sicht.aktuell ? geld.formatMitSymbol(sicht.aktuell.gesamtwert) : "—"}
          </span>
          <span
            style={{
              fontSize: "var(--fs-eyebrow)",
              fontWeight: "var(--fw-bold)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--ink-3)",
            }}
          >
            {t("depot.wertLabel")}
          </span>
        </div>
        {/* Der Stichtag gehört an die Zahl, nicht in eine Fussnote: ein Depotwert ohne
            Datum ist eine Behauptung ohne Zeitbezug. */}
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
          {sicht.aktuell
            ? t("depot.standErklaerung", { datum: datum.mitJahr(sicht.aktuell.stichtag) })
            : t("depot.nieAbgerufen")}
        </div>
      </div>

      {sicht.positionen.length > 0 ? (
        <DataTable columns={spalten} rows={[...sicht.positionen]} />
      ) : (
        <div className="muted">{t("depot.keinePositionen")}</div>
      )}

      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
        {t("depot.keineBewegungen")}
      </div>
    </Card>
  );
}
