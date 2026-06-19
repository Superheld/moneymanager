import { describe, it, expect } from "vitest";
import type { Budget } from "../core";
import type { BudgetRepository } from "./ports";
import { budgetAnlegen } from "./budgetAnlegen";

function memRepo(): BudgetRepository & { daten: Budget[] } {
  const daten: Budget[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) { const i = daten.findIndex((x) => x.id === b.id); if (i >= 0) daten[i] = b; else daten.push(b); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

describe("budgetAnlegen", () => {
  it("legt ein Budget an und übernimmt die Minor Units unverändert", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 35000, periode: "monatlich" });
    expect(b.rahmen).toBe(35000);
    expect(repo.daten).toHaveLength(1);
  });

  it("validiert Kategorie und Rahmen", async () => {
    const repo = memRepo();
    await expect(budgetAnlegen(repo, { kategorieId: "", rahmen: 10000, periode: "monatlich" })).rejects.toThrow("kategorie.waehlen");
    await expect(budgetAnlegen(repo, { kategorieId: "k", rahmen: 0, periode: "monatlich" })).rejects.toThrow("rahmen.groesserNull");
  });

  it("verbietet ein zweites Budget für gleiche Kategorie + Periode", async () => {
    const repo = memRepo();
    await budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 10000, periode: "monatlich" });
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 20000, periode: "monatlich" })).rejects.toThrow("budget.existiert");
    // andere Periode ist erlaubt
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 20000, periode: "jaehrlich" })).resolves.toBeTruthy();
  });

  it("erlaubt das Bearbeiten desselben Budgets (gleiche id)", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 10000, periode: "monatlich" });
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmen: 15000, periode: "monatlich" }, b.id)).resolves.toBeTruthy();
    expect(repo.daten).toHaveLength(1);
  });
});
