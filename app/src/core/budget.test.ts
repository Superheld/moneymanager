import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import { budgetVerbrauch, geglaetteterMonatsabfluss, periodeFenster, type Budget } from "./budget";
import type { IstBuchung } from "./istbuchung";

function budget(over: Partial<Budget> = {}): Budget {
  return { id: "b", kategorieId: "k", rahmen: euroZuCent(400), periode: "monatlich", ...over };
}

describe("geglaetteterMonatsabfluss", () => {
  it("monatlich: Rahmen = Monatsabfluss (negativ)", () => {
    expect(geglaetteterMonatsabfluss(budget())).toBe(euroZuCent(-400));
  });

  it("jährlich: Rahmen wird linear auf 12 Monate geglättet", () => {
    expect(geglaetteterMonatsabfluss(budget({ rahmen: euroZuCent(4800), periode: "jaehrlich" }))).toBe(
      euroZuCent(-400),
    );
  });
});

describe("periodeFenster", () => {
  it("monatlich: der Kalendermonat", () => {
    expect(periodeFenster("monatlich", "2026-06-14")).toEqual({ von: "2026-06-01", bis: "2026-07-01" });
  });
  it("monatlich: Jahreswechsel im Dezember", () => {
    expect(periodeFenster("monatlich", "2026-12-20")).toEqual({ von: "2026-12-01", bis: "2027-01-01" });
  });
  it("jährlich: das Kalenderjahr", () => {
    expect(periodeFenster("jaehrlich", "2026-06-14")).toEqual({ von: "2026-01-01", bis: "2027-01-01" });
  });
});

describe("budgetVerbrauch", () => {
  function b(over: Partial<IstBuchung>): IstBuchung {
    return { id: "x", datum: "2026-06-10", betrag: euroZuCent(-50), kontoId: "g", kategorieId: "k", charakter: "Aufwand", quelle: "manuell", ...over };
  }
  const { von, bis } = periodeFenster("monatlich", "2026-06-14");

  it("summiert Aufwands-Abflüsse der Kategorie im Fenster (als positiver Betrag)", () => {
    const ist = [b({ id: "1", betrag: euroZuCent(-50) }), b({ id: "2", betrag: euroZuCent(-30) })];
    expect(budgetVerbrauch(ist, "k", von, bis)).toBe(euroZuCent(80));
  });
  it("ignoriert andere Kategorien, andere Perioden und Nicht-Aufwand", () => {
    const ist = [
      b({ id: "1", kategorieId: "andere" }),
      b({ id: "2", datum: "2026-05-31" }), // vor dem Fenster
      b({ id: "3", datum: "2026-07-01" }), // bis ist exklusiv
      b({ id: "4", charakter: "Umschichtung" }), // gedeckte Topf-Entnahme zählt nicht
      b({ id: "5", charakter: "Ertrag" }),
    ];
    expect(budgetVerbrauch(ist, "k", von, bis)).toBe(0);
  });
});
