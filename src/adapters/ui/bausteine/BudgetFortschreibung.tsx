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

  // Die KOMPAKTE Zeile zeigt Geldfluss: die Rate kommt hinzu (+), der Verbrauch geht ab
  // (−). `verbraucht` ist positiv geführt (ein Rückfluss negativ) und wird deshalb
  // gedreht — ein Erstattungsmonat steht damit als Plus da, und das stimmt: es kam Geld
  // zurück. Nur Zahlen mit Vorzeichen, kein Wort, das etwas anderes behaupten könnte.
  const werte = {
    uebertrag: geld.format(monat.uebertrag),
    zufuehrung: geld.format(monat.zufuehrung, { mitVorzeichen: true }),
    verbraucht: geld.format(-monat.verbraucht, { mitVorzeichen: true }),
  };

  // Der SATZ dahinter braucht das Gegenteil. „verbraucht" mit einem Plusbetrag dahinter
  // liest sich als ausgegeben, obwohl der Rest im selben Atemzug wächst — ein Vorzeichen
  // gewinnt nie gegen ein Wort, das ihm widerspricht. Deshalb hier der Betrag ohne
  // Vorzeichen und stattdessen das passende Wort.
  const zurueck = monat.verbraucht < 0;
  const satz = {
    uebertrag: geld.formatMitSymbol(monat.uebertrag),
    zufuehrung: geld.formatMitSymbol(monat.zufuehrung),
    verbraucht: geld.formatMitSymbol(Math.abs(monat.verbraucht)),
    rest: geld.formatMitSymbol(monat.rest),
  };

  return (
    <span
      className="muted"
      style={{ fontSize: "var(--fs-2xs)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
      title={t(zurueck ? "budgets.fortschreibungTitelZurueck" : "budgets.fortschreibungTitel", satz)}
    >
      {t("budgets.fortschreibung", werte)}
    </span>
  );
}
