// Suche in der Bankenliste. Alle Einträge hier sind ERFUNDEN — die echte Liste ist
// gitignoriert und darf in keinem Test auftauchen.

import { describe, expect, it } from "vitest";
import { bankenSuchen, type Bankeintrag } from "./bankenliste";

const b = (blz: string, name: string, ort: string): Bankeintrag => ({
  blz,
  name,
  ort,
  url: `https://fints.${name.toLowerCase().replace(/\W/g, "")}.example/fints`,
  version: "FinTS V3.0",
});

const LISTE = [
  b("10000001", "Beispielbank", "Berlin"),
  b("20000002", "Kreissparkasse Beispiel", "Bremen"),
  b("20000003", "Sparkasse Musterstadt", "Musterstadt"),
  b("20000004", "Musterdirekt", "Musterhausen"),
];

describe("bankenSuchen", () => {
  it("liefert nichts bei leerer Eingabe", () => {
    expect(bankenSuchen(LISTE, "   ")).toEqual([]);
  });

  it("liest reine Ziffern als BLZ-Präfix", () => {
    expect(bankenSuchen(LISTE, "2000").map((x) => x.blz)).toEqual(["20000002", "20000003"]);
  });

  it("zerlegt eine IBAN selbst — die BLZ steht an Stelle 5 bis 12", () => {
    // Wer die IBAN zur Hand hat, soll sie nicht erst auseinandernehmen müssen.
    expect(bankenSuchen(LISTE, "DE15 2000 0004 9876 5432 10").map((x) => x.name)).toEqual(["Musterdirekt"]);
  });

  it("sucht sonst über Institut und Ort", () => {
    expect(bankenSuchen(LISTE, "bremen").map((x) => x.blz)).toEqual(["20000002"]);
  });

  it("stellt Treffer am Namensanfang nach vorn", () => {
    // Sonst stünde „Kreissparkasse Beispiel" vor „Sparkasse Musterstadt", nur weil es
    // in der Liste weiter oben steht.
    expect(bankenSuchen(LISTE, "sparkasse").map((x) => x.name)).toEqual([
      "Sparkasse Musterstadt",
      "Kreissparkasse Beispiel",
    ]);
  });

  it("begrenzt die Trefferzahl", () => {
    expect(bankenSuchen(LISTE, "e", 2)).toHaveLength(2);
  });
});
