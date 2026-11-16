// Was aus einem Budget herausgerechnet ist — seit Migration 81 über die Zuständigkeit
// (`herausgerechnet`), nicht mehr über die zweite Art eines Budgets. Bis dahin trennte
// `nachArtGetrennt` die Stände in monatliche und aufbauende und las daraus, was ein Dach
// verliert; das aufbauende ist inzwischen eine Rücklage und steht in keinem Budgetbaum.

import { describe, expect, it } from "vitest";
import type { Budget, BudgetSicht, Kategorie, Ruecklage } from "../../core";
import { budgetstaende } from "./budgetsichten";

const kategorien: Kategorie[] = [
  { id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "urlaub", name: "Urlaub", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "kino", name: "Kino", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "essen", name: "Essen", defaultCharakter: "Aufwand" },
];

const budget = (id: string, kategorieId: string): Budget => ({
  id, kategorieId, kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 10000 }],
});

const ruecklage = (over: Partial<Ruecklage> & { id: string; kategorieId: string }): Ruecklage => ({
  bezeichnung: over.id, beginn: "2026-01-01", art: "fortlaufend", raten: [{ abMonat: "2026-01", betrag: 5000 }], ...over,
});

const sicht = (budgets: Budget[], ruecklagen: Ruecklage[]): BudgetSicht => ({
  buchungen: [], kategorien, budgets, vertragsBuchungen: new Set(), ruecklagen,
});

describe("budgetstaende — was eine Rücklage darunter dem Budget abnimmt", () => {
  it("nennt am Dach die Rücklage, die unter ihm hängt", () => {
    const s = budgetstaende(sicht([budget("b-freizeit", "freizeit"), budget("b-essen", "essen")], [ruecklage({ id: "Tellwick", kategorieId: "urlaub" })]), "2026-03-15");
    expect(s.find((z) => z.budget.id === "b-freizeit")?.abgezogen).toEqual(["Tellwick"]);
    expect(s.find((z) => z.budget.id === "b-essen")?.abgezogen).toBeUndefined();
  });

  it("nennt eine Rücklage erst, wenn ihr Fundfenster den Tag enthält", () => {
    const spaeter = ruecklage({ id: "Ombrast", kategorieId: "urlaub", art: "abschliessend", findetAb: "2026-06-01" });
    const ohne = ruecklage({ id: "Quelvin", kategorieId: "kino", art: "abschliessend" });
    const b = [budget("b-freizeit", "freizeit")];
    expect(budgetstaende(sicht(b, [spaeter, ohne]), "2026-03-15")[0].abgezogen).toBeUndefined();
    expect(budgetstaende(sicht(b, [spaeter, ohne]), "2026-07-15")[0].abgezogen).toEqual(["Ombrast"]);
  });

  it("nennt nichts, wenn das Budget am selben Knoten hängt — dort gewinnt es", () => {
    const s = budgetstaende(sicht([budget("b-urlaub", "urlaub")], [ruecklage({ id: "Tellwick", kategorieId: "urlaub" })]), "2026-03-15");
    expect(s[0].abgezogen).toBeUndefined();
  });

  it("bindet die Rücklage an das NÄCHSTE Budget darüber", () => {
    const s = budgetstaende(
      sicht([budget("b-freizeit", "freizeit"), budget("b-kino", "kino")], [ruecklage({ id: "Tellwick", kategorieId: "urlaub" })]),
      "2026-03-15",
    );
    expect(s.find((z) => z.budget.id === "b-freizeit")?.abgezogen).toEqual(["Tellwick"]);
    expect(s.find((z) => z.budget.id === "b-kino")?.abgezogen).toBeUndefined();
  });
});
