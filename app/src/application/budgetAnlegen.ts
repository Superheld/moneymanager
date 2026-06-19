// Use-Case „Budget anlegen". Eindeutigkeit „ein Budget je Kategorie + Periode" wird
// hier per Repository geprüft (SPEC US-D1: bewusst nicht synchron erzwungen).

import { FachlicherFehler, type Budget, type BudgetPeriode, type Cent } from "../core";
import type { BudgetRepository } from "./ports";

export interface BudgetEingabe {
  kategorieId: string;
  /** Rahmen in Minor Units — die UI parst die Eingabe währungsgerecht (ADR-0004). */
  rahmen: Cent;
  periode: BudgetPeriode;
}

export async function budgetAnlegen(
  repo: BudgetRepository,
  eingabe: BudgetEingabe,
  id?: string,
): Promise<Budget> {
  if (!eingabe.kategorieId) throw new FachlicherFehler("kategorie.waehlen");
  if (!(eingabe.rahmen > 0)) throw new FachlicherFehler("rahmen.groesserNull");

  const bestehende = await repo.alle();
  if (bestehende.some((b) => b.id !== id && b.kategorieId === eingabe.kategorieId && b.periode === eingabe.periode)) {
    throw new FachlicherFehler("budget.existiert");
  }

  const budget: Budget = {
    id: id ?? crypto.randomUUID(),
    kategorieId: eingabe.kategorieId,
    rahmen: eingabe.rahmen,
    periode: eingabe.periode,
  };
  await repo.speichern(budget);
  return budget;
}
