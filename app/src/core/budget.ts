// Budget — Rahmen für variable Ausgaben einer Kategorie pro Periode (KONZEPT §3.3).
// Erzeugt geglättete Plan-Abflüsse; Reset zum Periodenende, KEIN Übertrag (saisonales
// Ansparen gehört in einen Topf, nicht ins Budget). MVP: lineare Glättung.

import type { Cent } from "./geld";

export type BudgetPeriode = "monatlich" | "jaehrlich";

export const PERIODE_MONATE: Record<BudgetPeriode, number> = {
  monatlich: 1,
  jaehrlich: 12,
};

export interface Budget {
  readonly id: string;
  readonly kategorieId: string;
  /** Rahmenbetrag je Periode, positiver Betrag in Cent (> 0). */
  readonly rahmen: Cent;
  readonly periode: BudgetPeriode;
}

/**
 * Geglätteter erwarteter Abfluss pro Monat (negativ). Linear: Rahmen ÷ Periodenmonate.
 * Beispiel: 4.800 €/Jahr → −400 €/Monat; 400 €/Monat → −400 €/Monat.
 */
export function geglaetteterMonatsabfluss(budget: Budget): Cent {
  const monate = PERIODE_MONATE[budget.periode];
  return -Math.round(budget.rahmen / monate);
}
