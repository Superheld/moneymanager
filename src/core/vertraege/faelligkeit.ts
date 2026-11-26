// Die Fälligkeit einer Regel, die einem Datum am nächsten liegt.
//
// Eigene Datei, weil zwei Stellen dieselbe Messung brauchen und keine der anderen gehört:
// der Zuordnungsvorschlag (`zuordnungsvorschlag.ts`) fragt „könnte diese Buchung
// dazugehören?", die Erkennung eines Umbuchungsvertrags (`umbuchungErkennung.ts`) fragt
// „gehört sie dazu?". Zwei Rechnungen dafür gäben an einem Monatsletzten zwei Antworten.

import { addMonate, monateZwischen, parseIso, tageBis, toIso } from "../basis/datum";
import { RHYTHMUS_MONATE, type Zahlungsregel } from "../basis/zahlungsregel";

/**
 * Die Fälligkeit der Regel, die `datum` am nächsten liegt, samt Abstand in Tagen.
 *
 * `rueckwaerts` verlängert den Takt auch VOR die erste Fälligkeit. Ohne das gibt es dort
 * keine (k ≥ 0): eine Buchung vor dem Start misst sich an der ersten — kurz davor kann
 * sie eine vorgezogene Abbuchung sein, lange davor fällt sie am Abstand heraus. Das ist
 * für eine Zahlung an einen Anbieter richtig. Ein Umbuchungsvertrag wird dagegen oft erst
 * erfasst, wenn der Dauerauftrag längst läuft, und soll die Umbuchungen davor finden;
 * dort zählt, ob die Buchung im TAKT liegt, nicht ob der Vertrag schon eingetragen war.
 */
export function naechstgelegeneFaelligkeit(
  regel: Zahlungsregel,
  datum: string,
  rueckwaerts = false,
): { faelligkeit: string; tage: number } {
  const schritt = RHYTHMUS_MONATE[regel.rhythmus];
  const start = parseIso(regel.startdatum);
  // Aus dem ORIGINAL-Startdatum + k·Schritt, nie iterativ: sonst klebt ein Vertrag ab dem
  // 31. nach dem Februar am 28. (dieselbe Regel wie in `projiziereRegel`). Der Zyklus um
  // das Buchungsdatum herum und seine beiden Nachbarn genügen — weiter weg liegt keine
  // Fälligkeit näher.
  const roh = Math.round(monateZwischen(regel.startdatum, datum) / schritt);
  const k0 = rueckwaerts ? roh : Math.max(0, roh);
  let beste = { faelligkeit: regel.startdatum, tage: tageBis(regel.startdatum, datum) };
  for (const k of [k0 - 1, k0, k0 + 1]) {
    if (k === 0 || (k < 0 && !rueckwaerts)) continue; // k = 0 ist der Startwert oben
    const faelligkeit = toIso(addMonate(start, k * schritt));
    const tage = tageBis(faelligkeit, datum);
    if (Math.abs(tage) < Math.abs(beste.tage)) beste = { faelligkeit, tage };
  }
  return beste;
}
