import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import { geglaetteterMonatsabfluss, type Budget } from "./budget";

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
