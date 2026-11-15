// Die Einordnung, wie eine Zeile sie zeigt — Art plus die NAMEN von Budget und Vertrag.
//
// Die Sortierregel selbst gehört dem Kern und wird dort geprüft; hier steht, was diese
// Sicht dazutut: die Namen, das Zusammenfassen gleicher Anteile und dass die
// Vertragszuordnung so gelesen wird wie in der Übersicht. Alle Namen sind erfunden.

import { describe, expect, it } from "vitest";
import type {
  Budget,
  IstBuchung,
  Kategorie,
  Vertrag,
  Vertragszuordnung,
  Zahlungskonto,
} from "../../core";
import { einordnungJeBuchung, einordnungVon, type EinordnungssichtEingabe } from "./einordnungssicht";

const KONTEN: Zahlungskonto[] = [
  { id: "giro", bezeichnung: "Alltagskonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 },
  { id: "spar", bezeichnung: "Zweitkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 0 },
  { id: "alter", bezeichnung: "Langfristkonto", typ: "Tagesgeld", klasse: "vorsorge", inhaberIds: [], saldo: 0 },
];

const KATEGORIEN: Kategorie[] = [
  { id: "kat-m", name: "Kesselraum", defaultCharakter: "Aufwand" },
  { id: "kat-t", name: "Vorhaben Nordseite", defaultCharakter: "Aufwand" },
  { id: "kat-t2", name: "Vorhaben Südseite", defaultCharakter: "Aufwand" },
  { id: "kat-frei", name: "Verschiedenes", defaultCharakter: "Aufwand" },
  { id: "kat-ein", name: "Zuflüsse", defaultCharakter: "Ertrag" },
];

function budget(id: string, kategorieId: string, art: Budget["art"]): Budget {
  return {
    id, kategorieId, kontoId: "giro", art, start: "2026-01-01",
    betraege: [{ abMonat: "2026-01", betrag: 10000 }],
  };
}

const BUDGETS: Budget[] = [
  budget("bu-m", "kat-m", "monatlich"),
  budget("bu-t", "kat-t", "aufbauend"),
  budget("bu-t2", "kat-t2", "aufbauend"),
];

const VERTRAG = { id: "v1", anbieter: "Ohlert", beginn: "2026-01-01", verlaengerung: "keine", status: "aktiv" } as unknown as Vertrag;

function buchung(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1", datum: "2026-10-05", betrag: -3000, kontoId: "giro",
    charakter: "Aufwand", quelle: "manuell", ...over,
  };
}

function sicht(buchungen: IstBuchung[], over: Partial<EinordnungssichtEingabe> = {}) {
  return einordnungJeBuchung({
    buchungen, kategorien: KATEGORIEN, budgets: BUDGETS, konten: KONTEN,
    zuordnungen: [], vertraege: [VERTRAG], ...over,
  });
}

describe("einordnungJeBuchung", () => {
  it("nennt bei einer Entnahme aus dem aufbauenden Budget dessen Kategorie als Namen", () => {
    const e = sicht([buchung({ kategorieId: "kat-t" })]);
    expect(e.get("b1")).toEqual([
      { art: "topf", budgetName: "Vorhaben Nordseite", vertragsname: undefined, intern: false },
    ]);
  });

  it("unterscheidet monatliches Budget, kein Budget und Einnahme", () => {
    const e = sicht([
      buchung({ id: "m", kategorieId: "kat-m" }),
      buchung({ id: "u", kategorieId: "kat-frei" }),
      buchung({ id: "ohne" }),
      buchung({ id: "ein", betrag: 250000, charakter: "Ertrag", kategorieId: "kat-ein" }),
    ]);
    expect(e.get("m")).toMatchObject([{ art: "laufend", budgetName: "Kesselraum" }]);
    expect(e.get("u")).toMatchObject([{ art: "ungeplant" }]);
    expect(e.get("u")![0].budgetName).toBeUndefined();
    expect(e.get("ohne")).toMatchObject([{ art: "ungeplant" }]);
    expect(e.get("ein")).toMatchObject([{ art: "einnahme" }]);
  });

  it("zählt eine Vertragszahlung als Fixkosten und nennt den Anbieter — auch unter einem Budget", () => {
    const zuordnungen: Vertragszuordnung[] = [{ istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" }];
    const e = sicht([buchung({ kategorieId: "kat-m" })], { zuordnungen });
    expect(e.get("b1")).toEqual([
      { art: "fixkosten", budgetName: undefined, vertragsname: "Ohlert", intern: false },
    ]);
  });

  it("liest „ausdrücklich kein Vertrag“ nicht als Vertrag", () => {
    const zuordnungen: Vertragszuordnung[] = [{ istbuchungId: "b1", vertragId: null, herkunft: "manuell" }];
    const e = sicht([buchung({ kategorieId: "kat-m" })], { zuordnungen });
    expect(e.get("b1")).toMatchObject([{ art: "laufend" }]);
  });

  it("bleibt bei Fixkosten, wenn der Vertrag hinter der Zuordnung fehlt — wie die Ergebnisrechnung", () => {
    // Die Vertragspille im Auszug lässt so eine Zuordnung fallen, weil sie keinen Namen
    // zu zeigen hat. Die ART darf das nicht: sie muss dieselbe sein, mit der die Übersicht
    // rechnet, und die liest jede Zuordnung mit `vertragId`.
    const zuordnungen: Vertragszuordnung[] = [{ istbuchungId: "b1", vertragId: "v-weg", herkunft: "automatisch" }];
    const e = sicht([buchung({ kategorieId: "kat-m" })], { zuordnungen });
    expect(e.get("b1")).toMatchObject([{ art: "fixkosten" }]);
    expect(e.get("b1")![0].vertragsname).toBeUndefined();
  });

  it("gibt bei einer geteilten Buchung die VERSCHIEDENEN Arten heraus, nicht nur die erste", () => {
    const geteilt = buchung({
      betrag: -9000,
      aufteilungen: [
        { kategorieId: "kat-m", betrag: -4000 },
        { kategorieId: "kat-t", betrag: -3000 },
        { kategorieId: "kat-frei", betrag: -2000 },
      ],
    });
    const e = sicht([geteilt]);
    expect(e.get("b1")!.map((x) => x.art)).toEqual(["laufend", "topf", "ungeplant"]);
  });

  it("fasst Anteile mit derselben Art und demselben Budget zusammen, trennt aber zwei Töpfe", () => {
    const geteilt = buchung({
      betrag: -9000,
      aufteilungen: [
        { kategorieId: "kat-t", betrag: -4000 },
        { kategorieId: "kat-t", betrag: -3000 },
        { kategorieId: "kat-t2", betrag: -2000 },
      ],
    });
    const e = sicht([geteilt]);
    expect(e.get("b1")!.map((x) => x.budgetName)).toEqual(["Vorhaben Nordseite", "Vorhaben Südseite"]);
  });

  it("nennt die Ausgabe ohne Budgetwirkung eine Entnahme aus der Rücklage", () => {
    const e = sicht([buchung({ kategorieId: "kat-m", budgetrelevant: false })]);
    expect(e.get("b1")).toMatchObject([{ art: "ruecklage" }]);
  });

  it("trennt Umbuchung und Vorsorge am Zielkonto und merkt, ob es ein Gegenbein gibt", () => {
    const e = sicht([
      buchung({ id: "um", charakter: "Umschichtung", transferId: "t1", gegenkontoId: "spar" }),
      buchung({ id: "vor", charakter: "Umschichtung", transferId: "t2", gegenkontoId: "alter" }),
      buchung({ id: "raus", charakter: "Umschichtung" }),
    ]);
    expect(e.get("um")).toMatchObject([{ art: "umbuchung", intern: true }]);
    expect(e.get("vor")).toMatchObject([{ art: "vorsorge", intern: true }]);
    expect(e.get("raus")).toMatchObject([{ art: "vorsorge", intern: false }]);
  });
});

describe("einordnungVon", () => {
  it("liefert für eine unbekannte oder fehlende Buchung eine leere Liste", () => {
    const e = sicht([buchung()]);
    expect(einordnungVon(e, "gibt-es-nicht")).toEqual([]);
    expect(einordnungVon(e, undefined)).toEqual([]);
    expect(einordnungVon(e, "b1")).toHaveLength(1);
  });
});
