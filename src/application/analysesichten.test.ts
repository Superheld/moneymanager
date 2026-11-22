// Das Analysefenster — und die eine Stelle, an der seine Monatsmarken nicht reichen.
//
// Alle Werte erfunden. Echt ist die Konstellation: eine Reihe von Beobachtungen, die
// mitten im laufenden Monat liegt, gegen ein Fenster, das den Monat an seinem Ersten
// benennt.

import { describe, expect, it } from "vitest";
import type { Depotwert } from "../core";
import { depotEntwicklung, type Depotsicht } from "./depot/depotsichten";
import { bilanzJeKlasse, ergebnisbasis, monatsErgebnis, staendeJeKlasse } from "../core";
import { belegungssicht } from "./kontobelegung";
import { analyseAusblick, analyseBefunde, analyseBericht, analyseBuchungen, analyseFensterTaggenau, analyseKostenverlauf, analyseLiquiditaet, analyseReichweite, type Analysebasis } from "./analysesichten";

describe("analyseFensterTaggenau", () => {
  it("schiebt die Monatsmarke auf den letzten Tag desselben Monats", () => {
    expect(analyseFensterTaggenau("2026-08-01")).toBe("2026-08-31");
    expect(analyseFensterTaggenau("2026-04-01")).toBe("2026-04-30");
  });

  it("kennt den Februar im Schaltjahr", () => {
    expect(analyseFensterTaggenau("2024-02-01")).toBe("2024-02-29");
    expect(analyseFensterTaggenau("2026-02-01")).toBe("2026-02-28");
  });
});

/**
 * Der Fehler, wegen dem es die Funktion gibt: die Analyse meldete „zu wenig Punkte" für
 * ein Depot, dessen Stände vollzählig gespeichert waren. `analyseFenster` endet auf dem
 * ERSTEN des laufenden Monats, Depot-Stichtage sind Abruftage und liegen dahinter — jeder
 * Punkt fiel aus dem Fenster. Das sah aus wie verlorene Daten und war eine Grenze.
 */
describe("Depot im Analysefenster", () => {
  const reihe: Depotwert[] = [
    { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 1_000_00 },
    { depotId: "d1", stichtag: "2026-08-24", gesamtwert: 1_050_00 },
    { depotId: "d1", stichtag: "2026-08-27", gesamtwert: 1_080_00 },
  ];
  const sicht: Depotsicht = {
    depot: { id: "d1", zugangId: "z1", schluessel: "1|", bezeichnung: "Depot" },
    aktuell: reihe[2],
    reihe,
    positionen: [],
  };

  it("findet mit der Monatsmarke als Ende keinen einzigen Punkt", () => {
    const bis = "2026-08-01";
    expect(reihe.filter((w) => w.stichtag >= "2025-09-01" && w.stichtag <= bis)).toHaveLength(0);
    expect(depotEntwicklung(sicht, "2025-09-01", bis).veraenderung).toBeUndefined();
  });

  it("findet mit dem taggenauen Ende die ganze Reihe", () => {
    const bis = analyseFensterTaggenau("2026-08-01");
    expect(reihe.filter((w) => w.stichtag >= "2025-09-01" && w.stichtag <= bis)).toHaveLength(3);
    expect(depotEntwicklung(sicht, "2025-09-01", bis).veraenderung).toBe(80_00);
  });
});


/**
 * Der Verlauf über die Gegenwart hinaus. Alle Werte erfunden; echt ist die Frage, die
 * daran hängt — was von einem geplanten Monat überhaupt auf den Kontostand wirkt.
 */
describe("analyseBuchungen — der Betrag der Zeile", () => {
  /**
   * Die Detailliste steht UNTER einem Aggregat, das über `kategorieAnteile` rechnet.
   * Zeigte sie `buchung.betrag`, summierten sich ihre Zeilen nicht auf die Zahl darüber —
   * und ein Wocheneinkauf stünde unter „Drogerie" mit dem Betrag, den er insgesamt
   * gekostet hat. Genau das tat sie, bis `betragInKategorie` angeschlossen wurde.
   */
  const geteilt: Analysebasis = {
    buchungen: [
      {
        id: "b1", datum: "2026-07-10", betrag: -5200, kontoId: "k1",
        charakter: "Aufwand", quelle: "manuell",
        aufteilungen: [
          { kategorieId: "k-le", betrag: -4000 },
          { kategorieId: "k-dro", betrag: -1200 },
        ],
      },
    ],
    konten: [{ id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 }],
    kategorien: [
      { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
      { id: "k-dro", name: "Drogerie", defaultCharakter: "Aufwand" },
    ],
    kontoNamen: new Map([["k1", "Giro"]]),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [],
    vertraege: [],
    regeln: [],
    ruecklagen: [],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map(),
    vormerkungen: [],
  };

  it("zeigt bei einer geteilten Buchung nur ihren Teil, nicht den Gesamtbetrag", () => {
    const zeilen = analyseBuchungen(geteilt, "k-dro", "2026-07-01", "2026-08-01");
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].betrag).toBe(-1200);
    expect(zeilen[0].buchung.betrag).toBe(-5200);
  });

  it("führt unter „Ungeplant“ je Kategorie den Teil der Buchung, nicht den Gesamtbetrag", () => {
    const befunde = analyseBefunde(geteilt, "2026-07-01", "2026-08-01");
    const dro = befunde.ungeplant.find((u) => u.kategorieId === "k-dro")!;
    expect(dro).toMatchObject({ name: "Drogerie", summe: 1200, anzahl: 1, wartend: 0 });
    expect(dro.zeilen.map((z) => z.betrag)).toEqual([-1200]);
    expect(befunde.ungeplant.map((u) => u.kategorieId)).toEqual(["k-le", "k-dro"]);
  });

  it("zeigt bei einer ungeteilten Buchung den vollen Betrag", () => {
    const ungeteilt: Analysebasis = {
      ...geteilt,
      buchungen: [
        {
          id: "b2", datum: "2026-07-11", betrag: -1900, kontoId: "k1",
          charakter: "Aufwand", quelle: "manuell", kategorieId: "k-dro",
        },
      ],
    };
    expect(analyseBuchungen(ungeteilt, "k-dro", "2026-07-01", "2026-08-01")[0].betrag).toBe(-1900);
  });
});

describe("analyseAusblick", () => {
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [
      {
        id: "b1", datum: "2026-07-10", betrag: -20000, kontoId: "k1",
        charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
      },
    ],
    konten: [
      { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 },
    ],
    kategorien: [{ id: "kat1", name: "Wohnen", defaultCharakter: "Aufwand" }],
    kontoNamen: new Map([["k1", "Giro"]]),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [],
    vertraege: [],
    regeln: [],
    ruecklagen: [],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map(),
    vormerkungen: [],
    ...extra,
  });

  it("liefert gewesene und geplante Monate in einer Reihe und markiert die Naht", () => {
    const punkte = analyseAusblick(basis(), "2026-08-15", 3, 3);
    // Der laufende Monat ist Plan: halb gebucht knickte die Linie an der Naht ein.
    expect(punkte.map((p) => p.monat)).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(punkte.filter((p) => p.plan).map((p) => p.monat)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("schreibt den Saldo an der Naht ohne Sprung fort", () => {
    const regeln = [
      {
        id: "r1", bezeichnung: "Miete", betrag: -100000, rhythmus: "monatlich" as const,
        startdatum: "2026-01-01", charakter: "Aufwand" as const, kontoId: "k1", kategorieId: "kat1",
      },
    ];
    const punkte = analyseAusblick(basis({ regeln }), "2026-08-15", 2, 2);
    const gewesen = punkte.filter((p) => !p.plan);
    const letzterIst = gewesen[gewesen.length - 1];
    const ersterPlan = punkte.find((p) => p.plan)!;
    expect(ersterPlan.saldo).toBe(letzterIst.saldo + ersterPlan.netto);
    // Der erste Planpunkt ist der laufende Monat — mit seinem ganzen Plan.
    expect(ersterPlan).toMatchObject({ monat: "2026-08", netto: -100000 });
  });

  // Der laufende Monat zählt als Plan, auch wenn schon etwas darin gebucht ist: sein
  // Gebuchtes ist ein halber Monat und gehört nicht in die Linie.
  it("rechnet den laufenden Monat ganz als Plan, auch mit Gebuchtem darin", () => {
    const regeln = [
      {
        id: "r1", bezeichnung: "Gehalt", betrag: 300000, rhythmus: "monatlich" as const,
        startdatum: "2026-01-28", charakter: "Ertrag" as const, kontoId: "k1",
      },
    ];
    const frueh = {
      id: "f8", datum: "2026-08-03", betrag: -5000, kontoId: "k1",
      charakter: "Aufwand" as const, quelle: "import" as const, kategorieId: "kat1",
    };
    const b = basis({ regeln });
    const punkte = analyseAusblick({ ...b, buchungen: [...b.buchungen, frueh] }, "2026-08-15", 2, 1);
    expect(punkte.map((p) => [p.monat, p.plan])).toEqual([["2026-06", false], ["2026-07", false], ["2026-08", true]]);
    expect(punkte[2].einnahmen).toBe(300000);
    expect(punkte[2].saldo).toBe(punkte[1].saldo + punkte[2].netto);
  });

  // Die Entscheidung, die `planWirkung` trägt, hier im Zusammenspiel: eine Umschichtung
  // wechselt nur das Konto und darf den vorhergesagten Stand nicht senken.
  it("laesst eine geplante Umschichtung den Saldo unberuehrt", () => {
    const regeln = [
      {
        id: "r2", bezeichnung: "Sparen", betrag: -50000, rhythmus: "monatlich" as const,
        startdatum: "2026-01-01", charakter: "Umschichtung" as const, kontoId: "k1",
      },
    ];
    const punkte = analyseAusblick(basis({ regeln }), "2026-08-15", 2, 2);
    expect(punkte.filter((p) => p.plan).every((p) => p.netto === 0)).toBe(true);
  });
});

/**
 * Die Kostensicht des Verlaufs. Alle Werte erfunden; echt sind die drei Entscheidungen,
 * die der Use-Case trägt: der laufende Monat erscheint und zählt nicht, die Zahl ist
 * dieselbe wie in der Übersicht, und die Grenze bei ausgebuchten Rücklagen steht dabei.
 */
describe("analyseKostenverlauf", () => {
  const heute = "2026-08-15";
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [
      { id: "g6", datum: "2026-06-28", betrag: 300000, kontoId: "k1", charakter: "Ertrag", quelle: "import", kategorieId: "lohn" },
      { id: "m6", datum: "2026-06-03", betrag: -90000, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId: "fix" },
      { id: "a6", datum: "2026-06-12", betrag: -30000, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId: "alltag" },
      { id: "g7", datum: "2026-07-28", betrag: 300000, kontoId: "k1", charakter: "Ertrag", quelle: "import", kategorieId: "lohn" },
      { id: "m7", datum: "2026-07-03", betrag: -90000, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId: "fix" },
      // Der laufende Monat: die Rate ist bezahlt, das Gehalt steht noch aus.
      { id: "m8", datum: "2026-08-03", betrag: -90000, kontoId: "k1", charakter: "Aufwand", quelle: "import", kategorieId: "fix" },
    ],
    konten: [{ id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 }],
    kategorien: [
      { id: "lohn", name: "Lohn", defaultCharakter: "Ertrag" },
      { id: "fix", name: "Festes", defaultCharakter: "Aufwand" },
      { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
    ],
    kontoNamen: new Map([["k1", "Giro"]]),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [
      { id: "b1", kategorieId: "alltag", kontoId: "k1", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 40000 }] },
    ],
    vertraege: [],
    regeln: [
      { id: "r1", bezeichnung: "Kesselmann", betrag: -90000, rhythmus: "monatlich", startdatum: "2026-01-03", charakter: "Aufwand", kontoId: "k1", kategorieId: "fix", vertragId: "v1" },
    ],
    ruecklagen: [{ id: "rl", bezeichnung: "Vibora", rate: 10000, beginn: "2026-01-01" }],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map([["m6", "v1"], ["m7", "v1"], ["m8", "v1"]]),
    vormerkungen: [],
    ...extra,
  });

  it("liefert je Monat die Zeilen der Ergebnisrechnung, Kosten positiv", () => {
    const { monate } = analyseKostenverlauf(basis(), "2026-06-01", "2026-08-01", heute);
    expect(monate.map((m) => m.monat)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(monate[0]).toMatchObject({
      einnahmen: 300000,
      kosten: { fixkosten: 90000, laufend: 30000, ungeplant: 0, abschreibungen: 10000, vorsorge: 0 },
      kostenGesamt: 130000,
      ergebnis: 170000,
      laufend: false,
    });
  });

  it("zeigt den laufenden Monat, lässt ihn aber aus den Kennzahlen", () => {
    const { monate, kennzahlen } = analyseKostenverlauf(basis(), "2026-06-01", "2026-08-01", heute);
    expect(monate[2]).toMatchObject({ monat: "2026-08", laufend: true, einnahmen: 0 });
    // Juni und Juli: 1300 und 1000 Kosten, je 3000 Einnahmen. Der August mit seiner
    // Rate ohne Gehalt zöge beides schief.
    expect(kennzahlen.monate).toBe(2);
    expect(kennzahlen.kostenJeMonat).toBe(115000);
    expect(kennzahlen.ergebnisJeMonat).toBe(185000);
    expect(kennzahlen.fixkostenquote).toBeCloseTo(0.3, 10);
    expect(kennzahlen.sparquote).toBeCloseTo(20000 / 600000, 10);
  });

  it("trägt für den laufenden Monat dieselbe Zahl wie die Übersicht", () => {
    const b = basis();
    const uebersicht = monatsErgebnis(
      ergebnisbasis({ regeln: b.regeln, budgets: b.budgets, ruecklagen: b.ruecklagen, beendete: b.beendete, ausbuchungen: b.ausbuchungen, ruecklagenzuordnungen: b.ruecklagenzuordnungen, ist: b.buchungen, kategorien: b.kategorien, konten: b.konten, vertragJeBuchung: b.vertragJeBuchung, heute }),
      "2026-08-01",
    );
    const { monate } = analyseKostenverlauf(b, "2026-06-01", "2026-08-01", heute);
    expect(monate[2].ergebnis).toBe(uebersicht.ergebnis.ist);
  });

  it("kennt ohne abgeschlossenen Monat keine Kennzahl", () => {
    const { monate, kennzahlen } = analyseKostenverlauf(basis(), "2026-08-01", "2026-08-01", heute);
    expect(monate).toHaveLength(1);
    expect(kennzahlen).toMatchObject({ monate: 0, fixkostenquote: null, sparquote: null });
  });

  it("markiert die Monate vor einer Ausbuchung als unvollständig", () => {
    // Im Juli ausgebucht: die Rücklage beginnt neu, und der Juni zeigt keine Rate mehr.
    const ausgebucht = basis({
      ruecklagen: [{ id: "rl", bezeichnung: "Vibora", ziel: 120000, fristMonate: 12, beginn: "2026-07-20" }],
      ausbuchungsdaten: ["2026-07-20"],
      ausbuchungen: [],
      beendete: [],
      ruecklagenzuordnungen: [],
    });
    const v = analyseKostenverlauf(ausgebucht, "2026-06-01", "2026-08-01", heute);
    expect(v.monate.map((m) => [m.monat, m.kosten.abschreibungen, m.ruecklagenUnvollstaendig])).toEqual([
      ["2026-06", 0, true],
      ["2026-07", 10000, false],
      ["2026-08", 10000, false],
    ]);
    expect(v.ruecklagenUnvollstaendig).toBe(true);
    // Ohne Ausbuchung im Fenster gilt die Einschränkung nicht — und steht dann auch nicht da.
    expect(analyseKostenverlauf(basis(), "2026-06-01", "2026-08-01", heute).ruecklagenUnvollstaendig).toBe(false);
  });
});

/**
 * „Reicht das Geld?" — der Use-Case über der Liquiditätsvorschau. Die Rechnung selbst
 * ist im Kern geprüft (`core/liquiditaet.test.ts`); hier steht, was der Use-Case
 * AUSWÄHLT und hineinreicht. Alle Werte erfunden.
 */
describe("analyseLiquiditaet", () => {
  const heute = "2026-08-15";
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [],
    konten: [
      { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 },
      { id: "alt", bezeichnung: "Altes Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 5000, aktiv: false },
      { id: "topf", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 300000 },
    ],
    kategorien: [{ id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" }],
    kontoNamen: new Map([["giro", "Giro"], ["alt", "Altes Giro"], ["topf", "Tagesgeld"]]),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [],
    vertraege: [],
    regeln: [],
    ruecklagen: [],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map(),
    vormerkungen: [],
    ...extra,
  });

  it("zeigt nur liquide, aktive Konten — mit Namen und dem Ende des Fensters", () => {
    const sicht = analyseLiquiditaet(basis(), heute, 30);
    expect(sicht.zeilen.map((z) => [z.kontoId, z.name, z.start])).toEqual([["giro", "Giro", 100000]]);
    expect(sicht.bis).toBe("2026-09-14");
  });

  it("trennt die feste von der erwarteten Linie", () => {
    const sicht = analyseLiquiditaet(
      basis({
        regeln: [
          { id: "r1", bezeichnung: "Kesselmann", betrag: -80000, rhythmus: "monatlich", startdatum: "2026-01-20", charakter: "Aufwand", kontoId: "giro" },
        ],
        budgets: [
          { id: "b1", kategorieId: "alltag", kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 60000 }] },
        ],
      }),
      heute,
      20,
    );
    const [giro] = sicht.zeilen;
    // Fest: nur die Rate am 20. — das Konto bleibt im Plus.
    expect(giro.fest).toMatchObject({ tiefstand: 20000, tiefstandAm: "2026-08-20" });
    expect(giro.fest.minusAb).toBeUndefined();
    // Erwartet: dazu der Budgetrest über die Tage — damit reicht es nicht mehr.
    expect(giro.erwartet.tiefstand).toBeLessThan(0);
    expect(giro.erwartet.minusAb).toBeDefined();
  });

  it("beginnt mit dem Stand abzüglich dessen, was die Bank schon vorgemerkt hat", () => {
    const sicht = analyseLiquiditaet(
      basis({ vormerkungen: [{ id: "v1", zahlungskontoId: "giro", betrag: -25000, waehrung: "EUR", gegenpartei: "Ohlert", verwendungszweck: "", erfasstAm: "2026-08-14" }] }),
      heute,
    );
    expect(sicht.zeilen[0].start).toBe(75000);
  });

  it("liefert die Kurve aller Zeilen Tag für Tag, mit den Posten des Tages", () => {
    const sicht = analyseLiquiditaet(
      basis({
        regeln: [
          { id: "r1", bezeichnung: "Kesselmann", betrag: -80000, rhythmus: "monatlich", startdatum: "2026-01-20", charakter: "Aufwand", kontoId: "giro" },
        ],
      }),
      heute,
      20,
    );
    expect(sicht.kurve).toHaveLength(21);
    expect(sicht.kurve[0]).toMatchObject({ datum: heute, fest: 100000, posten: [] });
    const tag = sicht.kurve.find((k) => k.datum === "2026-08-20")!;
    expect(tag.fest).toBe(20000);
    expect(tag.posten).toEqual([{ bezeichnung: "Kesselmann", betrag: -80000 }]);
    // Der Tiefstand der Tabelle ist ein Punkt dieser Kurve — eine Rechnung, nicht zwei.
    expect(Math.min(...sicht.kurve.map((k) => k.fest))).toBe(sicht.zeilen[0].fest.tiefstand);
  });
});

/**
 * „Wie lange reicht es ohne Einnahmen?" — was der Use-Case AUSWÄHLT: welche Monate
 * gemittelt werden, welches Geld als frei gilt. Die Rechnung selbst ist im Kern geprüft
 * (`core/reichweite.test.ts`). Alle Werte erfunden.
 */
describe("analyseReichweite", () => {
  const heute = "2026-08-15";
  const ist = (id: string, datum: string, betrag: number, kategorieId: string) =>
    ({ id, datum, betrag, kontoId: "giro", charakter: betrag > 0 ? "Ertrag" : "Aufwand", quelle: "import", kategorieId }) as const;
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [
      // Die erste Buchung liegt mitten im April: der April ist nur zum Teil erfasst.
      ist("a4", "2026-04-20", -10000, "alltag"),
      ist("g5", "2026-05-28", 300000, "lohn"), ist("m5", "2026-05-03", -90000, "fix"), ist("a5", "2026-05-12", -30000, "alltag"),
      ist("g6", "2026-06-28", 300000, "lohn"), ist("m6", "2026-06-03", -90000, "fix"), ist("a6", "2026-06-12", -50000, "alltag"),
      ist("g7", "2026-07-28", 300000, "lohn"), ist("m7", "2026-07-03", -90000, "fix"), ist("a7", "2026-07-12", -40000, "alltag"),
      // Der laufende Monat: die Rate ist bezahlt, sonst nichts.
      ist("m8", "2026-08-03", -90000, "fix"),
    ],
    konten: [
      { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 200000 },
      { id: "kasse", bezeichnung: "Kasse", typ: "Tagesgeld", klasse: "liquide", inhaberIds: [], saldo: 300000 },
      { id: "spar", bezeichnung: "Sparbuch", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 900000 },
    ],
    kategorien: [
      { id: "lohn", name: "Lohn", defaultCharakter: "Ertrag" },
      { id: "fix", name: "Festes", defaultCharakter: "Aufwand" },
      { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
    ],
    kontoNamen: new Map(),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [
      { id: "b1", kategorieId: "alltag", kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 40000 }] },
    ],
    vertraege: [],
    regeln: [
      { id: "r1", bezeichnung: "Ohlert", betrag: -90000, rhythmus: "monatlich", startdatum: "2026-01-03", charakter: "Aufwand", kontoId: "giro", kategorieId: "fix", vertragId: "v1" },
    ],
    // Eine Rücklage, deren Geld auf der Kasse liegt: sie kostet ihre Rate UND bindet Geld.
    ruecklagen: [{ id: "rl", bezeichnung: "Vibora", rate: 10000, beginn: "2026-01-01", kontoId: "kasse" }],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map([["m5", "v1"], ["m6", "v1"], ["m7", "v1"], ["m8", "v1"]]),
    vormerkungen: [],
    ...extra,
  });

  it("zieht ein überzogenes Konto mit seinem Minus ab", () => {
    const ohne = analyseReichweite(basis(), heute)!.reichweite!;
    const b = basis();
    const mit = analyseReichweite(
      {
        ...b,
        konten: [...b.konten, { id: "dispo", bezeichnung: "Zweitkonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: -70000 }],
      },
      heute,
    )!.reichweite!;
    expect(mit.frei).toBe(ohne.frei - 70000);
    expect(mit.ohneZuruecklegen!).toBeLessThan(ohne.ohneZuruecklegen!);
  });

  it("mittelt über die abgeschlossenen, voll erfassten Monate", () => {
    const r = analyseReichweite(basis(), heute)!.reichweite!;
    // Mai, Juni, Juli — nicht der halbe April, nicht der laufende August.
    expect(r.monate).toBe(3);
    // Grund: Vertrag 900 plus Alltag 300 / 500 / 400 → im Mittel 1300.
    expect(r.grundkosten).toBe(130000);
    // Dazu die Rate der Rücklage.
    expect(r.alleKosten).toBe(140000);
  });

  it("nimmt als Zähler das Freie der liquiden Konten — dieselbe Zahl wie unter Was da ist", () => {
    const b = basis();
    const r = analyseReichweite(b, heute)!.reichweite!;
    const belegung = belegungssicht(
      { konten: b.konten, buchungen: [...b.buchungen], ruecklagen: b.ruecklagen, sicht: { buchungen: [...b.buchungen], kategorien: b.kategorien, budgets: b.budgets, vertragsBuchungen: new Set(b.vertragJeBuchung.keys()) } },
      heute,
    );
    const liquide = bilanzJeKlasse(staendeJeKlasse(b.konten, b.buchungen), belegung.jeKonto).find((k) => k.klasse === "liquide")!;
    expect(r.frei).toBe(liquide.frei);
    // Die Rücklage bindet einen Teil, das Sparbuch zählt gar nicht.
    expect(liquide.gebunden).toBeGreaterThan(0);
    expect(r.frei).toBe(liquide.stand - liquide.gebunden);
    expect(r.ohneZuruecklegen).toBe(Math.floor((r.frei * 10) / 130000) / 10);
  });

  it("macht mit zu wenigen abgeschlossenen Monaten keine Aussage, sagt aber ab wann", () => {
    const sicht = analyseReichweite(basis(), "2026-07-15")!;
    expect(sicht.reichweite).toBeNull();
    expect(sicht.mindestens).toBe(3);
  });

  it("entfällt ohne liquides Konto", () => {
    expect(analyseReichweite(basis({ konten: [{ id: "spar", bezeichnung: "Sparbuch", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 1 }] }), heute)).toBeNull();
  });

  it("nennt die Grenze bei ausgebuchten Rücklagen, wenn sie einen gemittelten Monat trifft", () => {
    expect(analyseReichweite(basis(), heute)!.ruecklagenUnvollstaendig).toBe(false);
    expect(analyseReichweite(basis({ ausbuchungsdaten: ["2026-06-20"] }), heute)!.ruecklagenUnvollstaendig).toBe(true);
  });
});

/**
 * Der Bericht. Alle Werte erfunden; festgehalten wird, dass er nichts eigenes rechnet —
 * derselbe Monat trägt hier dieselben Kosten wie in der Kostensicht —, welcher Zeitraum
 * vorgegeben ist und wann der Vergleich fehlt.
 */
describe("analyseBericht", () => {
  const heute = "2026-08-15";
  const ist = (id: string, datum: string, betrag: number, kategorieId: string) =>
    ({ id, datum, betrag, kontoId: "giro", charakter: betrag > 0 ? "Ertrag" : "Aufwand", quelle: "import", kategorieId }) as const;
  const basis = (extra: Partial<Analysebasis> = {}): Analysebasis => ({
    buchungen: [
      // Die erste Buchung mitten im Mai: der Mai ist nur zum Teil erfasst.
      ist("a5", "2026-05-20", -12000, "alltag"),
      ist("g6", "2026-06-28", 210000, "lohn"), ist("a6", "2026-06-12", -45000, "alltag"),
      ist("g7", "2026-07-28", 210000, "lohn"), ist("a7", "2026-07-12", -38000, "alltag"),
      ist("a8", "2026-08-02", -9000, "alltag"),
    ],
    konten: [{ id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 50000 }],
    kategorien: [
      { id: "lohn", name: "Lohn", defaultCharakter: "Ertrag" },
      { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
    ],
    kontoNamen: new Map(),
    umsatzZuBuchung: new Map(),
    vertragsnamen: new Map(),
    vertragZuBuchung: new Map(),
    budgets: [],
    vertraege: [],
    regeln: [],
    ruecklagen: [{ id: "rl", bezeichnung: "Kesselmann", rate: 6000, beginn: "2026-01-01" }],
    ausbuchungsdaten: [],
    ausbuchungen: [],
    beendete: [],
    ruecklagenzuordnungen: [],
    vertragJeBuchung: new Map(),
    vormerkungen: [],
    ...extra,
  });

  it("nimmt ohne Wahl den letzten abgeschlossenen Monat und bietet nur voll erfasste an", () => {
    const s = analyseBericht(basis(), "monat", null, heute);
    expect(s.wahl).toEqual(["2026-07", "2026-06"]);
    expect(s.bericht!.schluessel).toBe("2026-07");
    expect(s.bericht!.vorher).toBe("2026-06");
  });

  it("trägt dieselben Zahlen wie die Kostensicht für denselben Monat", () => {
    const b = basis();
    const bericht = analyseBericht(b, "monat", "2026-07", heute).bericht!;
    const kosten = analyseKostenverlauf(b, "2026-06-01", "2026-07-01", heute);
    const juli = kosten.monate.find((m) => m.monat === "2026-07")!;
    const juni = kosten.monate.find((m) => m.monat === "2026-06")!;
    expect(bericht.ergebnis.ergebnis).toEqual({ jetzt: juli.ergebnis, vorher: juni.ergebnis, veraenderung: juli.ergebnis - juni.ergebnis });
    expect(bericht.kennzahlen.kostenJeMonat).toBe(juli.kostenGesamt);
  });

  it("vergleicht nicht mit einem Monat, der nicht ganz erfasst ist", () => {
    const s = analyseBericht(basis(), "monat", "2026-06", heute);
    expect(s.bericht!.vorher).toBeNull();
    expect(s.bericht!.ergebnis.ergebnis.vorher).toBeNull();
  });

  it("fällt auf den jüngsten Zeitraum zurück, wenn die Wahl nicht wählbar ist", () => {
    expect(analyseBericht(basis(), "monat", "2026-08", heute).bericht!.schluessel).toBe("2026-07");
  });

  it("hat ohne ganz erfasstes Jahr keinen Bericht über ein Jahr", () => {
    const s = analyseBericht(basis(), "jahr", null, heute);
    expect(s.wahl).toEqual([]);
    expect(s.bericht).toBeNull();
  });

  it("rechnet das Vermögen über die Konten, wenn kein Bestand geladen ist, und geht gegen die Überleitung auf", () => {
    const bericht = analyseBericht(basis(), "monat", "2026-07", heute).bericht!;
    const konten = bericht.vermoegen.zeilen.find((z) => z.teil === "konten")!;
    expect(bericht.vermoegen.anfang).toBe("2026-06-30");
    expect(bericht.vermoegen.ende).toBe("2026-07-31");
    // Ohne Umbuchungen und ohne Depot: die Konten ändern sich um genau das, was die
    // Überleitung als Änderung aller Kontostände nennt.
    expect(konten.veraenderung).toBe(bericht.ueberleitung.kontoaenderung);
    expect(bericht.ueberleitung.kontoaenderung).toBe(210000 - 38000);
    expect(bericht.mitBeobachtungen).toBe(false);
  });

  it("zählt Vermögenswerte und Schulden aus dem Bestand und sagt, dass sie Beobachtungen sind", () => {
    const b = basis();
    const bericht = analyseBericht(
      {
        ...b,
        vermoegen: {
          konten: b.konten, buchungen: b.buchungen, depotwerte: [],
          gegenstaende: [{ id: "g", bezeichnung: "Vibora", art: "sonstiges" }],
          werte: [{ gegenstandId: "g", stichtag: "2026-07-10", wert: 400000 }],
          verbindlichkeiten: [], staende: [],
        },
      },
      "monat",
      "2026-07",
      heute,
    ).bericht!;
    expect(bericht.vermoegen.zeilen.find((z) => z.teil === "vermoegenswerte")).toMatchObject({ anfang: 0, ende: 400000, veraenderung: 400000 });
    expect(bericht.mitBeobachtungen).toBe(true);
  });

  it("meldet fehlende Rücklagenraten auch, wenn sie nur den Vergleich treffen", () => {
    const s = analyseBericht(basis({ ausbuchungsdaten: ["2026-07-05"] }), "monat", "2026-07", heute);
    // Der Juli selbst ist der Monat der Ausbuchung und nicht betroffen, der Juni schon.
    expect(s.bericht!.ruecklagenUnvollstaendig).toBe(true);
    expect(analyseBericht(basis(), "monat", "2026-07", heute).bericht!.ruecklagenUnvollstaendig).toBe(false);
  });
});
