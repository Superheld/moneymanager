// Wer einen Anteil trägt — am Beispiel des Entwurfs und an den Grenzen des Fensters.
// Die Äquivalenz zur heutigen Einordnung steht in `topf.test.ts`. Namen je Testfall.

import { describe, expect, it } from "vitest";
import type { Budget } from "../budgets/budget";
import type { Kategorie } from "../kategorien/kategorie";
import type { Ruecklage } from "./ruecklage";
import { zustaendigkeit, type Ruecklagenzuordnung } from "./zustaendigkeit";

const kategorien: Kategorie[] = [
  { id: "freizeit", name: "Freizeit", defaultCharakter: "Aufwand" },
  { id: "urlaub", name: "Urlaub", elternId: "freizeit", defaultCharakter: "Aufwand" },
  { id: "markt", name: "Markt", defaultCharakter: "Aufwand" },
];
const freizeit: Budget = {
  id: "b-freizeit", kategorieId: "freizeit", kontoId: "giro", art: "monatlich", start: "2025-01-01",
  betraege: [{ abMonat: "2025-01", betrag: 20000 }],
};
const sommer: Ruecklage = { id: "r-sommer", bezeichnung: "Lammerding", rate: 5000, beginn: "2026-01-01", kategorieId: "urlaub", findetAb: "2026-01-01" };
const ski: Ruecklage = { id: "r-ski", bezeichnung: "Vosskuhl", rate: 3000, beginn: "2026-01-01", kategorieId: "urlaub", findetAb: "2026-01-01" };

const frage = (istbuchungId: string, kategorieId: string | undefined, datum: string, budgetrelevant?: boolean) => ({
  istbuchungId, kategorieId, datum, budgetrelevant,
});

describe("Zuständigkeit — das Beispiel des Entwurfs", () => {
  const zuordnungen: Ruecklagenzuordnung[] = [
    { istbuchungId: "b-ski", ruecklageId: "r-ski" },
    // Geteilte Buchung: nur der Urlaubsanteil ist zugeordnet.
    { istbuchungId: "b-geteilt", kategorieId: "urlaub", ruecklageId: "r-ski" },
    { istbuchungId: "b-keine", ruecklageId: undefined },
  ];
  const traeger = zustaendigkeit(kategorien, [freizeit], [sommer, ski], zuordnungen, []);

  it("lässt eine Urlaubsbuchung ohne Zuordnung auf beide Rücklagen warten", () => {
    expect(traeger(frage("b-offen", "urlaub", "2026-03-04"))).toEqual({ art: "wartet", kandidaten: ["r-sommer", "r-ski"] });
  });

  it("gibt sie mit Zuordnung der einen", () => {
    expect(traeger(frage("b-ski", "urlaub", "2026-03-04"))).toEqual({ art: "ruecklage", ruecklageId: "r-ski" });
  });

  it("gibt sie vor dem Fenster dem Budget darüber", () => {
    expect(traeger(frage("b-vorher", "urlaub", "2025-12-20"))).toEqual({ art: "laufend", budgetId: "b-freizeit" });
  });

  it("ordnet die Anteile einer geteilten Buchung je für sich ein", () => {
    expect(traeger(frage("b-geteilt", "urlaub", "2026-03-04"))).toEqual({ art: "ruecklage", ruecklageId: "r-ski" });
    expect(traeger(frage("b-geteilt", "markt", "2026-03-04"))).toEqual({ art: "ungeplant" });
  });

  it("nimmt ausdrücklich keine Rücklage beim Wort und fällt zum Dach durch", () => {
    expect(traeger(frage("b-keine", "urlaub", "2026-03-04"))).toEqual({ art: "laufend", budgetId: "b-freizeit" });
  });
});

describe("Zuständigkeit — die Grenzen", () => {
  it("lässt eine Rücklage nach ihrem Ende nichts mehr tragen", () => {
    const beendet: Ruecklage = { ...sommer, beendetAm: "2026-06-30" };
    const traeger = zustaendigkeit(kategorien, [], [beendet], [], []);
    expect(traeger(frage("b1", "urlaub", "2026-06-30"))).toEqual({ art: "ruecklage", ruecklageId: "r-sommer" });
    expect(traeger(frage("b2", "urlaub", "2026-07-01"))).toEqual({ art: "ungeplant" });
  });

  it("unterscheidet ohne Fundfenster nach der Sorte", () => {
    // Abschliessend ohne `findetAb`: eine Rücklage von Hand vor der Umstellung — sie
    // findet nichts. Fortlaufend ohne: ohne Anfang, wie heute ein aufbauendes Budget.
    const vonHand: Ruecklage = { id: "r-hand", bezeichnung: "Ruhnau", rate: 1000, beginn: "2026-01-01", kategorieId: "markt" };
    const fortlaufend: Ruecklage = { id: "r-fort", bezeichnung: "Seebeck", beginn: "2026-01-01", kategorieId: "urlaub", art: "fortlaufend" };
    const traeger = zustaendigkeit(kategorien, [], [vonHand, fortlaufend], [], []);
    expect(traeger(frage("b1", "markt", "2026-03-01"))).toEqual({ art: "ungeplant" });
    expect(traeger(frage("b2", "urlaub", "2020-03-01"))).toEqual({ art: "ruecklage", ruecklageId: "r-fort" });
  });

  it("sieht eine Rücklage ohne Kategorie nie als Kandidaten, eine Zuordnung auf sie gilt trotzdem", () => {
    const ohne: Ruecklage = { id: "r-ohne", bezeichnung: "Klattenhoff", rate: 1000, beginn: "2026-01-01", findetAb: "2026-01-01" };
    const traeger = zustaendigkeit(kategorien, [], [ohne, sommer], [{ istbuchungId: "b2", ruecklageId: "r-ohne" }], []);
    expect(traeger(frage("b1", "urlaub", "2026-03-01"))).toEqual({ art: "ruecklage", ruecklageId: "r-sommer" });
    expect(traeger(frage("b2", "urlaub", "2026-03-01"))).toEqual({ art: "ruecklage", ruecklageId: "r-ohne" });
  });

  it("lässt am selben Knoten das monatliche Budget gewinnen", () => {
    const amBudget: Ruecklage = { ...sommer, kategorieId: "freizeit" };
    const traeger = zustaendigkeit(kategorien, [freizeit], [amBudget], [], []);
    expect(traeger(frage("b1", "freizeit", "2026-03-01"))).toEqual({ art: "laufend", budgetId: "b-freizeit" });
  });

  it("glaubt keiner Zuordnung auf eine Rücklage, die es nicht gibt", () => {
    const traeger = zustaendigkeit(kategorien, [], [sommer], [{ istbuchungId: "b1", ruecklageId: "r-weg" }], []);
    expect(traeger(frage("b1", "urlaub", "2026-03-01"))).toEqual({ art: "ruecklage", ruecklageId: "r-sommer" });
  });

  it("lässt eine ausdrückliche Zuordnung vor budgetrelevant = false gelten", () => {
    // Teil B, Abschnitt 2: die Zuordnung ist Schritt 2, `budgetrelevant` erst Schritt 3.
    const traeger = zustaendigkeit(kategorien, [], [sommer, ski], [{ istbuchungId: "b1", ruecklageId: "r-ski" }], []);
    expect(traeger(frage("b1", "urlaub", "2026-03-01", false))).toEqual({ art: "ruecklage", ruecklageId: "r-ski" });
    expect(traeger(frage("b2", "urlaub", "2026-03-01", false))).toEqual({ art: "ungeplant" });
  });
});
