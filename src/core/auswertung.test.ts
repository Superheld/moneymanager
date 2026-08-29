import { describe, expect, it } from "vitest";

import {
  blindeFlecken,
  budgettreue,
  empfaengerRangliste,
  festUndFrei,
  groessteposten,
  imFenster,
  kategorienutzung,
  kennzahlen,
  monateImFenster,
  vertragstreue,
} from "./auswertung";
import type { IstBuchung } from "./buchung/istbuchung";
import type { Kategorie } from "./kategorien/kategorie";
import type { Zahlungskonto } from "./konten/konto";

const KATEGORIEN: Kategorie[] = [
  { id: "kat-a", name: "Alltag", defaultCharakter: "Aufwand" },
  { id: "kat-b", name: "Beitraege", defaultCharakter: "Aufwand" },
  { id: "kat-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
];

function b(
  id: string,
  datum: string,
  betrag: number,
  extra: Partial<IstBuchung> = {},
): IstBuchung {
  return {
    id,
    datum,
    betrag,
    kontoId: "k1",
    charakter: betrag > 0 ? "Ertrag" : "Aufwand",
    quelle: "manuell",
    ...extra,
  };
}

const KONTEN: Zahlungskonto[] = [
  { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 },
  { id: "k2", bezeichnung: "Depot", typ: "Depot", klasse: "vorsorge", inhaberIds: [], saldo: 900000 },
];

describe("Fenster und Monate", () => {
  it("zaehlt beide Enden mit", () => {
    expect(monateImFenster("2026-01-01", "2026-03-01")).toBe(3);
    expect(monateImFenster("2026-01-01", "2026-01-01")).toBe(1);
    expect(monateImFenster("2025-11-01", "2026-02-01")).toBe(4);
  });

  // Eine Umbuchung stuende in jeder Rangliste ganz oben, ohne dass etwas passiert waere.
  it("laesst interne Umbuchungen ueberall draussen", () => {
    const drin = imFenster(
      [b("x", "2026-02-10", -5000), b("u", "2026-02-11", -900000, { transferId: "t1" })],
      "2026-01-01",
      "2026-03-01",
    );
    expect(drin.map((z) => z.id)).toEqual(["x"]);
  });
});

describe("Kennzahlen", () => {
  const buchungen = [
    b("e1", "2026-01-31", 300000),
    b("e2", "2026-02-28", 300000),
    b("miete1", "2026-01-02", -100000),
    b("miete2", "2026-02-02", -100000),
    b("essen1", "2026-01-10", -20000),
    b("essen2", "2026-02-10", -30000),
  ];
  const vertragsBuchungen = new Set(["miete1", "miete2"]);

  it("mittelt ueber die Monate des Fensters", () => {
    const z = kennzahlen(buchungen, KONTEN, vertragsBuchungen, "2026-01-01", "2026-02-01");
    expect(z.monate).toBe(2);
    expect(z.einnahmenJeMonat).toBe(300000);
    expect(z.ausgabenJeMonat).toBe(125000);
    expect(z.festJeMonat).toBe(100000);
    expect(z.freiJeMonat).toBe(25000);
  });

  it("rechnet Fixkosten- und Sparquote als Bruchteil", () => {
    const z = kennzahlen(buchungen, KONTEN, vertragsBuchungen, "2026-01-01", "2026-02-01");
    expect(z.fixkostenquote).toBeCloseTo(200000 / 600000, 5);
    expect(z.sparquote).toBeCloseTo((600000 - 250000) / 600000, 5);
  });

  // Ohne Bezugsgroesse gibt es keine Quote — eine 0 behauptete, es sei nichts fest.
  it("laesst die Quoten offen, wenn es keine Einnahmen gab", () => {
    const z = kennzahlen([b("a", "2026-01-05", -1000)], KONTEN, new Set(), "2026-01-01", "2026-01-01");
    expect(z.fixkostenquote).toBeUndefined();
    expect(z.sparquote).toBeUndefined();
  });

  // Die Trennung, fuer die es die Kontoklasse gibt: das Depot traegt einen nicht durch
  // den naechsten Monat.
  it("rechnet die Reichweite nur aus liquiden Mitteln", () => {
    const z = kennzahlen(buchungen, KONTEN, vertragsBuchungen, "2026-01-01", "2026-02-01");
    // Anfangsbestand des Giro plus alle seine Buchungen; das Depot bleibt draussen.
    expect(z.liquide).toBe(100000 + 350000);
    expect(z.reichweiteMonate).toBeCloseTo(450000 / 125000, 5);
  });

  // Die Regel aus dem Kopf der Datei: eine Erstattung senkt die Ausgabe, sie erhoeht sie
  // nicht. Mit Math.abs stuende hier das Gegenteil.
  it("laesst eine Erstattung die Ausgaben senken", () => {
    const mitRueckfluss = [
      b("kauf", "2026-01-10", -20000, { kategorieId: "kat-a" }),
      b("retoure", "2026-01-20", 5000, { charakter: "Aufwand", kategorieId: "kat-a" }),
    ];
    const z = kennzahlen(mitRueckfluss, KONTEN, new Set(), "2026-01-01", "2026-01-01");
    expect(z.ausgabenJeMonat).toBe(20000);
    expect(z.einnahmenJeMonat).toBe(5000);
  });
});

describe("Fest und frei", () => {
  it("gibt jeden Monat des Fensters aus, auch den leeren", () => {
    const reihe = festUndFrei([b("a", "2026-03-05", -1000)], new Set(), "2026-01-01", "2026-03-01");
    expect(reihe.map((m) => m.monat)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(reihe[0]).toMatchObject({ fest: 0, frei: 0, einnahmen: 0 });
  });

  // Gebunden heisst „gehoert zu einem Vertrag" — nicht „ist gross". Eine Miete ohne
  // Vertrag zaehlt als frei, und diese Luecke soll sichtbar bleiben.
  it("bindet nur, was einem Vertrag zugeordnet ist", () => {
    const reihe = festUndFrei(
      [b("miete", "2026-01-02", -100000), b("abo", "2026-01-03", -1000)],
      new Set(["abo"]),
      "2026-01-01",
      "2026-01-01",
    );
    expect(reihe[0]).toMatchObject({ fest: 1000, frei: 100000 });
  });
});

describe("Empfaenger-Rangliste", () => {
  const buchungen = [
    b("1", "2026-01-05", -3000),
    b("2", "2026-02-05", -3000),
    b("3", "2026-02-06", -50000),
    b("4", "2026-02-07", 900),
  ];
  const namen = new Map([["1", "Kesselmann"], ["2", "Kesselmann"], ["3", "Vibora"], ["4", "Kesselmann"]]);
  const empf = (x: IstBuchung) => namen.get(x.id) ?? "";

  it("sortiert nach Summe und zaehlt Monate getrennt von Posten", () => {
    const liste = empfaengerRangliste(buchungen, empf, "2026-01-01", "2026-02-01");
    expect(liste.map((z) => z.name)).toEqual(["Vibora", "Kesselmann"]);
    expect(liste[1]).toMatchObject({ summe: 6000, anzahl: 2, monate: 2, letzte: "2026-02-05" });
  });

  it("laesst Zufluesse und namenlose Zeilen weg", () => {
    const liste = empfaengerRangliste(buchungen, empf, "2026-01-01", "2026-02-01");
    // Die Gutschrift an „Kesselmann" taucht nicht als vierter Posten auf.
    expect(liste.find((z) => z.name === "Kesselmann")?.anzahl).toBe(2);
    expect(empfaengerRangliste(buchungen, () => "  ", "2026-01-01", "2026-02-01")).toEqual([]);
  });
});

describe("Kategorie-Nutzung", () => {
  const buchungen = [
    b("a1", "2026-01-03", -1000, { kategorieId: "kat-a" }),
    b("a2", "2026-01-09", -1500, { kategorieId: "kat-a" }),
    b("a3", "2026-02-09", -500, { kategorieId: "kat-a" }),
    b("b1", "2026-02-01", -60000, { kategorieId: "kat-b" }),
  ];

  // Die Trennung, um die es geht: oft und klein gegen selten und teuer.
  it("trennt Haeufigkeit von Hoehe", () => {
    const [oft, selten] = kategorienutzung(buchungen, KATEGORIEN, "2026-01-01", "2026-02-01");
    expect(oft).toMatchObject({ name: "Alltag", anzahl: 3, summe: 3000, schnitt: 1000, monate: 2 });
    expect(selten).toMatchObject({ name: "Beitraege", anzahl: 1, summe: 60000, groesster: 60000 });
  });

  // Sonst zaehlte ein Wocheneinkauf, der auf drei Kategorien aufgeteilt ist, dreimal mit
  // vollem Betrag.
  it("zaehlt eine geteilte Buchung je Anteil, nicht je Buchung", () => {
    const geteilt = [
      b("g", "2026-01-04", -3000, {
        aufteilungen: [
          { kategorieId: "kat-a", betrag: -1000 },
          { kategorieId: "kat-b", betrag: -2000 },
        ],
      }),
    ];
    const liste = kategorienutzung(geteilt, KATEGORIEN, "2026-01-01", "2026-01-01");
    // Bei gleicher Anzahl entscheidet die Summe — deshalb steht der groessere Anteil oben.
    expect(liste.map((z) => [z.name, z.summe])).toEqual([
      ["Beitraege", 2000],
      ["Alltag", 1000],
    ]);
  });
});

describe("Budgettreue", () => {
  const budgets = [{ id: "bu1", name: "Alltag" }];

  // Der eigentliche Befund: die Jahressumme sagt „passt", und gestimmt hat es nie.
  it("zaehlt Monate statt Summen — eine aufgehende Summe kann jeden Monat verfehlen", () => {
    const stand = (_: string, m: string) => ({
      rahmen: 10000,
      verbraucht: m === "2026-01" ? 15000 : 5000,
    });
    const [z] = budgettreue(budgets, stand, "2026-01-01", "2026-02-01");
    expect(z.rahmen).toBe(20000);
    expect(z.verbraucht).toBe(20000); // Summe geht exakt auf
    expect(z.gehalten).toBe(1); // und trotzdem war ein Monat gerissen
    expect(z.schlimmste).toBe(5000);
  });

  // Vor dem ersten Budgetmonat gab es keinen Plan, gegen den etwas verstossen konnte.
  it("wertet einen Monat ohne Rahmen weder als gehalten noch als gerissen", () => {
    const stand = (_: string, m: string) => ({ rahmen: m === "2026-02" ? 10000 : 0, verbraucht: 1000 });
    const [z] = budgettreue(budgets, stand, "2026-01-01", "2026-02-01");
    expect(z.gehalten).toBe(1);
    expect(z.monate).toBe(2);
  });
});

describe("Blinde Flecken", () => {
  const buchungen = [
    b("geplant", "2026-01-05", -10000, { kategorieId: "kat-a" }),
    b("ungeplant", "2026-01-06", -30000, { kategorieId: "kat-b" }),
    b("vertrag", "2026-01-07", -10000, { kategorieId: "kat-b" }),
  ];

  it("meldet nur, was weder budgetiert noch vertraglich gebunden ist", () => {
    const flecken = blindeFlecken(
      buchungen,
      new Set(["kat-a"]),
      new Set(["vertrag"]),
      KATEGORIEN,
      "2026-01-01",
      "2026-01-01",
    );
    expect(flecken.map((f) => f.name)).toEqual(["Beitraege"]);
    // Der Anteil bezieht sich auf ALLE Ausgaben des Zeitraums, auch die gedeckten —
    // sonst waere „100 %" die Antwort, sobald ueberhaupt etwas ungedeckt ist.
    expect(flecken[0].anteil).toBeCloseTo(30000 / 50000, 5);
  });

  it("nimmt Buchungen ohne Kategorie mit — sie sind der blindeste Fleck", () => {
    const flecken = blindeFlecken(
      [b("ohne", "2026-01-08", -4000)],
      new Set(),
      new Set(),
      KATEGORIEN,
      "2026-01-01",
      "2026-01-01",
    );
    expect(flecken).toHaveLength(1);
    expect(flecken[0].kategorieId).toBeUndefined();
  });
});

describe("Vertragstreue", () => {
  const vertraege = [{ id: "v1", anbieter: "Ohlert" }];
  const buchungen = [
    b("z1", "2026-01-04", -1000, { kategorieId: "kat-b" }),
    b("z2", "2026-02-04", -4000, { kategorieId: "kat-a" }),
  ];
  // Die Zuordnung steht nicht an der Buchung, sondern in `vertrag_zuordnung` — der Kern
  // bekommt sie deshalb als Nachschlag herein und raet sie nicht aus einem Feld.
  const zuVertrag = new Map([["z1", "v1"], ["z2", "v1"]]);
  const vertragVon = (x: IstBuchung) => zuVertrag.get(x.id);
  const katName = (id: string) => KATEGORIEN.find((k) => k.id === id)?.name;

  // Die Spanne ist der Befund: eine feste Rate ist bei diesem Vertrag eine Fiktion.
  it("nennt Spanne und Streuung der Kategorien", () => {
    const [z] = vertragstreue(vertraege, buchungen, vertragVon, () => 5000, katName, "2026-01-01", "2026-02-01");
    expect(z).toMatchObject({ ist: 5000, anzahl: 2, kleinste: 1000, groesste: 4000 });
    expect(z.kategorien).toEqual(["Alltag", "Beitraege"]);
  });

  // Ein Vertrag ohne zugeordnete Zahlung ist der interessantere Fall: die Erkennung
  // greift zu eng. Er darf deshalb nicht aus der Liste fallen.
  it("fuehrt einen Vertrag ohne Zahlungen mit Null", () => {
    const [z] = vertragstreue(vertraege, [], vertragVon, () => 5000, katName, "2026-01-01", "2026-02-01");
    expect(z).toMatchObject({ ist: 0, anzahl: 0, kleinste: 0, groesste: 0, soll: 5000 });
  });
});

describe("Groesste Posten", () => {
  it("setzt den groessten Abfluss ins Verhaeltnis zum Monatsschnitt", () => {
    const liste = groessteposten(
      [b("gross", "2026-01-05", -400000), b("klein", "2026-01-06", -1000), b("ein", "2026-01-07", 900000)],
      "2026-01-01",
      "2026-01-01",
      100000,
    );
    expect(liste.map((z) => z.buchung.id)).toEqual(["gross", "klein"]);
    expect(liste[0].vielfaches).toBeCloseTo(4, 5);
  });
});
