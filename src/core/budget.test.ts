import { describe, it, expect } from "vitest";
import { euroZuCent } from "./geld";
import {
  budgetKategorien,
  budgetRahmen,
  budgetStand,
  budgetBuchungen,
  budgetVerbrauch,
  effektiverMonatsbetrag,
  elternBudget,
  geglaetteterMonatsabfluss,
  kindBudgets,
  monatsFenster,
  verbrauchsFenster,
  type Budget,
  type BudgetSicht,
} from "./budget";
import type { IstBuchung } from "./istbuchung";
import type { Kategorie } from "./kategorie";

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: "b",
    kategorieId: "k",
    kontoId: "giro",
    betragProMonat: euroZuCent(400),
    art: "monatlich",
    start: "2026-01-01",
    ...over,
  };
}

/** Ein zweistufiger Baum: Freizeit → Urlaub, dazu eine fremde Hauptkategorie. */
const BAUM: Kategorie[] = [
  { id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "urlaub", name: "Urlaub", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "fernreise", name: "Fernreise", elternId: "urlaub", defaultCharakter: "Aufwand" },
  { id: "kino", name: "Kino", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "fremd", name: "Mobilität", defaultCharakter: "Aufwand" },
];

describe("monatsFenster", () => {
  it("liefert den Kalendermonat", () => {
    expect(monatsFenster("2026-06-14")).toEqual({ von: "2026-06-01", bis: "2026-07-01" });
  });
  it("trägt den Jahreswechsel im Dezember", () => {
    expect(monatsFenster("2026-12-20")).toEqual({ von: "2026-12-01", bis: "2027-01-01" });
  });
});

describe("verbrauchsFenster", () => {
  it("monatlich: genau der laufende Monat — zum Ersten fängt es neu an", () => {
    expect(verbrauchsFenster(budget(), "2026-06-14")).toEqual({ von: "2026-06-01", bis: "2026-07-01" });
  });
  it("aufbauend: vom Start bis zum Monatsende — nie zurückgesetzt", () => {
    expect(verbrauchsFenster(budget({ art: "aufbauend", start: "2025-03-01" }), "2026-06-14")).toEqual({
      von: "2025-03-01",
      bis: "2026-07-01",
    });
  });
});

describe("budgetRahmen", () => {
  it("monatlich: jeden Monat derselbe Betrag", () => {
    const b = budget();
    expect(budgetRahmen(b, [b], BAUM, "2026-06-14")).toBe(euroZuCent(400));
  });

  it("aufbauend: Monatsbetrag mal verstrichene Monate, der laufende zählt mit", () => {
    // Start Januar, Blick im März → Januar, Februar, März = 3 Monate.
    const b = budget({ art: "aufbauend", betragProMonat: euroZuCent(50), start: "2026-01-01" });
    expect(budgetRahmen(b, [b], BAUM, "2026-03-20")).toBe(euroZuCent(150));
  });

  it("aufbauend: im Startmonat genau eine Rate — nicht null", () => {
    const b = budget({ art: "aufbauend", betragProMonat: euroZuCent(50), start: "2026-01-01" });
    expect(budgetRahmen(b, [b], BAUM, "2026-01-31")).toBe(euroZuCent(50));
  });

  it("aufbauend: vor dem Start ist nichts da — rückwirkend füllen wäre erfunden", () => {
    const b = budget({ art: "aufbauend", betragProMonat: euroZuCent(50), start: "2026-06-01" });
    expect(budgetRahmen(b, [b], BAUM, "2026-04-10")).toBe(0);
  });
});

describe("Verschachtelung", () => {
  const dach = budget({ id: "dach", kategorieId: "freizeit", betragProMonat: euroZuCent(200) });
  const kind = budget({ id: "kind", kategorieId: "urlaub", art: "aufbauend", betragProMonat: euroZuCent(80) });
  const fremd = budget({ id: "fremd", kategorieId: "fremd", betragProMonat: euroZuCent(90) });
  const alle = [dach, kind, fremd];

  it("findet das Budget, in dem ein anderes liegt", () => {
    expect(elternBudget(kind, alle, BAUM)?.id).toBe("dach");
    expect(elternBudget(dach, alle, BAUM)).toBeUndefined();
    expect(elternBudget(fremd, alle, BAUM)).toBeUndefined();
  });

  it("bindet ein Enkelbudget an das NÄCHSTE Dach, nicht an jedes darüber", () => {
    const enkel = budget({ id: "enkel", kategorieId: "fernreise", betragProMonat: euroZuCent(30) });
    const mitEnkel = [...alle, enkel];
    expect(elternBudget(enkel, mitEnkel, BAUM)?.id).toBe("kind");
    // Sonst zöge der Enkel auf zwei Ebenen gleichzeitig ab.
    expect(kindBudgets(dach, mitEnkel, BAUM).map((b) => b.id)).toEqual(["kind"]);
  });

  it("nimmt dem Dach die Kategorien seines Kindes weg", () => {
    expect([...budgetKategorien(dach, alle, BAUM)].sort()).toEqual(["freizeit", "kino"]);
    expect([...budgetKategorien(kind, alle, BAUM)].sort()).toEqual(["fernreise", "urlaub"]);
  });

  it("rechnet den Betrag des Kindes aus dem Dach heraus", () => {
    expect(effektiverMonatsbetrag(dach, alle, BAUM)).toBe(euroZuCent(120));
    expect(effektiverMonatsbetrag(kind, alle, BAUM)).toBe(euroZuCent(80));
    // Zusammen bleibt es bei dem, was das Dach ansagt — nichts entsteht, nichts fällt weg.
    expect(effektiverMonatsbetrag(dach, alle, BAUM) + effektiverMonatsbetrag(kind, alle, BAUM))
      .toBe(dach.betragProMonat);
  });

  it("lässt einen negativen Rest stehen, statt ihn auf null zu klemmen", () => {
    // Das Kind fordert mehr, als das Dach hergibt — ein Widerspruch, den man sehen soll.
    const gierig = { ...kind, betragProMonat: euroZuCent(500) };
    expect(effektiverMonatsbetrag(dach, [dach, gierig], BAUM)).toBe(euroZuCent(-300));
  });

  it("glättet den Monatsabfluss für die Planung auf den effektiven Betrag", () => {
    expect(geglaetteterMonatsabfluss(dach, alle, BAUM)).toBe(euroZuCent(-120));
  });
});

/**
 * Eine `BudgetSicht` fürs Testen. `vertragsBuchungen` ist im Kern Pflicht — hier meist
 * leer, weil die allermeisten Fälle nichts mit Verträgen zu tun haben; die Fälle, die es
 * tun, setzen sie ausdrücklich.
 */
function sicht(
  buchungen: readonly IstBuchung[],
  budgets: readonly Budget[],
  vertragsBuchungen: ReadonlySet<string> = new Set(),
): BudgetSicht {
  return { buchungen, kategorien: BAUM, budgets, vertragsBuchungen };
}

describe("budgetVerbrauch", () => {
  function b(over: Partial<IstBuchung>): IstBuchung {
    return {
      id: "x", datum: "2026-06-10", betrag: euroZuCent(-50), kontoId: "giro",
      kategorieId: "freizeit", charakter: "Aufwand", quelle: "manuell", ...over,
    };
  }
  const dach = budget({ id: "dach", kategorieId: "freizeit" });
  const { von, bis } = monatsFenster("2026-06-14");

  it("summiert Aufwands-Abflüsse der Kategorie im Fenster (als positiver Betrag)", () => {
    const ist = [b({ id: "1", betrag: euroZuCent(-50) }), b({ id: "2", betrag: euroZuCent(-30) })];
    expect(budgetVerbrauch(sicht(ist, [dach]), dach, von, bis)).toBe(euroZuCent(80));
  });

  it("ignoriert andere Kategorien, andere Monate und Nicht-Aufwand", () => {
    const ist = [
      b({ id: "1", kategorieId: "fremd" }),
      b({ id: "2", datum: "2026-05-31" }), // vor dem Fenster
      b({ id: "3", datum: "2026-07-01" }), // bis ist exklusiv
      b({ id: "4", charakter: "Umschichtung" }), // nur ein Kontowechsel, keine Ausgabe
      b({ id: "5", charakter: "Ertrag" }),
    ];
    expect(budgetVerbrauch(sicht(ist, [dach]), dach, von, bis)).toBe(0);
  });

  it("legt dieselbe Auswahl als Einzelposten offen — Summe = Verbrauch", () => {
    // Die Oberfläche zeigt beim Aufklappen genau diese Liste. Weil `budgetVerbrauch`
    // nur noch ihre Summe ist, können Balken und Liste nicht auseinanderlaufen.
    const ist = [
      b({ id: "1", datum: "2026-06-12", kategorieId: "kino", betrag: euroZuCent(-50) }),
      b({ id: "2", datum: "2026-06-03", kategorieId: "fernreise", betrag: euroZuCent(-12) }),
      b({ id: "3", kategorieId: "fremd", betrag: euroZuCent(-99) }),
    ];
    const posten = budgetBuchungen(sicht(ist, [dach]), dach, von, bis);
    expect(posten.map((p) => [p.buchung.id, p.betrag])).toEqual([
      ["2", euroZuCent(12)],
      ["1", euroZuCent(50)],
    ]);
    expect(posten.reduce((s, p) => s + p.betrag, 0)).toBe(
      budgetVerbrauch(sicht(ist, [dach]), dach, von, bis),
    );
  });

  it("führt jeden Anteil einer geteilten Buchung als eigenen Posten", () => {
    const ist = [
      b({
        id: "geteilt", kategorieId: undefined,
        aufteilungen: [
          { kategorieId: "kino", betrag: euroZuCent(-30) },
          { kategorieId: "fremd", betrag: euroZuCent(-20) },
        ],
      }),
    ];
    const posten = budgetBuchungen(sicht(ist, [dach]), dach, von, bis);
    expect(posten).toHaveLength(1);
    expect(posten[0]).toMatchObject({ kategorieId: "kino", betrag: euroZuCent(30) });
  });

  it("lässt Vertragszahlungen draußen — sie sind anderswo geplant", () => {
    // Der Fehler, wegen dem `vertragsBuchungen` Pflichtfeld ist: auf der Übersicht stand
    // „Familie & Kinder" mit 425,00 € Verbrauch bei 110,00 € Rahmen, obwohl die 425 € die
    // Kinderbetreuung waren — ein erfasster Vertrag mit eigener Zeile im Ausblick.
    const ist = [
      b({ id: "vertrag", betrag: euroZuCent(-425) }),
      b({ id: "frei", betrag: euroZuCent(-20) }),
    ];
    expect(budgetVerbrauch(sicht(ist, [dach], new Set(["vertrag"])), dach, von, bis))
      .toBe(euroZuCent(20));
    // Und die Liste zeigt dieselbe Auswahl — nicht nur dieselbe Summe.
    expect(budgetBuchungen(sicht(ist, [dach], new Set(["vertrag"])), dach, von, bis)
      .map((p) => p.buchung.id)).toEqual(["frei"]);
  });

  it("senkt den Verbrauch bei einer Erstattung, statt ihn zu erhöhen", () => {
    const ist = [b({ id: "1", betrag: euroZuCent(-50) }), b({ id: "2", betrag: euroZuCent(20) })];
    expect(budgetVerbrauch(sicht(ist, [dach]), dach, von, bis)).toBe(euroZuCent(30));
  });

  // Der Fall, an dem der Verbrauch in der echten App auf 0 stand: Budgets hängen an den
  // Hauptkategorien, gebucht wird ausschließlich auf deren Kindern.
  it("zählt Buchungen auf Unterkategorien mit", () => {
    const ist = [
      b({ id: "1", kategorieId: "kino", betrag: euroZuCent(-50) }),
      b({ id: "2", kategorieId: "fernreise", betrag: euroZuCent(-12) }),
      b({ id: "3", kategorieId: "fremd", betrag: euroZuCent(-99) }),
    ];
    expect(budgetVerbrauch(sicht(ist, [dach]), dach, von, bis)).toBe(euroZuCent(62));
  });

  it("lässt den Verbrauch eines eingebetteten Budgets beim Dach draussen", () => {
    const kind = budget({ id: "kind", kategorieId: "urlaub", art: "aufbauend" });
    const alle = [dach, kind];
    const ist = [
      b({ id: "1", kategorieId: "kino", betrag: euroZuCent(-50) }),
      b({ id: "2", kategorieId: "fernreise", betrag: euroZuCent(-12) }), // gehört dem Kind
    ];
    expect(budgetVerbrauch(sicht(ist, alle), dach, von, bis)).toBe(euroZuCent(50));
    expect(budgetVerbrauch(sicht(ist, alle), kind, von, bis)).toBe(euroZuCent(12));
  });

  it("belastet ein Budget bei geteilten Buchungen nur mit seinem Teil", () => {
    const ist = [
      b({
        id: "1", kategorieId: undefined, betrag: euroZuCent(-100),
        aufteilungen: [
          { kategorieId: "kino", betrag: euroZuCent(-40) },
          { kategorieId: "fremd", betrag: euroZuCent(-60) },
        ],
      }),
    ];
    expect(budgetVerbrauch(sicht(ist, [dach]), dach, von, bis)).toBe(euroZuCent(40));
  });
});

describe("budgetStand", () => {
  const ist: IstBuchung[] = [
    { id: "1", datum: "2026-01-20", betrag: euroZuCent(-30), kontoId: "giro", kategorieId: "urlaub", charakter: "Aufwand", quelle: "manuell" },
    { id: "2", datum: "2026-03-05", betrag: euroZuCent(-20), kontoId: "giro", kategorieId: "urlaub", charakter: "Aufwand", quelle: "manuell" },
  ];

  it("monatlich: nur der laufende Monat zählt gegen den Monatsbetrag", () => {
    const b = budget({ kategorieId: "urlaub", betragProMonat: euroZuCent(100) });
    expect(budgetStand(sicht(ist, [b]), b, "2026-03-15")).toEqual({
      rahmen: euroZuCent(100),
      verbraucht: euroZuCent(20),
      rest: euroZuCent(80),
    });
  });

  it("aufbauend: alles seit dem Start gegen die Summe aller Raten", () => {
    const b = budget({ kategorieId: "urlaub", art: "aufbauend", betragProMonat: euroZuCent(100), start: "2026-01-01" });
    expect(budgetStand(sicht(ist, [b]), b, "2026-03-15")).toEqual({
      rahmen: euroZuCent(300), // Januar + Februar + März
      verbraucht: euroZuCent(50), // beide Buchungen
      rest: euroZuCent(250),
    });
  });

  it("meldet einen negativen Rest, wenn mehr ausgegeben wurde als da war", () => {
    const b = budget({ kategorieId: "urlaub", betragProMonat: euroZuCent(10) });
    expect(budgetStand(sicht(ist, [b]), b, "2026-03-15").rest).toBe(euroZuCent(-10));
  });
});
