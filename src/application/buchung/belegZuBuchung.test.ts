import { describe, it, expect } from "vitest";
import { belegZuBuchung } from "./belegZuBuchung";
import type { Umsatz } from "../import/umsatz";

function umsatz(over: Partial<Umsatz> = {}): Umsatz {
  return {
    id: "u1", laufId: "l1", buchungstag: "2026-07-10", betrag: -1200, waehrung: "EUR",
    gegenpartei: "Vibora Handel", verwendungszweck: "Einkauf", rohHash: "h1",
    status: "verbucht", ...over,
  } as Umsatz;
}

describe("belegZuBuchung", () => {
  it("ordnet jeder Buchung ihren Beleg zu", () => {
    const m = belegZuBuchung([umsatz({ id: "u1", istbuchungId: "b1" })]);
    expect(m.get("b1")?.id).toBe("u1");
  });

  it("übergeht Umsätze ohne Buchung", () => {
    expect(belegZuBuchung([umsatz({ id: "u1", istbuchungId: undefined })]).size).toBe(0);
  });

  /**
   * Der Kern dieser Funktion: bis 2026-08-29 stand die Schleife an vier Stellen, zwei
   * davon mit „der letzte gewinnt". Zeigten zwei Belege auf dieselbe Buchung, nannte die
   * Analyse einen anderen Empfänger als der Kontoauszug — ein Widerspruch, der unsichtbar
   * bleibt, solange beide Belege dasselbe sagen.
   */
  it("lässt bei mehreren Belegen zu einer Buchung den ERSTEN gewinnen", () => {
    const m = belegZuBuchung([
      umsatz({ id: "u1", istbuchungId: "b1", gegenpartei: "Zuerst" }),
      umsatz({ id: "u2", istbuchungId: "b1", gegenpartei: "Danach" }),
    ]);
    expect(m.get("b1")?.gegenpartei).toBe("Zuerst");
  });
});
