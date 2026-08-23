// Die Aufrechnung eines Budgetmonats in einer Zeile: Übertrag, Zuführung, Verbrauch.
//
// Sie steht da, wo vorher „140 von 200" stand. Bei einem aufbauenden Budget war die 200
// der Betrag, der hineingegangen WÄRE, hätte man nie etwas ausgegeben — eine Zahl, die
// mit jedem Monat weiterwächst und über den laufenden Monat nichts sagt. Der Übertrag
// dagegen sagt genau das: soviel war da, soviel kam dazu, soviel ist weg.
//
// Das Ergebnis steht bewusst NICHT in dieser Zeile: es ist der grosse Betrag darüber.
// Zweimal dieselbe Zahl in zwei Schriftgrössen liest sich wie zwei verschiedene.

import { useTranslation } from "react-i18next";
import type { Budgetmonat } from "../../../application";
import { useGeld } from "./einstellungenKontext";

export function BudgetFortschreibung({ monat }: { monat: Budgetmonat }) {
  const { t } = useTranslation();
  const geld = useGeld();

  const werte = {
    uebertrag: geld.format(monat.uebertrag),
    // Vorzeichen aus der Sicht des Budgets: die Rate kommt hinzu, der Verbrauch geht ab.
    // `verbraucht` ist positiv geführt (eine Erstattung negativ) — deshalb hier gedreht,
    // damit ein Erstattungsmonat als Plus erscheint und nicht als negatives Minus.
    zufuehrung: geld.format(monat.zufuehrung, { mitVorzeichen: true }),
    verbraucht: geld.format(-monat.verbraucht, { mitVorzeichen: true }),
  };

  return (
    <span
      className="muted"
      style={{ fontSize: "var(--fs-2xs)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
      title={t("budgets.fortschreibungTitel", { ...werte, rest: geld.formatMitSymbol(monat.rest) })}
    >
      {t("budgets.fortschreibung", werte)}
    </span>
  );
}
