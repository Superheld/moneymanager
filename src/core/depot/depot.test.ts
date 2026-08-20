// Alle Zahlen hier sind erfunden. Was echt ist, sind die Konstellationen: ein Papier ohne
// Einstandsangabe (von einer anderen Bank übertragen), ein Fondsbestand mit gebrochener
// Stückzahl, und eine Wertreihe mit Lücken — ein Depot wird nicht täglich abgerufen.

import { describe, expect, it } from "vitest";
import { waehrungNachCode } from "../basis/waehrung";
import {
  einstandswert,
  positionsKennung,
  juengsterWert,
  positionsergebnis,
  wertAm,
  wertentwicklung,
  type Depotposition,
  type Depotwert,
} from "./depot";

const EUR = waehrungNachCode("EUR");

function position(over: Partial<Depotposition> = {}): Depotposition {
  return { depotId: "d1", stichtag: "2026-08-20", kennung: "DE000TEST001", ...over };
}

function wert(stichtag: string, gesamtwert: number): Depotwert {
  return { depotId: "d1", stichtag, gesamtwert };
}

describe("einstandswert", () => {
  it("macht aus Stückzahl und Kurs einen Cent-Betrag", () => {
    expect(einstandswert(position({ stueck: 10, einstandKurs: 25.5 }), EUR)).toBe(25_500);
  });

  it("kommt mit gebrochenen Stückzahlen zurecht", () => {
    // Fondsanteile sind selten ganzzahlig. 12,3456 × 87,65 = 1082,09184 → 108209 Cent.
    // In IEEE 754 ist das Zwischenergebnis 108209,18400000001 — genau der Grund, warum
    // die Rundung an genau einer Stelle passiert und nicht an jeder, die multipliziert.
    expect(einstandswert(position({ stueck: 12.3456, einstandKurs: 87.65 }), EUR)).toBe(108_209);
  });

  it("liefert nichts, wo die Bank nichts gesagt hat", () => {
    // Der Normalfall bei übertragenen Papieren — und kein Grund, eine Null zu erfinden:
    // ein Einstand von null hiesse geschenkt.
    expect(einstandswert(position({ stueck: 10 }), EUR)).toBeUndefined();
    expect(einstandswert(position({ einstandKurs: 25.5 }), EUR)).toBeUndefined();
    expect(einstandswert(position(), EUR)).toBeUndefined();
  });

  it("weist unbrauchbare Zahlen ab, statt NaN weiterzureichen", () => {
    expect(einstandswert(position({ stueck: Number.NaN, einstandKurs: 10 }), EUR)).toBeUndefined();
    expect(einstandswert(position({ stueck: 10, einstandKurs: Number.POSITIVE_INFINITY }), EUR)).toBeUndefined();
  });
});

describe("positionsKennung", () => {
  it("nimmt die ISIN, wo es eine gibt", () => {
    expect(positionsKennung({ isin: "DE000TEST001", wkn: "TST001", name: "Papier" }, 0)).toBe("DE000TEST001");
  });

  it("weicht auf WKN und Namen aus", () => {
    expect(positionsKennung({ wkn: "TST001", name: "Papier" }, 0)).toBe("TST001");
    expect(positionsKennung({ name: "Papier" }, 0)).toBe("Papier");
  });

  it("fällt auf die laufende Nummer zurück, statt zwei Positionen gleich zu benennen", () => {
    // Zwei namenlose Positionen wären sonst ununterscheidbar — und in einer Tabelle mit
    // zusammengesetztem Schlüssel bei jedem Abruf erneut doppelt.
    expect(positionsKennung({}, 0)).toBe("#0");
    expect(positionsKennung({ isin: "  " }, 1)).toBe("#1");
  });
});

describe("positionsergebnis", () => {
  it("rechnet Wert gegen Einstand", () => {
    const e = positionsergebnis(position({ stueck: 10, einstandKurs: 20, wert: 25_000 }), EUR);
    expect(e.einstand).toBe(20_000);
    expect(e.veraenderung).toBe(5_000);
    expect(e.anteil).toBeCloseTo(0.25);
  });

  it("zeigt Verluste als negative Veränderung", () => {
    const e = positionsergebnis(position({ stueck: 10, einstandKurs: 20, wert: 15_000 }), EUR);
    expect(e.veraenderung).toBe(-5_000);
    expect(e.anteil).toBeCloseTo(-0.25);
  });

  it("liefert den Wert auch ohne Einstand — nur eben ohne Ergebnis", () => {
    // Eine Position ohne Einstand ist trotzdem etwas wert. Sie deshalb wegzulassen wäre
    // ein zu kleines Depot.
    const e = positionsergebnis(position({ wert: 25_000 }), EUR);
    expect(e.wert).toBe(25_000);
    expect(e.einstand).toBeUndefined();
    expect(e.veraenderung).toBeUndefined();
  });

  it("teilt nicht durch einen Einstand von null", () => {
    const e = positionsergebnis(position({ stueck: 10, einstandKurs: 0, wert: 25_000 }), EUR);
    expect(e.veraenderung).toBe(25_000);
    expect(e.anteil).toBeUndefined();
  });
});

describe("Wertreihe", () => {
  const reihe = [wert("2026-06-30", 100_000), wert("2026-08-20", 125_000), wert("2026-07-31", 110_000)];

  it("findet den jüngsten Stand über den Stichtag, nicht über die Reihenfolge", () => {
    expect(juengsterWert(reihe)?.stichtag).toBe("2026-08-20");
    expect(juengsterWert([])).toBeUndefined();
  });

  it("nimmt zu einem Tag ohne Eintrag den letzten davor", () => {
    // Ein Depot wird nicht täglich abgerufen; zum Monatsende gibt es meist keinen Wert.
    expect(wertAm(reihe, "2026-08-15")?.stichtag).toBe("2026-07-31");
    expect(wertAm(reihe, "2026-07-31")?.stichtag).toBe("2026-07-31");
  });

  it("liefert nichts für einen Tag vor der ersten Beobachtung", () => {
    expect(wertAm(reihe, "2026-01-01")).toBeUndefined();
  });
});

describe("wertentwicklung", () => {
  const reihe = [wert("2026-06-30", 100_000), wert("2026-07-31", 110_000), wert("2026-08-20", 125_000)];

  it("misst zwischen den Ständen, die zu den Zeitpunkten galten", () => {
    const e = wertentwicklung(reihe, "2026-06-30", "2026-08-20");
    expect(e.veraenderung).toBe(25_000);
    expect(e.anteil).toBeCloseTo(0.25);
  });

  it("hält sich zurück, wo eine Seite fehlt", () => {
    const e = wertentwicklung(reihe, "2026-01-01", "2026-08-20");
    expect(e.von).toBeUndefined();
    expect(e.veraenderung).toBeUndefined();
  });
});
