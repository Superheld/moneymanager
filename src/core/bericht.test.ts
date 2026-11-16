// Der Bericht: Monat und Jahr auf einem Blatt. Alle Beträge erfunden, die Namen gelten je
// Testfall.
//
// Festgehalten wird vor allem die Probe aus `core/CLAUDE.md`: die Überleitung eines
// JAHRES geht wie die eines Monats exakt auf die Änderung der Kontostände auf — auch dann,
// wenn sich die Periodisierung innerhalb des Jahres nicht zu null hebt.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "./buchung/istbuchung";
import type { Kategorie } from "./kategorien/kategorie";
import type { Zahlungskonto } from "./konten/konto";
import { ergebnisbasis, ergebnisKennzahlen, monatsErgebnis, type ErgebnisEingabe, type MonatsErgebnis } from "./ergebnis";
import {
  berichtsstichtage,
  berichtszeitraeume,
  berichtszeitraum,
  ergebnisVergleich,
  ueberleitungSumme,
  vermoegensvergleich,
  vorherigerSchluessel,
} from "./bericht";
import type { VermoegensEingabe } from "./vermoegen/vermoegen";

const konto = (id: string, klasse: Zahlungskonto["klasse"], saldo = 0): Zahlungskonto => ({
  id, bezeichnung: id, typ: "Giro", klasse, inhaberIds: [], saldo,
});

describe("berichtszeitraeume", () => {
  const b = (datum: string) => ({ datum });

  it("bietet die abgeschlossenen, voll erfassten Monate an, jüngsten zuerst", () => {
    // Die erste Buchung liegt mitten im März: der März ist nur zum Teil erfasst.
    const z = berichtszeitraeume("2026-07-09", [b("2026-03-14"), b("2026-06-02")]);
    expect(z.monate).toEqual(["2026-06", "2026-05", "2026-04"]);
    expect(z.jahre).toEqual([]);
  });

  it("nimmt den ersten Monat mit, wenn die erste Buchung an seinem Ersten liegt", () => {
    expect(berichtszeitraeume("2026-03-20", [b("2026-01-01")]).monate).toEqual(["2026-02", "2026-01"]);
  });

  it("bietet ein Jahr nur an, wenn alle zwölf Monate voll erfasst sind", () => {
    const z = berichtszeitraeume("2026-02-03", [b("2024-02-01")]);
    // 2024 beginnt erst im Februar, 2026 ist nicht vorbei.
    expect(z.jahre).toEqual(["2025"]);
    expect(berichtszeitraeume("2026-01-01", [b("2025-01-01")]).jahre).toEqual(["2025"]);
  });

  it("hat ohne Buchungen nichts", () => {
    expect(berichtszeitraeume("2026-07-09", [])).toEqual({ monate: [], jahre: [] });
  });
});

describe("Zeitraum und Stichtage", () => {
  it("kennt Vormonat und Vorjahr, auch über den Jahreswechsel", () => {
    expect(vorherigerSchluessel("monat", "2026-01")).toBe("2025-12");
    expect(vorherigerSchluessel("jahr", "2026")).toBe("2025");
  });

  it("legt die Stichtage auf den Tag davor und den letzten Tag", () => {
    expect(berichtsstichtage(berichtszeitraum("monat", "2024-02"))).toEqual({ anfang: "2024-01-31", ende: "2024-02-29" });
    const jahr = berichtszeitraum("jahr", "2025");
    expect(jahr.monate).toHaveLength(12);
    expect(jahr.bis).toBe("2026-01-01");
    expect(berichtsstichtage(jahr)).toEqual({ anfang: "2024-12-31", ende: "2025-12-31" });
  });
});

/**
 * Ein Haushaltsjahr mit allem, was die Überleitung bewegt: ein Jahresbeitrag mitten im
 * Jahr (die Periodisierung hebt sich im Jahr NICHT auf), eine Rücklage, die weiterläuft, mit
 * Entnahme, eine Rücklage ohne Überweisung, eine Umbuchung auf ein Investmentkonto, dazu
 * Einnahmen und Ungeplantes.
 */
describe("Ein Jahr — die Summe seiner Monate", () => {
  const KATEGORIEN: Kategorie[] = [
    { id: "lohn", name: "Lohn", defaultCharakter: "Ertrag" },
    { id: "beitrag", name: "Beitrag", defaultCharakter: "Aufwand" },
    { id: "frei", name: "Frei", defaultCharakter: "Aufwand" },
    { id: "topf", name: "Topf", defaultCharakter: "Aufwand" },
  ];
  let n = 0;
  const ist = (datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung => ({
    id: `x${++n}`, datum, betrag, kontoId: "giro", charakter: betrag >= 0 ? "Ertrag" : "Aufwand", quelle: "import", ...over,
  });

  const buchungen: IstBuchung[] = [];
  const vertragJeBuchung = new Map<string, string>();
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const lohn = ist(`2025-${mm}-27`, 250000, { kategorieId: "lohn" });
    vertragJeBuchung.set(lohn.id, "v-lohn");
    buchungen.push(lohn, ist(`2025-${mm}-15`, -(30000 + m * 700), { kategorieId: "frei" }));
  }
  const beitrag = ist("2025-07-04", -72000, { kategorieId: "beitrag" });
  vertragJeBuchung.set(beitrag.id, "v-beitrag");
  buchungen.push(
    beitrag,
    ist("2025-09-12", -45000, { kategorieId: "topf" }),
    ist("2025-03-01", -20000, { charakter: "Umschichtung", transferId: "t1", gegenkontoId: "anlage" }),
    ist("2025-03-01", 20000, { charakter: "Umschichtung", transferId: "t1", kontoId: "anlage", gegenkontoId: "giro" }),
    // Ein Monat davor und einer danach, damit die Grenzen des Jahres etwas zu trennen haben.
    ist("2024-12-20", -9900, { kategorieId: "frei" }),
    ist("2026-01-03", -8800, { kategorieId: "frei" }),
  );

  const e: ErgebnisEingabe = {
    regeln: [
      { id: "r-lohn", bezeichnung: "Ohlert", betrag: 250000, rhythmus: "monatlich", startdatum: "2025-01-27", charakter: "Ertrag", kategorieId: "lohn", vertragId: "v-lohn" },
      { id: "r-beitrag", bezeichnung: "Vibora", betrag: -72000, rhythmus: "jaehrlich", startdatum: "2025-07-04", charakter: "Aufwand", kategorieId: "beitrag", vertragId: "v-beitrag" },
    ],
    budgets: [],
    ruecklagen: [
      // Läuft weiter — bis Migration 81 ein aufbauendes Budget.
      { id: "b-topf", bezeichnung: "Topf", kategorieId: "topf", kontoId: "giro", art: "fortlaufend", beginn: "2025-01-01", raten: [{ abMonat: "2025-01", betrag: 5000 }] },
      { id: "rl", bezeichnung: "Kesselmann", rate: 8000, beginn: "2025-01-01" },
    ],
    ausbuchungen: [],
    ruecklagenzuordnungen: [],
    ist: buchungen,
    kategorien: KATEGORIEN,
    konten: [konto("giro", "liquide"), konto("anlage", "investment")],
    vertragJeBuchung,
    heute: "2026-02-10",
  };
  const basis = ergebnisbasis(e);
  const jahr = berichtszeitraum("jahr", "2025");
  const monate = jahr.monate.map((m) => monatsErgebnis(basis, m));

  it("geht in der Überleitung exakt auf die Buchungen ohne Gegenbein des Jahres auf", () => {
    const u = ueberleitungSumme(monate);
    const gebucht = buchungen
      .filter((b) => b.datum >= jahr.von && b.datum < jahr.bis && b.transferId == null)
      .reduce((s, b) => s + b.betrag, 0);
    expect(u.kontoaenderung).toBe(gebucht);
    expect(u.ergebnis + u.posten.reduce((s, p) => s + p.betrag, 0)).toBe(gebucht);
    // Die Probe hat etwas zu prüfen: alle Posten kommen vor, die Periodisierung bleibt
    // stehen (der Beitrag gilt bis in den Juni des Folgejahres).
    expect(u.posten.map((p) => p.id)).toEqual(["raten", "entnahmen", "periodisierung", "vorsorgeEigen"]);
    expect(u.posten.find((p) => p.id === "periodisierung")!.betrag).toBe(-36000);
  });

  it("summiert Zeilen und Stufen über die zwölf Monate", () => {
    const v = ergebnisVergleich(monate, null);
    const summe = (f: (m: MonatsErgebnis) => number) => monate.reduce((s, m) => s + f(m), 0);
    expect(v.ergebnis.jetzt).toBe(summe((m) => m.ergebnis.ist ?? 0));
    expect(v.nachAlltag.jetzt).toBe(summe((m) => m.nachAlltag.ist ?? 0));
    expect(v.zeilen.find((z) => z.id === "einnahmen")!.wert.jetzt).toBe(12 * 250000);
    // Sechs Zwölftel des Beitrags fallen in dieses Jahr.
    expect(v.zeilen.find((z) => z.id === "fixkosten")!.wert.jetzt).toBe(-36000);
    // Rücklagen beider Sorten, in einer Zeile: 80 + 50 je Monat.
    expect(v.zeilen.find((z) => z.id === "abschreibungen")!.wert.jetzt).toBe(-12 * (8000 + 5000));
    // Ohne Vergleich gibt es keine zweite Zahl — und keine Null an ihrer Stelle.
    expect(v.ergebnis.vorher).toBeNull();
    expect(v.ergebnis.veraenderung).toBeNull();
  });

  it("stellt den Zeitraum davor daneben und nennt die Veränderung", () => {
    const juni = monatsErgebnis(basis, "2025-06-01");
    const juli = monatsErgebnis(basis, "2025-07-01");
    const v = ergebnisVergleich([juli], [juni]);
    const fix = v.zeilen.find((z) => z.id === "fixkosten")!.wert;
    expect(fix).toEqual({ jetzt: -6000, vorher: 0, veraenderung: -6000 });
    expect(v.ergebnis.veraenderung).toBe((juli.ergebnis.ist ?? 0) - (juni.ergebnis.ist ?? 0));
  });

  it("zeigt eine Zeile, die es nur im Zeitraum davor gab", () => {
    const ohneRuecklage = monatsErgebnis(ergebnisbasis({ ...e, ruecklagen: [], budgets: [] }), "2025-07-01");
    const v = ergebnisVergleich([ohneRuecklage], [monate[5]]);
    expect(v.zeilen.find((z) => z.id === "abschreibungen")!.wert).toEqual({ jetzt: 0, vorher: -13000, veraenderung: 13000 });
  });

  it("rechnet die Kennzahlen des Jahres über dieselben Monate", () => {
    const k = ergebnisKennzahlen(monate);
    expect(k.monate).toBe(12);
    expect(k.fixkostenquote).toBeCloseTo(36000 / 3000000);
  });
});

describe("vermoegensvergleich", () => {
  const e: VermoegensEingabe = {
    konten: [konto("giro", "liquide", 100000)],
    buchungen: [
      { id: "a", datum: "2025-05-10", betrag: -20000, kontoId: "giro", charakter: "Aufwand", quelle: "import" },
      { id: "b", datum: "2025-06-10", betrag: 50000, kontoId: "giro", charakter: "Ertrag", quelle: "import" },
    ],
    depotwerte: [{ depotId: "d", stichtag: "2025-05-20", gesamtwert: 300000 }],
    gegenstaende: [{ id: "g", bezeichnung: "Kesselmann", art: "sonstiges" }],
    werte: [{ gegenstandId: "g", stichtag: "2025-01-01", wert: 500000 }],
    verbindlichkeiten: [{ id: "s", bezeichnung: "Vibora", art: "privat" }],
    staende: [
      { verbindlichkeitId: "s", stichtag: "2025-01-01", restschuld: 200000 },
      { verbindlichkeitId: "s", stichtag: "2025-06-01", restschuld: 150000 },
    ],
  };

  it("zeigt vier Teile und das Nettovermögen, die Schulden als Abzug", () => {
    const v = vermoegensvergleich(e, "2025-04-30", "2025-06-30");
    const z = Object.fromEntries(v.zeilen.map((r) => [r.teil, r]));
    expect(z.konten).toEqual({ teil: "konten", anfang: 100000, ende: 130000, veraenderung: 30000 });
    expect(z.depots).toEqual({ teil: "depots", anfang: 0, ende: 300000, veraenderung: 300000 });
    expect(z.vermoegenswerte.veraenderung).toBe(0);
    // Die Schuld sank — das Vermögen wuchs: die Veränderung ist positiv.
    expect(z.schulden).toEqual({ teil: "schulden", anfang: -200000, ende: -150000, veraenderung: 50000 });
    // Die Spalte addiert sich zum Nettovermögen.
    for (const seite of ["anfang", "ende", "veraenderung"] as const) {
      expect(z.konten[seite] + z.depots[seite] + z.vermoegenswerte[seite] + z.schulden[seite]).toBe(z.netto[seite]);
    }
  });
});
