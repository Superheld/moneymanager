// Budget — Rahmen für variable Ausgaben einer Kategorie pro Periode (KONZEPT §3.3).
// Erzeugt geglättete Plan-Abflüsse; Reset zum Periodenende, KEIN Übertrag (saisonales
// Ansparen gehört in einen Topf, nicht ins Budget). MVP: lineare Glättung.

import type { Cent } from "./geld";
import type { IstBuchung } from "./istbuchung";

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

/**
 * Zeitfenster [von, bis) der laufenden Periode am Datum `am` (ISO). Monatlich = der
 * Kalendermonat, jährlich = das Kalenderjahr. Reine String-Arithmetik auf ISO-Daten,
 * locale- und zeitzonenunabhängig.
 */
export function periodeFenster(periode: BudgetPeriode, am: string): { von: string; bis: string } {
  const [j, m] = am.split("-").map(Number);
  if (periode === "jaehrlich") {
    return { von: `${j}-01-01`, bis: `${j + 1}-01-01` };
  }
  const von = `${j}-${String(m).padStart(2, "0")}-01`;
  const naechsterMonat = m === 12 ? 1 : m + 1;
  const jahr = m === 12 ? j + 1 : j;
  const bis = `${jahr}-${String(naechsterMonat).padStart(2, "0")}-01`;
  return { von, bis };
}

/**
 * Ist-Verbrauch eines Budgets (ADR-0003 §3: Budget-Matching automatisch über Kategorie ×
 * Periode). Summe der bestätigten **Aufwands**-Abflüsse auf der Kategorie im Zeitfenster
 * [von, bis), als positiver Betrag. Umschichtungen (z. B. gedeckte Topf-Entnahmen aus
 * Ersatz/Puffer) zählen NICHT — kein Doppelzählen. Spartopf-Entnahmen sind Aufwand und
 * zählen, wenn sie dieselbe Kategorie tragen.
 */
export function budgetVerbrauch(
  buchungen: IstBuchung[],
  kategorieId: string,
  von: string,
  bis: string,
): Cent {
  return buchungen.reduce((s, b) => {
    if (b.kategorieId !== kategorieId) return s;
    if (b.charakter !== "Aufwand") return s;
    if (b.datum < von || b.datum >= bis) return s;
    return s + Math.abs(b.betrag);
  }, 0);
}
