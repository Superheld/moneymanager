import { describe, expect, it } from "vitest";
import { formatplan } from "./formatwahl";

describe("formatplan", () => {
  it("beginnt ohne alles mit CAMT und lässt den zweiten Versuch zu", () => {
    expect(formatplan()).toEqual({ zuerstCamt: true, nurEines: false });
  });

  /**
   * Das Gedächtnis dreht nur die Reihenfolge. Es spart die absehbar vergebliche erste
   * Runde — und weil der zweite Versuch bleibt, kommt ein Institut, das CAMT nachrüstet,
   * von selbst wieder darauf.
   */
  it("dreht die Reihenfolge, wenn zuletzt MT940 getragen hat", () => {
    expect(formatplan({ zuletzt: "MT940" })).toEqual({ zuerstCamt: false, nurEines: false });
  });

  it("lässt CAMT im Gedächtnis die Reihenfolge, wie sie ist", () => {
    expect(formatplan({ zuletzt: "CAMT" })).toEqual({ zuerstCamt: true, nurEines: false });
  });

  /**
   * Der eigentliche Zweck der Wahl: den anderen Weg AUSSCHLIESSEN. Ohne das läuft der
   * zweite Versuch nie, sobald der erste irgendetwas liefert — auch eine von der Bank
   * gedeckelte Teilmenge zählt als Erfolg.
   */
  it("schliesst bei einer Festlegung den anderen Weg aus", () => {
    expect(formatplan({ wahl: "MT940" })).toEqual({ zuerstCamt: false, nurEines: true });
    expect(formatplan({ wahl: "CAMT" })).toEqual({ zuerstCamt: true, nurEines: true });
  });

  it("lässt die Festlegung gegen das Gedächtnis gewinnen", () => {
    expect(formatplan({ wahl: "MT940", zuletzt: "CAMT" })).toEqual({ zuerstCamt: false, nurEines: true });
  });

  it("behandelt „automatisch“ wie keine Wahl", () => {
    expect(formatplan({ wahl: "automatisch", zuletzt: "MT940" })).toEqual({
      zuerstCamt: false,
      nurEines: false,
    });
  });
});
