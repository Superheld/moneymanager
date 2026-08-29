// Welcher Beleg zu welcher Buchung gehört — der Join, den vier Sichten brauchen.
//
// Empfänger, Verwendungszweck und Gläubiger-ID stehen am `Umsatz` aus dem Import, Betrag
// und Datum an der `IstBuchung`; verbunden sind sie über `umsatz.istbuchungId`. Jede
// Sicht, die einen Empfänger neben einer Buchung zeigt, braucht diese Zuordnung.
//
// **Warum das eine eigene Funktion sein muss.** Bis 2026-08-29 stand die Schleife an
// vier Stellen (Zahlungsspuren, Kontensichten, Analysesichten, Buchungsdetail) — mit
// ZWEI verschiedenen Regeln für denselben Konflikt:
//
//   • `if (u.istbuchungId && !map.has(id)) map.set(...)`  → der erste gewinnt
//   • `if (u.istbuchungId) map.set(...)`                   → der letzte gewinnt
//
// Zeigen zwei Umsätze auf dieselbe Buchung, nannte die Analyse also einen anderen
// Empfänger als der Kontoauszug. Der Widerspruch ist unsichtbar, solange beide Belege
// dasselbe sagen — und genau deshalb fällt er nie auf, sondern erzeugt nur irgendwann
// zwei Antworten auf dieselbe Frage.

import type { Umsatz } from "../import/umsatz";

/**
 * Buchungs-Id → Beleg. Bei mehreren Belegen zu einer Buchung gewinnt der ERSTE.
 *
 * Die Regel ist bewusst die konservative: der erste ist der, mit dem die Buchung
 * entstanden ist. Ein später hinzugekommener Beleg (dieselbe Zahlung über eine zweite
 * Quelle) beschreibt dieselbe Zahlung — er soll die Anzeige aber nicht rückwirkend
 * umschreiben, denn welche der beiden Quellen „richtiger" ist, weiß hier niemand.
 */
export function belegZuBuchung(umsaetze: readonly Umsatz[]): Map<string, Umsatz> {
  const map = new Map<string, Umsatz>();
  for (const u of umsaetze) {
    if (!u.istbuchungId) continue;
    if (!map.has(u.istbuchungId)) map.set(u.istbuchungId, u);
  }
  return map;
}

/**
 * Buchungs-Id → Empfängername. Nur Belege MIT Namen, erster gewinnt.
 *
 * Eine eigene Funktion und keine Ableitung aus `belegZuBuchung`, weil der Filter vor der
 * Auswahl greifen muss: hat der erste Beleg keinen Empfänger und der zweite einen, ist
 * der zweite die bessere Auskunft — ein leerer Name ist keine Antwort, sondern eine
 * fehlende. Bei `belegZuBuchung` ist das anders, dort ist der Beleg als ganzer gemeint.
 *
 * Stand bis 2026-08-29 wortgleich in `uebersicht` und `budgets/budgetsichten`, dort mit
 * „letzter gewinnt" — die fünfte Variante desselben Joins.
 */
export function empfaengerJeBuchung(umsaetze: readonly Umsatz[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of umsaetze) {
    if (!u.istbuchungId || !u.gegenpartei) continue;
    if (!map.has(u.istbuchungId)) map.set(u.istbuchungId, u.gegenpartei);
  }
  return map;
}
