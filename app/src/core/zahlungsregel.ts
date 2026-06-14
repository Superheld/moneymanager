// Zahlungsregel — die Quelle, aus der die Projektion Plan-Zahlungen erzeugt.
// In P0 das einzige Aggregat der Planung; später kommen Verträge/Budgets/Töpfe
// als weitere Quellen hinzu, die ebenfalls in Zahlungsregeln münden.

import type { Cent } from "./geld";

/** Wiederholungsrhythmus als Monatsschritt. */
export type Rhythmus =
  | "monatlich" // alle 1 Monate
  | "quartalsweise" // alle 3 Monate
  | "halbjaehrlich" // alle 6 Monate
  | "jaehrlich"; // alle 12 Monate

/** Monatsabstand je Rhythmus — Basis der Projektionsarithmetik. */
export const RHYTHMUS_MONATE: Record<Rhythmus, number> = {
  monatlich: 1,
  quartalsweise: 3,
  halbjaehrlich: 6,
  jaehrlich: 12,
};

/**
 * Charakter einer Zahlung (KONZEPT §3.3): trennt echte Ausgabe/Einnahme von der
 * bloßen Vermögensumschichtung. Liquiditätswirksam sind alle drei; erfolgswirksam
 * nur Aufwand/Ertrag.
 */
export type Charakter = "Aufwand" | "Ertrag" | "Umschichtung";

export interface Zahlungsregel {
  readonly id: string;
  readonly bezeichnung: string;
  /** Betrag je Fälligkeit in Cent, vorzeichenbehaftet (negativ = Abfluss). */
  readonly betrag: Cent;
  readonly rhythmus: Rhythmus;
  /** Erste Fälligkeit, ISO-Datum „YYYY-MM-DD". */
  readonly startdatum: string;
  readonly charakter: Charakter;
}
