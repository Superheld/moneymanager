// Die Tabelle der Budgets einer Art — im Bereich Budgets die monatlichen, im Bereich
// Rücklagen die aufbauenden („über die Kategorie").
//
// Bis 2026-11-15 stand sie zweimal nebeneinander im Budgets-Screen, eine je Art. Seit die
// aufbauenden zu den Rücklagen gehören, steht dieselbe Tabelle in zwei Bereichen und liegt
// deshalb hier. Sie rechnet nichts: Stände, Deckung und Verschachtelung kommen fertig aus
// `budgetbereichLaden` und `nachArtGetrennt`.

import { useTranslation } from "react-i18next";
import type { GruppierterStand } from "../../../application";
import { CoverageTrack, DataTable } from ".";
import { IconButton, IconLeiste } from "./IconButton";
import { geldFarbe, warnFarbe } from "./geldFarbe";
import { useGeld } from "./einstellungenKontext";

export function BudgetTabelle({
  zeilen,
  kontoNamen,
  fehlt,
  offen,
  onZeile,
  onBearbeiten,
  onLoeschen,
}: {
  zeilen: readonly GruppierterStand[];
  kontoNamen: ReadonlyMap<string, string>;
  /** Was vom Rest eines aufbauenden Budgets auf seinem Konto NICHT liegt — 0, wenn alles da ist. */
  fehlt: (budgetId: string) => number;
  /** Die Zeile, deren Verlauf gerade offen ist. */
  offen: string | null;
  onZeile: (z: GruppierterStand) => void;
  onBearbeiten: (z: GruppierterStand) => void;
  onLoeschen: (z: GruppierterStand) => void;
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
          render: (z: GruppierterStand) => (
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
              {/* Zweite Zeile: worauf das Geld liegt, unter welchem Budget der anderen
                  Art es hängt — und was aus ihm herausgerechnet ist. Das Letzte steht
                  seit 2026-11-15 da: die andere Art steht in einem anderen Bereich, und
                  ohne den Satz wäre der Verbrauch hier kleiner als die Ausgaben der
                  Kategorie, ohne dass man sähe warum. */}
              <span className="muted" style={{ display: "block", fontSize: "var(--fs-2xs)" }}>
                {kontoNamen.get(z.budget.kontoId) ?? t("budgets.kontoFehlt")}
                {z.unter && ` · ${t("budgets.unter", { name: z.unter })}`}
                {z.abgezogen && ` · ${t(z.budget.art === "aufbauend" ? "ruecklagen.kategorie.budgetAbgezogen" : "budgets.ruecklageAbgezogen", {
                  count: z.abgezogen.length,
                  namen: z.abgezogen.join(", "),
                })}`}
                {/* Nur, wenn etwas fehlt: der Rest steht rechts als verfügbar da,
                    und das stimmt nur, wenn er auf dem Konto auch liegt. Eine
                    Einschränkung, deshalb offen in der Zeile und in Worten. */}
                {fehlt(z.budget.id) > 0 && (
                  <span style={{ color: warnFarbe(true) }}>
                    {" · "}
                    {t("budgets.deckungFehlt", { betrag: geld.formatMitSymbol(fehlt(z.budget.id)) })}
                  </span>
                )}
              </span>
            </span>
          ),
        },
        {
          // Was in DIESEM Monat zur Verfügung steht: beim Monatlichen der
          // Monatsbetrag, beim Aufbauenden Übertrag plus Rate. Der Titel legt
          // die Aufrechnung offen.
          key: "rahmen",
          label: `${t("budgets.spalteRahmen")} ${geld.symbol}`,
          align: "right",
          sortValue: (z: GruppierterStand) => z.monat.verfuegbar,
          render: (z: GruppierterStand) => (
            <span
              title={
                z.budget.art === "aufbauend"
                  ? t("budgets.verfuegbarHinweis", {
                      uebertrag: geld.formatMitSymbol(z.monat.uebertrag),
                      zufuehrung: geld.formatMitSymbol(z.monat.zufuehrung),
                      gesamt: geld.formatMitSymbol(z.rahmen),
                    })
                  : undefined
              }
            >
              {geld.format(z.monat.verfuegbar)}
            </span>
          ),
        },
        {
          // Verbrauch und Balken in einer Zelle: der Balken IST der Verbrauch,
          // die Zahl darüber sagt, wie viel.
          key: "verbraucht",
          label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`,
          align: "right",
          sortValue: (z: GruppierterStand) => z.monat.verbraucht,
          render: (z: GruppierterStand) => (
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
          render: (z: GruppierterStand) => (
            <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}>{geld.format(z.rest)}</span>
          ),
        },
        {
          key: "_a",
          label: "",
          align: "right",
          sortable: false,
          render: (z: GruppierterStand) => (
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
      istAktiv={(z: GruppierterStand) => z.budget.id === offen}
    />
  );
}
