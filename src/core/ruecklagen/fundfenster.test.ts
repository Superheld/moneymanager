// Was sich mit der Umstellung ändern DARF — und nur ab dem Tag, an dem die Kategorie einer
// Rücklage zu finden beginnt (`findetAb`). Drei Wirkungen, je ein Fall mit Buchungen NACH
// dem Fundfenster:
//
//   1. Eine Rücklage von Hand mit Kategorie findet ihre Ausgaben.
//   2. Hängen mehrere an derselben Kategorie, wartet die Buchung auf eine Zuordnung.
//   3. Der Anspruch auf dem Konto sinkt um die gefundenen Entnahmen.
//
// Dazu die beiden Befunde, die bewusst NACHGEBILDET und nicht behoben werden (Teil B des
// Entwurfs zu ADR-0006): eine Kategoriebuchung vor dem Start eines aufbauenden Budgets
// kostet nichts, und ein Kauf in zwei Ausbuchungen zählt zweimal als ungedeckt.
//
// Alle Beträge erfunden, die Namen gelten je Testfall.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../buchung/istbuchung";
import { budgetBuchungen, ruecklagenEntnahmenAus, type Budget, type BudgetSicht } from "../budgets/budget";
import { einordnen } from "../einordnung";
import { einordnungskontext, ergebnisbasis, monatsErgebnis, type ErgebnisEingabe } from "../ergebnis";
import type { Kategorie } from "../kategorien/kategorie";
import { ruecklagenDeckung, type Ruecklage, type Ruecklagenzyklus } from "./ruecklage";

let n = 0;
function buchung(datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung {
  return { id: `f${++n}`, datum, betrag, kontoId: "giro", charakter: "Aufwand", quelle: "manuell", ...over };
}

function eingabe(teil: Partial<ErgebnisEingabe>): ErgebnisEingabe {
  return {
    regeln: [],
    budgets: [],
    ruecklagen: [],
    ausbuchungen: [],
    ruecklagenzuordnungen: [],
    ist: [],
    kategorien: [],
    konten: [],
    vertragJeBuchung: new Map(),
    heute: "2031-01-01",
    ...teil,
  };
}

const zeile = (e: ErgebnisEingabe, monat: string, id: string) =>
  monatsErgebnis(ergebnisbasis(e), `${monat}-01`).zeilen.find((z) => z.id === id);

/** Die Überleitung geht auf: Ergebnis plus Posten ist die Summe der Buchungen ohne Gegenbein. */
function gehtAuf(e: ErgebnisEingabe, monat: string): void {
  const m = monatsErgebnis(ergebnisbasis(e), `${monat}-01`);
  const imMonat = e.ist.filter((b) => b.datum.startsWith(monat) && !b.transferId).reduce((s, b) => s + b.betrag, 0);
  expect(m.ueberleitung?.kontoaenderung, monat).toBe(imMonat);
}

// ------------------------------------------------------------------ Wirkung 1

describe("Wirkung 1: eine Rücklage von Hand mit Kategorie findet ab `findetAb` ihre Ausgaben", () => {
  const kategorien: Kategorie[] = [
    { id: "k-haus", name: "Haus", defaultCharakter: "Aufwand" },
    { id: "k-dach", name: "Dach", elternId: "k-haus", defaultCharakter: "Aufwand" },
  ];
  const haus: Budget = { id: "b-haus", kategorieId: "k-haus", kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 30000 }] };
  const dach: Ruecklage = {
    id: "r-dach", bezeichnung: "Strootmann", rate: 10000, raten: [{ abMonat: "2026-01", betrag: 10000 }], beginn: "2026-01-05",
    kategorieId: "k-dach", kontoId: "tg", art: "abschliessend", findetAb: "2026-03-15",
  };
  const vorher = buchung("2026-03-10", -4000, { kategorieId: "k-dach" });
  const danach = buchung("2026-04-08", -25000, { kategorieId: "k-dach" });
  const ueberzogen = buchung("2026-05-20", -60000, { kategorieId: "k-dach" });
  const e = eingabe({ kategorien, budgets: [haus], ruecklagen: [dach], ist: [vorher, danach, ueberzogen] });

  it("ordnet davor dem Budget darüber zu, danach der Rücklage", () => {
    const x = einordnen(e.ist, einordnungskontext(e));
    expect(x.find((y) => y.buchung.id === vorher.id)).toMatchObject({ art: "laufend", budgetId: "b-haus" });
    expect(x.find((y) => y.buchung.id === danach.id)).toMatchObject({ art: "ruecklage", ruecklageId: "r-dach" });
  });

  it("nimmt dem Budget darüber die gefundene Ausgabe weg — dieselbe Zuständigkeit wie im Ergebnis", () => {
    const sicht: BudgetSicht = { buchungen: e.ist, kategorien, budgets: [haus], vertragsBuchungen: new Set(), ruecklagen: [dach] };
    expect(budgetBuchungen(sicht, haus, "2026-03-01", "2026-06-01").map((p) => p.buchung.id)).toEqual([vorher.id]);
  });

  it("kostet die Rate, solange sie reicht, und das Ungedeckte, wenn nicht — die Überleitung geht auf", () => {
    // April: Raten Januar bis April 40000, entnommen 25000 → die Rate.
    const april = zeile(e, "2026-04", "abschreibungen")!.posten.find((p) => p.ruecklageId === "r-dach")!;
    expect(april).toMatchObject({ plan: -10000, ist: -10000, entnahme: -25000 });
    // Mai: Raten 50000, entnommen 85000 → Rate plus 25000 ungedeckt (max-Regel).
    const mai = zeile(e, "2026-05", "abschreibungen")!.posten.find((p) => p.ruecklageId === "r-dach")!;
    expect(mai).toMatchObject({ plan: -10000, ist: -45000, entnahme: -60000 });
    // Juni: im Minus, die Rate füllt nur das Loch.
    expect(zeile(e, "2026-06", "abschreibungen")!.posten.find((p) => p.ruecklageId === "r-dach")!.ist).toBe(0);
    for (const m of ["2026-03", "2026-04", "2026-05", "2026-06"]) gehtAuf(e, m);
  });

  it("findet ohne Fundfenster nichts — die Rücklage rechnet wie vor der Umstellung", () => {
    const ohne = eingabe({ ...e, ruecklagen: [{ ...dach, findetAb: undefined }] });
    const x = einordnen(ohne.ist, einordnungskontext(ohne));
    expect(x.every((y) => y.art === "laufend")).toBe(true);
    expect(zeile(ohne, "2026-05", "abschreibungen")!.posten.find((p) => p.ruecklageId === "r-dach")!.ist).toBe(-10000);
  });
});

// ------------------------------------------------------------------ Wirkung 2

describe("Wirkung 2: hängen mehrere an derselben Kategorie, wartet die Buchung", () => {
  const kategorien: Kategorie[] = [{ id: "k-reise", name: "Reise", defaultCharakter: "Aufwand" }];
  const sommer: Ruecklage = { id: "r-sommer", bezeichnung: "Heidkamp", ziel: 120000, fristMonate: 12, beginn: "2026-01-01", kategorieId: "k-reise", art: "abschliessend", findetAb: "2026-02-01" };
  const ski: Ruecklage = { id: "r-ski", bezeichnung: "Olvermann", ziel: 60000, fristMonate: 12, beginn: "2026-01-01", kategorieId: "k-reise", art: "abschliessend", findetAb: "2026-02-01" };
  const flug = buchung("2026-03-04", -30000, { kategorieId: "k-reise" });
  const e = eingabe({ kategorien, ruecklagen: [sommer, ski], ist: [flug] });

  it("führt sie als ungeplant, mit den Rücklagen, zwischen denen zu wählen ist — und sie kostet ihren Monat", () => {
    const [x] = einordnen(e.ist, einordnungskontext(e));
    expect(x).toMatchObject({ art: "ungeplant", wartetAuf: ["r-sommer", "r-ski"] });
    expect(zeile(e, "2026-03", "ungeplant")!.ist).toBe(-30000);
    gehtAuf(e, "2026-03");
  });

  it("gibt sie mit einer Zuordnung der einen — und die kostet dann nur ihre Rate", () => {
    const zugeordnet = eingabe({ ...e, ruecklagenzuordnungen: [{ istbuchungId: flug.id, ruecklageId: "r-ski" }] });
    const [x] = einordnen(zugeordnet.ist, einordnungskontext(zugeordnet));
    expect(x).toMatchObject({ art: "ruecklage", ruecklageId: "r-ski" });
    // Ski: 5000 im Monat, bis März 15000 angespart, entnommen 30000 → ungedeckt 15000.
    expect(zeile(zugeordnet, "2026-03", "abschreibungen")!.posten.find((p) => p.ruecklageId === "r-ski")!.ist).toBe(-20000);
    expect(zeile(zugeordnet, "2026-03", "ungeplant")?.posten ?? []).toEqual([]);
    gehtAuf(zugeordnet, "2026-03");
  });

  it("lässt ein monatliches Budget an derselben Kategorie gewinnen (der Altfall)", () => {
    const budget: Budget = { id: "b-reise", kategorieId: "k-reise", kontoId: "giro", art: "monatlich", start: "2026-01-01", betraege: [{ abMonat: "2026-01", betrag: 20000 }] };
    const mitBudget = eingabe({ ...e, budgets: [budget] });
    const [x] = einordnen(mitBudget.ist, einordnungskontext(mitBudget));
    expect(x).toMatchObject({ art: "laufend", budgetId: "b-reise" });
  });
});

// ------------------------------------------------------------------ Wirkung 3

describe("Wirkung 3: der Anspruch auf dem Konto sinkt um die gefundenen Entnahmen", () => {
  const kategorien: Kategorie[] = [{ id: "k-geraet", name: "Geraet", defaultCharakter: "Aufwand" }];
  const geraet: Ruecklage = {
    id: "r-geraet", bezeichnung: "Quandtmeyer", ziel: 120000, fristMonate: 12, beginn: "2026-01-01",
    kategorieId: "k-geraet", kontoId: "tg", art: "abschliessend", findetAb: "2026-03-01",
  };
  const vorher = buchung("2026-02-10", -7000, { kategorieId: "k-geraet" });
  const danach = buchung("2026-04-12", -15000, { kategorieId: "k-geraet" });
  const sicht: BudgetSicht = { buchungen: [vorher, danach], kategorien, budgets: [], vertragsBuchungen: new Set(), ruecklagen: [geraet] };
  const bestand = { entnahmen: ruecklagenEntnahmenAus(sicht), abschluesse: [] };
  const konto = new Map([["tg", 1000000]]);

  it("zieht am Stichtag nach dem Fundfenster ab, was die Rücklage gefunden hat", () => {
    // Am 20.05.: Soll (Januar bis April) 40000, gefunden 15000 → Anspruch 25000.
    const d = ruecklagenDeckung([geraet], "2026-05-20", konto, [], bestand);
    expect(d.posten[0]).toMatchObject({ soll: 25000, tatsaechlich: 25000 });
  });

  it("lässt den Anspruch vor dem Fundfenster beim Soll — die Buchung davor gehört ihr nicht", () => {
    const d = ruecklagenDeckung([geraet], "2026-03-20", konto, [], bestand);
    expect(d.posten[0].soll).toBe(20000);
  });

  it("beansprucht im Minus nichts", () => {
    const gross = buchung("2026-04-20", -90000, { kategorieId: "k-geraet" });
    const s2: BudgetSicht = { ...sicht, buchungen: [vorher, danach, gross] };
    const d = ruecklagenDeckung([geraet], "2026-05-20", konto, [], { entnahmen: ruecklagenEntnahmenAus(s2) });
    expect(d.posten[0].soll).toBe(0);
  });
});

// ------------------------------------------------------------------ Befunde

describe("Befunde, die bewusst nachgebildet sind", () => {
  it("eine Kategoriebuchung VOR dem Start eines aufbauenden Budgets ist eine Entnahme und kostet nichts", () => {
    // Bekannter Befund (Teil B, Abschnitt 4): die Einordnung kennt kein Datum, die Kosten
    // zählen ab dem Start. Behoben wird das mit eigener Entscheidung, nicht hier.
    const kategorien: Kategorie[] = [{ id: "k-werk", name: "Werk", defaultCharakter: "Aufwand" }];
    const werk: Budget = { id: "b-werk", kategorieId: "k-werk", kontoId: "tg", art: "aufbauend", start: "2026-03-01", betraege: [{ abMonat: "2026-03", betrag: 5000 }] };
    const frueh = buchung("2026-02-11", -40000, { kategorieId: "k-werk" });
    const e = eingabe({ kategorien, budgets: [werk], ist: [frueh] });
    const [x] = einordnen(e.ist, einordnungskontext(e));
    expect(x).toMatchObject({ art: "ruecklage", ruecklageId: "b-werk", budgetId: "b-werk" });
    const posten = zeile(e, "2026-02", "abschreibungen")!.posten.find((p) => p.budgetId === "b-werk")!;
    expect(posten).toMatchObject({ ist: 0, entnahme: -40000 });
    gehtAuf(e, "2026-02");
  });

  it("ein Kauf, den zwei Ausbuchungen nennen, zählt in beiden als ungedeckt", () => {
    // Bekannter Befund (Teil B, Abschnitt 5): die alte Regel rechnet je Ausbuchung.
    const r: Ruecklage = { id: "r-zwei", bezeichnung: "Fennekamp", ziel: 20000, fristMonate: 5, beginn: "2025-04-01" };
    const kauf = buchung("2025-03-15", -26000, { budgetrelevant: false });
    const ausbuchungen: Ruecklagenzyklus[] = [
      { id: "a-eins", ruecklageId: "r-zwei", datum: "2025-02-10", zyklusBeginn: "2024-09-01", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: kauf.id },
      { id: "a-zwei", ruecklageId: "r-zwei", datum: "2025-04-01", zyklusBeginn: "2025-02-10", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: kauf.id },
    ];
    const e = eingabe({ ruecklagen: [r], ausbuchungen, ist: [kauf] });
    const posten = zeile(e, "2025-03", "abschreibungen")!.posten;
    // Eins: angespart am Abschluss (Sept. bis Jan.) 20000 → 6000 ungedeckt, keine Rate mehr.
    expect(posten.find((p) => p.schluessel === "zyklus:a-eins")).toMatchObject({ plan: 0, ist: -6000 });
    // Zwei: angespart am Abschluss (Februar und März) 8000, Rate März 4000 → 4000 + 18000.
    expect(posten.find((p) => p.schluessel === "zyklus:a-zwei")).toMatchObject({ plan: -4000, ist: -22000 });
  });
});
