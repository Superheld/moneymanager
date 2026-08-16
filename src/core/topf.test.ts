import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import {
  ansparrate,
  entnahmeCharakter,
  sollstand,
  topfStand,
  zielwert,
  type Puffertopf,
  type Spartopf,
} from "./topf";

const puffer: Puffertopf = {
  id: "p",
  typ: "puffer",
  bezeichnung: "Autoreparatur",
  start: "2026-01-01",
  schaetzbetrag: euroZuCent(1200),
  fristMonate: 12,
};

const spartopfMitZiel: Spartopf = {
  id: "s1",
  typ: "spartopf",
  bezeichnung: "Reise",
  start: "2026-01-01",
  zufuehrungProMonat: euroZuCent(50),
  sparziel: euroZuCent(500),
};

const spartopfOhneZiel: Spartopf = {
  id: "s2",
  typ: "spartopf",
  bezeichnung: "Klamotten",
  start: "2026-01-01",
  zufuehrungProMonat: euroZuCent(50),
};

describe("ansparrate", () => {
  it("Puffer: Schätzbetrag ÷ Frist", () => {
    expect(ansparrate(puffer)).toBe(euroZuCent(100)); // 1200 / 12
  });
  it("Spartopf: explizite Zuführung", () => {
    expect(ansparrate(spartopfOhneZiel)).toBe(euroZuCent(50));
  });
});

describe("zielwert", () => {
  it("Spartopf ohne Sparziel hat keinen Zielwert", () => {
    expect(zielwert(spartopfOhneZiel)).toBeNull();
    expect(zielwert(spartopfMitZiel)).toBe(euroZuCent(500));
  });
});

describe("sollstand", () => {
  it("Puffer erreicht den Schätzbetrag zur Frist", () => {
    expect(sollstand(puffer, "2026-07-01")).toBe(euroZuCent(600)); // 6 * 100
    expect(sollstand(puffer, "2027-01-01")).toBe(euroZuCent(1200)); // gedeckelt
  });
  it("vor dem Start ist der Sollstand 0", () => {
    expect(sollstand(puffer, "2025-01-01")).toBe(0);
  });
  it("Spartopf: Sollstand nur mit Sparziel, sonst null", () => {
    expect(sollstand(spartopfMitZiel, "2027-01-01")).toBe(euroZuCent(500)); // min(600,500)
    expect(sollstand(spartopfOhneZiel, "2027-01-01")).toBeNull();
  });
});

// Entnahme-Buchung dieses Topfes (Beträge negativ = Abfluss vom Konto).
function entnahme(topfId: string, betrag: number, datum: string): IstBuchung {
  return {
    id: `b-${datum}-${betrag}`,
    datum,
    betrag: euroZuCent(-Math.abs(betrag)),
    kontoId: "giro",
    charakter: "Umschichtung",
    quelle: "manuell",
    verwendung: { art: "topf", topfId },
  };
}

describe("entnahmeCharakter (ADR-0003 §5)", () => {
  it("Puffer: gedeckte Entnahme ist Umschichtung", () => {
    expect(entnahmeCharakter("puffer")).toBe("Umschichtung");
  });
  it("Spartopf: Entnahme ist Aufwand (Konsum)", () => {
    expect(entnahmeCharakter("spartopf")).toBe("Aufwand");
  });
});

describe("topfStand", () => {
  it("ohne Entnahmen = kalkulatorischer Aufbau (= Sollstand bei vorhandenem Ziel)", () => {
    expect(topfStand(puffer, "2026-07-01", [])).toBe(euroZuCent(600)); // 6 * 100
  });
  it("Entnahme senkt den Stand", () => {
    const e = [entnahme(puffer.id, 250, "2026-05-01")];
    expect(topfStand(puffer, "2026-07-01", e)).toBe(euroZuCent(350)); // 600 − 250
  });
  it("Spartopf ohne Sparziel: ungedeckelter Aufbau minus Entnahmen", () => {
    const e = [entnahme(spartopfOhneZiel.id, 30, "2026-03-01")];
    // 12 Monate * 50 = 600 (ungedeckelt), − 30
    expect(topfStand(spartopfOhneZiel, "2027-01-01", e)).toBe(euroZuCent(570));
  });
  it("Überziehung: mehr entnommen als angespart → negativ", () => {
    const e = [entnahme(puffer.id, 800, "2026-04-01")];
    expect(topfStand(puffer, "2026-05-01", e)).toBe(euroZuCent(-400)); // 400 − 800
  });
});
