// Das Analysefenster — und die eine Stelle, an der seine Monatsmarken nicht reichen.
//
// Alle Werte erfunden. Echt ist die Konstellation: eine Reihe von Beobachtungen, die
// mitten im laufenden Monat liegt, gegen ein Fenster, das den Monat an seinem Ersten
// benennt.

import { describe, expect, it } from "vitest";
import type { Depotwert } from "../core";
import { depotEntwicklung, type Depotsicht } from "./depot/depotsichten";
import { analyseAusblick, analyseFensterTaggenau, type Analysebasis } from "./analysesichten";

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


/**
 * Der Verlauf über die Gegenwart hinaus. Alle Werte erfunden; echt ist die Frage, die
 * daran hängt — was von einem geplanten Monat überhaupt auf den Kontostand wirkt.
 */
describe("analyseAusblick", () => {
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [
      {
        id: "b1", datum: "2026-07-10", betrag: -20000, kontoId: "k1",
        charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
      },
    ],
    konten: [
      { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 },
    ],
    kategorien: [{ id: "kat1", name: "Wohnen", defaultCharakter: "Aufwand" }],
    kontoNamen: new Map([["k1", "Giro"]]),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [],
    vertraege: [],
    regeln: [],
    ...extra,
  });

  it("liefert gewesene und geplante Monate in einer Reihe und markiert die Naht", () => {
    const punkte = analyseAusblick(basis(), "2026-08-15", 3, 3);
    expect(punkte.map((p) => p.monat)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
    // Der LAUFENDE Monat gehört zum Isten — er ist zur Hälfte gebucht.
    expect(punkte.filter((p) => p.plan).map((p) => p.monat)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("schreibt den Saldo an der Naht ohne Sprung fort", () => {
    const regeln = [
      {
        id: "r1", bezeichnung: "Miete", betrag: -100000, rhythmus: "monatlich" as const,
        startdatum: "2026-01-01", charakter: "Aufwand" as const, kontoId: "k1", kategorieId: "kat1",
      },
    ];
    const punkte = analyseAusblick(basis({ regeln }), "2026-08-15", 2, 2);
    const gewesen = punkte.filter((p) => !p.plan);
    const letzterIst = gewesen[gewesen.length - 1];
    const ersterPlan = punkte.find((p) => p.plan)!;
    expect(ersterPlan.saldo).toBe(letzterIst.saldo + ersterPlan.netto);
    expect(ersterPlan.netto).toBe(-100000);
  });

  // Die Entscheidung, die `planWirkung` trägt, hier im Zusammenspiel: eine Umschichtung
  // wechselt nur das Konto und darf den vorhergesagten Stand nicht senken.
  it("laesst eine geplante Umschichtung den Saldo unberuehrt", () => {
    const regeln = [
      {
        id: "r2", bezeichnung: "Sparen", betrag: -50000, rhythmus: "monatlich" as const,
        startdatum: "2026-01-01", charakter: "Umschichtung" as const, kontoId: "k1",
      },
    ];
    const punkte = analyseAusblick(basis({ regeln }), "2026-08-15", 2, 2);
    expect(punkte.filter((p) => p.plan).every((p) => p.netto === 0)).toBe(true);
  });
});
