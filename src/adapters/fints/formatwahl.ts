// Welches Umsatzformat zuerst versucht wird — und ob es einen zweiten Versuch gibt.
//
// Eigene Datei, weil es die einzige Stelle im Adapter ist, an der wirklich ENTSCHIEDEN
// wird. Der Rest von `fintsAdapter.ts` redet mit der Bank und ist ohne sie nicht prüfbar;
// diese Funktion ist eine reine Abbildung und soll genau deshalb hier liegen, wo ein Test
// sie erreicht.
//
// Zwei Eingaben, die man leicht verwechselt, und der Unterschied entscheidet über das
// Ergebnis:
//
//  • **Das Gedächtnis** (`zuletzt`) dreht nur die REIHENFOLGE. Es spart die absehbar
//    vergebliche erste Runde, schliesst aber nichts aus — bleibt der erste Versuch leer,
//    läuft der zweite. So kommt ein Institut, das CAMT nachrüstet, von selbst wieder
//    darauf, statt für immer auf dem alten Weg zu bleiben.
//
//  • **Die Wahl** (`wahl`) ist eine FESTLEGUNG und schliesst den anderen Weg aus. Sie
//    wird gebraucht, weil das Gedächtnis genau dann nicht greift, wenn man es am nötigsten
//    hätte: liefert der erste Versuch etwas — und sei es eine von der Bank gedeckelte
//    Teilmenge —, gilt er als erfolgreich, und der zweite läuft nie. Wer den anderen Weg
//    sehen will, muss den ersten ausschliessen können.

import type { Formatvorgabe } from "../../application/fints/abrufPort";

export interface Formatplan {
  /** Womit begonnen wird. */
  readonly zuerstCamt: boolean;
  /** Wenn true, gibt es keinen zweiten Versuch — das Format ist festgelegt. */
  readonly nurEines: boolean;
}

export function formatplan(vorgabe?: Formatvorgabe): Formatplan {
  const wahl = vorgabe?.wahl ?? "automatisch";
  if (wahl === "CAMT") return { zuerstCamt: true, nurEines: true };
  if (wahl === "MT940") return { zuerstCamt: false, nurEines: true };
  // Ohne Festlegung: CAMT ist die Vorgabe, das Gedächtnis darf sie umdrehen.
  return { zuerstCamt: vorgabe?.zuletzt !== "MT940", nurEines: false };
}
