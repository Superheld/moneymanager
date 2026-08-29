// Projektion — aus Zahlungsregeln entstehen Plan-Zahlungen auf einer Zeitachse.
// Strikt seiteneffektfrei: kein IO, keine Uhr, kein Zufall → trivial unit-testbar.
// Planbuchungen werden BERECHNET, nicht gespeichert (TAKTIK-PLANUNG §0).
//
// Die Monatsverlaufs- und Liquiditätsaggregation stand hier einmal daneben; sie ist mit
// den Bereichen Planung und Deckung entfallen (2026-08-16). Wer heute einen Monat
// aufrechnet, tut das über `monatsAusblick` gegen Ist-Buchungen, nicht gegen eine Kurve.

import type { Cent } from "../basis/geld";
import { RHYTHMUS_MONATE, type Charakter, type Zahlungsregel } from "../basis/zahlungsregel";
import { addMonate, ord, parseIso, toIso } from "../basis/datum";


/** Eine berechnete Plan-Zahlung (nicht persistiert). */
export interface Planbuchung {
  readonly regelId: string;
  readonly bezeichnung: string;
  readonly datum: string; // ISO
  readonly betrag: Cent;
  readonly charakter: Charakter;
}

/**
 * Projiziert die Fälligkeiten EINER Regel in das Fenster [ab, ab+monate).
 * Beginnt beim Startdatum und schreitet im Rhythmus voran; Fälligkeiten vor
 * dem Fensterstart werden übersprungen (die Regel kann älter sein als das Fenster).
 *
 * Solche Fälligkeiten sind Fakt, kein Plan mehr → sie werden aus der Vorschau
 * entfernt, damit sie nicht doppelt zählen (der reale Saldo trägt sie schon).
 */
/**
 * Deckel für die Fälligkeitsschleife — sie zählt vom ersten Zyklus IM Fenster hoch, ein
 * Fenster ist also nie annähernd so gross. Der Deckel schützt nur davor, dass ein
 * kaputter Rhythmus (Schritt 0) endlos läuft.
 */
const MAX_SCHRITTE = 10_000;

export function projiziereRegel(
  regel: Zahlungsregel,
  ab: string,
  monate: number,
): Planbuchung[] {
  const schritt = RHYTHMUS_MONATE[regel.rhythmus];
  const fensterStart = parseIso(ab);
  const fensterEnde = addMonate(fensterStart, Math.max(0, Math.floor(monate))); // exklusiv
  const startOrd = ord(fensterStart);
  const endeOrd = ord(fensterEnde);

  // Jede Fälligkeit aus dem Original-Startdatum + k·Schritt berechnen — NICHT
  // iterativ vom zuletzt geklemmten Wert, sonst driftet der Monatstag dauerhaft
  // (z. B. 31. → Feb 28. → würde 28. bleiben statt im März wieder 31. zu sein).
  const start = parseIso(regel.startdatum);
  const buchungen: Planbuchung[] = [];

  // Beim ersten Zyklus IM Fenster einsteigen, statt vom Regelstart hochzuzählen: eine
  // Regel mit sehr altem Startdatum verschwand sonst kommentarlos aus der Projektion,
  // weil der Schleifendeckel (`MAX_SCHRITTE`) bei monatlichem Rhythmus nur rund
  // 833 Jahre weit reicht. Der Posten stand in der Vertragsliste, tauchte im
  // Liquiditätsplan aber nie auf — der projizierte Saldo war zu hoch.
  const monateBisFenster =
    (fensterStart.y - start.y) * 12 + (fensterStart.m - start.m);
  const kStart = Math.max(0, Math.floor(monateBisFenster / schritt));

  for (let k = kStart; k < kStart + MAX_SCHRITTE; k++) {
    const faellig = addMonate(start, k * schritt);
    if (ord(faellig) >= endeOrd) break;
    if (ord(faellig) >= startOrd) {
      const datum = toIso(faellig);
      buchungen.push({
        regelId: regel.id,
        bezeichnung: regel.bezeichnung,
        datum,
        betrag: regel.betrag,
        charakter: regel.charakter,
      });
    }
  }
  return buchungen;
}

/**
 * Nächste Fälligkeit einer Regel ab `heute` (einschließlich heute), oder null, wenn
 * keine mehr kommt. Eigene Funktion statt `projiziereRegel(...)[0]`: die Projektion
 * baut ein ganzes Fenster auf, und wer nur den nächsten Termin braucht (Vertragsliste),
 * müsste raten, wie weit das Fenster reichen muss — bei einem Jahresvertrag zwölf
 * Monate, bei einem monatlichen einer.
 *
 * Rechnet wie die Projektion aus dem ORIGINAL-Startdatum + k·Schritt, damit der
 * Monatstag nicht driftet (ein Vertrag ab dem 31. bliebe sonst nach dem Februar
 * dauerhaft am 28. kleben).
 */
export function naechsteFaelligkeit(regel: Zahlungsregel, heute: string): string | null {
  const schritt = RHYTHMUS_MONATE[regel.rhythmus];
  const start = parseIso(regel.startdatum);
  const jetzt = parseIso(heute);
  const heuteOrd = ord(jetzt);

  // Direkt in die Nähe springen statt vom Startdatum hochzuzählen — Regeln mit sehr
  // altem Start (Miete seit 2009) sind der Normalfall, nicht die Ausnahme.
  const monateBisHeute = (jetzt.y - start.y) * 12 + (jetzt.m - start.m);
  let k = Math.max(0, Math.floor(monateBisHeute / schritt));
  // Der Sprung landet höchstens einen Zyklus daneben; drei Schritte sind reichlich.
  for (let i = 0; i < 3; i++, k++) {
    const faellig = addMonate(start, k * schritt);
    if (ord(faellig) >= heuteOrd) return toIso(faellig);
  }
  return null;
}
