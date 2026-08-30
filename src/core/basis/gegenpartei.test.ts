import { describe, it, expect } from "vitest";
import { anbieterSchluessel } from "./gegenpartei";

describe("anbieterSchluessel", () => {
  it("fasst dieselbe Firma trotz Rechtsform und Schreibweise zusammen", () => {
    expect(anbieterSchluessel("Vibora GmbH")).toBe(anbieterSchluessel("vibora"));
    expect(anbieterSchluessel("Müller & Söhne KG")).toBe(anbieterSchluessel("Mueller und Soehne"));
  });

  /**
   * Die Gegenprobe ist die wichtigere: ein FALSCH zusammengefasster Vorschlag („alle
   * Petrossen") stiftet mehr Schaden als zwei getrennte, denn er nennt einen Betrag,
   * den es nie gab. Deshalb wird nicht auf die ersten Wörter gekürzt.
   */
  it("wirft verschiedene Anbieter mit gleichem Anfang NICHT zusammen", () => {
    expect(anbieterSchluessel("Petrossen Bonn")).not.toBe(anbieterSchluessel("Petrossen Bremen"));
  });
});
