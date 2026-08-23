// Der wichtigste Test dieser Datei ist der letzte: die Fortschreibung muss auf denselben
// Rest kommen wie `budgetStand`. Sie ist dessen Zerlegung, keine zweite Rechnung — und
// zwei Zahlen für dieselbe Sache im selben Bild haben die Budgetrechnung hier schon
// einmal auseinandergetrieben.

import { describe, it, expect } from "vitest";
import { euroZuCent } from "../basis/geld";
import { budgetStand, type Budget, type BudgetSicht } from "./budget";
import {
  budgetFortschreibung,
  budgetMonatsstand,
  fruehesterVerlaufsmonat,
  verlaufsfenster,
} from "./budgetverlauf";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Kategorie } from "../kategorien/kategorie";

const BAUM: Kategorie[] = [
  { id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "urlaub", name: "Urlaub", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "fremd", name: "Mobilität", defaultCharakter: "Aufwand" },
];

/** Wie in `budget.test.ts`: `betragProMonat` wird zur Reihe mit einer Version. */
function budget(over: Partial<Budget> & { betragProMonat?: number } = {}): Budget {
  const { betragProMonat = euroZuCent(50), ...rest } = over;
  const basis = {
    id: "b", kategorieId: "urlaub", kontoId: "giro",
    art: "aufbauend" as const, start: "2026-01-01", ...rest,
  };
  return {
    ...basis,
    betraege: rest.betraege ?? [{ abMonat: basis.start.slice(0, 7), betrag: betragProMonat }],
  };
}

function buchung(over: Partial<IstBuchung>): IstBuchung {
  return {
    id: "x", datum: "2026-03-10", betrag: euroZuCent(-30), kontoId: "giro",
    kategorieId: "urlaub", charakter: "Aufwand", quelle: "manuell", ...over,
  };
}

function sicht(buchungen: readonly IstBuchung[], budgets: readonly Budget[]): BudgetSicht {
  return { buchungen, kategorien: BAUM, budgets, vertragsBuchungen: new Set() };
}

describe("verlaufsfenster", () => {
  it("zählt den Monat von `am` mit — zwölf Monate heisst elf zurück", () => {
    expect(verlaufsfenster("2026-08-23", 12)).toEqual({ vonMonat: "2025-09", bisMonat: "2026-08" });
  });
  it("trägt den Jahreswechsel", () => {
    expect(verlaufsfenster("2026-02-01", 3)).toEqual({ vonMonat: "2025-12", bisMonat: "2026-02" });
  });
});

describe("fruehesterVerlaufsmonat", () => {
  it("begrenzt das Aufbauende auf seinen Startmonat", () => {
    expect(fruehesterVerlaufsmonat(budget({ start: "2026-04-15" }))).toBe("2026-04");
  });
  it("lässt das Monatliche unbegrenzt — dort steht jeder Monat für sich", () => {
    // Es bekommt keinen erfundenen Rahmen für die Zeit davor, sondern `ohnePlan` (siehe
    // unten). Eine Untergrenze liesse vom Verlauf oft einen einzigen Balken übrig: ein
    // monatliches Budget trägt als `start` den Tag, an dem es angelegt wurde.
    const b = budget({ art: "monatlich", betraege: [{ abMonat: "2026-03", betrag: euroZuCent(200) }] });
    expect(fruehesterVerlaufsmonat(b)).toBeNull();
  });
});

describe("budgetFortschreibung, monatlich", () => {
  const b = budget({ art: "monatlich", betragProMonat: euroZuCent(200) });

  it("fängt jeden Monat wieder bei null an — kein Übertrag", () => {
    const ist = [buchung({ id: "1", datum: "2026-02-10", betrag: euroZuCent(-40) })];
    const reihe = budgetFortschreibung(sicht(ist, [b]), b, "2026-02", "2026-04");
    expect(reihe.map((m) => [m.monat, m.uebertrag, m.verfuegbar, m.verbraucht, m.rest])).toEqual([
      ["2026-02", 0, euroZuCent(200), euroZuCent(40), euroZuCent(160)],
      // Die 160 aus dem Februar sind im März weg — genau das heisst „monatlich".
      ["2026-03", 0, euroZuCent(200), 0, euroZuCent(200)],
      ["2026-04", 0, euroZuCent(200), 0, euroZuCent(200)],
    ]);
  });

  it("zeigt die Monate vor der ersten Version — ohne Rahmen, aber mit dem Verbrauch", () => {
    const spaet = budget({ art: "monatlich", betragProMonat: euroZuCent(200), start: "2026-06-01" });
    const ist = [buchung({ id: "1", datum: "2026-04-10", betrag: euroZuCent(-70) })];
    const reihe = budgetFortschreibung(sicht(ist, [spaet]), spaet, "2026-04", "2026-06");

    // April und Mai: kein Rahmen (es gab noch keinen), aber die Ausgabe ist eine Tatsache.
    expect(reihe.map((m) => [m.monat, m.zufuehrung, m.verbraucht, m.ohnePlan])).toEqual([
      ["2026-04", 0, euroZuCent(70), true],
      ["2026-05", 0, 0, true],
      ["2026-06", euroZuCent(200), 0, undefined],
    ]);
    // Und der Anfang der Planung ist KEINE Rahmenänderung — „vorher 0,00" wäre die
    // falsche Auskunft.
    expect(reihe[2].zufuehrungVorher).toBeUndefined();
  });
});

describe("budgetFortschreibung, aufbauend", () => {
  const b = budget({ betragProMonat: euroZuCent(50), start: "2026-01-01" });

  it("nimmt den Rest in den Folgemonat mit", () => {
    const ist = [buchung({ id: "1", datum: "2026-03-10", betrag: euroZuCent(-30) })];
    const reihe = budgetFortschreibung(sicht(ist, [b]), b, "2026-01", "2026-04");
    expect(reihe.map((m) => [m.monat, m.uebertrag, m.zufuehrung, m.verbraucht, m.rest])).toEqual([
      ["2026-01", 0, euroZuCent(50), 0, euroZuCent(50)],
      ["2026-02", euroZuCent(50), euroZuCent(50), 0, euroZuCent(100)],
      ["2026-03", euroZuCent(100), euroZuCent(50), euroZuCent(30), euroZuCent(120)],
      ["2026-04", euroZuCent(120), euroZuCent(50), 0, euroZuCent(170)],
    ]);
  });

  it("beginnt nicht vor dem Start, auch wenn das Fenster weiter zurückreicht", () => {
    const reihe = budgetFortschreibung(sicht([], [b]), b, "2025-08", "2026-02");
    expect(reihe.map((m) => m.monat)).toEqual(["2026-01", "2026-02"]);
  });

  it("holt den Übertrag aus der Vorgeschichte, statt bei null anzufangen", () => {
    // Zwölf-Monats-Fenster auf ein Budget, das lange vorher angefangen hat: ohne die
    // Vorgeschichte sähe es aus, als sammle es gerade erst an.
    const ist = [buchung({ id: "1", datum: "2026-02-10", betrag: euroZuCent(-20) })];
    const reihe = budgetFortschreibung(sicht(ist, [b]), b, "2026-05", "2026-06");
    // Jan–Apr: 4 × 50 = 200, davon 20 im Februar weg → 180 kommen im Mai an.
    expect(reihe[0].uebertrag).toBe(euroZuCent(180));
    expect(reihe[0].rest).toBe(euroZuCent(230));
  });

  it("zählt im Startmonat erst ab dem Starttag — wie `verbrauchsFenster` auch", () => {
    const spaet = budget({ start: "2026-01-20" });
    const ist = [
      buchung({ id: "vorher", datum: "2026-01-05", betrag: euroZuCent(-99) }),
      buchung({ id: "nachher", datum: "2026-01-25", betrag: euroZuCent(-10) }),
    ];
    const reihe = budgetFortschreibung(sicht(ist, [spaet]), spaet, "2026-01", "2026-01");
    expect(reihe[0].von).toBe("2026-01-20");
    expect(reihe[0].verbraucht).toBe(euroZuCent(10));
  });

  it("rechnet die Verschachtelung mit — das Kind nimmt dem Dach seine Rate weg", () => {
    const dach = budget({ id: "dach", kategorieId: "freizeit", art: "aufbauend", betragProMonat: euroZuCent(200) });
    const kind = budget({ id: "kind", kategorieId: "urlaub", art: "aufbauend", betragProMonat: euroZuCent(80) });
    const reihe = budgetFortschreibung(sicht([], [dach, kind]), dach, "2026-01", "2026-02");
    expect(reihe.map((m) => m.zufuehrung)).toEqual([euroZuCent(120), euroZuCent(120)]);
  });
});

describe("budgetMonatsstand", () => {
  const b = budget({ betragProMonat: euroZuCent(50), start: "2026-01-01" });

  it("liefert genau den einen Monat, mit Übertrag aus allem davor", () => {
    const ist = [buchung({ id: "1", datum: "2026-03-10", betrag: euroZuCent(-30) })];
    const m = budgetMonatsstand(sicht(ist, [b]), b, "2026-04-15");
    expect([m.monat, m.uebertrag, m.zufuehrung, m.verbraucht, m.rest]).toEqual([
      "2026-04", euroZuCent(120), euroZuCent(50), 0, euroZuCent(170),
    ]);
  });

  it("gibt für einen Monat vor dem Start einen leeren Monat, keine erfundene Rate", () => {
    const spaet = budget({ start: "2026-06-01" });
    const m = budgetMonatsstand(sicht([], [spaet]), spaet, "2026-04-10");
    expect([m.zufuehrung, m.verfuegbar, m.rest]).toEqual([0, 0, 0]);
  });
});

describe("Fortschreibung und budgetStand kommen auf denselben Rest", () => {
  /**
   * Die Algebra dahinter: `verfuegbar − verbrauchtImMonat` ist dasselbe wie
   * `rahmenKumuliert − verbrauchtKumuliert`, weil sich der bis dahin angefallene
   * Verbrauch aus beiden Seiten herauskürzt. Der Test prüft es an Daten, damit es auch
   * dann noch stimmt, wenn jemand an einer der beiden Seiten schraubt.
   */
  const ist = [
    buchung({ id: "1", datum: "2026-01-15", betrag: euroZuCent(-12) }),
    buchung({ id: "2", datum: "2026-03-02", betrag: euroZuCent(-140) }),
    buchung({ id: "3", datum: "2026-03-20", betrag: euroZuCent(25) }), // Erstattung
    buchung({ id: "4", datum: "2026-05-08", betrag: euroZuCent(-60) }),
    buchung({ id: "5", datum: "2026-05-09", kategorieId: "fremd", betrag: euroZuCent(-500) }),
  ];
  const monate = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

  for (const art of ["monatlich", "aufbauend"] as const) {
    it(`${art}: Monat für Monat derselbe Rest wie budgetStand`, () => {
      const b = budget({ art, betragProMonat: euroZuCent(50), start: "2026-01-01" });
      const s = sicht(ist, [b]);
      const reihe = budgetFortschreibung(s, b, monate[0], monate[monate.length - 1]);
      expect(reihe).toHaveLength(monate.length);
      for (const m of reihe) {
        expect(m.rest).toBe(budgetStand(s, b, `${m.monat}-28`).rest);
      }
    });
  }

  it("aufbauend: gilt auch, wenn das Fenster erst mitten in der Historie beginnt", () => {
    const b = budget({ art: "aufbauend", betragProMonat: euroZuCent(50), start: "2026-01-01" });
    const s = sicht(ist, [b]);
    for (const m of budgetFortschreibung(s, b, "2026-04", "2026-06")) {
      expect(m.rest).toBe(budgetStand(s, b, `${m.monat}-28`).rest);
    }
  });

  it("aufbauend: gilt auch bei einem Start mitten im Monat", () => {
    const b = budget({ art: "aufbauend", betragProMonat: euroZuCent(50), start: "2026-01-20" });
    const s = sicht(ist, [b]);
    for (const m of budgetFortschreibung(s, b, "2026-01", "2026-06")) {
      expect(m.rest).toBe(budgetStand(s, b, `${m.monat}-28`).rest);
    }
  });
});

/**
 * Der Betrag ist versioniert — und die Fortschreibung ist die Stelle, an der man das
 * sieht: jeder Monat bekommt die Rate, die DAMALS galt.
 */
describe("Betragsversionen", () => {
  const zweiStufen = budget({
    art: "monatlich",
    betraege: [
      { abMonat: "2026-01", betrag: euroZuCent(200) },
      { abMonat: "2026-04", betrag: euroZuCent(300) },
    ],
  });

  it("gibt jedem Monat die Rate, die damals galt", () => {
    const reihe = budgetFortschreibung(sicht([], [zweiStufen]), zweiStufen, "2026-02", "2026-05");
    expect(reihe.map((m) => [m.monat, m.zufuehrung])).toEqual([
      ["2026-02", euroZuCent(200)],
      ["2026-03", euroZuCent(200)],
      ["2026-04", euroZuCent(300)],
      ["2026-05", euroZuCent(300)],
    ]);
  });

  it("merkt den Monat an, in dem sich die Rate ändert", () => {
    const reihe = budgetFortschreibung(sicht([], [zweiStufen]), zweiStufen, "2026-02", "2026-05");
    // Nur der Wechselmonat trägt die Marke — sonst stünde an jedem Balken ein Hinweis.
    expect(reihe.map((m) => m.zufuehrungVorher)).toEqual([
      undefined, undefined, euroZuCent(200), undefined,
    ]);
  });

  it("hält die Marke am ANFANG der Reihe zurück, wenn sie mitten in der Historie beginnt", () => {
    // Sonst wäre die erste Zeile jedes Zwölf-Monats-Fensters eine Änderung — sie hat nun
    // einmal keinen Vorgänger IN der Reihe, aber sehr wohl einen davor.
    const reihe = budgetFortschreibung(sicht([], [zweiStufen]), zweiStufen, "2026-04", "2026-05");
    expect(reihe[0].monat).toBe("2026-04");
    expect(reihe[0].zufuehrungVorher).toBe(euroZuCent(200));

    const abAnfang = budgetFortschreibung(sicht([], [zweiStufen]), zweiStufen, "2026-01", "2026-02");
    expect(abAnfang[0].zufuehrungVorher).toBeUndefined();
  });

  it("aufbauend: sammelt mit der jeweils gültigen Rate, nicht mit der heutigen", () => {
    const b = budget({
      art: "aufbauend",
      start: "2026-01-01",
      betraege: [
        { abMonat: "2026-01", betrag: euroZuCent(50) },
        { abMonat: "2026-03", betrag: euroZuCent(100) },
      ],
    });
    const reihe = budgetFortschreibung(sicht([], [b]), b, "2026-01", "2026-04");
    // 50 + 50 + 100 + 100 = 300 — und NICHT 4 × 100, wie eine Multiplikation es rechnete.
    expect(reihe.map((m) => m.rest)).toEqual([
      euroZuCent(50), euroZuCent(100), euroZuCent(200), euroZuCent(300),
    ]);
    expect(budgetStand(sicht([], [b]), b, "2026-04-28").rest).toBe(euroZuCent(300));
  });

  it("aufbauend: holt auch den Übertrag mit den damaligen Raten, nicht mit der heutigen", () => {
    const b = budget({
      art: "aufbauend",
      start: "2026-01-01",
      betraege: [
        { abMonat: "2026-01", betrag: euroZuCent(50) },
        { abMonat: "2026-03", betrag: euroZuCent(100) },
      ],
    });
    // Fenster erst ab April: der Übertrag kommt aus der Vorgeschichte und muss dieselben
    // 300 ergeben wie die durchgerechnete Reihe oben.
    const reihe = budgetFortschreibung(sicht([], [b]), b, "2026-04", "2026-04");
    expect(reihe[0].uebertrag).toBe(euroZuCent(200));
    expect(reihe[0].rest).toBe(euroZuCent(300));
  });

  it("bleibt mit budgetStand im Gleichschritt, auch über einen Wechsel hinweg", () => {
    const ist = [
      buchung({ id: "1", datum: "2026-02-10", betrag: euroZuCent(-40) }),
      buchung({ id: "2", datum: "2026-04-11", betrag: euroZuCent(-260) }),
    ];
    for (const art of ["monatlich", "aufbauend"] as const) {
      const b = budget({
        art,
        start: "2026-01-01",
        betraege: [
          { abMonat: "2026-01", betrag: euroZuCent(200) },
          { abMonat: "2026-04", betrag: euroZuCent(300) },
        ],
      });
      const s = sicht(ist, [b]);
      for (const m of budgetFortschreibung(s, b, "2026-01", "2026-06")) {
        expect([art, m.monat, m.rest]).toEqual([art, m.monat, budgetStand(s, b, `${m.monat}-28`).rest]);
      }
    }
  });
});
