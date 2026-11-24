// Das Vorzeichen einer Plangrösse aus ihrem Charakter.

import type { Cent, Charakter } from "../../core";

/**
 * Ertrag fließt zu (+), Aufwand und Umschichtung fließen ab (−).
 *
 * Die Funktion leitet die RICHTUNG aus der EINORDNUNG ab, und das geht nur so lange gut,
 * wie beide dasselbe sagen. Für eine PLANGRÖSSE (die Zahlung eines Vertrags) tun sie das
 * immer: eine geplante Rate hat genau eine Richtung, sonst wäre sie keine Rate.
 *
 * Für eine IST-BUCHUNG gilt das nicht, und deshalb ruft `buchungErfassen` diese Funktion
 * seit 2026-08-25 nicht mehr auf. Eine Erstattung ist der Fall, in dem Einordnung und
 * Richtung auseinanderfallen: sie gehört in die Kategorie der Ausgabe (also Aufwand), aber
 * das Geld kam herein. Dort trägt der Betrag sein Vorzeichen selbst — beim Import vom
 * Beleg, von Hand aus dem, was jemand eintippt.
 */
export function vorzeichenbehaftet(betrag: Cent, charakter: Charakter): number {
  const cent = Math.abs(betrag);
  return charakter === "Ertrag" ? cent : -cent;
}
