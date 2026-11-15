// Die Tilgung aus der Reihe der Restschulden. Alle Beträge sind erfunden.

import { describe, expect, it } from "vitest";
import { tilgungIm } from "./tilgung";
import type { Verbindlichkeitsstand } from "./vermoegen";

const stand = (stichtag: string, restschuld: number): Verbindlichkeitsstand => ({
  verbindlichkeitId: "s1",
  stichtag,
  restschuld,
});

const monate = (jahr: number) => Array.from({ length: 12 }, (_, i) => `${jahr}-${String(i + 1).padStart(2, "0")}`);

describe("tilgungIm", () => {
  // Zwei Jahresauszüge: 1.200,00 weniger über zwölf Monate.
  const zweiAuszuege = [stand("2024-12-31", 5_000_000), stand("2025-12-31", 4_880_000)];

  it("verteilt den Rückgang gleichmässig auf die Monate nach der älteren Beobachtung", () => {
    expect(monate(2025).map((m) => tilgungIm(zweiAuszuege, true, m))).toEqual(Array(12).fill(10_000));
  });

  it("legt den Rest der Teilung in den ersten Monat und summiert exakt auf den Rückgang", () => {
    const reihe = [stand("2024-12-31", 100_000), stand("2025-12-31", 90_001)];
    const werte = monate(2025).map((m) => tilgungIm(reihe, true, m) ?? 0);
    expect(werte[0]).toBe(9_999 - 833 * 11);
    expect(werte[1]).toBe(833);
    expect(werte.reduce((s, w) => s + w, 0)).toBe(9_999);
  });

  it("sagt mit weniger als zwei Beobachtungen nichts", () => {
    expect(tilgungIm([], true, "2025-06")).toBeUndefined();
    expect(tilgungIm([stand("2024-12-31", 5_000_000)], true, "2025-06")).toBeUndefined();
  });

  it("sagt vor der ersten und im Monat der ersten Beobachtung nichts", () => {
    expect(tilgungIm(zweiAuszuege, true, "2024-11")).toBeUndefined();
    expect(tilgungIm(zweiAuszuege, true, "2024-12")).toBeUndefined();
  });

  it("schreibt nach der jüngsten Beobachtung die zuletzt bekannte Monatstilgung fort", () => {
    expect(tilgungIm(zweiAuszuege, true, "2026-01")).toBe(10_000);
    expect(tilgungIm(zweiAuszuege, true, "2027-08")).toBe(10_000);
  });

  it("schreibt ohne den Rest der Teilung fort und hört auf, wenn die Restschuld aufgebraucht ist", () => {
    // 250 über drei Monate: 84 im ersten, dann 83; danach bleiben 50 übrig.
    const reihe = [stand("2025-01-31", 300), stand("2025-04-30", 50)];
    expect(tilgungIm(reihe, true, "2025-02")).toBe(84);
    expect(tilgungIm(reihe, true, "2025-05")).toBe(50);
    expect(tilgungIm(reihe, true, "2025-06")).toBe(0);
  });

  it("tilgt nichts in einem Zeitraum, in dem die Restschuld steigt", () => {
    const reihe = [stand("2023-12-31", 4_000_000), stand("2024-12-31", 4_500_000), stand("2025-12-31", 4_380_000)];
    expect(tilgungIm(reihe, true, "2024-06")).toBe(0);
    // Danach wieder gemessen: der neue Zeitraum zählt für sich.
    expect(tilgungIm(reihe, true, "2025-06")).toBe(10_000);
  });

  it("schreibt nach einer Aufstockung keine Tilgung fort", () => {
    const reihe = [stand("2024-12-31", 4_000_000), stand("2025-12-31", 4_500_000)];
    expect(tilgungIm(reihe, true, "2026-03")).toBe(0);
  });

  it("lässt eine stillgelegte Schuld nach ihrer letzten Beobachtung nichts mehr tilgen", () => {
    expect(tilgungIm(zweiAuszuege, false, "2025-12")).toBe(10_000);
    expect(tilgungIm(zweiAuszuege, false, "2026-01")).toBe(0);
  });

  it("nimmt bei zwei Beobachtungen im selben Monat die jüngere", () => {
    const reihe = [stand("2024-12-31", 5_000_000), stand("2025-12-01", 4_900_000), stand("2025-12-31", 4_880_000)];
    expect(tilgungIm(reihe, true, "2025-07")).toBe(10_000);
  });

  it("liest die Reihe nach dem Stichtag, nicht nach ihrer Reihenfolge", () => {
    expect(tilgungIm([...zweiAuszuege].reverse(), true, "2025-07")).toBe(10_000);
  });
});
