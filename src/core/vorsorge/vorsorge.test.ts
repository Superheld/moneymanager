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
  vorsorgeposten,
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
    depots: [
      { id: "d1", zugangId: "z", schluessel: "1|", bezeichnung: "Erstdepot", vorsorgezielId: "z1" },
      // Zählt nicht: ohne Zuordnung steht es nur im Nettovermögen.
      { id: "d2", zugangId: "z", schluessel: "2|", bezeichnung: "Zweitdepot" },
    ],
    depotwerte: [
      { depotId: "d1", stichtag: "2025-05-31", gesamtwert: 4_000_00 },
      { depotId: "d2", stichtag: "2025-05-31", gesamtwert: 9_000_00 },
    ],
    gegenstaende: [
      { id: "police", bezeichnung: "Police", art: "versicherung" as const, vorsorgezielId: "z1" },
      { id: "wagen", bezeichnung: "Wagen", art: "fahrzeug" as const },
    ],
    werte: [
      { gegenstandId: "police", stichtag: "2025-01-31", wert: 8_000_00 },
      { gegenstandId: "wagen", stichtag: "2025-01-31", wert: 16_000_00 },
    ],
  };

  it("zählt Vorsorge- und Investmentkonten, die zugeordneten Depots und die zugeordneten Vermögenswerte", () => {
    const v = vorsorgevermoegen(bestand as never, "z1", "2025-06-15");
    expect(v.konten).toBe(3_000_00);
    expect(v.depots).toBe(4_000_00);
    expect(v.vermoegenswerte).toBe(8_000_00);
    expect(v.schulden).toBe(0);
    expect(v.netto).toBe(15_000_00);
  });

  it("lässt einen Vermögenswert und ein Depot weg, die einem anderen oder keinem Ziel gehören", () => {
    const v = vorsorgevermoegen(bestand as never, "anderes", "2025-06-15");
    expect(v.vermoegenswerte).toBe(0);
    expect(v.depots).toBe(0);
  });
});

describe("vorsorgeposten", () => {
  const konto = (id: string, klasse: Zahlungskonto["klasse"], saldo: number): Zahlungskonto =>
    ({ id, bezeichnung: `Konto ${id}`, typ: "Giro", klasse, inhaberIds: [], saldo }) as Zahlungskonto;
  const depot = (id: string, ziel?: string, verrechnung?: string) => ({
    id, zugangId: "z", schluessel: `${id}|`, bezeichnung: `Depot ${id}`,
    ...(ziel ? { vorsorgezielId: ziel } : {}),
    ...(verrechnung ? { verrechnungskontoId: verrechnung } : {}),
  });
  const bestand = {
    konten: [
      konto("giro", "liquide", 500_00),
      konto("verr", "investment", 300_00),
      konto("verr-giro", "liquide", 200_00),
      konto("vors", "vorsorge", 1_000_00),
    ],
    buchungen: [
      { id: "b", datum: "2025-06-01", betrag: 50_00, kontoId: "verr", charakter: "Umschichtung" as const, quelle: "import" as const },
    ],
    depots: [
      depot("a", "z1", "verr"),
      // Dasselbe Verrechnungskonto ein zweites Mal: es steht nur unter dem ersten.
      depot("b", "z1", "verr"),
      // Ein Verrechnungskonto, dessen Klasse nicht zur Vorsorge zählt.
      depot("c", "z1", "verr-giro"),
      // Zählt nicht zum Ziel — und nimmt sein Verrechnungskonto nicht mit hinein.
      depot("d", undefined, "vors"),
    ],
    depotwerte: [
      { depotId: "a", stichtag: "2025-05-31", gesamtwert: 4_000_00 },
      { depotId: "b", stichtag: "2025-05-31", gesamtwert: 1_000_00 },
      { depotId: "c", stichtag: "2025-05-31", gesamtwert: 2_000_00 },
      { depotId: "d", stichtag: "2025-05-31", gesamtwert: 9_000_00 },
    ],
    gegenstaende: [
      { id: "police", bezeichnung: "Police", art: "versicherung" as const, vorsorgezielId: "z1" },
      { id: "verkauft", bezeichnung: "Verkauft", art: "beteiligung" as const, vorsorgezielId: "z1", aktiv: false },
    ],
    werte: [
      { gegenstandId: "police", stichtag: "2025-01-31", wert: 8_000_00 },
      { gegenstandId: "verkauft", stichtag: "2025-01-31", wert: 5_000_00 },
    ],
  };

  it("geht auf die Summe von vorsorgevermoegen auf", () => {
    const posten = vorsorgeposten(bestand as never, "z1", "2025-06-15");
    const summe = posten.reduce(
      (s, p) => s + p.betrag + (p.verrechnungskonto?.zaehlt ? p.verrechnungskonto.betrag : 0),
      0,
    );
    expect(summe).toBe(vorsorgevermoegen(bestand as never, "z1", "2025-06-15").netto);
  });

  it("stellt das Verrechnungskonto unter sein Depot, und jedes Konto steht einmal da", () => {
    const posten = vorsorgeposten(bestand as never, "z1", "2025-06-15");
    expect(posten.map((p) => [p.art, p.id, p.betrag])).toEqual([
      ["depot", "a", 4_000_00],
      ["depot", "b", 1_000_00],
      ["depot", "c", 2_000_00],
      ["konto", "vors", 1_000_00],
      ["vermoegenswert", "police", 8_000_00],
    ]);
    expect(posten[0].verrechnungskonto).toEqual({ id: "verr", bezeichnung: "Konto verr", klasse: "investment", betrag: 350_00, zaehlt: true });
    expect(posten[1].verrechnungskonto).toBeUndefined();
  });

  it("zeigt ein Verrechnungskonto, dessen Klasse nicht zählt, ohne es mitzuzählen", () => {
    const posten = vorsorgeposten(bestand as never, "z1", "2025-06-15");
    expect(posten[2].verrechnungskonto).toMatchObject({ id: "verr-giro", betrag: 200_00, zaehlt: false });
    expect(vorsorgevermoegen(bestand as never, "z1", "2025-06-15").konten).toBe(350_00 + 1_000_00);
  });
});
