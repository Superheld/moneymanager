// Use-Case „Budget anlegen". Eindeutigkeit „ein Budget je Kategorie" wird hier per
// Repository geprüft (SPEC US-D1: bewusst nicht synchron erzwungen).
//
// Je Kategorie EINES — nicht mehr wie früher „eines je Kategorie + Periode". Mit zwei
// Arten am selben Aggregat wäre ein zweites Budget auf derselben Kategorie keine
// Verfeinerung, sondern eine Doppelzählung: beide zögen dieselben Buchungen. Wer
// unterschiedlich behandeln will, legt das zweite Budget auf eine UNTERkategorie —
// dann rechnet der Kern es automatisch aus dem Dach heraus (core/budget).

import { FachlicherFehler, istCent, type Budget, type Budgetart, type Cent } from "../../core";
import type { BudgetRepository } from "../ports";

export interface BudgetEingabe {
  kategorieId: string;
  kontoId: string;
  /** Betrag pro Monat in Minor Units — die UI parst die Eingabe währungsgerecht (ADR-0004). */
  betragProMonat: Cent;
  art: Budgetart;
  /** ISO-Datum; fehlt es, zählt der Erste des angegebenen Monats bzw. `heute`. */
  start: string;
}

export async function budgetAnlegen(
  repo: BudgetRepository,
  eingabe: BudgetEingabe,
  id?: string,
): Promise<Budget> {
  if (!eingabe.kategorieId) throw new FachlicherFehler("kategorie.waehlen");
  if (!eingabe.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!istCent(eingabe.betragProMonat) || eingabe.betragProMonat <= 0) {
    throw new FachlicherFehler("rahmen.groesserNull");
  }
  // Nur die FORM — ob es den Tag gibt, prüft der Kern beim Rechnen (CLAUDE.md).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.start)) throw new FachlicherFehler("startdatum.ungueltig");

  const bestehende = await repo.alle();
  if (bestehende.some((b) => b.id !== id && b.kategorieId === eingabe.kategorieId)) {
    throw new FachlicherFehler("budget.existiert");
  }

  const budget: Budget = {
    id: id ?? crypto.randomUUID(),
    kategorieId: eingabe.kategorieId,
    kontoId: eingabe.kontoId,
    betragProMonat: eingabe.betragProMonat,
    art: eingabe.art,
    // Ein aufbauendes Budget sammelt ab dem Monatsersten — mitten im Monat anzufangen
    // hiesse, den ersten Monat anteilig zu rechnen, und dafür gibt es keinen Grund.
    start: `${eingabe.start.slice(0, 7)}-01`,
  };
  await repo.speichern(budget);
  return budget;
}
