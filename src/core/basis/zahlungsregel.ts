// Zahlungsregel — die Form, aus der die Projektion Plan-Zahlungen erzeugt.
// Seit Migration 84 keine eigene Tabelle mehr: jede Regel wird aus einem Vertrag gebaut
// (`regelAusVertrag` in `core/vertraege/vertrag.ts`). Der Typ bleibt als die Sicht, die
// die Planung liest.

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
  /** Referenz auf ein Zahlungskonto (Stammdaten), ab P1. Optional. */
  readonly kontoId?: string;
  /**
   * Das ZIELKONTO einer geplanten Umbuchung — gesetzt macht die Regel aus einer Zahlung
   * eine Verschiebung zwischen zwei eigenen Konten.
   *
   * Gespeichert steht es an der Zahlung des Vertrags (`Vertragszahlung.gegenkontoId`).
   *
   * Sinnvoll nur mit `charakter: "Umschichtung"`: bei Aufwand oder Ertrag verlässt das
   * Geld den erfassten Bereich, und ein Gegenkonto behauptete etwas anderes.
   */
  readonly gegenkontoId?: string;
  /** Referenz auf eine Kategorie (Stammdaten), ab P1. Optional. */
  readonly kategorieId?: string;
  /**
   * Der Vertrag, aus dem die Regel gebaut ist. Aus dem Bestand kommt keine Regel ohne;
   * optional bleibt das Feld für Regeln, die ein Test oder eine Rechnung von Hand baut.
   */
  readonly vertragId?: string;
}
