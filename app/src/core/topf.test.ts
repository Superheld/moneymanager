import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import {
  ansparrate,
  sollstand,
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
