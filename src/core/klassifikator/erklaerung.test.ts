import { describe, expect, it } from "vitest";
import { erklaeren } from "./erklaerung";
import { klassifizieren, trainieren, type Beispiel } from "./modell";

/**
 * Zwei Kategorien, die sich ein Wort teilen. `vwz:karte` steht in beiden, in „gruen"
 * aber häufiger — das ist der Fall, den die alte Begründung nicht auseinanderhielt.
 */
function daten(): Beispiel[] {
  const b: Beispiel[] = [];
  for (let i = 0; i < 15; i++) {
    b.push({ merkmale: ["emp=ohlert", "vwz:karte"], kategorieId: "gruen" });
    b.push({ merkmale: ["emp=vibora"], kategorieId: "blau" });
  }
  for (let i = 0; i < 5; i++) b.push({ merkmale: ["emp=vibora", "vwz:karte"], kategorieId: "blau" });
  for (let i = 0; i < 4; i++) b.push({ merkmale: ["emp=kesselmann"], kategorieId: "rot" });
  return b;
}

describe("erklaeren", () => {
  const modell = trainieren(daten());

  it("wählt dieselbe Kategorie wie klassifizieren", () => {
    for (const m of [["emp=ohlert"], ["emp=vibora", "vwz:karte"], ["vwz:karte"], ["emp=kesselmann"]]) {
      expect(erklaeren(modell, m)!.gewaehlt.kategorieId).toBe(klassifizieren(modell, m)!.kategorieId);
    }
  });

  it("zerlegt den Abstand ohne Rest — Posten plus Grundneigung ergeben ihn genau", () => {
    // Das ist die Zusage der ganzen Datei: keine Näherung, sondern die Rechnung selbst.
    // Ginge die Summe nicht auf, wäre ein Posten erfunden oder einer vergessen.
    const e = erklaeren(modell, ["emp=vibora", "vwz:karte", "vwz:neu"])!;
    const summe = e.posten.reduce((s, p) => s + p.differenz, 0) + e.grundneigung.differenz;
    expect(summe).toBeCloseTo(e.abstand, 5);
    expect(e.abstand).toBeGreaterThan(0);
  });

  it("vergleicht ohne Vorgabe mit der Zweitbesten", () => {
    const e = erklaeren(modell, ["emp=ohlert", "vwz:karte"])!;
    expect(e.gewaehlt.rang).toBe(1);
    expect(e.vergleich?.rang).toBe(2);
    expect(e.kandidaten.map((k) => k.rang)).toEqual([1, 2, 3]);
  });

  it("vergleicht mit der vorgegebenen Kategorie, auch wenn sie weit hinten liegt", () => {
    const e = erklaeren(modell, ["emp=ohlert", "vwz:karte"], "rot")!;
    expect(e.vergleich?.kategorieId).toBe("rot");
    expect(e.vergleich?.rang).toBe(3);
  });

  it("ordnet nach Anteil am Abstand, nicht nach rohem Gewicht", () => {
    // `vwz:karte` steht in gruen UND in blau. Gegen blau gerechnet zählt nur der
    // Unterschied — der Empfänger trennt schärfer und steht deshalb vorn.
    const e = erklaeren(modell, ["emp=ohlert", "vwz:karte"], "blau")!;
    const karte = e.posten.find((p) => p.merkmal === "vwz:karte")!;
    expect(karte.differenz).toBeCloseTo(karte.fuer - karte.gegen, 6);
    expect(e.posten[0].merkmal).toBe("emp=ohlert");
  });

  it("meldet die Grundneigung, wenn nichts Bekanntes in der Zahlung steht", () => {
    // Nur unbekannte Wörter: die Entscheidung fällt allein über die Grundneigung. In
    // der alten Begründung stand dann nichts — als hätte es keinen Grund gegeben.
    const e = erklaeren(modell, ["vwz:unbekannt"])!;
    expect(e.posten).toHaveLength(0);
    expect(e.unbekannt).toEqual(["vwz:unbekannt"]);
    expect(e.grundneigung.differenz).toBeCloseTo(e.abstand, 5);
  });

  it("sagt, wenn die richtige Kategorie im Training gar nicht vorkam", () => {
    const e = erklaeren(modell, ["emp=ohlert"], "gelb")!;
    expect(e.vergleichUnbekannt).toBe(true);
    expect(e.vergleich).toBeNull();
  });

  it("zählt ein doppeltes Merkmal einmal, wie das Modell", () => {
    const e = erklaeren(modell, ["emp=ohlert", "emp=ohlert"])!;
    expect(e.posten).toHaveLength(1);
  });

  it("liefert null für ein leeres Modell", () => {
    expect(erklaeren(trainieren([]), ["emp=ohlert"])).toBeNull();
  });
});
