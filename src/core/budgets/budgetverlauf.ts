// Budgetverlauf — dasselbe Budget, Monat für Monat aufgeschrieben: Rahmen des Monats,
// Verbrauch des Monats, Rest. Seit Migration 81 ist ein Budget nur noch monatlich, und
// der Rest verfällt zum Ersten; der Übertrag ist deshalb immer 0.
//
// Die Fortschreibung mit Übertrag — „aus dem Vormonat, plus die Rate, minus was abfloss"
// — hatte bis dahin das aufbauende Budget. Sie gehört jetzt der Rücklage
// (`ruecklagenFortschreibung` in `ruecklagen/topf.ts`). Beide schreiben dieselbe Form
// (`Fortschreibungsmonat` in `../fortschreibung.ts`), damit eine Ansicht beide zeigen kann.
//
// **Sie ist keine zweite Wahrheit neben `budgetStand`, sondern dessen Zerlegung.** Der
// Rest ist in beiden Rechnungen derselbe. Festgehalten in `budgetverlauf.test.ts`.

import { addMonate, parseIso, toIso } from "../basis/datum";
import {
  budgetVerbrauch,
  ersterBudgetmonat,
  monatDanach,
  monatsFenster,
  zufuehrungIm,
  type Budget,
} from "./budget";
import type { Fortschreibungsmonat } from "../fortschreibung";
import type { Zustaendigkeitssicht } from "../zustaendigkeit";

/**
 * Die Monate `vonMonat`..`bisMonat` (beide `YYYY-MM`, einschließlich) als Fortschreibung.
 *
 * Unbegrenzt nach hinten: jeder Monat steht für sich, und was vor der ersten
 * Betragsversion ausgegeben wurde, ist eine Tatsache und die interessanteste Zeile am
 * Verlauf — „so war es, bevor ich das Budget hatte". Diese Monate bekommen keinen
 * erfundenen Rahmen, sondern `ohnePlan`.
 */
export function budgetFortschreibung(
  sicht: Zustaendigkeitssicht,
  budget: Budget,
  vonMonat: string,
  bisMonat: string,
): Fortschreibungsmonat[] {
  const geplantAb = ersterBudgetmonat(budget);
  const rate = (m: string) => zufuehrungIm(budget, m);

  const raus: Fortschreibungsmonat[] = [];
  for (let m = vonMonat; m <= bisMonat; m = monatDanach(m)) {
    const { von, bis } = monatsFenster(`${m}-01`);
    const zufuehrung = rate(m);
    // Der Vergleich läuft über den echten Vormonat, nicht über die vorige Zeile: die
    // Reihe kann mitten in der Historie anfangen, und dann wäre die erste Zeile immer
    // eine Änderung.
    const ohnePlan = m < geplantAb;
    // Die Marke nur zwischen zwei GEPLANTEN Monaten: der Sprung von „gar kein Budget" auf
    // die erste Rate ist keine Änderung des Rahmens, sondern sein Anfang, und „vorher
    // 0,00" wäre dafür die falsche Auskunft.
    const vorher = !ohnePlan && vormonat(m) >= geplantAb ? rate(vormonat(m)) : zufuehrung;
    const verbraucht = budgetVerbrauch(sicht, budget, von, bis);
    raus.push({
      monat: m, von, bis, uebertrag: 0, zufuehrung, verfuegbar: zufuehrung, verbraucht, rest: zufuehrung - verbraucht,
      ...(vorher !== zufuehrung ? { zufuehrungVorher: vorher } : {}),
      ...(ohnePlan ? { ohnePlan: true as const } : {}),
    });
  }
  return raus;
}

/** Die Fortschreibung EINES Monats — was Liste und Übersicht je Zeile brauchen. */
export function budgetMonatsstand(sicht: Zustaendigkeitssicht, budget: Budget, am: string): Fortschreibungsmonat {
  const monat = am.slice(0, 7);
  return budgetFortschreibung(sicht, budget, monat, monat)[0];
}

/** `YYYY-MM` einen Monat zurück. */
function vormonat(monat: string): string {
  return toIso(addMonate(parseIso(`${monat}-01`), -1)).slice(0, 7);
}
