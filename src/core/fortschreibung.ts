// Die Fortschreibung — ein Topf Monat für Monat aufgeschrieben: was aus dem Vormonat
// übrig war, was hineinging, was abfloss, was bleibt.
//
// Budget und Rücklage schreiben sie beide (`budgets/budgetverlauf.ts`,
// `ruecklagen/topf.ts`), in DERSELBEN Form, damit eine Ansicht beide zeigen kann — der
// Verlaufs-Chart ist ein Baustein, den beide Bereiche benutzen. Die Form gehört deshalb
// keinem von beiden: Rücklagen kennen keine Budgets (`src/architektur.test.ts`,
// „Modulgrenzen"), und läge sie bei den Budgets, holte jede Rücklage ihren Verlauf dort.
//
// Warum nicht `basis/`: dort liegen Primitive, die quer durch ALLES gehen (Geld, Datum).
// Ein Monat einer Fortschreibung betrifft genau zwei Bereiche. Er bleibt direkt in
// `src/core/`, wo steht, was keinem Bereich gehört. Bis 2026-11-16 hiess der Typ `Budgetmonat` und
// stand in `budgets/budgetverlauf.ts`.

import type { Cent } from "./basis/geld";
import { addMonate, parseIso, toIso } from "./basis/datum";

/**
 * Ein Monat im Leben eines Budgets oder einer Rücklage — die Aufrechnung, aus der sein
 * Rest entsteht: Übertrag + Zuführung − Verbrauch (− abgeschlossen) = Rest.
 */
export interface Fortschreibungsmonat {
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
 * Die letzten `anzahl` Monate bis einschließlich des Monats von `am`, als `YYYY-MM`-Paar
 * für `budgetFortschreibung` und `ruecklagenFortschreibung`.
 */
export function verlaufsfenster(am: string, anzahl: number): { vonMonat: string; bisMonat: string } {
  const bisMonat = am.slice(0, 7);
  const vonMonat = toIso(addMonate({ ...parseIso(`${bisMonat}-01`) }, -(anzahl - 1))).slice(0, 7);
  return { vonMonat, bisMonat };
}
