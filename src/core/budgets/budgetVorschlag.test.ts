import { describe, expect, it } from "vitest";
import { budgetvorschlaege } from "./budgetVorschlag";
import type { Kategorie } from "../kategorien/kategorie";
import type { IstBuchung } from "../buchung/istbuchung";

const KATEGORIEN: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" },
  { id: "leben", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "essen", name: "Lebensmittel", elternId: "leben", defaultCharakter: "Aufwand" },
  { id: "restaurant", name: "Auswärts essen", elternId: "leben", defaultCharakter: "Aufwand" },
];

/** Eine Buchung je Monat, rückwärts ab `bis`. */
function monatlich(opts: {
  praefix: string;
  kategorieId: string;
  betrag: number; // positiv = Ausgabe
  monate?: number;
  bis?: string; // „YYYY-MM"
  charakter?: IstBuchung["charakter"];
}): IstBuchung[] {
  const [j, m] = (opts.bis ?? "2026-08").split("-").map(Number);
  const buchungen: IstBuchung[] = [];
  for (let i = 0; i < (opts.monate ?? 12); i++) {
    const gesamt = j * 12 + (m - 1) - i;
    const datum = `${String(Math.floor(gesamt / 12)).padStart(4, "0")}-${String((gesamt % 12) + 1).padStart(2, "0")}-15`;
    buchungen.push({
      id: `${opts.praefix}-${i}`,
      datum,
      betrag: -opts.betrag,
      kontoId: "k1",
      charakter: opts.charakter ?? "Aufwand",
      quelle: "import",
      kategorieId: opts.kategorieId,
    });
  }
  return buchungen;
}

/**
 * Buchungen an genau diesen Stellen des Zwölf-Monats-Fensters bis „2026-08":
 * 0 ist der älteste Monat, 11 der jüngste. Das Fenster ist der Bezugsrahmen für den
 * aufbauenden Fall, deshalb wird hier über Positionen gesprochen und nicht über Daten.
 */
function anStellen(opts: {
  praefix: string;
  kategorieId: string;
  betrag: number;
  stellen: readonly number[];
}): IstBuchung[] {
  const basis = 2026 * 12 + 7; // 2026-08
  return opts.stellen.map((stelle, i) => {
    const gesamt = basis - (11 - stelle);
    const datum = `${String(Math.floor(gesamt / 12)).padStart(4, "0")}-${String((gesamt % 12) + 1).padStart(2, "0")}-15`;
    return {
      id: `${opts.praefix}-${i}`,
      datum,
      betrag: -opts.betrag,
      kontoId: "k1",
      charakter: "Aufwand" as const,
      quelle: "import" as const,
      kategorieId: opts.kategorieId,
    };
  });
}

/** Füllt alle zwölf Monate, damit die Historie als beobachtet gilt. */
const HINTERGRUND = monatlich({ praefix: "hg", kategorieId: "essen", betrag: 40000 });

describe("budgetvorschlaege", () => {
  it("schlägt den Median der Monatssummen vor, auf zehn gerundet", () => {
    // 12 Monate à 43,70 € → Median 4370 Cent → Vorschlag 40,00 €.
    const v = budgetvorschlaege(monatlich({ praefix: "a", kategorieId: "essen", betrag: 4370 }), KATEGORIEN, "2026-08");
    expect(v).toHaveLength(1);
    expect(v[0].kategorieId).toBe("leben"); // die HAUPTkategorie, nicht „Lebensmittel"
    expect(v[0].name).toBe("Lebenshaltung");
    expect(v[0].proMonat).toBe(4370);
    expect(v[0].vorschlag).toBe(4000);
    expect(v[0].monate).toBe(12);
  });

  it("fasst Unterkategorien unter ihrer Hauptkategorie zusammen", () => {
    const v = budgetvorschlaege(
      [...monatlich({ praefix: "a", kategorieId: "essen", betrag: 30000 }),
       ...monatlich({ praefix: "b", kategorieId: "restaurant", betrag: 12000 })],
      KATEGORIEN,
      "2026-08",
    );
    expect(v).toHaveLength(1);
    expect(v[0].proMonat).toBe(42000);
  });

  /**
   * Der Kern der Sache: eine Kategorie, die nur aus Verträgen besteht, lässt sich nicht
   * steuern. Ein Budget wäre dort eine Zahl, die man jeden Monat exakt trifft. Auf echten
   * Daten traf das drei von sieben Hauptkategorien.
   */
  it("schlägt keine Kategorie vor, die vertraglich gebunden ist", () => {
    const miete = monatlich({ praefix: "m", kategorieId: "miete", betrag: 47000 });
    const ohne = budgetvorschlaege(miete, KATEGORIEN, "2026-08");
    expect(ohne.map((x) => x.name)).toEqual(["Wohnen"]);

    const mit = budgetvorschlaege(miete, KATEGORIEN, "2026-08", new Set(miete.map((b) => b.id)));
    expect(mit).toEqual([]);
  });

  /**
   * Der Fall aus den echten Daten: „Wohnen" liegt bei 557 €/Monat, davon sind 496 € Miete
   * und Nebenkosten — steuerbar bleiben 61 €. Absolut wäre das ein Rahmen (über der
   * Kleinbetragsgrenze), fachlich ist es keiner: 11 % der Kategorie steuern zu wollen,
   * während 89 % fest sind, erzeugt nur ein Budget, das nichts sagt.
   */
  it("schlägt keine Kategorie vor, die überwiegend vertraglich ist", () => {
    const fest = monatlich({ praefix: "f", kategorieId: "miete", betrag: 49600 });
    const rest = monatlich({ praefix: "r", kategorieId: "wohnen", betrag: 6100 });
    const v = budgetvorschlaege([...fest, ...rest], KATEGORIEN, "2026-08", new Set(fest.map((b) => b.id)));
    expect(v).toEqual([]);
  });

  it("zieht den vertraglich gebundenen Teil vom Vorschlag ab", () => {
    const vertrag = monatlich({ praefix: "v", kategorieId: "essen", betrag: 10000 });
    const rest = monatlich({ praefix: "r", kategorieId: "restaurant", betrag: 30000 });
    const v = budgetvorschlaege([...vertrag, ...rest], KATEGORIEN, "2026-08", new Set(vertrag.map((b) => b.id)));
    expect(v).toHaveLength(1);
    expect(v[0].proMonat).toBe(40000);
    expect(v[0].vertragsanteil).toBe(10000);
    expect(v[0].vorschlag).toBe(30000);
  });

  it("überspringt Kategorien mit zu wenigen Monaten", () => {
    const v = budgetvorschlaege(monatlich({ praefix: "a", kategorieId: "essen", betrag: 20000, monate: 3 }), KATEGORIEN, "2026-08");
    expect(v).toEqual([]);
  });

  it("überspringt Kleinbeträge, für die sich kein Rahmen lohnt", () => {
    const v = budgetvorschlaege(monatlich({ praefix: "a", kategorieId: "essen", betrag: 500 }), KATEGORIEN, "2026-08");
    expect(v).toEqual([]);
  });

  it("überspringt, wofür es schon ein Budget gibt", () => {
    const buchungen = monatlich({ praefix: "a", kategorieId: "essen", betrag: 40000 });
    expect(budgetvorschlaege(buchungen, KATEGORIEN, "2026-08")).toHaveLength(1);
    expect(budgetvorschlaege(buchungen, KATEGORIEN, "2026-08", new Set(), new Set(["leben"]))).toEqual([]);
  });

  it("zählt nur Aufwand — Sparen und Einnahmen gehören in kein Ausgabenbudget", () => {
    const v = budgetvorschlaege(
      monatlich({ praefix: "a", kategorieId: "essen", betrag: 40000, charakter: "Umschichtung" }),
      KATEGORIEN,
      "2026-08",
    );
    expect(v).toEqual([]);
  });

  it("verrechnet eine Erstattung, statt sie aufzuaddieren", () => {
    const kauf = monatlich({ praefix: "a", kategorieId: "essen", betrag: 40000 });
    const retoure = monatlich({ praefix: "b", kategorieId: "essen", betrag: -10000 }); // positiver Aufwand
    const v = budgetvorschlaege([...kauf, ...retoure], KATEGORIEN, "2026-08");
    expect(v[0].proMonat).toBe(30000);
  });

  /** Eine geteilte Buchung gehört anteilig in beide Kategorien, nicht voll in eine. */
  it("verteilt eine geteilte Buchung auf ihre Anteile", () => {
    const buchungen = monatlich({ praefix: "a", kategorieId: "essen", betrag: 40000 }).map((b) => ({
      ...b,
      aufteilungen: [
        { kategorieId: "essen", betrag: -25000 },
        { kategorieId: "miete", betrag: -15000 },
      ],
    }));
    const v = budgetvorschlaege(buchungen, KATEGORIEN, "2026-08");
    const nach = new Map(v.map((x) => [x.name, x.proMonat]));
    expect(nach.get("Lebenshaltung")).toBe(25000);
    expect(nach.get("Wohnen")).toBe(15000);
  });

  it("wertet nur das Zeitfenster aus", () => {
    const alt = monatlich({ praefix: "alt", kategorieId: "essen", betrag: 90000, bis: "2024-08" });
    const neu = monatlich({ praefix: "neu", kategorieId: "essen", betrag: 20000 });
    const v = budgetvorschlaege([...alt, ...neu], KATEGORIEN, "2026-08");
    expect(v[0].proMonat).toBe(20000);
  });

  /** Die Schwankung sagt, wie oft der Rahmen reißen wird. */
  it("meldet den Ausreißer-Monat als Schwankung", () => {
    const buchungen = monatlich({ praefix: "a", kategorieId: "essen", betrag: 20000 });
    buchungen[0] = { ...buchungen[0], betrag: -100000 };
    const v = budgetvorschlaege(buchungen, KATEGORIEN, "2026-08");
    expect(v[0].proMonat).toBe(20000);
    expect(v[0].schwankung).toBe(5);
  });

  it("kommt mit leerer Eingabe und unbekannten Kategorien zurecht", () => {
    expect(budgetvorschlaege([], KATEGORIEN, "2026-08")).toEqual([]);
    const fremd = monatlich({ praefix: "a", kategorieId: "gibtsnicht", betrag: 40000 });
    expect(budgetvorschlaege(fremd, KATEGORIEN, "2026-08")).toEqual([]);
  });

  it("nennt bei jedem Vorschlag die Art", () => {
    const v = budgetvorschlaege(HINTERGRUND, KATEGORIEN, "2026-08");
    expect(v[0].art).toBe("monatlich");
  });
});

/**
 * Der Fall, der vorher ganz herausfiel: zweimal im Jahr etwas Großes. Ein monatlicher
 * Rahmen wäre hier sinnlos — elf Monate bliebe er unberührt, im zwölften risse er.
 */
describe("budgetvorschlaege — aufbauend", () => {
  it("schlägt für seltene große Ausgaben ein aufbauendes Budget vor", () => {
    const selten = anStellen({ praefix: "s", kategorieId: "miete", betrag: 60000, stellen: [1, 7] });
    const v = budgetvorschlaege([...HINTERGRUND, ...selten], KATEGORIEN, "2026-08");
    const wohnen = v.find((x) => x.name === "Wohnen");
    expect(wohnen?.art).toBe("aufbauend");
    // 2 × 600 € über zwölf beobachtete Monate → 100 € im Monat.
    expect(wohnen?.proMonat).toBe(10000);
    expect(wohnen?.vorschlag).toBe(10000);
    // Und die Kategorie mit Ausgaben in jedem Monat bleibt monatlich.
    expect(v.find((x) => x.name === "Lebenshaltung")?.art).toBe("monatlich");
  });

  it("mittelt über alle beobachteten Monate, nicht nur über die mit Ausgaben", () => {
    const einmal = anStellen({ praefix: "s", kategorieId: "miete", betrag: 120000, stellen: [2] });
    const v = budgetvorschlaege([...HINTERGRUND, ...einmal], KATEGORIEN, "2026-08");
    // Über die belegten Monate gemittelt wären es 1200 € — der Vorschlag wäre
    // hundertmal zu hoch und das Budget nach einem Monat gesprengt.
    expect(v.find((x) => x.name === "Wohnen")?.proMonat).toBe(10000);
  });

  it("hält eine neue Kategorie für neu und nicht für selten", () => {
    // Dieselbe Anzahl belegter Monate wie oben, aber sie liegen am jüngsten Ende:
    // das ist ein Posten, der gerade erst angefangen hat.
    const neu = anStellen({ praefix: "s", kategorieId: "miete", betrag: 60000, stellen: [10, 11] });
    const v = budgetvorschlaege([...HINTERGRUND, ...neu], KATEGORIEN, "2026-08");
    expect(v.find((x) => x.name === "Wohnen")).toBeUndefined();
  });

  it("schlägt ohne genug Historie nichts Aufbauendes vor", () => {
    // Ein halbes Jahr Daten: eine jährliche Zahlung ist von einer einmaligen nicht zu
    // unterscheiden.
    const kurz = monatlich({ praefix: "hg", kategorieId: "essen", betrag: 40000, monate: 6 });
    const selten = anStellen({ praefix: "s", kategorieId: "miete", betrag: 60000, stellen: [6, 8] });
    const v = budgetvorschlaege([...kurz, ...selten], KATEGORIEN, "2026-08");
    expect(v.map((x) => x.name)).toEqual(["Lebenshaltung"]);
  });

  it("zieht auch beim aufbauenden Vorschlag den vertraglich gebundenen Teil ab", () => {
    const selten = anStellen({ praefix: "s", kategorieId: "miete", betrag: 60000, stellen: [1, 7] });
    const v = budgetvorschlaege(
      [...HINTERGRUND, ...selten],
      KATEGORIEN,
      "2026-08",
      new Set([selten[0].id]),
    );
    const wohnen = v.find((x) => x.name === "Wohnen");
    // 600 € von 1200 € hängen an einem Vertrag → über zwölf Monate 50 € im Monat.
    expect(wohnen?.vertragsanteil).toBe(5000);
    expect(wohnen?.vorschlag).toBe(5000);
  });
});
