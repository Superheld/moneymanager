/** @vitest-environment jsdom */
// Die Linie hinter den Balken hat je nach Art eine andere Form — und genau das ist ihre
// Aussage. Monatlich eine Grenze (Stufe über die ganze Breite eines Monats), aufbauend
// ein Stand (Linie durch die Monatsmitten, mit Punkten). Monate ohne Rahmen unterbrechen
// sie: dort gab es keinen Rahmen, und eine durchgezogene Linie behauptete einen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { waitFor } from "@testing-library/react";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import type { Budgetmonat } from "../../../application";
import { BudgetVerlaufChart } from "./BudgetVerlaufChart";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const monat = (i: number, verfuegbar: number, verbraucht: number, ohnePlan?: true): Budgetmonat => ({
  monat: `2026-0${i + 1}`, von: "", bis: "", uebertrag: 0, zufuehrung: 10000,
  verfuegbar, verbraucht, rest: verfuegbar - verbraucht, ...(ohnePlan ? { ohnePlan } : {}),
}) as Budgetmonat;

/** Die Linie — erst, wenn sie da ist. Ein leerer Pfad bestünde sonst jede Prüfung. */
async function linie(container: HTMLElement): Promise<string> {
  let d = "";
  await waitFor(() => {
    d = container.querySelector("svg path[d]")?.getAttribute("d") ?? "";
    expect(d).toMatch(/^M/);
  });
  return d;
}

describe("BudgetVerlaufChart — die Linie hinter den Balken", () => {
  const monate = [monat(0, 0, 5000, true), monat(1, 10000, 4000), monat(2, 10000, 12000), monat(3, 10000, 3000)];

  it("zeichnet beim monatlichen Budget eine Grenze, keinen Stand", async () => {
    const { container } = rendere(<BudgetVerlaufChart monate={monate} art="monatlich" />);
    const d = await linie(container);
    // Drei Monate mit Rahmen, je ein waagerechtes Stück: ein Anfang, fünf Linienzüge
    // (je Monat einer, dazwischen die senkrechten Verbindungen).
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(5);
    expect(container.querySelectorAll("svg circle")).toHaveLength(0);
    expect(container.textContent).toMatch(/Rahmen/);
  });

  it("zeichnet beim aufbauenden Budget den Stand als Linie mit Punkten", async () => {
    const { container } = rendere(<BudgetVerlaufChart monate={monate} art="aufbauend" />);
    const d = await linie(container);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
    // Ein Punkt je Monat mit Rahmen — der Monat davor hat keinen.
    expect(container.querySelectorAll("svg circle")).toHaveLength(3);
    expect(container.textContent).toMatch(/Stand/);
  });

  it("unterbricht die Linie an einem Monat ohne Rahmen", async () => {
    const mitLuecke = [monat(0, 10000, 1000), monat(1, 0, 2000, true), monat(2, 10000, 3000)];
    const { container } = rendere(<BudgetVerlaufChart monate={mitLuecke} art="aufbauend" />);
    const d = await linie(container);
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
