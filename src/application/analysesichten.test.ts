// Das Analysefenster — und die eine Stelle, an der seine Monatsmarken nicht reichen.
//
// Alle Werte erfunden. Echt ist die Konstellation: eine Reihe von Beobachtungen, die
// mitten im laufenden Monat liegt, gegen ein Fenster, das den Monat an seinem Ersten
// benennt.

import { describe, expect, it } from "vitest";
import type { Depotwert } from "../core";
import { depotEntwicklung, type Depotsicht } from "./depot/depotsichten";
import { analyseFensterTaggenau } from "./analysesichten";

describe("analyseFensterTaggenau", () => {
  it("schiebt die Monatsmarke auf den letzten Tag desselben Monats", () => {
    expect(analyseFensterTaggenau("2026-08-01")).toBe("2026-08-31");
    expect(analyseFensterTaggenau("2026-04-01")).toBe("2026-04-30");
  });

  it("kennt den Februar im Schaltjahr", () => {
    expect(analyseFensterTaggenau("2024-02-01")).toBe("2024-02-29");
    expect(analyseFensterTaggenau("2026-02-01")).toBe("2026-02-28");
  });
});

/**
 * Der Fehler, wegen dem es die Funktion gibt: die Analyse meldete „zu wenig Punkte" für
 * ein Depot, dessen Stände vollzählig gespeichert waren. `analyseFenster` endet auf dem
 * ERSTEN des laufenden Monats, Depot-Stichtage sind Abruftage und liegen dahinter — jeder
 * Punkt fiel aus dem Fenster. Das sah aus wie verlorene Daten und war eine Grenze.
 */
describe("Depot im Analysefenster", () => {
  const reihe: Depotwert[] = [
    { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 1_000_00 },
    { depotId: "d1", stichtag: "2026-08-24", gesamtwert: 1_050_00 },
    { depotId: "d1", stichtag: "2026-08-27", gesamtwert: 1_080_00 },
  ];
  const sicht: Depotsicht = {
    depot: { id: "d1", zugangId: "z1", schluessel: "1|", bezeichnung: "Depot" },
    aktuell: reihe[2],
    reihe,
    positionen: [],
  };

  it("findet mit der Monatsmarke als Ende keinen einzigen Punkt", () => {
    const bis = "2026-08-01";
    expect(reihe.filter((w) => w.stichtag >= "2025-09-01" && w.stichtag <= bis)).toHaveLength(0);
    expect(depotEntwicklung(sicht, "2025-09-01", bis).veraenderung).toBeUndefined();
  });

  it("findet mit dem taggenauen Ende die ganze Reihe", () => {
    const bis = analyseFensterTaggenau("2026-08-01");
    expect(reihe.filter((w) => w.stichtag >= "2025-09-01" && w.stichtag <= bis)).toHaveLength(3);
    expect(depotEntwicklung(sicht, "2025-09-01", bis).veraenderung).toBe(80_00);
  });
});
