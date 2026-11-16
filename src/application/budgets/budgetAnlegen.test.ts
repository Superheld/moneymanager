import { describe, it, expect } from "vitest";
import type { Budget } from "../../core";
import type { BudgetRepository, RuecklagenRepository } from "../ports";
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
    start: "2026-08-19", abMonat: "2026-08", ...over,
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
    const b = await budgetAnlegen(repo, eingabe({ start: "2026-08-19" }));
    expect(b.start).toBe("2026-08-01");
  });

  it("validiert Kategorie, Konto, Betrag und Startdatum", async () => {
    const repo = memRepo();
    await expect(budgetAnlegen(repo, eingabe({ kategorieId: "" }))).rejects.toThrow("kategorie.waehlen");
    await expect(budgetAnlegen(repo, eingabe({ kontoId: "" }))).rejects.toThrow("konto.waehlen");
    await expect(budgetAnlegen(repo, eingabe({ betragProMonat: 0 }))).rejects.toThrow("rahmen.groesserNull");
    await expect(budgetAnlegen(repo, eingabe({ start: "August" }))).rejects.toThrow("startdatum.ungueltig");
  });

  it("verbietet ein zweites Budget für dieselbe Kategorie", async () => {
    // Zwei Budgets auf derselben Kategorie zögen dieselben Buchungen: eine
    // Doppelzählung, keine Verfeinerung. Feiner geht über eine Unterkategorie.
    const repo = memRepo();
    await budgetAnlegen(repo, eingabe());
    await expect(budgetAnlegen(repo, eingabe({ betragProMonat: 20000 }))).rejects.toThrow("budget.existiert");
  });

  it("erlaubt das Bearbeiten desselben Budgets (gleiche id) — es bleibt monatlich", async () => {
    // Seit Migration 81 gibt es keine andere Art; was sich ansammeln soll, ist eine Rücklage.
    const repo = memRepo();
    const b = await budgetAnlegen(repo, eingabe());
    const geaendert = await budgetAnlegen(repo, eingabe({ betragProMonat: 15000 }), b.id);
    expect(geaendert.art).toBe("monatlich");
    expect(repo.daten).toHaveLength(1);
  });
});

/**
 * Die Gegenrichtung von `ruecklage.kategorieHatBudget` (Paket 5, ADR-0006): ein NEUES
 * monatliches Budget nicht an eine Kategorie, an der eine Rücklage hängt — dort gewönne das
 * Budget, und die Rücklage fände still nichts mehr. Ein Altfall bleibt stehen.
 */
describe("budgetAnlegen neben einer Rücklage", () => {
  const ruecklagen = { alle: async () => [{ id: "r-1", bezeichnung: "Tavroki", beginn: "2026-01-01", kategorieId: "kat1" }] } as unknown as RuecklagenRepository;

  it("weist ein neues Budget an der Kategorie einer Rücklage ab und verweist auf eine Unterkategorie", async () => {
    const repo = memRepo();
    await expect(budgetAnlegen(repo, eingabe(), undefined, ruecklagen)).rejects.toThrow("budget.kategorieHatRuecklage");
    expect(repo.daten).toHaveLength(0);
    // Eine andere Kategorie geht.
    await budgetAnlegen(repo, eingabe({ kategorieId: "kat2" }), undefined, ruecklagen);
    expect(repo.daten).toHaveLength(1);
  });

  it("lässt einen Altfall stehen: dasselbe Budget lässt sich weiter bearbeiten", async () => {
    const repo = memRepo();
    const alt = await budgetAnlegen(repo, eingabe());
    const geaendert = await budgetAnlegen(repo, eingabe({ betragProMonat: 12000 }), alt.id, ruecklagen);
    expect(geaendert.kategorieId).toBe("kat1");
    // Wechselt es aber die Kategorie AUF die einer Rücklage, ist das eine neue Wahl.
    const anderes = await budgetAnlegen(repo, eingabe({ kategorieId: "kat3" }));
    await expect(budgetAnlegen(repo, eingabe({ kategorieId: "kat1" }), anderes.id, ruecklagen)).rejects.toThrow();
  });
});
