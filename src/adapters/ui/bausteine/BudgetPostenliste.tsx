// Woraus der Verbrauch eines Budgets in einem Monat besteht — die Buchungen selbst, nicht
// noch eine Zahl. Die Liste kommt aus `budgetPostenZu`/`budgetPostenImMonat`, also aus
// derselben Auswahl, die auch den Verbrauch summiert; sie kann gar nicht anders ausfallen
// als der Balken darüber.
//
// Baustein, weil sie zwei Bereiche bedient: die Übersicht klappt sie unter einer Budgetzeile
// auf, der Verlauf unter Budgets zeigt sie für den im Chart gewählten Monat. Sie lag vorher
// in `UebersichtScreen.tsx` und wäre beim zweiten Aufrufer nachgebaut worden.
//
// Bewusst KEINE Karte: sie hängt unter einer Zeile, die schon in einer steckt (siehe
// `ui/CLAUDE.md`). Eine getönte Fläche mit Radius reicht, um sie abzusetzen.

import { useTranslation } from "react-i18next";
import type { Verbrauchsposten } from "../../../application";
import { useGeld } from "./einstellungenKontext";

export interface BudgetPostenlisteProps {
  posten: readonly Verbrauchsposten[];
  /** Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung. */
  empfaenger: ReadonlyMap<string, string>;
  kategorieNamen: ReadonlyMap<string, string>;
  /** Die Summe darunter — sie kommt von aussen, damit dieselbe Zahl steht wie in der Zeile. */
  verbraucht: number;
  /** Was über der Liste steht, wenn sie leer ist. Ohne Angabe der Standardtext. */
  leerText?: string;
}

export function BudgetPostenliste({ posten, empfaenger, kategorieNamen, verbraucht, leerText }: BudgetPostenlisteProps) {
  const { t } = useTranslation();
  const geld = useGeld();

  if (posten.length === 0) {
    return (
      <div className="muted" style={{ fontSize: "var(--fs-xs)", padding: "8px 0 2px" }}>
        {leerText ?? t("uebersicht.budgetOhneBuchungen")}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-2, rgba(0,0,0,.015))",
        borderRadius: "var(--r-md)",
        padding: "4px 10px",
        margin: "8px 0 2px",
        maxHeight: 260,
        overflowY: "auto",
      }}
    >
      {posten.map((p, i) => {
        const kategorie = p.kategorieId ? kategorieNamen.get(p.kategorieId) : undefined;
        const name =
          p.buchung.notiz || empfaenger.get(p.buchung.id) || kategorie || t("uebersicht.budgetBuchung");
        return (
          <div
            key={`${p.buchung.id}#${i}`}
            style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: "12.5px", borderBottom: i < posten.length - 1 ? "1px solid var(--line-soft)" : "none" }}
          >
            <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
              {p.buchung.datum.slice(8)}.{p.buchung.datum.slice(5, 7)}.{p.buchung.datum.slice(2, 4)}
            </span>
            <span title={name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
              {name}
            </span>
            {kategorie && kategorie !== name && (
              <span style={{ color: "var(--ink-3)", fontSize: "11.5px", flex: "0 0 auto" }}>{kategorie}</span>
            )}
            <span className="num" style={{ marginLeft: "auto", flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>
              {geld.format(p.betrag)}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0 5px", borderTop: "1px solid var(--line)", fontSize: "12.5px", fontWeight: "var(--fw-bold)" }}>
        <span>{t("uebersicht.budgetSumme")}</span>
        <span className="num">{geld.formatMitSymbol(verbraucht)}</span>
      </div>
    </div>
  );
}
