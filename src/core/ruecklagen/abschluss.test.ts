// Abschliessen statt Ausbuchen (ADR-0006, Paket 5): was es mit der Ergebnisrechnung, der
// Überleitung, dem Konto und dem Verlauf tut — und vor allem, was es NICHT tut.
//
// Die Zusage des Nutzers ist: was beim Abschliessen übrig ist, wird frei, und zwar nur auf
// dem Konto; ein Minus hat seinen Monat schon gekostet. Geprüft wird deshalb jede Zeile der
// Ergebnisrechnung Monat für Monat, einmal mit und einmal ohne Abschluss, und in jedem
// Monat die Überleitung zum Konto.
//
// Die eine Ausnahme folgt aus der bestehenden Zyklusregel (`zyklen` in `topf.ts`): die
// Rate des ABSCHLUSSMONATS gehört dem neuen Zyklus. Beginnt die Rücklage neu, kostet der
// Monat deshalb dieselbe Rate wie ohne Abschluss; wird sie beendet, gibt es keinen neuen
// Zyklus, und die Rate dieses Monats entfällt — so wie jede Rate danach. Das ist kein Rest,
// der einen Monat verbessert, sondern das Ende des Zurücklegens: eine abschliessende
// Rücklage zählt die Rate eines Monats ohnehin erst im Folgemonat zu ihrem Stand.
//
// Alle Beträge erfunden, die Namen gelten je Testfall.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../buchung/istbuchung";
import { kontobelegung } from "../konten/kontobelegung";
import { ergebnisbasis, monatsErgebnis, type ErgebnisEingabe, type MonatsErgebnis } from "../ergebnis";
import type { Kategorie } from "../kategorien/kategorie";
import { ruecklagenAnsprueche, type Ruecklage, type Ruecklagenzyklus } from "./ruecklage";
import { abschliessen, abschlussstaende, ruecklagenFortschreibung, type Ruecklagenentnahme } from "./topf";

const KATEGORIEN: Kategorie[] = [
  { id: "k-fahrt", name: "Fahrt", defaultCharakter: "Aufwand" },
  { id: "k-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
];

/** Frei 100,00 im Monat ab Januar, findet ab ihrem Beginn über `k-fahrt`, liegt auf `giro`. */
const QUARVELO: Ruecklage = {
  id: "r-quarvelo", bezeichnung: "Quarvelo", beginn: "2026-01-01", findetAb: "2026-01-01", kategorieId: "k-fahrt",
  art: "abschliessend", kontoId: "giro", raten: [{ abMonat: "2026-01", betrag: 10000 }],
};

let n = 0;
function buchung(datum: string, betrag: number, kategorieId: string): IstBuchung {
  return { id: `ab${++n}`, datum, betrag, kontoId: "giro", charakter: betrag > 0 ? "Ertrag" : "Aufwand", quelle: "manuell", kategorieId };
}

function eingabe(ist: IstBuchung[], ruecklagen: Ruecklage[], beendete: Ruecklage[], ausbuchungen: Ruecklagenzyklus[]): ErgebnisEingabe {
  return {
    regeln: [], budgets: [], ruecklagen, beendete, ausbuchungen, ruecklagenzuordnungen: [], ist,
    kategorien: KATEGORIEN, konten: [], vertragJeBuchung: new Map(), heute: "2031-01-01",
  };
}

/** Was die Rücklage über ihre Kategorie trägt — hier hängt nur sie dort, also jede Ausgabe. */
const entnahmenAus = (ist: IstBuchung[]): Ruecklagenentnahme[] =>
  ist.filter((b) => b.kategorieId === "k-fahrt").map((b) => ({ datum: b.datum, betrag: b.betrag }));

/** Die Ergebnisrechnung in beiden Zuständen: ohne Abschluss und nach `abschliessen`. */
function beideZustaende(ist: IstBuchung[], am: string, folge: "neu" | "ende") {
  const a = abschliessen(QUARVELO, [], entnahmenAus(ist), am, folge);
  const abschluss: Ruecklagenzyklus = { ...a.abschluss, id: "a-1", kategorieId: "k-fahrt" };
  const ohne = eingabe(ist, [QUARVELO], [], []);
  const mit = folge === "neu" ? eingabe(ist, [a.ruecklage], [], [abschluss]) : eingabe(ist, [], [a.ruecklage], [abschluss]);
  return { a, abschluss, ohne, mit };
}

const monat = (e: ErgebnisEingabe, m: string): MonatsErgebnis => monatsErgebnis(ergebnisbasis(e), `${m}-01`);
/** Jede Zeile mit Plan und Ist — ohne die Posten, deren Zyklus-Aufteilung sich ändern darf. */
const zeilen = (m: MonatsErgebnis) => m.zeilen.map((z) => ({ id: z.id, plan: z.plan, ist: z.ist }));
const ruecklagenIst = (m: MonatsErgebnis) => m.zeilen.find((z) => z.id === "abschreibungen")?.ist ?? 0;

/** Die Überleitung geht auf: sie endet exakt bei der Summe der Ist-Buchungen des Monats. */
function gehtAuf(e: ErgebnisEingabe, m: string): void {
  const imMonat = e.ist.filter((b) => b.datum.startsWith(m)).reduce((s, b) => s + b.betrag, 0);
  expect(monat(e, m).ueberleitung?.kontoaenderung, m).toBe(imMonat);
}

const MONATE = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

describe("Abschluss mit Rest", () => {
  // Raten Januar bis Mai 500,00, getragen 450,00 → am 15.06. sind 50,00 übrig.
  const ist = [
    buchung("2026-03-10", -25000, "k-fahrt"),
    buchung("2026-04-01", 200000, "k-lohn"),
    buchung("2026-05-12", -20000, "k-fahrt"),
  ];

  it("rechnet den Rest richtig: angespart bis zum Vormonat, frei wird der Überschuss", () => {
    const { a } = beideZustaende(ist, "2026-06-15", "neu");
    expect(a).toMatchObject({ raten: 50000, entnahmen: 45000, frei: 5000, ungedeckt: 0 });
  });

  it("neu beginnen ändert keinen Monat — jede Zeile ist gleich, und die Überleitung geht auf", () => {
    const { ohne, mit } = beideZustaende(ist, "2026-06-15", "neu");
    for (const m of MONATE) {
      // Auch der Abschlussmonat: seine Rate gehört dem neuen Zyklus, und der kostet sie
      // genauso wie der alte ohne Abschluss. Der Rest von 50,00 taucht nirgends auf.
      expect(zeilen(monat(mit, m)), m).toEqual(zeilen(monat(ohne, m)));
      gehtAuf(mit, m);
      gehtAuf(ohne, m);
    }
  });

  it("beenden ändert keinen Monat davor; im Abschlussmonat entfällt nur die Rate, die einem neuen Zyklus gehört hätte", () => {
    const { ohne, mit } = beideZustaende(ist, "2026-06-15", "ende");
    for (const m of MONATE.filter((x) => x < "2026-06")) expect(zeilen(monat(mit, m)), m).toEqual(zeilen(monat(ohne, m)));
    // Juni: ohne Abschluss die Rate von 100,00, beendet keine — und keine Auflösung des Rests.
    expect(ruecklagenIst(monat(ohne, "2026-06"))).toBe(-10000);
    expect(ruecklagenIst(monat(mit, "2026-06"))).toBe(0);
    // Alle anderen Zeilen bleiben, was sie waren.
    const ohneRuecklagen = (m: MonatsErgebnis) => zeilen(m).filter((z) => z.id !== "abschreibungen");
    expect(ohneRuecklagen(monat(mit, "2026-06"))).toEqual(ohneRuecklagen(monat(ohne, "2026-06")));
    for (const m of MONATE) gehtAuf(mit, m);
  });

  it("gibt den Rest auf dem Konto frei: der Anspruch fällt auf den neuen Zyklus bzw. auf null", () => {
    const entnahmen = new Map([["r-quarvelo", entnahmenAus(ist)]]);
    const { a, abschluss } = beideZustaende(ist, "2026-06-15", "neu");
    const vorher = ruecklagenAnsprueche([QUARVELO], "2026-06-20", { entnahmen });
    const nachher = ruecklagenAnsprueche([a.ruecklage], "2026-06-20", { entnahmen, abschluesse: [abschluss] });
    expect(vorher[0].betrag).toBe(5000);
    // Der neue Zyklus hat im Abschlussmonat noch nichts angespart (Raten ab dem Folgemonat).
    expect(nachher[0].betrag).toBe(0);
    // Im Juli trägt er seine erste Rate — genau um den Rest weniger als ohne Abschluss.
    const juli = ruecklagenAnsprueche([a.ruecklage], "2026-07-20", { entnahmen, abschluesse: [abschluss] });
    expect(juli[0].betrag).toBe(10000);
    expect(ruecklagenAnsprueche([QUARVELO], "2026-07-20", { entnahmen })[0].betrag).toBe(15000);

    // Dieselbe Zahl in der EINEN Rechnung für gebunden und frei.
    const staende = new Map([["giro", 100000]]);
    expect(kontobelegung(staende, vorher).get("giro")).toMatchObject({ gebunden: 5000, frei: 95000 });
    expect(kontobelegung(staende, nachher).get("giro")).toMatchObject({ gebunden: 0, frei: 100000 });
    // Beendet steht sie in keiner Liste laufender Rücklagen — sie beansprucht nichts mehr.
    expect(ruecklagenAnsprueche([], "2026-06-20", { entnahmen })).toEqual([]);
  });

  it("zeigt im Verlauf den Abschlussmonat mit beiden Zyklen, und der Monat geht auf", () => {
    const { a, abschluss } = beideZustaende(ist, "2026-06-15", "neu");
    const reihe = ruecklagenFortschreibung(a.ruecklage, [abschluss], entnahmenAus(ist), "2026-05", "2026-07");
    const [mai, juni, juli] = reihe;
    // Mai: die Rate eines Monats kommt bei einer abschliessenden erst im Folgemonat dazu —
    // Ende April standen Raten bis März 300,00 gegen 250,00, Ende Mai 400,00 gegen 450,00.
    expect(mai).toMatchObject({ uebertrag: 5000, zufuehrung: 10000, verbraucht: 20000, rest: -5000 });
    expect(mai.abgeschlossen).toBeUndefined();
    // Juni: der alte Zyklus bringt sein Minus und die Mai-Rate mit und steht am
    // Abschlusstag bei 50,00 — die werden frei; der neue beginnt bei null.
    expect(juni).toMatchObject({ uebertrag: -5000, zufuehrung: 10000, verbraucht: 0, abgeschlossen: 5000, rest: 0 });
    expect(juni.uebertrag + juni.zufuehrung - juni.verbraucht - (juni.abgeschlossen ?? 0)).toBe(juni.rest);
    // Juli: nur noch der neue Zyklus, mit seiner ersten Rate.
    expect(juli).toMatchObject({ uebertrag: 0, zufuehrung: 10000, verbraucht: 0, rest: 10000 });
    // Und was die Geschichte als frei geworden zeigt, ist derselbe Stand.
    expect(abschlussstaende(a.ruecklage, [abschluss], entnahmenAus(ist)).get("a-1")).toEqual({ raten: 50000, entnahmen: 45000, stand: 5000 });
  });
});

describe("Abschluss im Minus", () => {
  // Raten Januar bis Mai 500,00, getragen 850,00 bis zum 15.06. → 350,00 im Minus.
  const ist = [
    buchung("2026-03-10", -25000, "k-fahrt"),
    buchung("2026-04-01", 200000, "k-lohn"),
    buchung("2026-05-12", -20000, "k-fahrt"),
    buchung("2026-06-05", -40000, "k-fahrt"),
  ];

  it("beenden ändert keinen Monat: das Minus hat seinen Monat schon gekostet", () => {
    const { a, ohne, mit } = beideZustaende(ist, "2026-06-15", "ende");
    expect(a).toMatchObject({ frei: 0, ungedeckt: 35000 });
    // Bis August füllt ohne Abschluss die Rate nur das Loch, kostet also nichts — beendet
    // ebenso nichts. Erst wenn das Loch voll wäre (September), kostete die weiterlaufende
    // Rücklage wieder ihre Rate; die beendete legt nichts mehr zurück.
    //
    // Was im Abschlussmonat wegfällt, ist allein der PLAN der Zeile: die Rate, die einem
    // neuen Zyklus gehört hätte (Kopf der Datei). Gekostet hat der Monat dasselbe.
    // Ab dann fehlt der beendeten auch der Plan; eine leere Zeile steht gar nicht da.
    const ids = ["einnahmen", "fixkosten", "laufend", "ungeplant", "abschreibungen", "vorsorge", "tilgung"];
    const kosten = (m: MonatsErgebnis) => ids.map((id) => ({ id, ist: m.zeilen.find((z) => z.id === id)?.ist ?? 0 }));
    for (const m of MONATE.filter((x) => x <= "2026-08")) {
      expect(kosten(monat(mit, m)), m).toEqual(kosten(monat(ohne, m)));
      if (m < "2026-06") expect(zeilen(monat(mit, m)), m).toEqual(zeilen(monat(ohne, m)));
      gehtAuf(mit, m);
    }
  });

  it("neu beginnen ändert keinen Monat davor; im Abschlussmonat kostet der neue Zyklus seine Rate", () => {
    const { ohne, mit } = beideZustaende(ist, "2026-06-15", "neu");
    for (const m of MONATE.filter((x) => x < "2026-06")) expect(zeilen(monat(mit, m)), m).toEqual(zeilen(monat(ohne, m)));
    // Juni ohne Abschluss: das Ungedeckte, 350,00 (die Rate füllt nichts mehr auf). Mit
    // Abschluss dasselbe Ungedeckte im alten Zyklus — nicht mehr und nicht weniger — und
    // dazu die erste Rate des neuen, der für etwas Neues zurücklegt.
    expect(ruecklagenIst(monat(ohne, "2026-06"))).toBe(-35000);
    expect(ruecklagenIst(monat(mit, "2026-06"))).toBe(-45000);
    for (const m of MONATE) gehtAuf(mit, m);
  });

  it("zeigt im Verlauf das Minus, mit dem sie abgeschlossen wurde, und der Monat geht auf", () => {
    const { a, abschluss } = beideZustaende(ist, "2026-06-15", "ende");
    const [juni] = ruecklagenFortschreibung(a.ruecklage, [abschluss], entnahmenAus(ist), "2026-06", "2026-06");
    expect(juni).toMatchObject({ verbraucht: 40000, abgeschlossen: -35000, rest: 0 });
    expect(juni.uebertrag + juni.zufuehrung - juni.verbraucht - (juni.abgeschlossen ?? 0)).toBe(0);
  });
});
