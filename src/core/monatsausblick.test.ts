import { describe, it, expect } from "vitest";
import { euroZuCent } from "./basis/geld";
import { monatsAusblick, monatsAusblicke, type AusblickZeileId } from "./monatsausblick";
import type { Budget } from "./budgets/budget";
import type { IstBuchung } from "./buchung/istbuchung";
import type { Kategorie } from "./kategorien/kategorie";
import type { Zahlungsregel } from "./basis/zahlungsregel";

const KATEGORIEN: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", elternId: "wohnen", defaultCharakter: "Aufwand" },
  { id: "lebenshaltung", name: "Lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "lebensmittel", name: "Lebensmittel", elternId: "lebenshaltung", defaultCharakter: "Aufwand" },
  { id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "sport", name: "Sport", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

function regel(over: Partial<Zahlungsregel> = {}): Zahlungsregel {
  return {
    id: "r-miete",
    bezeichnung: "Vermieter",
    betrag: euroZuCent(-471.41),
    rhythmus: "monatlich",
    startdatum: "2026-01-04",
    charakter: "Aufwand",
    kategorieId: "miete",
    ...over,
  };
}

function ist(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "i1",
    datum: "2026-08-05",
    betrag: euroZuCent(-459.25),
    kontoId: "giro",
    kategorieId: "miete",
    charakter: "Aufwand",
    quelle: "import",
    ...over,
  };
}

/** `betragProMonat` ist Bequemlichkeit der Fabrik und wird zur Reihe mit einer Version. */
const budget = (over: Partial<Budget> & { betragProMonat?: number } = {}): Budget => {
  const { betragProMonat = euroZuCent(430), ...rest } = over;
  const basis = {
    id: "b1",
    kategorieId: "lebenshaltung",
    kontoId: "giro",
    art: "monatlich" as const,
    start: "2026-01-01",
    ...rest,
  };
  return {
    ...basis,
    betraege: rest.betraege ?? [{ abMonat: basis.start.slice(0, 7), betrag: betragProMonat }],
  };
};

const basis = {
  regeln: [], budgets: [], ist: [], kategorien: KATEGORIEN,
  // Pflichtfeld: „keine Vertragszuordnung bekannt" ist eine Aussage und muss dastehen.
  vertragsBuchungen: new Set<string>(), heute: "2026-08-16",
};
const zeile = (a: ReturnType<typeof monatsAusblick>, id: AusblickZeileId) =>
  a.zeilen.find((z) => z.id === id);

describe("monatsAusblick — Fenster und Zeitbezug", () => {
  it("beschreibt den laufenden Monat als laufend, nicht als Zukunft", () => {
    const a = monatsAusblick({ ...basis, monatAb: "2026-08-01" });
    expect([a.label, a.von, a.bis]).toEqual(["2026-08", "2026-08-01", "2026-09-01"]);
    expect([a.laufend, a.zukunft]).toEqual([true, false]);
  });

  it("hat für kommende Monate keine Ist-Spalte", () => {
    const a = monatsAusblick({ ...basis, ist: [ist()], monatAb: "2026-09-01" });
    expect(a.zukunft).toBe(true);
    expect(a.restIst).toBeNull();
  });

  it("trägt den Jahreswechsel korrekt über", () => {
    const a = monatsAusblick({ ...basis, monatAb: "2026-12-01" });
    expect(a.bis).toBe("2027-01-01");
  });
});

describe("monatsAusblick — Plan-Spalte aus den Verträgen", () => {
  it("rechnet Einnahmen, Verträge und Budgets zum Rest auf", () => {
    const a = monatsAusblick({
      ...basis,
      regeln: [
        regel(),
        regel({ id: "r-lohn", bezeichnung: "Arbeitgeber", betrag: euroZuCent(2475.36), charakter: "Ertrag", kategorieId: "gehalt", startdatum: "2026-01-28" }),
      ],
      budgets: [budget()],
      monatAb: "2026-09-01",
    });

    expect(zeile(a, "einnahmen")!.plan).toBe(euroZuCent(2475.36));
    expect(zeile(a, "vertraege")!.plan).toBe(euroZuCent(-471.41));
    expect(zeile(a, "budgets")!.plan).toBe(euroZuCent(-430));
    expect(a.restPlan).toBe(euroZuCent(2475.36 - 471.41 - 430));
  });

  it("zeigt ohne Einnahme-Vertrag ehrlich 0 statt einer Hochrechnung aus dem Ist", () => {
    const a = monatsAusblick({
      ...basis,
      // Einnahmen sind im Ist reichlich da — geplant ist trotzdem keine.
      ist: [ist({ id: "e", betrag: euroZuCent(2475.36), kategorieId: "gehalt", charakter: "Ertrag" })],
      monatAb: "2026-09-01",
    });
    expect(zeile(a, "einnahmen")!.plan).toBe(0);
  });

  it("rechnet ein aufbauendes Budget mit derselben Monatsrate ein wie ein monatliches", () => {
    // Auch was sich aufbaut, kostet jeden Monat seine Rate — es gibt sie nur am
    // Monatsende nicht zurück. Für die Aufrechnung „was bleibt" ist das dasselbe.
    const a = monatsAusblick({
      ...basis,
      budgets: [budget({ art: "aufbauend", betragProMonat: euroZuCent(400) })],
      monatAb: "2026-09-01",
    });
    expect(zeile(a, "budgets")!.plan).toBe(euroZuCent(-400));
  });

  it("zieht ein eingebettetes Budget vom Dach ab, statt beide voll zu zählen", () => {
    const a = monatsAusblick({
      ...basis,
      budgets: [
        budget({ id: "dach", kategorieId: "freizeit", betragProMonat: euroZuCent(200) }),
        budget({ id: "kind", kategorieId: "sport", art: "aufbauend", betragProMonat: euroZuCent(80) }),
      ],
      monatAb: "2026-09-01",
    });
    // 200 insgesamt, nicht 280 — das Kind liegt IM Dach.
    expect(zeile(a, "budgets")!.plan).toBe(euroZuCent(-200));
  });

  it("nimmt eine quartalsweise Rate nur im Fälligkeitsmonat auf", () => {
    const q = regel({ id: "r-ard", bezeichnung: "Rundfunk", betrag: euroZuCent(-55.08), rhythmus: "quartalsweise", startdatum: "2026-06-15" });
    const eingabe = { ...basis, regeln: [q] };
    expect(zeile(monatsAusblick({ ...eingabe, monatAb: "2026-09-01" }), "vertraege")!.plan).toBe(euroZuCent(-55.08));
    expect(zeile(monatsAusblick({ ...eingabe, monatAb: "2026-10-01" }), "vertraege")!.plan).toBe(0);
  });
});

describe("monatsAusblick — Ist-Spalte des laufenden Monats", () => {
  it("ordnet eine Ist-Buchung über Kategorie und Betragsnähe ihrem Plan-Posten zu", () => {
    const a = monatsAusblick({ ...basis, regeln: [regel()], ist: [ist()], monatAb: "2026-08-01" });
    const v = zeile(a, "vertraege")!;
    expect(v.ist).toBe(euroZuCent(-459.25)); // der ECHTE Betrag, nicht der geplante
    expect(v.posten[0].status).toBe("gebucht");
  });

  it("lässt einen Posten offen, wenn der Betrag zu weit abweicht", () => {
    const a = monatsAusblick({
      ...basis,
      regeln: [regel()],
      ist: [ist({ betrag: euroZuCent(-200) })], // 58 % daneben
      monatAb: "2026-08-01",
    });
    const v = zeile(a, "vertraege")!;
    expect(v.posten[0].status).toBe("offen");
    expect(v.ist).toBe(0);
    // Die Zahlung ist trotzdem nicht verschwunden — sie steht unter „Sonstiges".
    expect(zeile(a, "sonstiges")!.ist).toBe(euroZuCent(-200));
  });

  it("ein Häkchen (planRef) schlägt die Betragsheuristik", () => {
    const a = monatsAusblick({
      ...basis,
      regeln: [regel()],
      ist: [
        ist({ id: "haken", betrag: euroZuCent(-471.41), planRef: { quelleId: "r-miete", faelligkeit: "2026-08-04" }, quelle: "bezahlt-markiert" }),
        ist({ id: "nah", betrag: euroZuCent(-459.25) }),
      ],
      monatAb: "2026-08-01",
    });
    const v = zeile(a, "vertraege")!;
    expect(v.posten[0].status).toBe("bezahlt");
    expect(v.posten[0].ist).toBe(euroZuCent(-471.41));
  });

  it("vergibt jede Ist-Buchung nur einmal — der passendere Posten gewinnt", () => {
    const a = monatsAusblick({
      ...basis,
      regeln: [
        regel({ id: "r-a", bezeichnung: "A", betrag: euroZuCent(-100), kategorieId: "sport", startdatum: "2026-01-10" }),
        regel({ id: "r-b", bezeichnung: "B", betrag: euroZuCent(-108), kategorieId: "sport", startdatum: "2026-01-20" }),
      ],
      ist: [ist({ id: "s", datum: "2026-08-10", betrag: euroZuCent(-107), kategorieId: "sport" })],
      monatAb: "2026-08-01",
    });
    const v = zeile(a, "vertraege")!;
    const nachBezeichnung = Object.fromEntries(v.posten.map((p) => [p.bezeichnung, p.status]));
    expect(nachBezeichnung).toEqual({ A: "offen", B: "gebucht" });
    expect(v.ist).toBe(euroZuCent(-107));
  });

  it("zählt den Budget-Verbrauch über den Kategorienbaum", () => {
    const a = monatsAusblick({
      ...basis,
      budgets: [budget()],
      ist: [ist({ id: "e1", kategorieId: "lebensmittel", betrag: euroZuCent(-62.5) })],
      monatAb: "2026-08-01",
    });
    expect(zeile(a, "budgets")!.ist).toBe(euroZuCent(-62.5));
  });

  it("zählt eine Vertragszahlung NICHT zusätzlich ins Budget ihrer Hauptkategorie", () => {
    const a = monatsAusblick({
      ...basis,
      regeln: [regel({ id: "r-verein", bezeichnung: "Verein", betrag: euroZuCent(-180), kategorieId: "sport", startdatum: "2026-01-01" })],
      budgets: [budget({ id: "b-frei", kategorieId: "freizeit", betragProMonat: euroZuCent(160) })],
      ist: [ist({ id: "v", datum: "2026-08-01", betrag: euroZuCent(-180), kategorieId: "sport" })],
      monatAb: "2026-08-01",
    });
    expect(zeile(a, "vertraege")!.ist).toBe(euroZuCent(-180));
    expect(zeile(a, "budgets")!.ist).toBe(0);
    expect(a.restIst).toBe(euroZuCent(-180)); // genau einmal, nicht doppelt
  });

  it("sammelt ungeplante Einnahmen in der Einnahmen-Zeile", () => {
    const a = monatsAusblick({
      ...basis,
      ist: [ist({ id: "e", betrag: euroZuCent(300), kategorieId: "gehalt", charakter: "Ertrag" })],
      monatAb: "2026-08-01",
    });
    const e = zeile(a, "einnahmen")!;
    expect([e.plan, e.ist]).toEqual([0, euroZuCent(300)]);
    expect(e.posten[e.posten.length - 1].status).toBe("ohnePlan");
  });

  it("führt Sonstiges als einzelne Buchungen auf, nicht als eine Summe", () => {
    // Aufgeklappt soll dort stehen, WAS das war — eine Zeile „ohne Budget und Vertrag:
    // −72,40" beantwortet die Frage nicht, wegen der man aufklappt.
    const a = monatsAusblick({
      ...basis,
      ist: [
        ist({ id: "s1", datum: "2026-08-11", betrag: euroZuCent(-20), kategorieId: "wohnen", notiz: "Schlüsseldienst" }),
        ist({ id: "s2", datum: "2026-08-03", betrag: euroZuCent(-52.4), kategorieId: undefined }),
      ],
      monatAb: "2026-08-01",
    });
    const s = zeile(a, "sonstiges")!;
    expect(s.ist).toBe(euroZuCent(-72.4));
    // Chronologisch, mit Datum und Herkunft an jedem Posten.
    expect(s.posten.map((p) => [p.datum, p.ist, p.istId])).toEqual([
      ["2026-08-03", euroZuCent(-52.4), "s2"],
      ["2026-08-11", euroZuCent(-20), "s1"],
    ]);
    expect(s.posten[1].bezeichnung).toBe("Schlüsseldienst");
    expect(s.posten[1].kategorieId).toBe("wohnen");
  });

  it("teilt eine geteilte Buchung zwischen Budget und Sonstigem auf", () => {
    const a = monatsAusblick({
      ...basis,
      budgets: [budget()],
      ist: [
        ist({
          id: "geteilt", datum: "2026-08-07", betrag: euroZuCent(-100), kategorieId: undefined,
          aufteilungen: [
            { kategorieId: "lebensmittel", betrag: euroZuCent(-60) },
            { kategorieId: "wohnen", betrag: euroZuCent(-40) },
          ],
        }),
      ],
      monatAb: "2026-08-01",
    });
    expect(zeile(a, "budgets")!.ist).toBe(euroZuCent(-60));
    const s = zeile(a, "sonstiges")!;
    expect(s.ist).toBe(euroZuCent(-40));
    expect(s.posten).toHaveLength(1);
    expect(s.posten[0].kategorieId).toBe("wohnen");
  });

  it("führt auch die ungeplanten Umschichtungen einzeln auf", () => {
    const a = monatsAusblick({
      ...basis,
      ist: [
        ist({ id: "u1", datum: "2026-08-09", betrag: euroZuCent(-250), charakter: "Umschichtung", notiz: "Depot" }),
        ist({ id: "u2", datum: "2026-08-20", betrag: euroZuCent(-100), charakter: "Umschichtung" }),
      ],
      monatAb: "2026-08-01",
    });
    const u = zeile(a, "umschichtung")!;
    expect(u.ist).toBe(euroZuCent(-350));
    expect(u.posten.map((p) => p.istId)).toEqual(["u1", "u2"]);
  });

  it("schiebt eine Vertragszahlung auf einer Budgetkategorie nach Sonstiges statt sie zu verlieren", () => {
    // Der heikle Fall an der Vertragsregel: die Buchung hängt unter einer Budgetkategorie,
    // wird vom Budget aber nicht getragen. Nähme „Sonstiges" (wie früher) alles, dessen
    // KATEGORIE ausserhalb der Budgets liegt, fiele sie durch beide Zeilen — und die
    // Ist-Spalte summierte nicht mehr auf das, was vom Konto ging.
    const a = monatsAusblick({
      ...basis,
      budgets: [budget()],
      ist: [
        ist({ id: "rate", datum: "2026-08-02", betrag: euroZuCent(-425), kategorieId: "lebensmittel" }),
        ist({ id: "frei", datum: "2026-08-06", betrag: euroZuCent(-30), kategorieId: "lebensmittel" }),
      ],
      vertragsBuchungen: new Set(["rate"]),
      monatAb: "2026-08-01",
    });
    expect(zeile(a, "budgets")!.ist).toBe(euroZuCent(-30));
    const s = zeile(a, "sonstiges")!;
    expect(s.posten.map((p) => p.istId)).toEqual(["rate"]);
    expect(a.restIst).toBe(euroZuCent(-455)); // beide Buchungen, jede genau einmal
  });

  it("die Ist-Spalte summiert auf alles Gebuchte des Monats", () => {
    const buchungen = [
      ist({ id: "1", betrag: euroZuCent(-459.25), kategorieId: "miete" }),
      ist({ id: "2", betrag: euroZuCent(-62.5), kategorieId: "lebensmittel" }),
      ist({ id: "3", betrag: euroZuCent(-17.9), kategorieId: "wohnen" }),
      ist({ id: "4", betrag: euroZuCent(2475.36), kategorieId: "gehalt", charakter: "Ertrag" }),
    ];
    const a = monatsAusblick({ ...basis, regeln: [regel()], budgets: [budget()], ist: buchungen, monatAb: "2026-08-01" });
    expect(a.restIst).toBe(buchungen.reduce((s, b) => s + b.betrag, 0));
  });

  it("lässt interne Umbuchungen komplett draußen", () => {
    const a = monatsAusblick({
      ...basis,
      ist: [ist({ id: "t", betrag: euroZuCent(-500), kategorieId: undefined, charakter: "Umschichtung", transferId: "t1" })],
      monatAb: "2026-08-01",
    });
    expect(a.restIst).toBe(0);
    expect(zeile(a, "umschichtung")).toBeUndefined();
  });

  it("blendet Sonstiges und Umschichtung aus, solange es dort nichts gibt", () => {
    const a = monatsAusblick({ ...basis, budgets: [budget()], monatAb: "2026-08-01" });
    expect(a.zeilen.map((z) => z.id)).toEqual(["einnahmen", "vertraege", "budgets"]);
  });
});

describe("monatsAusblicke", () => {
  it("liefert den laufenden Monat und die beiden folgenden", () => {
    const drei = monatsAusblicke({ ...basis, heute: "2026-11-20" });
    expect(drei.map((a) => a.label)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(drei.map((a) => a.zukunft)).toEqual([false, true, true]);
  });

  it("bleibt am Monatsletzten im richtigen Monat", () => {
    const drei = monatsAusblicke({ ...basis, heute: "2026-01-31" });
    expect(drei.map((a) => a.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});
