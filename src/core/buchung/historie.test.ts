import { describe, expect, it } from "vitest";
import { buchungenDerKategorie, fruehesterMonat, istInterneUmbuchung, istMonatsverlauf, kategorieAggregat, nachHauptgruppe, type KategorieSumme } from "./historie";
import type { IstBuchung } from "./istbuchung";
import type { Kategorie } from "../kategorien/kategorie";
import type { Zahlungskonto } from "../konten/konto";

function konto(saldo: number): Zahlungskonto {
  return { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo };
}
function b(datum: string, betrag: number, charakter: IstBuchung["charakter"]): IstBuchung {
  return { id: datum + betrag, datum, betrag, kontoId: "k1", charakter, quelle: "import" };
}

describe("istMonatsverlauf", () => {
  it("bündelt Erträge/Aufwände/Umschichtungen je Monat", () => {
    const r = istMonatsverlauf(
      [konto(0)],
      [
        b("2022-01-10", 200000, "Ertrag"),
        b("2022-01-15", -5000, "Aufwand"),
        b("2022-01-20", -50000, "Umschichtung"),
      ],
      "2022-01-01",
      "2022-01-01",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ einnahmen: 200000, ausgaben: -5000, umschichtung: -50000, netto: 195000 });
  });

  it("führt den realen Saldo über die Monate fort (inkl. Umschichtung im Saldo)", () => {
    const r = istMonatsverlauf(
      [konto(100000)], // Anfangsbestand 1000,00
      [b("2022-01-10", -30000, "Aufwand"), b("2022-02-10", 50000, "Ertrag")],
      "2022-01-01",
      "2022-02-01",
    );
    expect(r[0].saldo).toBe(70000); // 100000 - 30000
    expect(r[1].saldo).toBe(120000); // + 50000
  });

  it("listet buchungsfreie Monate mit Nullfluss, Saldo läuft weiter", () => {
    const r = istMonatsverlauf([konto(0)], [b("2022-01-10", -1000, "Aufwand")], "2022-01-01", "2022-03-01");
    expect(r.map((m) => m.label)).toEqual(["2022-01", "2022-02", "2022-03"]);
    expect(r[1]).toMatchObject({ einnahmen: 0, ausgaben: 0, saldo: -1000 });
    expect(r[2].saldo).toBe(-1000);
  });

  it("zählt Ist VOR dem Fenster in den Sockel-Saldo, nicht in die Monatsflüsse", () => {
    const r = istMonatsverlauf(
      [konto(0)],
      [b("2021-12-31", -10000, "Aufwand"), b("2022-01-05", -2000, "Aufwand")],
      "2022-01-01",
      "2022-01-01",
    );
    expect(r[0].ausgaben).toBe(-2000); // Dez nicht im Fluss
    expect(r[0].saldo).toBe(-12000); // aber im Saldo
  });

  it("lässt nicht verfügbare Konten mit Saldo UND Buchungen draußen", () => {
    // Der Kern der Sache: der Sockel entsteht aus den liquiden Salden, und liefe danach
    // die Bewegung eines Rücklagenkontos darüber, zeigte die Kurve einen Saldo, den es
    // nie gab. Beide Seiten müssen dieselbe Regel benutzen.
    const ruecklage: Zahlungskonto = {
      id: "k2",
      bezeichnung: "Rücklage",
      typ: "Tagesgeld",
      klasse: "ruecklage",
      inhaberIds: [],
      saldo: 500000,
    };
    const aufRuecklage: IstBuchung = {
      id: "r1",
      datum: "2022-01-10",
      betrag: -100000,
      kontoId: "k2",
      charakter: "Aufwand",
      quelle: "import",
    };

    const r = istMonatsverlauf(
      [konto(100000), ruecklage],
      [b("2022-01-15", -5000, "Aufwand"), aufRuecklage],
      "2022-01-01",
      "2022-01-01",
    );

    // Weder die 5000er Ausgabe des Girokontos verschwindet, noch taucht die 100000er auf.
    expect(r[0].ausgaben).toBe(-5000);
    // Sockel 100000 (nur das Girokonto) minus 5000 — die Rücklage kommt nirgends vor.
    expect(r[0].saldo).toBe(95000);
  });

  it("zählt eine Buchung mit, deren Konto gar nicht in der Liste steht", () => {
    // Die Kontenliste ist hier eine Filterregel, keine Vollständigkeitszusage. Eine
    // Buchung stillschweigend zu verlieren wäre der schlechtere Fehler.
    const fremd: IstBuchung = {
      id: "f1",
      datum: "2022-01-12",
      betrag: -2000,
      kontoId: "unbekannt",
      charakter: "Aufwand",
      quelle: "import",
    };
    const r = istMonatsverlauf([konto(0)], [fremd], "2022-01-01", "2022-01-01");
    expect(r[0].ausgaben).toBe(-2000);
  });
});

describe("kategorieAggregat", () => {
  const kategorien: Kategorie[] = [
    { id: "le", name: "Lebensmittel", elternId: "lh", defaultCharakter: "Aufwand" },
    { id: "lh", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
    { id: "ge", name: "Gehalt", defaultCharakter: "Ertrag" },
  ];
  function bk(datum: string, betrag: number, charakter: IstBuchung["charakter"], kategorieId?: string): IstBuchung {
    return { id: datum + betrag, datum, betrag, kontoId: "k1", charakter, quelle: "import", kategorieId };
  }

  it("summiert je Kategorie im Fenster, sortiert nach Magnitude, mit Elternname", () => {
    const r = kategorieAggregat(
      [
        bk("2022-01-05", -3000, "Aufwand", "le"),
        bk("2022-01-09", -2000, "Aufwand", "le"),
        bk("2022-01-10", 250000, "Ertrag", "ge"),
        bk("2022-02-01", -9999, "Aufwand", "le"), // außerhalb des Fensters
      ],
      "2022-01-01",
      "2022-01-01",
      kategorien,
    );
    expect(r.map((x) => x.name)).toEqual(["Gehalt", "Lebensmittel"]); // Magnitude: 250000 > 5000
    const le = r.find((x) => x.kategorieId === "le")!;
    expect(le).toMatchObject({ summe: -5000, anzahl: 2, elternName: "Lebenshaltung", charakter: "Aufwand" });
  });

  it("fasst Buchungen ohne Kategorie separat zusammen", () => {
    const r = kategorieAggregat([bk("2022-01-05", -1000, "Aufwand")], "2022-01-01", "2022-01-01", kategorien);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kategorieId: undefined, name: "—", summe: -1000 });
  });
});

describe("buchungenDerKategorie", () => {
  const bk = (datum: string, betrag: number, kategorieId?: string): IstBuchung => ({ id: datum + betrag, datum, betrag, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId });
  it("liefert nur die Buchungen der Kategorie im Fenster, neueste zuerst", () => {
    const r = buchungenDerKategorie(
      [bk("2022-01-05", -10, "le"), bk("2022-01-20", -30, "le"), bk("2022-01-10", -20, "ge"), bk("2022-02-01", -99, "le")],
      "le",
      "2022-01-01",
      "2022-01-01",
    );
    expect(r.map((b) => b.betrag)).toEqual([-30, -10]); // 20. vor 5., Feb + andere Kategorie raus
  });
});

describe("istInterneUmbuchung", () => {
  const mk = (over: Partial<IstBuchung>): IstBuchung => ({ id: "x", datum: "2022-01-01", betrag: -1, kontoId: "k1", charakter: "Aufwand", quelle: "import", ...over });
  it("erkennt importierte Umbuchungen (Umschichtung ohne Kategorie)", () => {
    expect(istInterneUmbuchung(mk({ charakter: "Umschichtung" }))).toBe(true);
  });
  it("erkennt manuelle Umbuchungen (transferId gesetzt)", () => {
    expect(istInterneUmbuchung(mk({ charakter: "Umschichtung", transferId: "t1" }))).toBe(true);
  });
  it("lässt Sparen (Umschichtung MIT Kategorie) und normale Buchungen durch", () => {
    expect(istInterneUmbuchung(mk({ charakter: "Umschichtung", kategorieId: "sp" }))).toBe(false);
    expect(istInterneUmbuchung(mk({ charakter: "Aufwand", kategorieId: "le" }))).toBe(false);
  });
});

describe("fruehesterMonat", () => {
  it("findet den frühesten Buchungsmonat als YYYY-MM-01", () => {
    expect(fruehesterMonat([b("2023-05-10", -1, "Aufwand"), b("2021-11-02", -1, "Aufwand")])).toBe("2021-11-01");
  });
  it("liefert undefined bei leerer Liste", () => {
    expect(fruehesterMonat([])).toBeUndefined();
  });
});

describe("nachHauptgruppe", () => {
  const kategorien: Kategorie[] = [
    { id: "lebenshaltung", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
    { id: "essen", name: "Lebensmittel", defaultCharakter: "Aufwand", elternId: "lebenshaltung" },
    { id: "drogerie", name: "Drogerie", defaultCharakter: "Aufwand", elternId: "lebenshaltung" },
    { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
    { id: "miete", name: "Miete", defaultCharakter: "Aufwand", elternId: "wohnen" },
  ];

  const flach: KategorieSumme[] = [
    { kategorieId: "essen", name: "Lebensmittel", charakter: "Aufwand", summe: -40000, anzahl: 20 },
    { kategorieId: "drogerie", name: "Drogerie", charakter: "Aufwand", summe: -10000, anzahl: 5 },
    { kategorieId: "miete", name: "Miete", charakter: "Aufwand", summe: -90000, anzahl: 3 },
  ];

  it("bündelt Unterkategorien unter ihrer Hauptgruppe", () => {
    const gruppen = nachHauptgruppe(flach, kategorien);
    expect(gruppen.map((g) => g.name)).toEqual(["Wohnen", "Lebenshaltung"]); // nach Betrag
    const lebenshaltung = gruppen.find((g) => g.kategorieId === "lebenshaltung")!;
    expect(lebenshaltung.summe).toBe(-50000);
    expect(lebenshaltung.anzahl).toBe(25);
    expect(lebenshaltung.kinder.map((k) => k.name)).toEqual(["Lebensmittel", "Drogerie"]);
  });

  it("führt eine Kategorie ohne Elternteil als eigene Gruppe", () => {
    const gruppen = nachHauptgruppe(
      [{ kategorieId: "wohnen", name: "Wohnen", charakter: "Aufwand", summe: -5000, anzahl: 1 }],
      kategorien,
    );
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].kategorieId).toBe("wohnen");
    expect(gruppen[0].summe).toBe(-5000);
  });

  /**
   * Wird direkt auf eine Hauptgruppe gebucht UND auf ihre Unterkategorien, muss die
   * Gruppenzeile beides tragen — und aufgeklappt beides zeigen. Sonst summieren die
   * sichtbaren Kinder auf weniger, als die Zeile darüber behauptet.
   */
  it("zählt Buchungen direkt auf der Hauptgruppe mit und zeigt sie als Kind", () => {
    const gruppen = nachHauptgruppe(
      [
        { kategorieId: "lebenshaltung", name: "Lebenshaltung", charakter: "Aufwand", summe: -1000, anzahl: 1 },
        { kategorieId: "essen", name: "Lebensmittel", charakter: "Aufwand", summe: -4000, anzahl: 2 },
      ],
      kategorien,
    );
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].summe).toBe(-5000);
    expect(gruppen[0].kinder.reduce((s, k) => s + k.summe, 0)).toBe(gruppen[0].summe);
  });

  it("behält die Sammelzeile ohne Kategorie", () => {
    const gruppen = nachHauptgruppe(
      [{ name: "—", charakter: "Aufwand", summe: -700, anzahl: 2 }],
      kategorien,
    );
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].kategorieId).toBeUndefined();
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(nachHauptgruppe([], kategorien)).toEqual([]);
  });
});
