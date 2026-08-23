// Budgetverlauf — dasselbe Budget, Monat für Monat aufgeschrieben.
//
// `budgetStand` beantwortet „wie steht es JETZT" mit zwei kumulierten Zahlen: dem Rahmen
// (bei aufbauend: Rate × Monate seit Start) und dem Verbrauch (bei aufbauend: alles seit
// Start). Für ein monatliches Budget ist das die ganze Wahrheit — für ein aufbauendes ist
// es die falsche Auskunft: „140 von 200" sagt, wieviel hineingegangen WÄRE, wenn man nie
// etwas ausgegeben hätte. Die Zahl wächst mit jedem Monat weiter, und was sich in DIESEM
// Monat verändert hat, verschwindet darin.
//
// Die Fortschreibung sagt es andersherum: Übertrag aus dem Vormonat, plus die Rate dieses
// Monats, minus was in diesem Monat abgeflossen ist, ergibt den Rest.
//
// **Sie ist keine zweite Wahrheit neben `budgetStand`, sondern dessen Zerlegung.** Der
// Rest ist in beiden Rechnungen derselbe, und das ist kein Zufall, sondern Algebra:
//
//     verfuegbar − verbrauchtImMonat
//       = (rahmenKumuliert − verbrauchtBisher) − (verbrauchtKumuliert − verbrauchtBisher)
//       = rahmenKumuliert − verbrauchtKumuliert
//       = rest
//
// Festgehalten in `budgetverlauf.test.ts` — wenn eine der beiden Seiten je abweicht,
// stünden im selben Bild zwei Zahlen für dieselbe Sache, und genau daran ist die
// Budgetrechnung hier schon einmal gescheitert.

import type { Cent } from "../basis/geld";
import { addMonate, monateZwischen, parseIso, toIso } from "../basis/datum";
import {
  budgetVerbrauch,
  effektiverMonatsbetrag,
  monatsFenster,
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
   * Was aus dem Vormonat übrig blieb. Bei `monatlich` immer 0: der Rahmen setzt sich zum
   * Ersten zurück, und ein Übertrag von 0 ist hier eine Aussage, kein fehlender Wert.
   */
  readonly uebertrag: Cent;
  /**
   * Was in diesem Monat hineingeht — der effektive Monatsbetrag. 0, solange der Monat vor
   * dem Start des Budgets liegt; ein Budget rückwirkend zu füllen wäre erfunden.
   */
  readonly zufuehrung: Cent;
  /** `uebertrag + zufuehrung` — der Rahmen DIESES Monats. */
  readonly verfuegbar: Cent;
  /** Verbrauch in diesem Monat, positiv (eine Erstattung ist entsprechend negativ). */
  readonly verbraucht: Cent;
  /**
   * `verfuegbar − verbraucht`. Bei `aufbauend` der Übertrag in den nächsten Monat, bei
   * `monatlich` das, was zum Ersten verfällt. Negativ = überzogen.
   */
  readonly rest: Cent;
}

/**
 * Ab welchem Monat ein Verlauf frühestens beginnen darf.
 *
 * Bei `aufbauend` ist das der Startmonat: davor gibt es keine Zuführung, und der Verbrauch
 * zählt dort auch für `budgetStand` nicht (sein Fenster beginnt am Start). Ein Balken für
 * einen Monat davor zeigte Ausgaben, die das Budget nie belastet haben.
 *
 * Bei `monatlich` gibt es keine Untergrenze — der Start ist dort ohne Wirkung, jeder Monat
 * hat seinen vollen Rahmen.
 */
export function fruehesterVerlaufsmonat(budget: Budget): string | null {
  return budget.art === "aufbauend" ? budget.start.slice(0, 7) : null;
}

/**
 * Die Monate `vonMonat`..`bisMonat` (beide `YYYY-MM`, einschließlich) als Fortschreibung.
 *
 * Der Übertrag in den ersten Monat wird NICHT bei null angenommen, sondern aus der
 * Vorgeschichte gerechnet: bei `aufbauend` alles zwischen Start und `vonMonat`. Sonst
 * zeigte ein Zwölf-Monats-Fenster ein Budget, das gerade erst angefangen hat zu sammeln,
 * und der letzte Rest passte nicht mehr zu dem, was daneben steht.
 */
export function budgetFortschreibung(
  sicht: BudgetSicht,
  budget: Budget,
  vonMonat: string,
  bisMonat: string,
): Budgetmonat[] {
  const proMonat = effektiverMonatsbetrag(budget, sicht.budgets, sicht.kategorien);
  const untergrenze = fruehesterVerlaufsmonat(budget);
  const start = untergrenze && untergrenze > vonMonat ? untergrenze : vonMonat;

  let uebertrag = budget.art === "aufbauend" ? vorgeschichte(sicht, budget, proMonat, start) : 0;

  const raus: Budgetmonat[] = [];
  for (let m = start; m <= bisMonat; m = naechsterMonat(m)) {
    const { von, bis } = monatsfensterAb(budget, m);
    const zufuehrung = zufuehrungIm(budget, proMonat, m);
    const verfuegbar = uebertrag + zufuehrung;
    const verbraucht = budgetVerbrauch(sicht, budget, von, bis);
    const rest = verfuegbar - verbraucht;
    raus.push({ monat: m, von, bis, uebertrag, zufuehrung, verfuegbar, verbraucht, rest });
    // Genau hier steht der ganze Unterschied zwischen den beiden Arten: das Aufbauende
    // nimmt seinen Rest mit, das Monatliche lässt ihn liegen.
    uebertrag = budget.art === "aufbauend" ? rest : 0;
  }
  return raus;
}

/** Die Fortschreibung EINES Monats — was Liste und Übersicht je Zeile brauchen. */
export function budgetMonatsstand(sicht: BudgetSicht, budget: Budget, am: string): Budgetmonat {
  const monat = am.slice(0, 7);
  const reihe = budgetFortschreibung(sicht, budget, monat, monat);
  // Leer nur, wenn der Monat vor dem Start eines aufbauenden Budgets liegt: dann gibt es
  // weder Zuführung noch Übertrag, und ein leerer Monat ist die richtige Antwort.
  return reihe[0] ?? leererMonat(monat);
}

function leererMonat(monat: string): Budgetmonat {
  const { von, bis } = monatsFenster(`${monat}-01`);
  return { monat, von, bis, uebertrag: 0, zufuehrung: 0, verfuegbar: 0, verbraucht: 0, rest: 0 };
}

/**
 * Das Fenster [von, bis) eines Monats — im Startmonat eines aufbauenden Budgets erst ab
 * dem Starttag.
 *
 * Muss so sein, weil `verbrauchsFenster` (Kern, für `budgetStand`) es genauso hält: dort
 * beginnt das Fenster am Starttag, nicht am Monatsersten. Zöge die Fortschreibung ihre
 * Grenze anders, zählte eine Buchung vom Monatsanfang hier mit und dort nicht — und der
 * Rest der beiden Rechnungen liefe genau um diesen Betrag auseinander.
 */
function monatsfensterAb(budget: Budget, monat: string): { von: string; bis: string } {
  const fenster = monatsFenster(`${monat}-01`);
  if (budget.art === "aufbauend" && monat === budget.start.slice(0, 7)) {
    return { von: budget.start, bis: fenster.bis };
  }
  return fenster;
}

/** Was ein aufbauendes Budget zwischen seinem Start und `bisMonat` angesammelt hat. */
function vorgeschichte(sicht: BudgetSicht, budget: Budget, proMonat: Cent, bisMonat: string): Cent {
  const startMonat = budget.start.slice(0, 7);
  if (startMonat >= bisMonat) return 0;
  const monate = monateZwischen(`${startMonat}-01`, `${bisMonat}-01`);
  return proMonat * monate - budgetVerbrauch(sicht, budget, budget.start, `${bisMonat}-01`);
}

/** 0 vor dem Start, sonst der effektive Monatsbetrag. */
function zufuehrungIm(budget: Budget, proMonat: Cent, monat: string): Cent {
  if (budget.art === "aufbauend" && monat < budget.start.slice(0, 7)) return 0;
  return proMonat;
}

/** `YYYY-MM` einen Monat weiter — String-Arithmetik über die vorhandenen Datumshelfer. */
function naechsterMonat(monat: string): string {
  return toIso(addMonate(parseIso(`${monat}-01`), 1)).slice(0, 7);
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
