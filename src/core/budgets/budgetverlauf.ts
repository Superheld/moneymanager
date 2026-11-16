// Budgetverlauf — dasselbe Budget, Monat für Monat aufgeschrieben: Rahmen des Monats,
// Verbrauch des Monats, Rest. Seit Migration 81 ist ein Budget nur noch monatlich, und
// der Rest verfällt zum Ersten; der Übertrag ist deshalb immer 0.
//
// Die Fortschreibung mit Übertrag — „aus dem Vormonat, plus die Rate, minus was abfloss"
// — hatte bis dahin das aufbauende Budget. Sie gehört jetzt der Rücklage
// (`ruecklagenFortschreibung` in `ruecklagen/topf.ts`) und benutzt dieselbe Form
// `Budgetmonat`, damit eine Ansicht beide zeigen kann.
//
// **Sie ist keine zweite Wahrheit neben `budgetStand`, sondern dessen Zerlegung.** Der
// Rest ist in beiden Rechnungen derselbe. Festgehalten in `budgetverlauf.test.ts`.

import type { Cent } from "../basis/geld";
import { addMonate, parseIso, toIso } from "../basis/datum";
import {
  budgetVerbrauch,
  ersterBudgetmonat,
  monatDanach,
  monatsFenster,
  zufuehrungIm,
  type Budget,
  type BudgetSicht,
} from "./budget";

/** Ein Monat im Leben eines Budgets — die Aufrechnung, aus der sein Rest entsteht. */
export interface Budgetmonat {
  /** `YYYY-MM`. */
  readonly monat: string;
  /** Das Fenster [von, bis) dieses Monats — dieselbe Auswahl wie für `verbraucht`. */
  readonly von: string;
  readonly bis: string;
  /**
   * Was aus dem Vormonat übrig blieb. Beim Budget immer 0: der Rahmen setzt sich zum
   * Ersten zurück, und ein Übertrag von 0 ist hier eine Aussage, kein fehlender Wert. Bei
   * einer Rücklage (`ruecklagenFortschreibung`) ihr Stand am Ende des Vormonats.
   */
  readonly uebertrag: Cent;
  /**
   * Was in diesem Monat hineingeht — der effektive Monatsbetrag. 0, solange der Monat vor
   * dem Start des Budgets liegt; ein Budget rückwirkend zu füllen wäre erfunden.
   */
  readonly zufuehrung: Cent;
  /**
   * Die Zuführung des VORmonats, wenn sie eine andere war — sonst `undefined`.
   *
   * Damit die Stufe im Verlauf erklärbar ist: ein Rahmen, der von einem Monat auf den
   * nächsten springt, sieht sonst aus wie ein Rechenfehler. Sie wird aus der EFFEKTIVEN
   * Zuführung abgeleitet und nicht aus der Betragsreihe, weil sie sich auch ändert, wenn
   * ein eingebettetes Budget eine neue Version bekommt — beides ist für den Betrachter
   * dasselbe Ereignis: „hier gilt ab jetzt etwas anderes".
   */
  readonly zufuehrungVorher?: Cent;
  /**
   * Der Monat liegt VOR der ersten Betragsversion: damals gab es für diese Kategorie
   * keinen Rahmen.
   *
   * Er steht trotzdem in der Reihe, weil das Ausgegebene eine Tatsache ist und die
   * interessanteste Frage am Verlauf beantwortet: „wie war es, bevor ich das Budget
   * hatte?". Ohne die Kennzeichnung läse sich so ein Monat als Rahmen 0 bei vollem
   * Verbrauch — also als heftig überzogen, obwohl niemand etwas überzogen hat.
   */
  readonly ohnePlan?: true;
  /** `uebertrag + zufuehrung` — der Rahmen DIESES Monats. */
  readonly verfuegbar: Cent;
  /** Verbrauch in diesem Monat, positiv (eine Erstattung ist entsprechend negativ). */
  readonly verbraucht: Cent;
  /**
   * Nur bei einer Rücklage, und nur im Monat, in dem sie abgeschlossen wurde: was der
   * abgeschlossene Zyklus am Abschlusstag noch hatte — positiv frei geworden, negativ das
   * Minus, mit dem er abgeschlossen wurde. Beides verlässt die Rücklage an diesem Tag;
   * ohne die Zahl ginge der Monat nicht auf (`ruecklagenFortschreibung`).
   */
  readonly abgeschlossen?: Cent;
  /**
   * `verfuegbar − verbraucht − abgeschlossen`. Beim Budget das, was zum Ersten verfällt,
   * bei einer Rücklage der Übertrag in den nächsten Monat. Negativ = überzogen.
   */
  readonly rest: Cent;
}

/**
 * Die Monate `vonMonat`..`bisMonat` (beide `YYYY-MM`, einschließlich) als Fortschreibung.
 *
 * Unbegrenzt nach hinten: jeder Monat steht für sich, und was vor der ersten
 * Betragsversion ausgegeben wurde, ist eine Tatsache und die interessanteste Zeile am
 * Verlauf — „so war es, bevor ich das Budget hatte". Diese Monate bekommen keinen
 * erfundenen Rahmen, sondern `ohnePlan`.
 */
export function budgetFortschreibung(
  sicht: BudgetSicht,
  budget: Budget,
  vonMonat: string,
  bisMonat: string,
): Budgetmonat[] {
  const geplantAb = ersterBudgetmonat(budget);
  const rate = (m: string) => zufuehrungIm(budget, m);

  const raus: Budgetmonat[] = [];
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
export function budgetMonatsstand(sicht: BudgetSicht, budget: Budget, am: string): Budgetmonat {
  const monat = am.slice(0, 7);
  return budgetFortschreibung(sicht, budget, monat, monat)[0];
}

/** `YYYY-MM` einen Monat zurück. */
function vormonat(monat: string): string {
  return toIso(addMonate(parseIso(`${monat}-01`), -1)).slice(0, 7);
}

/**
 * Die letzten `anzahl` Monate bis einschließlich des Monats von `am`, als `YYYY-MM`-Paar
 * für `budgetFortschreibung`.
 */
export function verlaufsfenster(am: string, anzahl: number): { vonMonat: string; bisMonat: string } {
  const bisMonat = am.slice(0, 7);
  const vonMonat = toIso(addMonate({ ...parseIso(`${bisMonat}-01`) }, -(anzahl - 1))).slice(0, 7);
  return { vonMonat, bisMonat };
}
