// Die Trennung nach Art — nach dem DACH eines Baums, nicht je Zeile.

import { describe, expect, it } from "vitest";
import type { Budgetart } from "../../core";
import { nachArtGetrennt, type Budgetstand } from "./budgetsichten";

const stand = (id: string, art: Budgetart, tiefe: number): Budgetstand =>
  ({ budget: { id, art }, tiefe }) as unknown as Budgetstand;

describe("nachArtGetrennt", () => {
  it("trennt nach der Art des obersten Budgets und lässt Kinder bei ihrem Dach", () => {
    const g = nachArtGetrennt([
      stand("freizeit", "monatlich", 0),
      stand("urlaub", "aufbauend", 1), // aufbauend, aber unter einem monatlichen Dach
      stand("werkstatt", "aufbauend", 0),
      stand("reifen", "monatlich", 1),
      stand("essen", "monatlich", 0),
    ]);
    expect(g.monatlich.map((z) => z.budget.id)).toEqual(["freizeit", "urlaub", "essen"]);
    expect(g.aufbauend.map((z) => z.budget.id)).toEqual(["werkstatt", "reifen"]);
  });
});
