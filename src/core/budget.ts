// Budget — Rahmen für variable Ausgaben einer Kategorie pro Periode (KONZEPT §3.3).
// Erzeugt geglättete Plan-Abflüsse; Reset zum Periodenende, KEIN Übertrag (saisonales
// Ansparen gehört in einen Topf, nicht ins Budget). MVP: lineare Glättung.

import type { Cent } from "./geld";
import { kategorieAnteile, type IstBuchung } from "./istbuchung";

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
 *
 * Vorzeichenrichtig: Aufwände sind negativ und erhöhen den Verbrauch, ein positiver
 * Aufwand ist eine Erstattung und senkt ihn. Ein früheres `Math.abs` liess Retouren den
 * Verbrauch ERHÖHEN — Fehler in Höhe des doppelten Erstattungsbetrags, und die Historie
 * (die vorzeichenrichtig rechnet) zeigte für dieselben Daten andere Zahlen.
 *
 * Nicht behandelt: eine Erstattung, die als `Ertrag` gebucht ist, bleibt draussen — sie
 * entlastet das Budget also nicht. Das ist eine fachliche Frage (zählt jeder Zufluss auf
 * einer Aufwandskategorie als Budget-Entlastung?) und keine hier zu treffende Entscheidung.
 */
export function budgetVerbrauch(
  buchungen: IstBuchung[],
  kategorieId: string,
  von: string,
  bis: string,
): Cent {
  return buchungen.reduce((s, b) => {
    if (b.charakter !== "Aufwand") return s;
    if (b.datum < von || b.datum >= bis) return s;
    // Über die Anteile, nicht über b.kategorieId: eine geteilte Buchung (S-7) belastet
    // dieses Budget nur mit IHREM Teil, nicht mit dem vollen Betrag — und nicht gar nicht.
    return kategorieAnteile(b).reduce(
      (t, a) => (a.kategorieId === kategorieId ? t - a.betrag : t),
      s,
    );
  }, 0);
}
