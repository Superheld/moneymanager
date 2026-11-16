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
  type ErgebnisSchulden,
  type ErgebnisVorsorge,
  type ErgebnisZeileId,
  type MonatsErgebnis,
} from "./ergebnis";
import type { Kategorie } from "./kategorien/kategorie";
import type { Zahlungskonto } from "./konten/konto";
import type { Ruecklage } from "./ruecklagen/ruecklage";
import type { Vorsorgezielannahme } from "./vorsorge/vorsorge";

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
    ausbuchungen: [],
    ruecklagenzuordnungen: [],
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

describe("Das aufbauende Budget — in der Zeile der Rücklagen", () => {
  const topf = budget({ id: "reise", kategorieId: "reise", art: "aufbauend", rate: 10000, start: "2025-01-01" });

  it("kostet die Rate, auch wenn im Monat viel entnommen wird", () => {
    // Zwölf Raten bis Dezember = 1.200; im Dezember gehen 1.200 raus.
    const e = eingabe({ budgets: [topf], ist: [ist("2025-12-05", -120000, { kategorieId: "flug" })] });
    const r = erwarteAufgang(e, "2025-12");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-10000);
    expect(zeile(r, "abschreibungen")?.posten[0].entnahme).toBe(-120000);
    expect(posten(r, "raten")).toBe(10000);
    expect(posten(r, "entnahmen")).toBe(-120000);
  });

  it("kostet die Rate in einem Monat ohne Entnahme", () => {
    const r = erwarteAufgang(eingabe({ budgets: [topf] }), "2025-05");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-10000);
    expect(r.ueberleitung?.kontoaenderung).toBe(0);
  });

  it("rechnet das Ungedeckte zu den Kosten des Monats", () => {
    // Bis Juni sind 600 im Topf, entnommen werden 900: 300 sind ungedeckt.
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    const r = erwarteAufgang(e, "2025-06");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-40000);
  });

  it("zählt die Rate nicht noch einmal, solange sie nur das Loch füllt", () => {
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    expect(zeile(erwarteAufgang(e, "2025-07"), "abschreibungen")?.ist ?? 0).toBe(0);
    expect(zeile(erwarteAufgang(e, "2025-08"), "abschreibungen")?.ist ?? 0).toBe(0);
    // Ende September ist das Loch gefüllt (900 Raten gegen 900 Ausgaben), ab Oktober
    // kostet der Topf wieder seine Rate.
    expect(zeile(erwarteAufgang(e, "2025-10"), "abschreibungen")?.ist).toBe(-10000);
  });

  it("kostet über die ganze Zeit nie weniger als ausgegeben und nie weniger als die Raten", () => {
    const e = eingabe({ budgets: [topf], ist: [ist("2025-06-20", -90000, { kategorieId: "reise" })] });
    const monate = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const gesamt = monate.reduce((s, m) => s + (zeile(rechne(e, `2025-${m}`), "abschreibungen")?.ist ?? 0), 0);
    expect(gesamt).toBe(-120000);
  });
});

describe("Rücklagen und aufbauende Budgets — EINE Zeile", () => {
  // Seit 2026-11-15 heissen beide in der Oberfläche „Rücklagen"; die Ergebnisrechnung
  // führt sie deshalb in einer Zeile. Jeder Posten rechnet weiter nach seiner Regel —
  // die Probe hier ist, dass die Zeile die Summe beider ist und am Ergebnis nichts rückt.
  const topf = budget({ id: "ferien", kategorieId: "ferien", art: "aufbauend", rate: 7000, start: "2025-01-01" });
  const geraet: Ruecklage = { id: "g", bezeichnung: "Gerät", ziel: 96000, fristMonate: 96, beginn: "2025-01-01" };
  const entnahme = ist("2025-06-20", -90000, { kategorieId: "ferien" });

  it("ist die Summe aus Rücklage und aufbauendem Budget", () => {
    const nurTopf = rechne(eingabe({ budgets: [topf], ist: [entnahme] }), "2025-06");
    const nurRuecklage = rechne(eingabe({ ruecklagen: [geraet], ist: [entnahme] }), "2025-06");
    const beide = erwarteAufgang(eingabe({ budgets: [topf], ruecklagen: [geraet], ist: [entnahme] }), "2025-06");

    const z = zeile(beide, "abschreibungen")!;
    expect(z.posten.map((p) => p.budgetId ?? p.ruecklageId).sort()).toEqual(["ferien", "g"]);
    expect(z.ist).toBe((zeile(nurTopf, "abschreibungen")?.ist ?? 0) + (zeile(nurRuecklage, "abschreibungen")?.ist ?? 0));
    expect(z.plan).toBe((zeile(nurTopf, "abschreibungen")?.plan ?? 0) + (zeile(nurRuecklage, "abschreibungen")?.plan ?? 0));
    expect(beide.zeilen.map((x) => x.id)).not.toContain("wagnisse");
  });

  it("lässt Ergebnis und Überleitung unverändert", () => {
    const beide = erwarteAufgang(eingabe({ budgets: [topf], ruecklagen: [geraet], ist: [entnahme] }), "2025-06");
    // Von Hand gerechnet: Rate des Topfs 70, bis Juni 420 angespart gegen 900 Ausgaben —
    // der Monat kostet 70 + 410 (bis Mai 350 angespart, also max(420, 900) − max(350, 0)
    // = 550); die Rücklage kostet 10. Zusammen 560.
    expect(zeile(beide, "abschreibungen")?.ist).toBe(-56000);
    expect(beide.ergebnis.ist).toBe(-56000);
    expect(posten(beide, "raten")).toBe(56000);
    expect(posten(beide, "entnahmen")).toBe(-90000);
  });
});

describe("Abschreibungen — die Rücklage", () => {
  const geraet: Ruecklage = { id: "g", bezeichnung: "Gerät", ziel: 96000, fristMonate: 96, beginn: "2025-01-01" };

  it("kostet den Zuwachs ihres Solls, ohne dass Geld fliesst", () => {
    const r = erwarteAufgang(eingabe({ ruecklagen: [geraet] }), "2025-04");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-1000);
    expect(posten(r, "raten")).toBe(1000);
  });

  // Eine Ausbuchung von vor Migration 76: sie kennt die Buchung, aber nicht den Zyklus.
  const ohneGeschichte = (kaufId: string) => [{ id: "a0", ruecklageId: "g", datum: "2025-04-12", istbuchungId: kaufId }];

  it("zählt den Kauf als Entnahme und nicht ein zweites Mal als Kosten", () => {
    const kauf = ist("2025-04-12", -96000, { kategorieId: "haushalt", budgetrelevant: false });
    const r = erwarteAufgang(eingabe({ ruecklagen: [geraet], ist: [kauf], ausbuchungen: ohneGeschichte(kauf.id) }), "2025-04");
    expect(zeile(r, "ungeplant")).toBeUndefined();
    expect(posten(r, "entnahmen")).toBe(-96000);
    expect(r.ergebnis.ist).toBe(-1000);
  });

  it("zählt eine Ausgabe als Kosten, die nur von Hand aus den Budgets genommen wurde", () => {
    // Keine Rücklage wurde dafür ausgebucht: angespart war nichts, also kostet sie
    // ihren Monat. Sonst hätte sie nie etwas gekostet.
    const kauf = ist("2025-04-12", -80000, { kategorieId: "haushalt", budgetrelevant: false });
    const r = erwarteAufgang(eingabe({ ist: [kauf] }), "2025-04");
    expect(zeile(r, "ungeplant")?.ist).toBe(-80000);
    expect(posten(r, "entnahmen")).toBe(0);
  });
});

describe("Abschreibungen — der beendete Zyklus", () => {
  // Eine freie Rücklage: 50 je Monat seit Januar, im Juli ausgebucht. Angespart: 300.
  const zyklus = (kaufId?: string) => ({
    id: "a1", ruecklageId: "u", bezeichnung: "Reise", datum: "2025-07-10",
    istbuchungId: kaufId, zyklusBeginn: "2025-01-01", zyklusRate: 5000,
  });

  it("kostet in den Monaten vor dem Ausbuchen weiter seine Rate", () => {
    const r = erwarteAufgang(eingabe({ ausbuchungen: [zyklus()] }), "2025-03");
    expect(zeile(r, "abschreibungen")?.ist).toBe(-5000);
  });

  it("kostet nach dem Ausbuchen nichts mehr", () => {
    const r = erwarteAufgang(eingabe({ ausbuchungen: [zyklus()] }), "2025-09");
    expect(zeile(r, "abschreibungen")).toBeUndefined();
  });

  it("lässt einen Kauf bis zur Höhe des Angesparten nichts kosten", () => {
    const kauf = ist("2025-07-10", -28000, { kategorieId: "reise", budgetrelevant: false });
    const r = erwarteAufgang(eingabe({ ist: [kauf], ausbuchungen: [zyklus(kauf.id)] }), "2025-07");
    // Angespart sind sechs volle Monate zu 50 = 300; der angefangene Juli zählt nicht
    // mehr. Der Kauf liegt darunter und kostet nichts.
    expect(zeile(r, "abschreibungen")?.ist).toBe(0);
    expect(posten(r, "entnahmen")).toBe(-28000);
  });

  it("zählt, was über das Angesparte hinausgeht, als Kosten des Kaufmonats", () => {
    const kauf = ist("2025-07-10", -45000, { kategorieId: "reise", budgetrelevant: false });
    const r = erwarteAufgang(eingabe({ ist: [kauf], ausbuchungen: [zyklus(kauf.id)] }), "2025-07");
    // Angespart 300, gekauft für 450: 150 sind ungedeckt.
    expect(zeile(r, "abschreibungen")?.ist).toBe(-15000);
    expect(zeile(r, "ungeplant")).toBeUndefined();
  });

  it("zählt das Ungedeckte nicht doppelt, wenn die Buchung inzwischen an einem Vertrag hängt", () => {
    const kauf = ist("2025-07-10", -45000, { kategorieId: "reise", budgetrelevant: false });
    const e = eingabe({ ist: [kauf], ausbuchungen: [zyklus(kauf.id)], vertragJeBuchung: new Map([[kauf.id, "v9"]]) });
    const r = erwarteAufgang(e, "2025-07");
    // Sie zählt dort als Vertragszahlung; die Rücklagenzeile bleibt leer.
    expect(zeile(r, "abschreibungen")).toBeUndefined();
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

describe("Vorsorge mit Ziel — die Rate statt der Überweisung", () => {
  // Rendite null, damit die Raten von Hand nachzurechnen sind: Lücke 1.000 je Monat über
  // elf Monate Entnahme ergibt einen Bedarf von 11.000; ab Februar bleiben elf Monate bis
  // zum Zielmonat, die Rate ist also (11.000 − Vermögen) ÷ verbleibende Monate.
  const annahme = (over: Partial<Vorsorgezielannahme> = {}): Vorsorgezielannahme => ({
    zielId: "z1",
    abMonat: "2025-02",
    zielMonat: "2026-01",
    wunschMonatlich: 250000,
    renteMonatlich: 150000,
    entnahmeMonate: 11,
    renditeBp: 0,
    ...over,
  });
  const mitZiel = (ist: IstBuchung[], annahmen = [annahme()], over: Partial<ErgebnisEingabe> = {}) => {
    const vorsorge: ErgebnisVorsorge = {
      zielId: "z1",
      bezeichnung: "Lindqvist",
      annahmen,
      bestand: { konten: KONTEN, buchungen: ist, depotwerte: [], gegenstaende: [], werte: [] },
    };
    return eingabe({ ist, vorsorge, ...over });
  };
  const umbuchung = (datum: string, betrag: number, t: string) => [
    ist(datum, -betrag, { charakter: "Umschichtung", transferId: t, gegenkontoId: "depotkonto" }),
    ist(datum, betrag, { charakter: "Umschichtung", transferId: t, kontoId: "depotkonto", gegenkontoId: "giro" }),
  ];
  const vorsorgeposten = (r: MonatsErgebnis) => zeile(r, "vorsorge")?.posten[0];

  it("kostet die Rate, und die Umbuchung steht als Zuführung in der Überleitung", () => {
    const r = erwarteAufgang(mitZiel(umbuchung("2025-02-10", 30000, "t1")), "2025-02");
    expect(zeile(r, "vorsorge")?.plan).toBe(-100000);
    expect(zeile(r, "vorsorge")?.ist).toBe(-100000);
    expect(vorsorgeposten(r)?.zufuehrung).toBe(-30000);
    expect(vorsorgeposten(r)?.bezeichnung).toBe("Lindqvist");
    expect(posten(r, "raten")).toBe(100000);
    expect(posten(r, "zufuehrung")).toBe(-30000);
    expect(posten(r, "vorsorgeEigen")).toBe(30000);
    expect(r.ueberleitung?.kontoaenderung).toBe(0);
  });

  it("kostet die Rate auch, wenn nichts überwiesen wurde", () => {
    const r = erwarteAufgang(mitZiel([ist("2025-02-05", -4000, { kategorieId: "haushalt" })]), "2025-02");
    expect(zeile(r, "vorsorge")?.ist).toBe(-100000);
    expect(vorsorgeposten(r)?.zufuehrung).toBe(0);
    expect(posten(r, "raten")).toBe(100000);
    expect(posten(r, "zufuehrung")).toBe(0);
  });

  it("kostet nicht mehr als die Rate, wenn mehr überwiesen wurde", () => {
    const kauf = ist("2025-02-03", -250000, { charakter: "Umschichtung" });
    const r = erwarteAufgang(mitZiel([kauf]), "2025-02");
    expect(zeile(r, "vorsorge")?.ist).toBe(-100000);
    expect(vorsorgeposten(r)?.zufuehrung).toBe(-250000);
    expect(posten(r, "zufuehrung")).toBe(-250000);
    expect(posten(r, "vorsorgeEigen")).toBe(0);
    expect(r.ueberleitung?.kontoaenderung).toBe(-250000);
  });

  it("rechnet zum Monatsanfang: was danach eingeht, ändert die Rate dieses Monats nicht", () => {
    // Eine Überweisung am Ersten zählt erst ab dem Folgemonat, eine spätere erst recht.
    const ist = [...umbuchung("2025-02-01", 30000, "t1"), ...umbuchung("2025-04-15", 50000, "t2")];
    expect(rechne(mitZiel(ist), "2025-02").ergebnis.ist).toBe(-100000);
    // März: (11.000 − 300) ÷ 10 verbleibende Monate.
    expect(zeile(rechne(mitZiel(ist), "2025-03"), "vorsorge")?.ist).toBe(-107000);
    erwarteAufgang(mitZiel(ist), "2025-03");
  });

  it("rechnet vor der ersten Annahme genau wie ohne Ziel", () => {
    const ist = umbuchung("2025-01-10", 30000, "t1");
    const ohne = rechne(eingabe({ ist }), "2025-01");
    const mit = erwarteAufgang(mitZiel(ist), "2025-01");
    expect(mit).toEqual(ohne);
    expect(zeile(mit, "vorsorge")?.ist).toBe(-30000);
  });

  it("nimmt je Monat die Annahme, die damals galt", () => {
    const annahmen = [annahme(), annahme({ abMonat: "2025-03", wunschMonatlich: 200000 })];
    const e = mitZiel([], annahmen);
    expect(zeile(rechne(e, "2025-02"), "vorsorge")?.ist).toBe(-100000);
    // Ab März: Lücke 500 × 11 = 5.500 über zehn Monate.
    expect(zeile(rechne(e, "2025-03"), "vorsorge")?.ist).toBe(-55000);
    erwarteAufgang(e, "2025-03");
  });

  it("verlangt ab dem Zielmonat keine Rate mehr und zählt wieder die Überweisung", () => {
    // Am Zielmonat ist das Ziel nicht mehr erreichbar (`sparrate === null`).
    const ist = umbuchung("2026-01-10", 30000, "t1");
    const ohne = rechne(eingabe({ ist, heute: "2026-02-15" }), "2026-01");
    const mit = erwarteAufgang(mitZiel(ist, [annahme()], { heute: "2026-02-15" }), "2026-01");
    expect(mit).toEqual(ohne);
    expect(zeile(mit, "vorsorge")?.ist).toBe(-30000);
  });

  it("kostet nichts, wenn das Ziel gedeckt ist — die Überweisung bleibt sichtbar", () => {
    const konten = KONTEN.map((k) => (k.id === "depotkonto" ? { ...k, saldo: 2000000 } : k));
    const ist = umbuchung("2025-02-10", 30000, "t1");
    // Nur der Bestand des Ziels kennt den Anfangsbestand; die Ergebnisrechnung braucht ihn nicht.
    const e = mitZiel(ist);
    const r = erwarteAufgang({ ...e, vorsorge: { ...e.vorsorge!, bestand: { ...e.vorsorge!.bestand, konten } } }, "2025-02");
    expect(zeile(r, "vorsorge")?.ist).toBe(0);
    expect(vorsorgeposten(r)?.zufuehrung).toBe(-30000);
    expect(posten(r, "raten")).toBe(0);
    expect(r.ergebnis.ist).toBe(0);
  });

  it("plant die Rate in künftigen Monaten und rechnet sie im laufenden ganz", () => {
    const e = mitZiel([], [annahme()], { heute: "2025-02-15" });
    const laufend = rechne(e, "2025-02");
    expect(laufend.erwartet).toBe(-100000);
    const kuenftig = rechne(e, "2025-03");
    expect(zeile(kuenftig, "vorsorge")?.plan).toBe(-110000);
    expect(zeile(kuenftig, "vorsorge")?.ist).toBeNull();
    expect(vorsorgeposten(kuenftig)?.zufuehrung).toBeUndefined();
  });

  it("ersetzt einen Dauerauftrag auf das Vorsorgekonto, statt ihn neben die Rate zu stellen", () => {
    const dauerauftrag = regel({ id: "rv", vertragId: undefined, bezeichnung: "Brandauer", betrag: -30000, rhythmus: "monatlich", startdatum: "2025-01-10", charakter: "Umschichtung", kategorieId: undefined, kontoId: "giro", gegenkontoId: "depotkonto" });
    const e = mitZiel(umbuchung("2025-02-10", 30000, "t1"), [annahme()], { regeln: [dauerauftrag] });
    const r = erwarteAufgang(e, "2025-02");
    expect(zeile(r, "vorsorge")?.posten).toHaveLength(1);
    expect(zeile(r, "vorsorge")?.plan).toBe(-100000);
  });
});

describe("Tilgung — die Kreditrate in Zinsen und Tilgung geteilt", () => {
  // Rate 1.000 im Monat; die Restschuld sinkt über 2025 um 1.200, also 100 Tilgung je
  // Monat und 900 Zinsen.
  const rate = regel({ id: "rk", vertragId: "vk", bezeichnung: "Brenneke", betrag: -100000, rhythmus: "monatlich", startdatum: "2025-01-15" });
  const schulden = (over: Partial<ErgebnisSchulden["verbindlichkeiten"][number]> = {}, staende = [
    { verbindlichkeitId: "s1", stichtag: "2024-12-31", restschuld: 5_000_000 },
    { verbindlichkeitId: "s1", stichtag: "2025-12-31", restschuld: 4_880_000 },
  ]): ErgebnisSchulden => ({
    verbindlichkeiten: [{ id: "s1", bezeichnung: "Halvorsen", art: "ratenkredit", vertragId: "vk", ...over }],
    staende,
  });
  const gezahlt = (datum: string, betrag = -100000) => ist(datum, betrag, { kategorieId: "absicherung" });
  const mitRate = (buchungen: IstBuchung[], over: Partial<ErgebnisEingabe> = {}) =>
    eingabe({ regeln: [rate], ist: buchungen, vertragJeBuchung: new Map(buchungen.map((b) => [b.id, "vk"])), ...over });
  const tilgungsposten = (r: MonatsErgebnis) => zeile(r, "tilgung")?.posten[0];

  it("zeigt unter den Verträgen die Zinsen und die Tilgung in der dritten Stufe", () => {
    const e = mitRate([gezahlt("2025-06-15")]);
    const ohne = rechne(e, "2025-06");
    const r = erwarteAufgang({ ...e, schulden: schulden() }, "2025-06");
    expect(zeile(r, "fixkosten")).toMatchObject({ plan: -90000, ist: -90000 });
    expect(zeile(r, "fixkosten")?.posten[0].nurZinsen).toBe(true);
    expect(zeile(r, "tilgung")).toMatchObject({ plan: -10000, ist: -10000 });
    expect(tilgungsposten(r)).toMatchObject({ bezeichnung: "Halvorsen", verbindlichkeitId: "s1", vertragId: "vk", status: "gebucht" });
    // Bleibt wirklich frei ändert sich nicht, die Zwischensummen davor schon.
    expect(r.ergebnis).toEqual(ohne.ergebnis);
    expect(r.nachPflichten.ist).toBe((ohne.nachPflichten.ist ?? 0) + 10000);
    expect(r.ueberleitung).toEqual(ohne.ueberleitung);
  });

  it("rechnet ohne verknüpfte Schuld genau wie vorher", () => {
    const e = mitRate([gezahlt("2025-06-15")]);
    const ohne = rechne(e, "2025-06");
    expect(rechne({ ...e, schulden: { verbindlichkeiten: [], staende: [] } }, "2025-06")).toEqual(ohne);
    expect(rechne({ ...e, schulden: schulden({ vertragId: undefined }) }, "2025-06")).toEqual(ohne);
    // Eine einzige Restschuld sagt nichts über die Tilgung.
    const eine = schulden({}, [{ verbindlichkeitId: "s1", stichtag: "2024-12-31", restschuld: 5_000_000 }]);
    expect(rechne({ ...e, schulden: eine }, "2025-06")).toEqual(ohne);
    // Vor der ersten Beobachtung ebenso.
    const frueh = mitRate([gezahlt("2024-12-15")]);
    expect(rechne({ ...frueh, schulden: schulden() }, "2024-12")).toEqual(rechne(frueh, "2024-12"));
    expect(zeile(rechne(e, "2025-06"), "tilgung")).toBeUndefined();
  });

  it("schreibt nach der jüngsten Restschuld die letzte Monatstilgung fort", () => {
    const e = mitRate([gezahlt("2026-03-15")], { heute: "2026-03-31", schulden: schulden() });
    const r = erwarteAufgang(e, "2026-03");
    expect(zeile(r, "tilgung")?.ist).toBe(-10000);
  });

  it("tilgt nie mehr, als der Vertrag im Monat kostet", () => {
    // Die Restschuld sinkt um 2.400 im Jahr, die Rate ist 1.000: der Rest war Sondertilgung.
    const viel = schulden({}, [
      { verbindlichkeitId: "s1", stichtag: "2024-12-31", restschuld: 5_000_000 },
      { verbindlichkeitId: "s1", stichtag: "2025-12-31", restschuld: 2_600_000 },
    ]);
    const r = erwarteAufgang(mitRate([gezahlt("2025-06-15")], { schulden: viel }), "2025-06");
    expect(zeile(r, "tilgung")?.ist).toBe(-100000);
    expect(zeile(r, "fixkosten")?.ist).toBe(0);
  });

  it("teilt im Ist nichts, solange die Rate nicht abgebucht ist", () => {
    const r = erwarteAufgang(mitRate([], { schulden: schulden() }), "2025-06");
    expect(zeile(r, "tilgung")).toMatchObject({ plan: -10000, ist: 0 });
    expect(tilgungsposten(r)?.status).toBe("offen");
    expect(zeile(r, "fixkosten")).toMatchObject({ plan: -90000, ist: 0 });
  });

  it("rechnet den laufenden Monat mit offener Rate genauso hoch wie ohne Teilung", () => {
    const e = mitRate([], { heute: "2025-06-10" });
    const r = rechne({ ...e, schulden: schulden() }, "2025-06");
    expect(r.erwartet).toBe(rechne(e, "2025-06").erwartet);
    expect(r.erwartet).toBe(-100000);
  });

  it("plant die Teilung in künftigen Monaten", () => {
    const r = rechne(mitRate([], { heute: "2025-03-10", schulden: schulden() }), "2025-05");
    expect(zeile(r, "tilgung")).toMatchObject({ plan: -10000, ist: null });
    expect(zeile(r, "fixkosten")?.plan).toBe(-90000);
    expect(r.ueberleitung).toBeUndefined();
  });

  it("stellt bei einem Jahreszahler die Monatstilgung gegen das Zwölftel", () => {
    const jaehrlich = regel({ id: "rj", vertragId: "vk", bezeichnung: "Brenneke", betrag: -1200000, rhythmus: "jaehrlich", startdatum: "2025-01-15" });
    const zahlung = gezahlt("2025-01-15", -1200000);
    const e = eingabe({ regeln: [jaehrlich], ist: [zahlung], vertragJeBuchung: new Map([[zahlung.id, "vk"]]), schulden: schulden() });
    const januar = erwarteAufgang(e, "2025-01");
    expect(zeile(januar, "fixkosten")?.ist).toBe(-90000);
    expect(zeile(januar, "tilgung")?.ist).toBe(-10000);
    // Bezahlt 12.000, davon gehören 11.000 späteren Monaten.
    expect(posten(januar, "periodisierung")).toBe(-1100000);
    const juli = erwarteAufgang(e, "2025-07");
    expect(zeile(juli, "fixkosten")?.ist).toBe(-90000);
    expect(zeile(juli, "tilgung")?.ist).toBe(-10000);
  });

  it("lässt eine stillgelegte Schuld nach ihrer letzten Restschuld nicht mehr tilgen", () => {
    const e = mitRate([gezahlt("2026-02-15")], { heute: "2026-02-28", schulden: schulden({ aktiv: false }) });
    expect(zeile(rechne(e, "2026-02"), "tilgung")).toBeUndefined();
  });

  it("zählt die Tilgung zur Sparquote und die Zinsen zur Fixkostenquote", () => {
    const gehalt = ist("2025-06-01", 400000, { kategorieId: "gehalt" });
    const zahlung = gezahlt("2025-06-15");
    const e = mitRate([zahlung, gehalt], { schulden: schulden(), vertragJeBuchung: new Map([[zahlung.id, "vk"]]) });
    const k = ergebnisKennzahlen([rechne(e, "2025-06")]);
    expect(k.fixkostenquote).toBeCloseTo(90000 / 400000, 10);
    expect(k.sparquote).toBeCloseTo(10000 / 400000, 10);
    expect(monatsKosten(rechne(e, "2025-06"))).toBe(100000);
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
      ["ruecklage", "reise", -2000],
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

describe("Hochrechnung — womit der laufende Monat endet", () => {
  const miete = regel({ id: "rm", vertragId: "vm", bezeichnung: "Ohlert", betrag: -80000, rhythmus: "monatlich", startdatum: "2025-01-28", kategorieId: "absicherung" });
  const gehalt = regel({ id: "rg", vertragId: "vg", bezeichnung: "Varnhorn", betrag: 250000, rhythmus: "monatlich", startdatum: "2025-01-30", charakter: "Ertrag", kategorieId: "gehalt" });
  const alltag = budget({ rate: 40000 });
  const mitte = (over: Partial<ErgebnisEingabe>) => eingabe({ regeln: [miete, gehalt], budgets: [alltag], heute: "2025-06-15", ...over });

  it("rechnet offene Verträge mit ihrem Plan und das Budget als ausgegeben", () => {
    const r = rechne(mitte({ ist: [ist("2025-06-05", -10000, { kategorieId: "alltag" })] }), "2025-06");
    // Bisher: nur 100 Ausgabe. Erwartet: 2.500 Gehalt − 800 Miete − 400 Budget.
    expect(r.ergebnis.ist).toBe(-10000);
    expect(r.erwartet).toBe(250000 - 80000 - 40000);
  });

  it("nimmt das Gebuchte, wo es vom Plan abweicht", () => {
    const zahlung = ist("2025-06-02", -85000, { kategorieId: "absicherung" });
    const r = rechne(mitte({ ist: [zahlung], vertragJeBuchung: new Map([[zahlung.id, "vm"]]) }), "2025-06");
    expect(r.erwartet).toBe(250000 - 85000 - 40000);
  });

  it("zählt ein überzogenes Budget mit dem, was ausgegeben wurde", () => {
    const r = rechne(mitte({ ist: [ist("2025-06-05", -55000, { kategorieId: "alltag" })] }), "2025-06");
    expect(r.erwartet).toBe(250000 - 80000 - 55000);
  });

  it("schätzt nichts Ungeplantes dazu, zählt das Gebuchte aber mit", () => {
    const r = rechne(mitte({ ist: [ist("2025-06-05", -7000, { kategorieId: "sonstiges" })] }), "2025-06");
    expect(r.erwartet).toBe(250000 - 80000 - 40000 - 7000);
  });

  it("steht nur am laufenden Monat", () => {
    expect(rechne(mitte({}), "2025-05").erwartet).toBeUndefined();
    expect(rechne(mitte({}), "2025-07").erwartet).toBeUndefined();
  });
});
