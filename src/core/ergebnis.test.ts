// Die Ergebnisrechnung an den Fällen, an denen sie entworfen wurde. Alle Beträge sind
// erfunden; die Namen gelten je Testfall.

import { describe, expect, it } from "vitest";
import type { Zahlungsregel } from "./basis/zahlungsregel";
import type { IstBuchung } from "./buchung/istbuchung";
import type { Budget } from "./budgets/budget";
import { einordnen } from "./einordnung";
import {
  einordnungskontext,
  ergebnisbasis,
  ergebnisKennzahlen,
  monatsKosten,
  ruecklagenrateFehlt,
  monatsanteil,
  monatsErgebnis,
  type ErgebnisEingabe,
  type ErgebnisZeileId,
  type MonatsErgebnis,
} from "./ergebnis";
import type { Kategorie } from "./kategorien/kategorie";
import type { Zahlungskonto } from "./konten/konto";
import type { Ruecklage } from "./ruecklagen/ruecklage";

const KATEGORIEN: Kategorie[] = [
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
  { id: "absicherung", name: "Absicherung", defaultCharakter: "Aufwand" },
  { id: "alltag", name: "Alltag", defaultCharakter: "Aufwand" },
  { id: "markt", name: "Markt", elternId: "alltag", defaultCharakter: "Aufwand" },
  { id: "reise", name: "Reise", defaultCharakter: "Aufwand" },
  { id: "flug", name: "Flug", elternId: "reise", defaultCharakter: "Aufwand" },
  { id: "haushalt", name: "Haushalt", defaultCharakter: "Aufwand" },
];

const konto = (id: string, klasse: Zahlungskonto["klasse"] = "liquide"): Zahlungskonto => ({
  id,
  bezeichnung: id,
  typ: "Giro",
  klasse,
  inhaberIds: [],
  saldo: 0,
});
const KONTEN = [konto("giro"), konto("tagesgeld", "ruecklage"), konto("depotkonto", "investment"), konto("spar", "sparen")];

let laufend = 0;
function ist(datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: `i${++laufend}`,
    datum,
    betrag,
    kontoId: "giro",
    charakter: betrag >= 0 ? "Ertrag" : "Aufwand",
    quelle: "import",
    ...over,
  };
}

function regel(over: Partial<Zahlungsregel>): Zahlungsregel {
  return {
    id: "r1",
    bezeichnung: "Kesselmann",
    betrag: -60000,
    rhythmus: "jaehrlich",
    startdatum: "2025-01-10",
    charakter: "Aufwand",
    kategorieId: "absicherung",
    vertragId: "v1",
    ...over,
  };
}

function budget(over: Partial<Budget> & { rate: number }): Budget {
  const { rate, ...rest } = over;
  const start = rest.start ?? "2025-01-01";
  return {
    id: "b1",
    kategorieId: "alltag",
    kontoId: "giro",
    art: "monatlich",
    start,
    betraege: [{ abMonat: start.slice(0, 7), betrag: rate }],
    ...rest,
  };
}

function eingabe(over: Partial<ErgebnisEingabe>): ErgebnisEingabe {
  return {
    regeln: [],
    budgets: [],
    ruecklagen: [],
    ist: [],
    kategorien: KATEGORIEN,
    konten: KONTEN,
    vertragJeBuchung: new Map(),
    heute: "2025-12-31",
    ...over,
  };
}

const rechne = (e: ErgebnisEingabe, monat: string) => monatsErgebnis(ergebnisbasis(e), `${monat}-01`);
const zeile = (r: MonatsErgebnis, id: ErgebnisZeileId) => r.zeilen.find((z) => z.id === id);
const posten = (r: MonatsErgebnis, id: string) => r.ueberleitung?.posten.find((p) => p.id === id)?.betrag ?? 0;

/** Die Probe: die Überleitung endet bei der Summe aller Buchungen ohne Gegenbein. */
function erwarteAufgang(e: ErgebnisEingabe, monat: string) {
  const r = rechne(e, monat);
  const gebucht = e.ist
    .filter((b) => b.datum.startsWith(monat) && b.transferId == null)
    .reduce((s, b) => s + b.betrag, 0);
  expect(r.ueberleitung?.kontoaenderung).toBe(gebucht);
  return r;
}

describe("monatsanteil", () => {
  it("summiert über alle Teile exakt auf den Betrag", () => {
    const teile = Array.from({ length: 12 }, (_, i) => monatsanteil(-10000, 12, i));
    expect(teile.reduce((s, t) => s + t, 0)).toBe(-10000);
    expect(teile[1]).toBe(-833);
  });
});

describe("Fixkosten — der Jahresbeitrag", () => {
  const zahlung = ist("2025-01-10", -60000, { kategorieId: "absicherung" });
  const e = eingabe({
    regeln: [regel({})],
    ist: [zahlung],
    vertragJeBuchung: new Map([[zahlung.id, "v1"]]),
  });

  it("kostet im Monat der Zahlung ein Zwölftel, nicht den ganzen Beitrag", () => {
    const r = erwarteAufgang(e, "2025-01");
    expect(zeile(r, "fixkosten")?.ist).toBe(-5000);
    expect(zeile(r, "fixkosten")?.plan).toBe(-5000);
    // Bezahlt 600, davon gehören 550 späteren Monaten.
    expect(posten(r, "periodisierung")).toBe(-55000);
  });

  it("kostet auch in einem Monat ohne Zahlung sein Zwölftel", () => {
    const r = erwarteAufgang(e, "2025-07");
    expect(zeile(r, "fixkosten")?.ist).toBe(-5000);
    expect(posten(r, "periodisierung")).toBe(5000);
    expect(r.ueberleitung?.kontoaenderung).toBe(0);
  });

  it("kostet vor der ersten Fälligkeit nichts", () => {
    const r = rechne(e, "2024-12");
    expect(zeile(r, "fixkosten")?.plan).toBe(0);
  });

  it("zeigt eine Vertragszahlung ohne Regel unverteilt und ohne Plan", () => {
    const fremd = ist("2025-03-03", -1900, { kategorieId: "absicherung" });
    const r = erwarteAufgang(eingabe({ ist: [fremd], vertragJeBuchung: new Map([[fremd.id, "v9"]]) }), "2025-03");
    expect(zeile(r, "fixkosten")?.posten[0]).toMatchObject({ ist: -1900, plan: 0, status: "ohnePlan" });
  });
});

describe("Wagnisse — das aufbauende Budget", () => {
  const topf = budget({ id: "reise", kategorieId: "reise", art: "aufbauend", rate: 10000, start: "2025-01-01" });

  it("kostet die Rate, auch wenn im Monat viel entnommen wird", () => {
    // Zwölf Raten bis Dezember = 1.200; im Dezember gehen 1.200 raus.
    const e = eingabe({ budgets: [topf], ist: [ist("2025-12-05", -120000, { kategorieId: "flug" })] });
    const r = erwarteAufgang(e, "2025-12");
    expect(zeile(r, "wagnisse")?.ist).toBe(-10000);
    expect(zeile(r, "wagnisse")?.posten[0].entnahme).toBe(-120000);
    expect(posten(r, "raten")).toBe(10000);
    expect(posten(r, "entnahmen")).toBe(-120000);
  });

  it("kostet die Rate in einem Monat ohne Entnahme", () => {
    const r = erwarteAufgang(eingabe({ budgets: [topf] }), "2025-05");
    expect(zeile(r, "wagnisse")?.ist).toBe(-10000);
    expect(r.ueberleitung?.kontoaenderung).toBe(0);
  });

  it("rechnet das Ungedeckte zu den Kosten des Monats", () => {
    // Bis Juni sind 600 im Topf, entnommen werden 900: 300 sind ungedeckt.
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    const r = erwarteAufgang(e, "2025-06");
    expect(zeile(r, "wagnisse")?.ist).toBe(-40000);
  });

  it("zählt die Rate nicht noch einmal, solange sie nur das Loch füllt", () => {
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    expect(zeile(erwarteAufgang(e, "2025-07"), "wagnisse")?.ist ?? 0).toBe(0);
    expect(zeile(erwarteAufgang(e, "2025-08"), "wagnisse")?.ist ?? 0).toBe(0);
    // Ende September ist das Loch gefüllt (900 Raten gegen 900 Ausgaben), ab Oktober
    // kostet der Topf wieder seine Rate.
    expect(zeile(erwarteAufgang(e, "2025-10"), "wagnisse")?.ist).toBe(-10000);
  });

  it("kostet über die ganze Zeit nie weniger als ausgegeben und nie weniger als die Raten", () => {
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    const monate = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const gesamt = monate.reduce((s, m) => s + (zeile(rechne(e, `2025-${m}`), "wagnisse")?.ist ?? 0), 0);
    expect(gesamt).toBe(-120000);
  });
});

describe("Abschreibungen — die Rücklage", () => {
  const geraet: Ruecklage = { id: "g", bezeichnung: "Gerät", ziel: 96000, fristMonate: 96, beginn: "2025-01-01" };

  it("kostet den Zuwachs ihres Solls, ohne dass Geld fliesst", () => {
    const r = erwarteAufgang(eingabe({ ruecklagen: [geraet] }), "2025-04");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-1000);
    expect(posten(r, "raten")).toBe(1000);
  });

  it("zählt den Kauf als Entnahme und nicht ein zweites Mal als Kosten", () => {
    const kauf = ist("2025-04-12", -96000, { kategorieId: "haushalt", budgetrelevant: false });
    const r = erwarteAufgang(eingabe({ ruecklagen: [geraet], ist: [kauf] }), "2025-04");
    expect(zeile(r, "ungeplant")).toBeUndefined();
    expect(posten(r, "entnahmen")).toBe(-96000);
    expect(r.ergebnis.ist).toBe(-1000);
  });
});

describe("Abschreibungen — wann eine Rücklage kostet", () => {
  const frei: Ruecklage = { id: "f", bezeichnung: "Puffer", rate: 5000, beginn: "2025-01-01" };
  const mitZiel: Ruecklage = { id: "z", bezeichnung: "Gerät", ziel: 60000, fristMonate: 12, beginn: "2025-01-01" };
  const kosten = (ruecklagen: Ruecklage[], monat: string, heute = "2025-12-31") =>
    zeile(rechne(eingabe({ ruecklagen, heute }), monat), "abschreibungen");

  it("plant im künftigen Monat, ohne ein Ist zu behaupten", () => {
    expect(kosten([frei], "2025-10", "2025-08-16")).toMatchObject({ plan: -5000, ist: null });
  });

  it("kostet nichts mehr, wenn das Ziel erreicht ist — und nichts vor dem Beginn", () => {
    const erreicht = { ...mitZiel, fristMonate: 3 };
    const spaeter = { ...frei, beginn: "2025-09-01" };
    expect(kosten([erreicht, spaeter], "2025-08")).toBeUndefined();
  });

  it("zählt den Monat des Beginns mit", () => {
    expect(kosten([{ ...frei, beginn: "2025-08-20" }], "2025-08")?.plan).toBe(-5000);
  });
});

describe("Vorsorge", () => {
  it("zählt die Umbuchung auf ein Vorsorgekonto als Kosten, obwohl das Geld bleibt", () => {
    const raus = ist("2025-02-01", -30000, { charakter: "Umschichtung", transferId: "t1", gegenkontoId: "depotkonto" });
    const rein = ist("2025-02-01", 30000, {
      charakter: "Umschichtung",
      transferId: "t1",
      kontoId: "depotkonto",
      gegenkontoId: "giro",
    });
    const r = erwarteAufgang(eingabe({ ist: [raus, rein] }), "2025-02");
    expect(zeile(r, "vorsorge")?.ist).toBe(-30000);
    expect(posten(r, "vorsorgeEigen")).toBe(30000);
    expect(r.ueberleitung?.kontoaenderung).toBe(0);
  });

  it("lässt eine Umbuchung aufs Sparkonto ganz heraus", () => {
    const raus = ist("2025-02-01", -30000, { charakter: "Umschichtung", transferId: "t1", gegenkontoId: "spar" });
    const rein = ist("2025-02-01", 30000, { charakter: "Umschichtung", transferId: "t1", kontoId: "spar", gegenkontoId: "giro" });
    const r = erwarteAufgang(eingabe({ ist: [raus, rein] }), "2025-02");
    expect(zeile(r, "vorsorge")).toBeUndefined();
    expect(r.ergebnis.ist).toBe(0);
  });

  it("zählt Geld, das die erfassten Konten verlässt und Vermögen bleibt", () => {
    const kauf = ist("2025-02-03", -25000, { charakter: "Umschichtung" });
    const r = erwarteAufgang(eingabe({ ist: [kauf] }), "2025-02");
    expect(zeile(r, "vorsorge")?.ist).toBe(-25000);
    expect(posten(r, "vorsorgeEigen")).toBe(0);
  });
});

describe("die Stufen", () => {
  it("rechnen einen ganzen Monat nach der Gliederung und gehen gegen die Buchungen auf", () => {
    const gehalt = ist("2025-06-01", 300000, { kategorieId: "gehalt" });
    const beitrag = ist("2025-01-10", -60000, { kategorieId: "absicherung" });
    const e = eingabe({
      regeln: [
        regel({}),
        regel({ id: "r-gehalt", bezeichnung: "Ohlert", betrag: 300000, rhythmus: "monatlich", charakter: "Ertrag", kategorieId: "gehalt", vertragId: "v-gehalt", startdatum: "2025-01-01" }),
      ],
      budgets: [
        budget({ id: "alltag", rate: 70000 }),
        budget({ id: "reise", kategorieId: "reise", art: "aufbauend", rate: 20000 }),
      ],
      ruecklagen: [{ id: "g", bezeichnung: "Gerät", rate: 15000, beginn: "2025-01-01" }],
      ist: [gehalt, beitrag, ist("2025-06-07", -45000, { kategorieId: "markt" }), ist("2025-06-09", -3000, { kategorieId: "haushalt" })],
      vertragJeBuchung: new Map([
        [gehalt.id, "v-gehalt"],
        [beitrag.id, "v1"],
      ]),
    });
    const r = erwarteAufgang(e, "2025-06");
    expect(r.nachPflichten).toEqual({ plan: 295000, ist: 295000 });
    expect(r.nachAlltag).toEqual({ plan: 225000, ist: 247000 });
    expect(r.ergebnis).toEqual({ plan: 190000, ist: 212000 });
  });

  it("geben einem künftigen Monat nur den Plan und keine Überleitung", () => {
    const r = rechne(eingabe({ budgets: [budget({ rate: 70000 })], heute: "2025-03-15" }), "2025-05");
    expect(r.zukunft).toBe(true);
    expect(r.ergebnis).toEqual({ plan: -70000, ist: null });
    expect(r.ueberleitung).toBeUndefined();
  });
});

describe("Einordnung", () => {
  it("ordnet die Anteile einer geteilten Buchung einzeln ein", () => {
    const b = ist("2025-06-07", -5000, {
      aufteilungen: [
        { kategorieId: "markt", betrag: -3000 },
        { kategorieId: "flug", betrag: -2000 },
      ],
    });
    const e = eingabe({
      budgets: [budget({ id: "alltag", rate: 70000 }), budget({ id: "reise", kategorieId: "reise", art: "aufbauend", rate: 20000 })],
      ist: [b],
    });
    expect(einordnen(e.ist, einordnungskontext(e)).map((x) => [x.art, x.budgetId, x.betrag])).toEqual([
      ["laufend", "alltag", -3000],
      ["topf", "reise", -2000],
    ]);
  });

  it("behält eine Erstattung in der Art ihrer Ausgabe, mit ihrem Vorzeichen", () => {
    const e = eingabe({ budgets: [budget({ id: "alltag", rate: 70000 })], ist: [ist("2025-06-07", 1200, { charakter: "Aufwand", kategorieId: "markt" })] });
    const r = erwarteAufgang(e, "2025-06");
    expect(zeile(r, "laufend")?.ist).toBe(1200);
    expect(zeile(r, "einnahmen")?.ist).toBe(0);
  });
});

const ruecklage = (over: Partial<Ruecklage>): Ruecklage => ({ id: "rl", bezeichnung: "Vibora", beginn: "2025-01-01", ...over });

describe("Kennzahlen über mehrere Monate", () => {
  // Ein Haushalt mit je einer Zeile jeder Art, damit keine Quote zufällig stimmt.
  const haushalt = (over: Partial<ErgebnisEingabe> = {}) =>
    eingabe({
      regeln: [regel({ id: "miete", bezeichnung: "Ohlert", betrag: -100000, rhythmus: "monatlich", startdatum: "2025-01-03", vertragId: "v-miete" })],
      budgets: [
        budget({ id: "alltag", rate: 50000 }),
        budget({ id: "reise", kategorieId: "reise", art: "aufbauend", rate: 20000 }),
      ],
      ruecklagen: [ruecklage({ rate: 10000 })],
      ...over,
    });
  const monat = (m: string, gehalt: number) => {
    const miete = ist(`${m}-03`, -100000, { kategorieId: "absicherung" });
    return {
      buchungen: [ist(`${m}-01`, gehalt, { kategorieId: "gehalt" }), miete, ist(`${m}-12`, -40000, { kategorieId: "markt" })],
      vertrag: [miete.id, "v-miete"] as const,
    };
  };

  it("mittelt Kosten und Ergebnis und bildet die Quoten über die Summen", () => {
    const a = monat("2025-05", 300000);
    const b = monat("2025-06", 100000);
    const e = haushalt({ ist: [...a.buchungen, ...b.buchungen], vertragJeBuchung: new Map([a.vertrag, b.vertrag]) });
    const monate = [rechne(e, "2025-05"), rechne(e, "2025-06")];

    // Je Monat: 1000 fix + 400 Alltag + 100 Rücklage + 200 Topf.
    expect(monate.map(monatsKosten)).toEqual([170000, 170000]);
    const k = ergebnisKennzahlen(monate);
    expect(k).toMatchObject({ monate: 2, kostenJeMonat: 170000, ergebnisJeMonat: 30000 });
    // Über die Summen: 2000 von 4000 — nicht das Mittel aus einem Drittel und dem Ganzen.
    expect(k.fixkostenquote).toBeCloseTo(0.5, 10);
    expect(k.sparquote).toBeCloseTo(60000 / 400000, 10);
  });

  it("nennt ohne Einnahmen keine Quote statt einer Null", () => {
    const a = monat("2025-05", 0);
    const e = haushalt({ ist: a.buchungen.slice(1), vertragJeBuchung: new Map([a.vertrag]) });
    const k = ergebnisKennzahlen([rechne(e, "2025-05")]);
    expect(k.fixkostenquote).toBeNull();
    expect(k.sparquote).toBeNull();
    expect(k.kostenJeMonat).toBe(170000);
  });

  it("lässt eine Erstattung die Kosten senken", () => {
    const e = eingabe({
      budgets: [budget({ id: "alltag", rate: 50000 })],
      ist: [ist("2025-05-07", -30000, { kategorieId: "markt" }), ist("2025-05-20", 5000, { charakter: "Aufwand", kategorieId: "markt" })],
    });
    expect(monatsKosten(rechne(e, "2025-05"))).toBe(25000);
  });

  it("zählt künftige Monate nicht mit und bleibt ohne Monate bei null", () => {
    const e = haushalt({ heute: "2025-05-31" });
    expect(ergebnisKennzahlen([rechne(e, "2025-07")])).toEqual({
      monate: 0, kostenJeMonat: 0, ergebnisJeMonat: 0, fixkostenquote: null, sparquote: null,
    });
    expect(ergebnisKennzahlen([]).monate).toBe(0);
  });
});

describe("Die Grenze nach hinten: ausgebuchte Rücklagen", () => {
  it("zeigt vor dem neuen Beginn keine Rate — und sagt, welche Monate das trifft", () => {
    // Die Rücklage lief seit Jahren und wurde im Juni ausgebucht: `beginn` steht auf dem
    // Tag der Ausgabe. Im Mai wurde zurückgelegt, die Rechnung weiss es nicht mehr.
    const e = eingabe({ ruecklagen: [ruecklage({ rate: 10000, beginn: "2025-06-14" })] });
    expect(zeile(rechne(e, "2025-05"), "abschreibungen")).toBeUndefined();
    expect(zeile(rechne(e, "2025-06"), "abschreibungen")?.ist).toBe(-10000);

    const ausbuchungen = ["2025-06-14"];
    expect(ruecklagenrateFehlt("2025-05", ausbuchungen)).toBe(true);
    // Der Monat der Ausbuchung trägt schon die erste Rate des neuen Zyklus.
    expect(ruecklagenrateFehlt("2025-06", ausbuchungen)).toBe(false);
    expect(ruecklagenrateFehlt("2025-07", ausbuchungen)).toBe(false);
    expect(ruecklagenrateFehlt("2025-05", [])).toBe(false);
  });
});
