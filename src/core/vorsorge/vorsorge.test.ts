// Die Vorsorgerechnung — jedes Glied der Kette für sich, dann die ganze Kette.

import { describe, expect, it } from "vitest";
import type { Zahlungskonto } from "../konten/konto";
import {
  annahmeIm,
  hochgerechnet,
  kapitalbedarf,
  moeglicheEntnahme,
  monatszins,
  noetigeSparrate,
  reichweiteMonate,
  versorgungsluecke,
  vorsorgestand,
  vorsorgevermoegen,
  type Vorsorgeannahmen,
} from "./vorsorge";

describe("monatszins", () => {
  it("ergibt über zwölf Monate genau die Jahresrendite", () => {
    expect(Math.pow(1 + monatszins(300), 12)).toBeCloseTo(1.03, 10);
  });
});

describe("versorgungsluecke", () => {
  it("ist Wunsch minus Rente und nie negativ", () => {
    expect(versorgungsluecke({ wunschMonatlich: 250000, renteMonatlich: 150000 })).toBe(100000);
    expect(versorgungsluecke({ wunschMonatlich: 150000, renteMonatlich: 200000 })).toBe(0);
  });
});

describe("kapitalbedarf", () => {
  it("ist ohne Rendite Monate mal Betrag", () => {
    expect(kapitalbedarf(100000, 240, 0)).toBe(24000000);
  });

  it("ist mit Rendite kleiner, weil der Rest weiterarbeitet", () => {
    const mit = kapitalbedarf(100000, 240, 300);
    expect(mit).toBeLessThan(24000000);
    expect(mit).toBeGreaterThan(17000000);
  });

  it("ist null ohne Lücke oder ohne Entnahmezeit", () => {
    expect(kapitalbedarf(0, 240, 300)).toBe(0);
    expect(kapitalbedarf(100000, 0, 300)).toBe(0);
  });
});

describe("hochgerechnet", () => {
  it("verzinst ein Jahr mit der Jahresrendite", () => {
    expect(hochgerechnet(1000000, 12, 300)).toBe(1030000);
  });

  it("lässt den Betrag stehen, wenn keine Zeit bleibt", () => {
    expect(hochgerechnet(1000000, 0, 300)).toBe(1000000);
  });
});

describe("noetigeSparrate", () => {
  it("verteilt den Fehlbetrag ohne Rendite gleichmässig und rundet auf", () => {
    expect(noetigeSparrate(100000, 12, 0)).toBe(8334);
  });

  it("führt mit Rendite tatsächlich zum Fehlbetrag", () => {
    const rate = noetigeSparrate(5000000, 120, 300)!;
    const i = monatszins(300);
    const endwert = (rate * (Math.pow(1 + i, 120) - 1)) / i;
    expect(endwert).toBeGreaterThanOrEqual(5000000);
    expect(endwert).toBeLessThan(5000000 + 200);
  });

  it("nennt keine Rate, wenn keine Zeit mehr bleibt", () => {
    expect(noetigeSparrate(100000, 0, 300)).toBeNull();
    expect(noetigeSparrate(0, 0, 300)).toBe(0);
  });
});

describe("vorsorgestand", () => {
  const annahmen: Vorsorgeannahmen = {
    zielMonat: "2045-07",
    wunschMonatlich: 250000,
    renteMonatlich: 150000,
    entnahmeMonate: 240,
    renditeBp: 300,
  };

  it("rechnet die Kette von der Lücke bis zur Sparrate", () => {
    const s = vorsorgestand(annahmen, 5000000, "2025-07-15");
    expect(s.monateBisZiel).toBe(240);
    expect(s.luecke).toBe(100000);
    expect(s.kapitalbedarf).toBe(kapitalbedarf(100000, 240, 300));
    expect(s.hochgerechnet).toBe(hochgerechnet(5000000, 240, 300));
    expect(s.fehlbetrag).toBe(s.kapitalbedarf - s.hochgerechnet);
    expect(s.sparrate).toBe(noetigeSparrate(s.fehlbetrag, 240, 300));
    expect(s.deckung).toBeGreaterThan(0);
    expect(s.deckung).toBeLessThan(1);
  });

  it("verlangt nichts mehr, wenn das Vermögen den Bedarf schon trägt", () => {
    const s = vorsorgestand(annahmen, 50000000, "2025-07-15");
    expect(s.fehlbetrag).toBe(0);
    expect(s.sparrate).toBe(0);
    expect(s.deckung).toBe(1);
  });

  it("gilt als erreicht, wenn die Rente den Wunsch deckt", () => {
    const s = vorsorgestand({ ...annahmen, renteMonatlich: 300000 }, 0, "2025-07-15");
    expect(s.kapitalbedarf).toBe(0);
    expect(s.deckung).toBe(1);
  });

  it("nennt nach dem Zielmonat keine Rate mehr, wenn etwas fehlt", () => {
    const s = vorsorgestand(annahmen, 0, "2046-01-01");
    expect(s.monateBisZiel).toBe(0);
    expect(s.sparrate).toBeNull();
  });
});

describe("Entnahme", () => {
  it("gibt genau das her, was der Kapitalbedarf verlangt hätte", () => {
    const bedarf = kapitalbedarf(100000, 240, 300);
    const entnahme = moeglicheEntnahme(bedarf, 240, 300);
    // Hin und zurück gerundet: höchstens ein Cent darunter, nie darüber.
    expect(entnahme).toBeLessThanOrEqual(100000);
    expect(entnahme).toBeGreaterThanOrEqual(99999);
  });

  it("trägt ohne Rendite Kapital durch Entnahme viele Monate", () => {
    expect(reichweiteMonate(1200000, 100000, 0)).toBe(12);
  });

  it("reicht mit Rendite länger als ohne", () => {
    expect(reichweiteMonate(12000000, 100000, 300)!).toBeGreaterThan(120);
  });

  it("reicht unbegrenzt, wenn die Entnahme den Zins nicht übersteigt", () => {
    expect(reichweiteMonate(100000000, 100000, 300)).toBeNull();
  });
});

describe("annahmeIm", () => {
  const reihe = [{ abMonat: "2025-03" }, { abMonat: "2025-09" }];

  it("nimmt die jüngste Zeile, die nicht nach dem Monat beginnt", () => {
    expect(annahmeIm(reihe, "2025-03")?.abMonat).toBe("2025-03");
    expect(annahmeIm(reihe, "2025-08")?.abMonat).toBe("2025-03");
    expect(annahmeIm(reihe, "2026-01")?.abMonat).toBe("2025-09");
  });

  it("kennt vor der ersten Zeile keine — auch nicht die erste rückwirkend", () => {
    expect(annahmeIm(reihe, "2025-02")).toBeUndefined();
  });
});

describe("vorsorgevermoegen", () => {
  const konto = (id: string, klasse: Zahlungskonto["klasse"], saldo: number): Zahlungskonto =>
    ({ id, bezeichnung: id, typ: "Giro", klasse, inhaberIds: [], saldo }) as Zahlungskonto;

  const bestand = {
    konten: [
      konto("giro", "liquide", 500_00),
      konto("spar", "sparen", 700_00),
      konto("vors", "vorsorge", 1_000_00),
      konto("inv", "investment", 2_000_00),
    ],
    buchungen: [],
    depotwerte: [{ depotId: "d1", stichtag: "2025-05-31", gesamtwert: 4_000_00, waehrung: "EUR" }],
    gegenstaende: [
      { id: "police", bezeichnung: "Police", art: "versicherung" as const, vorsorgezielId: "z1" },
      { id: "wagen", bezeichnung: "Wagen", art: "fahrzeug" as const },
    ],
    werte: [
      { gegenstandId: "police", stichtag: "2025-01-31", wert: 8_000_00 },
      { gegenstandId: "wagen", stichtag: "2025-01-31", wert: 16_000_00 },
    ],
  };

  it("zählt Vorsorge- und Investmentkonten, alle Depots und die zugeordneten Vermögenswerte", () => {
    const v = vorsorgevermoegen(bestand as never, "z1", "2025-06-15");
    expect(v.konten).toBe(3_000_00);
    expect(v.depots).toBe(4_000_00);
    expect(v.vermoegenswerte).toBe(8_000_00);
    expect(v.schulden).toBe(0);
    expect(v.netto).toBe(15_000_00);
  });

  it("lässt einen Vermögenswert weg, der einem anderen oder keinem Ziel gehört", () => {
    expect(vorsorgevermoegen(bestand as never, "anderes", "2025-06-15").vermoegenswerte).toBe(0);
  });
});
