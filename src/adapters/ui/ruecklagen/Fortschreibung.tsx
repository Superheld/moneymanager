// Die Aufrechnung eines Monats einer Rücklage in einer Zeile: Übertrag, Rate, Entnahmen —
// und im Monat eines Abschlusses, was dabei frei geworden ist.
//
// Bis Paket 4 (ADR-0006) war das die Zeile des aufbauenden Budgets und lag in
// `bausteine/` (als `BudgetFortschreibung`). Seither zeigt sie der Verlauf JEDER Rücklage
// und nur er — deshalb liegt sie hier. Sie steht da, wo sonst „140 von 200" stünde: die
// 200 wäre der Betrag, der hineingegangen WÄRE, hätte man nie etwas ausgegeben. Der
// Übertrag sagt dagegen: soviel war da, soviel kam dazu, soviel ist weg.
//
// Das Ergebnis steht bewusst NICHT in dieser Zeile: es ist der grosse Betrag darüber.
// Zweimal dieselbe Zahl in zwei Schriftgrössen liest sich wie zwei verschiedene.

import { useTranslation } from "react-i18next";
import type { Fortschreibungsmonat } from "../../../application";
import { useGeld } from "../bausteine/einstellungenKontext";

export function Fortschreibung({ monat }: { monat: Fortschreibungsmonat }) {
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

  // Im Monat eines Abschlusses verlässt der Stand des alten Zyklus die Rücklage: frei
  // geworden oder als Minus abgeschlossen. Ohne diesen Teil ginge die Zeile nicht auf den
  // Rest auf, der daneben steht (`ruecklagenFortschreibung`).
  const abschluss =
    monat.abgeschlossen == null
      ? ""
      : monat.abgeschlossen >= 0
        ? t("ruecklagen.fortschreibungFrei", { betrag: geld.formatMitSymbol(monat.abgeschlossen) })
        : t("ruecklagen.fortschreibungImMinus", { betrag: geld.formatMitSymbol(monat.abgeschlossen) });
  const dazu = abschluss ? ` · ${abschluss}` : "";

  return (
    <span
      className="muted"
      style={{ fontSize: "var(--fs-2xs)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
      title={`${t(zurueck ? "ruecklagen.fortschreibungTitelZurueck" : "ruecklagen.fortschreibungTitel", satz)}${dazu}`}
    >
      {t("ruecklagen.fortschreibung", werte)}{dazu}
    </span>
  );
}
