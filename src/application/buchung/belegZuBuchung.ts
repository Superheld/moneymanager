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
// **Der Konflikt ist heute nicht erreichbar**, und das gehört dazugesagt: `umsatzVerbuchen`
// ruft `verbuchen(u, ist.id)` immer 1:1 auf, jeder Beleg bekommt seine eigene Buchung. Es
// gibt keinen Weg, zwei Belege auf dieselbe zu setzen.
//
// Der Grund für die eine Stelle ist deshalb nicht ein Fehler, den es gibt, sondern einer,
// den vier Kopien einer Schleife jederzeit bekommen können: die vierte wird beim nächsten
// Umbau vergessen, und welche Regel dann gilt, sieht man ihr nicht an. Dass die Kopien
// sich schon jetzt widersprachen, ohne dass es auffiel, ist der Beleg dafür — nicht ein
// gemeldeter Fehler.

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
