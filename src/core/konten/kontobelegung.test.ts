// Die Kontobelegung — die eine Rechnung, gegen die jede Anzeige „gebunden / frei" liest.

import { describe, expect, it } from "vitest";
import { kontobelegung, type Anspruch } from "./kontobelegung";

const anspruch = (id: string, kontoId: string, betrag: number, art: Anspruch["art"] = "ruecklage"): Anspruch => ({
  art,
  id,
  kontoId,
  betrag,
});

describe("kontobelegung", () => {
  it("zieht alle Ansprüche vom Stand ab, gleich welcher Art", () => {
    const b = kontobelegung(new Map([["k1", 5000]]), [
      anspruch("r1", "k1", 1200),
      anspruch("b1", "k1", 650, "budget"),
    ]).get("k1")!;
    expect(b.gebunden).toBe(1850);
    expect(b.frei).toBe(3150);
    expect(b.posten.map((p) => p.gedeckt)).toEqual([1200, 650]);
  });

  it("verteilt eine Unterdeckung anteilig über alle Ansprüche", () => {
    const b = kontobelegung(new Map([["k1", 600]]), [
      anspruch("r1", "k1", 800),
      anspruch("b1", "k1", 200, "budget"),
    ]).get("k1")!;
    expect(b.anteil).toBeCloseTo(0.6);
    expect(b.posten.map((p) => p.gedeckt)).toEqual([480, 120]);
    // Negativ heisst: so viel fehlt, um alles zu decken.
    expect(b.frei).toBe(-400);
  });

  it("deckt bei einem Konto im Minus nichts, statt negativ zu decken", () => {
    const b = kontobelegung(new Map([["k1", -50]]), [anspruch("r1", "k1", 100)]).get("k1")!;
    expect(b.posten[0].gedeckt).toBe(0);
    expect(b.anteil).toBe(0);
  });

  it("führt auch Konten ohne Anspruch, mit allem frei", () => {
    const b = kontobelegung(new Map([["k1", 300]]), []).get("k1")!;
    expect(b).toMatchObject({ gebunden: 0, frei: 300, anteil: 1, posten: [] });
  });

  it("lässt einen Anspruch von 0 oder darunter aus", () => {
    const b = kontobelegung(new Map([["k1", 300]]), [anspruch("b1", "k1", -20, "budget")]).get("k1")!;
    expect(b.posten).toEqual([]);
  });

  it("rechnet einen Anspruch auf ein unbekanntes Konto gegen 0 — ungedeckt, nicht verschwunden", () => {
    const b = kontobelegung(new Map(), [anspruch("r1", "weg", 100)]).get("weg")!;
    expect(b).toMatchObject({ stand: 0, gebunden: 100, frei: -100 });
    expect(b.posten[0].gedeckt).toBe(0);
  });
});
