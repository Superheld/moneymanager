import { describe, it, expect } from "vitest";
import { euroZuCent, type Budget } from "../core";
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
  it("legt ein Budget an und rechnet Euro in Cent", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 350, periode: "monatlich" });
    expect(b.rahmen).toBe(euroZuCent(350));
    expect(repo.daten).toHaveLength(1);
  });

  it("validiert Kategorie und Rahmen", async () => {
    const repo = memRepo();
    await expect(budgetAnlegen(repo, { kategorieId: "", rahmenEuro: 100, periode: "monatlich" })).rejects.toThrow(/Kategorie/);
    await expect(budgetAnlegen(repo, { kategorieId: "k", rahmenEuro: 0, periode: "monatlich" })).rejects.toThrow(/größer als 0/);
  });

  it("verbietet ein zweites Budget für gleiche Kategorie + Periode", async () => {
    const repo = memRepo();
    await budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 100, periode: "monatlich" });
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 200, periode: "monatlich" })).rejects.toThrow(/schon ein Budget/);
    // andere Periode ist erlaubt
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 200, periode: "jaehrlich" })).resolves.toBeTruthy();
  });

  it("erlaubt das Bearbeiten desselben Budgets (gleiche id)", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 100, periode: "monatlich" });
    await expect(budgetAnlegen(repo, { kategorieId: "kat1", rahmenEuro: 150, periode: "monatlich" }, b.id)).resolves.toBeTruthy();
    expect(repo.daten).toHaveLength(1);
  });
});
