// Die Trennung nach Art — je Zeile, seit 2026-11-09 (vorher nach dem Dach eines Baums).

import { describe, expect, it } from "vitest";
import type { Budgetart } from "../../core";
import { nachArtGetrennt, type Budgetstand } from "./budgetsichten";

const stand = (id: string, art: Budgetart, tiefe: number): Budgetstand =>
  ({ budget: { id, art }, kategorieName: id, tiefe }) as unknown as Budgetstand;

describe("nachArtGetrennt", () => {
  const g = nachArtGetrennt([
    stand("freizeit", "monatlich", 0),
    stand("urlaub", "aufbauend", 1), // aufbauend, aber unter einem monatlichen Dach
    stand("kino", "monatlich", 1),
    stand("werkstatt", "aufbauend", 0),
    stand("reifen", "monatlich", 1),
    stand("winter", "aufbauend", 2), // aufbauend unter monatlich unter aufbauend
    stand("essen", "monatlich", 0),
  ]);

  it("trennt nach der Art jedes Budgets, nicht nach seinem Dach", () => {
    expect(g.monatlich.map((z) => z.budget.id)).toEqual(["freizeit", "kino", "reifen", "essen"]);
    expect(g.aufbauend.map((z) => z.budget.id)).toEqual(["urlaub", "werkstatt", "winter"]);
  });

  it("nennt das Budget der anderen Art, unter dem eines hängt", () => {
    const unter = (l: typeof g.monatlich, id: string) => l.find((z) => z.budget.id === id)!.unter;
    expect(unter(g.aufbauend, "urlaub")).toBe("freizeit");
    expect(unter(g.monatlich, "reifen")).toBe("werkstatt");
    expect(unter(g.aufbauend, "winter")).toBe("reifen");
    expect(unter(g.monatlich, "kino")).toBeUndefined();
  });

  it("zählt die Tiefe nur über Vorfahren derselben Art", () => {
    const tiefe = (l: typeof g.monatlich) => l.map((z) => z.tiefe);
    expect(tiefe(g.monatlich)).toEqual([0, 1, 0, 0]);
    // „winter" hängt unter „werkstatt" (aufbauend) — eine Stufe, nicht zwei.
    expect(tiefe(g.aufbauend)).toEqual([0, 0, 1]);
  });
});
