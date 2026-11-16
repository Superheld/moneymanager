// Die Tabelle der monatlichen Budgets. Sie rechnet nichts: Stände und Verschachtelung
// kommen fertig aus `budgetbereichLaden`, was eine Rücklage darunter dem Budget abnimmt,
// aus `abgezogen` (über `herausgerechnet` in der Zuständigkeit).

import { useTranslation } from "react-i18next";
import type { Budgetstand } from "../../../application";
import { CoverageTrack, DataTable } from ".";
import { IconButton, IconLeiste } from "./IconButton";
import { geldFarbe } from "./geldFarbe";
import { useGeld } from "./einstellungenKontext";

export function BudgetTabelle({
  zeilen,
  kontoNamen,
  offen,
  onZeile,
  onBearbeiten,
  onLoeschen,
}: {
  zeilen: readonly Budgetstand[];
  kontoNamen: ReadonlyMap<string, string>;
  /** Die Zeile, deren Verlauf gerade offen ist. */
  offen: string | null;
  onZeile: (z: Budgetstand) => void;
  onBearbeiten: (z: Budgetstand) => void;
  onLoeschen: (z: Budgetstand) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  return (
    <DataTable
      pageSize={30}
      columns={[
        {
          key: "kategorie",
          label: t("budgets.spalteKategorie"),
          render: (z: Budgetstand) => (
            // Einrückung statt eigener Spalte: die Verschachtelung ist eine
            // Eigenschaft der Kategorie. Den Verlauf öffnet die Zeile; der
            // Name zeigt es an (`DataTable`, Bezeichner).
            <span style={{ paddingLeft: z.tiefe * 14, display: "inline-block" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {z.tiefe > 0 && <span style={{ color: "var(--ink-3)" }}>└</span>}
                <span style={{ fontWeight: z.tiefe === 0 ? "var(--fw-bold)" : "var(--fw-semi)" }}>
                  <span className="zeilenname">{z.kategorieName}</span>
                </span>
              </span>
              {/* Zweite Zeile: worauf das Geld liegt — und welche Rücklage darunter ihm
                  Buchungen abnimmt. Die Rücklage steht in einem anderen Bereich, und ohne
                  den Satz wäre der Verbrauch hier kleiner als die Ausgaben der Kategorie,
                  ohne dass man sähe warum. */}
              <span className="muted" style={{ display: "block", fontSize: "var(--fs-2xs)" }}>
                {kontoNamen.get(z.budget.kontoId) ?? t("budgets.kontoFehlt")}
                {z.abgezogen && ` · ${t("budgets.ruecklageAbgezogen", {
                  count: z.abgezogen.length,
                  namen: z.abgezogen.join(", "),
                })}`}
              </span>
            </span>
          ),
        },
        {
          // Was in DIESEM Monat zur Verfügung steht: der Monatsbetrag.
          key: "rahmen",
          label: `${t("budgets.spalteRahmen")} ${geld.symbol}`,
          align: "right",
          sortValue: (z: Budgetstand) => z.monat.verfuegbar,
          render: (z: Budgetstand) => (
            <span>{geld.format(z.monat.verfuegbar)}</span>
          ),
        },
        {
          // Verbrauch und Balken in einer Zelle: der Balken IST der Verbrauch,
          // die Zahl darüber sagt, wie viel.
          key: "verbraucht",
          label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`,
          align: "right",
          sortValue: (z: Budgetstand) => z.monat.verbraucht,
          render: (z: Budgetstand) => (
            <span style={{ display: "block", minWidth: 80 }}>
              <span className="num">{geld.format(z.monat.verbraucht)}</span>
              <CoverageTrack name={z.kategorieName} value={Math.max(0, z.monat.verbraucht)} max={Math.max(1, z.monat.verfuegbar)} over={z.rest < 0} label="" right="" style={{ marginTop: 4 }} />
            </span>
          ),
        },
        {
          key: "rest",
          label: `${t("budgets.spalteRest")} ${geld.symbol}`,
          align: "right",
          render: (z: Budgetstand) => (
            <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}>{geld.format(z.rest)}</span>
          ),
        },
        {
          key: "_a",
          label: "",
          align: "right",
          sortable: false,
          render: (z: Budgetstand) => (
            // Der Klick auf ein Zeilen-Icon darf nicht zusätzlich den Verlauf
            // umschalten: er blubberte sonst zur Zeile hoch, und „löschen" öffnete
            // nebenbei ein Diagramm zu einem Budget, das es nicht mehr gibt.
            <span onClick={(e) => e.stopPropagation()}>
              <IconLeiste>
                <IconButton icon="bearbeiten" label={t("budgets.bearbeiten")} onClick={() => onBearbeiten(z)} />
                <IconButton icon="loeschen" ton="gefahr" label={t("budgets.loeschen")} onClick={() => onLoeschen(z)} />
              </IconLeiste>
            </span>
          ),
        },
      ]}
      rows={[...zeilen]}
      // Der Name TRÄGT die Möglichkeit sichtbar; die ganze Zeile als Ziel kommt
      // dazu, weil man nach dem ersten Mal die Trefferfläche will.
      onRowClick={onZeile}
      istAktiv={(z: Budgetstand) => z.budget.id === offen}
    />
  );
}
