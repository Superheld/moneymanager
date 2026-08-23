import { describe, it, expect } from "vitest";
import type { Budget } from "../../core";
import type { BudgetRepository } from "../ports";
import { budgetAnlegen, type BudgetEingabe } from "./budgetAnlegen";

function memRepo(): BudgetRepository & { daten: Budget[] } {
  const daten: Budget[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) { const i = daten.findIndex((x) => x.id === b.id); if (i >= 0) daten[i] = b; else daten.push(b); },
    async betragSpeichern(budgetId, betrag) {
      const b = daten.find((x) => x.id === budgetId);
      if (!b) return;
      const reihe = [...b.betraege.filter((v) => v.abMonat !== betrag.abMonat), betrag]
        .sort((x, y) => x.abMonat.localeCompare(y.abMonat));
      daten[daten.indexOf(b)] = { ...b, betraege: reihe };
    },
    async betragLoeschen(budgetId, abMonat) {
      const b = daten.find((x) => x.id === budgetId);
      if (!b) return;
      daten[daten.indexOf(b)] = { ...b, betraege: b.betraege.filter((v) => v.abMonat !== abMonat) };
    },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

function eingabe(over: Partial<BudgetEingabe> = {}): BudgetEingabe {
  return {
    kategorieId: "kat1", kontoId: "giro", betragProMonat: 35000,
    art: "monatlich", start: "2026-08-19", abMonat: "2026-08", ...over,
  };
}

describe("budgetAnlegen", () => {
  it("legt ein Budget an und übernimmt die Minor Units unverändert", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, eingabe());
    // Ein Betrag, EINE Version — ab dem Monat, den die Eingabe ansagt.
    expect(b.betraege).toEqual([{ abMonat: "2026-08", betrag: 35000 }]);
    expect(b.art).toBe("monatlich");
    expect(repo.daten).toHaveLength(1);
  });

  it("verlegt den Start auf den Monatsersten", async () => {
    // Mitten im Monat anzufangen hiesse, den ersten Monat anteilig zu rechnen — dafür
    // gibt es keinen Grund, und es wäre die einzige Stelle mit Bruchteilen einer Rate.
    const repo = memRepo();
    const b = await budgetAnlegen(repo, eingabe({ art: "aufbauend", start: "2026-08-19" }));
    expect(b.start).toBe("2026-08-01");
  });

  it("validiert Kategorie, Konto, Betrag und Startdatum", async () => {
    const repo = memRepo();
    await expect(budgetAnlegen(repo, eingabe({ kategorieId: "" }))).rejects.toThrow("kategorie.waehlen");
    await expect(budgetAnlegen(repo, eingabe({ kontoId: "" }))).rejects.toThrow("konto.waehlen");
    await expect(budgetAnlegen(repo, eingabe({ betragProMonat: 0 }))).rejects.toThrow("rahmen.groesserNull");
    await expect(budgetAnlegen(repo, eingabe({ start: "August" }))).rejects.toThrow("startdatum.ungueltig");
  });

  it("verbietet ein zweites Budget für dieselbe Kategorie — auch mit anderer Art", async () => {
    // Zwei Budgets auf derselben Kategorie zögen dieselben Buchungen: eine
    // Doppelzählung, keine Verfeinerung. Feiner geht über eine Unterkategorie.
    const repo = memRepo();
    await budgetAnlegen(repo, eingabe());
    await expect(budgetAnlegen(repo, eingabe({ betragProMonat: 20000 }))).rejects.toThrow("budget.existiert");
    await expect(budgetAnlegen(repo, eingabe({ art: "aufbauend" }))).rejects.toThrow("budget.existiert");
  });

  it("erlaubt das Bearbeiten desselben Budgets (gleiche id) samt Artwechsel", async () => {
    const repo = memRepo();
    const b = await budgetAnlegen(repo, eingabe());
    const geaendert = await budgetAnlegen(repo, eingabe({ betragProMonat: 15000, art: "aufbauend" }), b.id);
    expect(geaendert.art).toBe("aufbauend");
    expect(repo.daten).toHaveLength(1);
  });
});
