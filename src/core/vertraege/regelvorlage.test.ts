import { describe, expect, it } from "vitest";
import {
  beobachteteSpanne,
  faelligkeitsfenster,
  kreisfenster,
  regelvorlageAus,
  spanneWeiten,
  MAX_FENSTERANTEIL,
  TAGES_PUFFER,
} from "./regelvorlage";
import { standardErkennung, passtZu } from "./vertragZuordnung";
import type { Zahlungsspur } from "../buchung/zahlungsspur";

describe("kreisfenster", () => {
  it("fasst gestreute Werte in das engste Fenster und puffert es", () => {
    // Tage 10, 11, 12 → roh 10–12, mit Puffer 6–16.
    expect(kreisfenster([10, 11, 12], 31, TAGES_PUFFER)).toEqual([6, 16]);
  });

  it("legt das Fenster über den Monatswechsel, statt von 1 bis 31 zu laufen", () => {
    // Der Fall, für den die Kreisrechnung überhaupt da ist: wer am Monatsletzten
    // abbucht, trägt Tage aus beiden Hälften des Kreises. Als gewöhnliche Spanne von
    // Kleinstem zu Größtem wäre das „1 bis 31" — also alles.
    const fenster = kreisfenster([1, 29, 30, 31], 31, 0);
    expect(fenster).toEqual([29, 1]);
  });

  it("gibt nichts heraus, wenn das Fenster mehr als die Hälfte des Kreises fasst", () => {
    // Zahlungen am 1. und am 15. — dazwischen passt kein Fenster, das noch etwas
    // einschränkt. Eine Einstellung, die alles trifft, gehört nicht in die Regel.
    expect(kreisfenster([1, 15], 31, TAGES_PUFFER)).toBeUndefined();
    expect(MAX_FENSTERANTEIL).toBeLessThanOrEqual(0.5);
  });

  it("gibt nichts heraus, wenn der Puffer allein schon den Kreis schliesst", () => {
    expect(kreisfenster([5], 12, 6)).toBeUndefined();
  });

  it("kommt mit einem einzigen Wert aus", () => {
    expect(kreisfenster([3], 12, 1)).toEqual([2, 4]);
  });

  it("übergeht Werte ausserhalb des Kreises, statt an ihnen zu scheitern", () => {
    expect(kreisfenster([0, 40, 7], 31, 0)).toEqual([7, 7]);
    expect(kreisfenster([], 31, 0)).toBeUndefined();
  });
});

describe("faelligkeitsfenster", () => {
  it("gibt einem monatlichen Vertrag ein Tagesfenster und KEIN Monatsfenster", () => {
    const f = faelligkeitsfenster(["2026-03-03", "2026-04-02", "2026-05-04"], "monatlich");
    // Tage 2–4, gepuffert. Nach unten läuft der Puffer über den Monatsanfang hinaus und
    // landet auf dem 29. — ein Fenster vom 29. bis zum 8., und genau so gemeint: die
    // Abbuchung zum Monatsanfang kann auf den Vormonat rutschen.
    expect(f.tagVon).toBe(29);
    expect(f.tagBis).toBe(4 + TAGES_PUFFER);
    // Ein monatlicher Vertrag ist in JEDEM Monat fällig — ein Monatsfenster wäre entweder
    // „alle zwölf" oder falsch.
    expect(f.monatVon).toBeUndefined();
    expect(f.monatBis).toBeUndefined();
  });

  it("gibt einem jährlichen Vertrag beides", () => {
    const f = faelligkeitsfenster(["2024-03-10", "2025-03-11", "2026-03-09"], "jaehrlich");
    expect(f.monatVon).toBe(2);
    expect(f.monatBis).toBe(4);
    expect(f.tagVon).toBe(9 - TAGES_PUFFER);
    expect(f.tagBis).toBe(11 + TAGES_PUFFER);
  });

  it("gibt einem quartalsweisen Vertrag kein Monatsfenster", () => {
    // Seine vier Termine liegen über das Jahr verstreut; das engste Fenster, das alle
    // fasst, umspannte zehn Monate und schränkte damit nichts ein.
    const f = faelligkeitsfenster(
      ["2026-01-05", "2026-04-05", "2026-07-05", "2026-10-05"],
      "quartalsweise",
    );
    expect(f.monatVon).toBeUndefined();
    expect(f.tagVon).toBe(1);
    expect(f.tagBis).toBe(9);
  });
});

describe("spanneWeiten", () => {
  it("weitet nach beiden Seiten, wenn die Wirklichkeit weiter war als die Annahme", () => {
    // Der Fall: eine Verbrauchsabrechnung mit Nachzahlung. Sie gehört zum Vertrag und
    // fiele aus der abgeleiteten Spanne heraus.
    expect(spanneWeiten({ von: 4800, bis: 14400 }, { von: 3900, bis: 46000 })).toEqual({
      betragVon: 3900,
      betragBis: 46000,
    });
  });

  it("verengt NIE — eine eng streuende Reihe nimmt der Regel nicht ihre Luft", () => {
    // Sonst fiele die nächste Preiserhöhung still aus der Regel, und der Vertrag sähe
    // aus, als hätte er ausgesetzt.
    expect(spanneWeiten({ von: 4800, bis: 14400 }, { von: 8000, bis: 8050 })).toEqual({
      betragVon: 4800,
      betragBis: 14400,
    });
  });

  it("nimmt, was da ist, wenn eine Seite fehlt", () => {
    expect(spanneWeiten({}, { von: 500, bis: 900 })).toEqual({ betragVon: 500, betragBis: 900 });
    expect(spanneWeiten({ von: 500, bis: 900 }, undefined)).toEqual({
      betragVon: 500,
      betragBis: 900,
    });
  });
});

describe("beobachteteSpanne", () => {
  it("lässt den kleinsten Wert stehen und gibt dem größten Luft", () => {
    const s = beobachteteSpanne([-1000, 2000, 1500]);
    expect(s?.von).toBe(1000);
    expect(s?.bis).toBeGreaterThan(2000);
  });

  it("gibt nichts heraus, wenn nichts Brauchbares dabei ist", () => {
    expect(beobachteteSpanne([])).toBeUndefined();
    expect(beobachteteSpanne([0, 0])).toBeUndefined();
  });
});

describe("standardErkennung mit Vorlage", () => {
  const TERMINE = ["2026-05-02", "2026-06-01", "2026-07-02"];

  it("übernimmt das gemessene Fälligkeitsfenster in die Regel", () => {
    const vorlage = regelvorlageAus(TERMINE, [2400, 2400, 2400], "monatlich");
    const e = standardErkennung("v1", "Handelmann", 2400, undefined, vorlage);
    expect(e.tagVon).toBe(vorlage.tagVon);
    expect(e.tagBis).toBe(vorlage.tagBis);
    expect(e.tagVon).toBeDefined();
  });

  it("lässt ohne Vorlage alles beim Alten — kein geratenes Fenster", () => {
    const e = standardErkennung("v1", "Handelmann", 2400);
    expect(e.tagVon).toBeUndefined();
    expect(e.monatVon).toBeUndefined();
    expect(e.betragVon).toBe(Math.round(2400 * 0.6));
    expect(e.betragBis).toBe(Math.round(2400 * 1.8));
  });

  it("holt die Zahlung zurück, die vorher aus der Betragsspanne fiel", () => {
    // Drei gleiche Raten und eine Nachzahlung, die weit über 1,8× liegt. Ohne die
    // Messung schnitt die abgeleitete Spanne sie weg.
    const betraege = [2400, 2400, 2400, 9800];
    const vorlage = regelvorlageAus([...TERMINE, "2026-08-01"], betraege, "monatlich");
    const e = standardErkennung("v2", "Handelmann", 2400, undefined, vorlage);

    const nachzahlung: Zahlungsspur = {
      id: "b1",
      datum: "2026-08-01",
      betrag: -9800,
      gegenpartei: "Handelmann",
      charakter: "Aufwand",
    };
    expect(passtZu(e, nachzahlung)).toBe(true);
    expect(passtZu(standardErkennung("v2", "Handelmann", 2400), nachzahlung)).toBe(false);
  });

  it("hält mit dem Fenster fern, was am falschen Tag des Monats kam", () => {
    // Genau der Fall, für den das Fenster gebaut wurde: zwei Vereinbarungen beim selben
    // Empfänger, unterscheidbar nur am Termin.
    const vorlage = regelvorlageAus(TERMINE, [2400, 2400, 2400], "monatlich");
    const e = standardErkennung("v3", "Handelmann", 2400, undefined, vorlage);
    const andereRate: Zahlungsspur = {
      id: "b2",
      datum: "2026-08-20",
      betrag: -2400,
      gegenpartei: "Handelmann",
      charakter: "Aufwand",
    };
    expect(passtZu(e, andereRate)).toBe(false);
  });
});
