// Use-Case „Budget anlegen". Eindeutigkeit „ein Budget je Kategorie + Periode" wird
// hier per Repository geprüft (SPEC US-D1: bewusst nicht synchron erzwungen).

import { euroZuCent, type Budget, type BudgetPeriode } from "../core";
import type { BudgetRepository } from "./ports";

export interface BudgetEingabe {
  kategorieId: string;
  rahmenEuro: number;
  periode: BudgetPeriode;
}

export async function budgetAnlegen(
  repo: BudgetRepository,
  eingabe: BudgetEingabe,
  id?: string,
): Promise<Budget> {
  if (!eingabe.kategorieId) throw new Error("Bitte eine Kategorie wählen.");
  if (!(eingabe.rahmenEuro > 0)) throw new Error("Der Rahmen muss größer als 0 sein.");

  const bestehende = await repo.alle();
  if (bestehende.some((b) => b.id !== id && b.kategorieId === eingabe.kategorieId && b.periode === eingabe.periode)) {
    throw new Error("Für diese Kategorie und Periode gibt es schon ein Budget.");
  }

  const budget: Budget = {
    id: id ?? crypto.randomUUID(),
    kategorieId: eingabe.kategorieId,
    rahmen: euroZuCent(eingabe.rahmenEuro),
    periode: eingabe.periode,
  };
  await repo.speichern(budget);
  return budget;
}
