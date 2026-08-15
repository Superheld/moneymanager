import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import type { IstBuchung } from "./istbuchung";
import {
  ansparrate,
  entnahmeCharakter,
  sollstand,
  topfStand,
  zielwert,
  type Ersatztopf,
  type Puffertopf,
  type Spartopf,
} from "./topf";

const ersatz: Ersatztopf = {
  id: "e",
  typ: "ersatz",
  bezeichnung: "Waschmaschine",
  start: "2026-01-01",
  wiederbeschaffung: euroZuCent(600),
  nutzungsdauerMonate: 60,
};

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
  it("Ersatz: Wiederbeschaffung ÷ Nutzungsdauer", () => {
    expect(ansparrate(ersatz)).toBe(euroZuCent(10)); // 600 / 60
  });
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
  it("Ersatz wächst linear und wird auf den Zielwert gedeckelt", () => {
    expect(sollstand(ersatz, "2027-01-01")).toBe(euroZuCent(120)); // 12 * 10
    expect(sollstand(ersatz, "2200-01-01")).toBe(euroZuCent(600)); // gedeckelt
  });
  it("Puffer erreicht den Schätzbetrag zur Frist", () => {
    expect(sollstand(puffer, "2026-07-01")).toBe(euroZuCent(600)); // 6 * 100
    expect(sollstand(puffer, "2027-01-01")).toBe(euroZuCent(1200)); // gedeckelt
  });
  it("vor dem Start ist der Sollstand 0", () => {
    expect(sollstand(ersatz, "2025-01-01")).toBe(0);
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
  it("Ersatz/Puffer: gedeckte Entnahme ist Umschichtung", () => {
    expect(entnahmeCharakter("ersatz")).toBe("Umschichtung");
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
  it("Ersatz: nur Entnahmen NACH dem Zyklus-Start zählen", () => {
    // Zyklus neu gestartet am 2027-01-01; die auslösende Entnahme liegt auf dem Start
    // (alter Zyklus) und darf den neuen Aufbau nicht mindern.
    const neuerZyklus: Ersatztopf = { ...ersatz, start: "2027-01-01" };
    const e = [
      entnahme(ersatz.id, 600, "2027-01-01"), // == start → ignoriert (alter Zyklus)
      entnahme(ersatz.id, 20, "2027-03-01"), // > start → zählt
    ];
    // Aufbau ab 2027-01-01 bis 2027-04-01: 3 * 10 = 30, − 20 = 10
    expect(topfStand(neuerZyklus, "2027-04-01", e)).toBe(euroZuCent(10));
  });
});
