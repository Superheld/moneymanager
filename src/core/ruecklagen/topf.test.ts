// Die Bausteine für „eine Rücklage" — an den Zahlenbeispielen des Entwurfs und, vor allem,
// gegen die Rechnung VON DAVOR: ihre Zusage ist, dass sie auf den Daten vor der Umstellung
// dasselbe ergeben wie das, was sie ersetzt haben. Geprüft Monat für Monat, nicht an einer
// Summe — eine Summe gleicht Verschiebungen zwischen Monaten aus, und genau die darf es
// nicht geben. Die alte Regel des aufbauenden Budgets steht dafür unten als festgehaltene
// Abschrift (`topfKostenVorher`); die Ergebnisrechnung rechnet seit Paket 3 selbst über
// diese Bausteine, und ein Vergleich mit ihr allein wäre einer mit sich selbst. Die Probe
// über ganze Bestände steht in `src/umstellungsprobe.test.ts`.
//
// Alle Beträge erfunden, die Namen gelten je Testfall.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Budget } from "../budgets/budget";
import { addMonate, parseIso, toIso } from "../basis/datum";
import { einordnen } from "../einordnung";
import { einordnungskontext, ergebnisbasis, monatsErgebnis, type ErgebnisEingabe } from "../ergebnis";
import type { Kategorie } from "../kategorien/kategorie";
import { sollRuecklage, type Ruecklage, type Ruecklagenzyklus } from "./ruecklage";
import {
  abschliessen,
  altabschlussKosten,
  rateIm,
  ratenBis,
  ruecklagenKostenIm,
  ruecklagenstand,
  zyklen,
  zyklusKosten,
  type Ruecklagenentnahme,
} from "./topf";
import { zustaendigkeit } from "../zustaendigkeit";

/** `anzahl` Monate (`YYYY-MM`) ab `von`. */
function monate(von: string, anzahl: number): string[] {
  const [j, m] = von.split("-").map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const n = j * 12 + (m - 1) + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

let laufend = 0;
function buchung(datum: string, betrag: number, over: Partial<IstBuchung> = {}): IstBuchung {
  return { id: `t${++laufend}`, datum, betrag, kontoId: "giro", charakter: "Aufwand", quelle: "manuell", ...over };
}

const entnahme = (datum: string, betrag: number): Ruecklagenentnahme => ({ datum, betrag });

/** Ein aufbauendes Budget so, wie Migration 81 es als Rücklage hinterlässt. */
function alsRuecklage(b: { id: string; kategorieId: string; start: string; betraege: readonly { abMonat: string; betrag: number }[] }): Ruecklage {
  return {
    id: b.id,
    bezeichnung: "",
    beginn: b.start,
    kategorieId: b.kategorieId,
    kontoId: "tg",
    art: "fortlaufend",
    raten: b.betraege,
  };
}

/** Die Eingabe der Ergebnisrechnung mit allem leer, was der Fall nicht braucht. */
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
    // Weit in der Zukunft: jeder geprüfte Monat ist vergangen und hat ein Ist.
    heute: "2031-01-01",
    ...teil,
  };
}

/** Das Ist aller Posten der Rücklagenzeile, die `passt`, positiv als Kosten. */
function heutigeKosten(e: ErgebnisEingabe, monat: string, passt: (p: { schluessel: string; ruecklageId?: string; budgetId?: string }) => boolean): number {
  const m = monatsErgebnis(ergebnisbasis(e), `${monat}-01`);
  const zeile = m.zeilen.find((z) => z.id === "abschreibungen");
  return -(zeile?.posten.filter(passt).reduce((s, p) => s + (p.ist ?? 0), 0) ?? 0) || 0;
}

describe("Zahlenbeispiele des Entwurfs", () => {
  const ziel1200: Ruecklage = { id: "r-ziel", bezeichnung: "Mahlberg", ziel: 120000, fristMonate: 12, beginn: "2026-01-01" };
  const urlaub = (art: Ruecklage["art"]): Ruecklage => ({ id: "r-frei", bezeichnung: "Sauerbier", rate: 10000, beginn: "2026-01-01", art });
  const urlaubsEntnahmen = [entnahme("2026-05-12", -25000), entnahme("2026-07-08", -40000)];

  it("teilt eine Rücklage am Abschluss in zwei Zyklen, und die Rate des Abschlussmonats gehört dem neuen", () => {
    const abschluss: Ruecklagenzyklus = {
      id: "a-mahlberg", ruecklageId: "r-ziel", datum: "2026-07-15",
      zyklusBeginn: "2026-01-01", zyklusZiel: 120000, zyklusFrist: 12,
    };
    const [erster, zweiter, ...mehr] = zyklen({ ...ziel1200, beginn: "2026-07-15" }, [abschluss]);
    expect(mehr).toEqual([]);
    expect(erster).toMatchObject({ beginn: "2026-01-01", ende: "2026-07-15", abschlussId: "a-mahlberg" });
    expect(zweiter.beginn).toBe("2026-07-15");
    expect(zweiter.ende).toBeUndefined();
    expect(ratenBis(erster, "2026-12")).toBe(60000); // Januar bis Juni
    expect(rateIm(erster, "2026-06")).toBe(10000);
    expect(rateIm(erster, "2026-07")).toBe(0);
    expect(rateIm(zweiter, "2026-07")).toBe(10000);
    // Der Kauf am Abschlusstag gehört dem alten Zyklus, nicht auch noch dem neuen.
    expect(zweiter.entnahmenAb).toBe("2026-07-16");
  });

  it("rechnet die Rate mit Ziel aus dem Ziel, gedeckelt", () => {
    const [z] = zyklen(ziel1200, []);
    expect(rateIm(z, "2026-03")).toBe(10000);
    expect(ratenBis(z, "2026-06")).toBe(60000);
    expect(ratenBis(z, "2027-06")).toBe(120000);
    expect(rateIm(z, "2027-01")).toBe(0);
    expect(rateIm(z, "2025-12")).toBe(0);
  });

  it("verteilt ein krummes Ziel ohne Rundungsrest", () => {
    const [z] = zyklen({ id: "r-krumm", bezeichnung: "Zehnder", ziel: 1000, fristMonate: 3, beginn: "2026-01-01" }, []);
    expect(monate("2026-01", 4).map((m) => rateIm(z, m))).toEqual([333, 334, 333, 0]);
  });

  it("nimmt bei einer freien Rücklage die Reihe, sobald es eine gibt", () => {
    const [z] = zyklen({
      id: "r-reihe", bezeichnung: "Oltmanns", rate: 10000, beginn: "2026-01-01",
      raten: [{ abMonat: "2026-01", betrag: 5000 }, { abMonat: "2026-04", betrag: 8000 }],
    }, []);
    expect(monate("2026-01", 5).map((m) => rateIm(z, m))).toEqual([5000, 5000, 5000, 8000, 8000]);
  });

  it("nennt den Stand am 20.07. je Sorte wie heute", () => {
    // Im Entwurf (Teil A) steht nur die erste Zeile: dort zählte der laufende Monat für
    // beide Sorten mit. Teil B rechnet jede Sorte wie heute, und Urlaub ist abschliessend.
    expect(ruecklagenstand(urlaub("fortlaufend"), [], urlaubsEntnahmen, "2026-07-20")).toEqual({
      raten: 70000, entnahmen: 65000, stand: 5000,
    });
    expect(ruecklagenstand(urlaub("abschliessend"), [], urlaubsEntnahmen, "2026-07-20")).toEqual({
      raten: 60000, entnahmen: 65000, stand: -5000,
    });
  });

  it("kostet je Monat nach der max-Regel", () => {
    const [z] = zyklen(urlaub("fortlaufend"), []);
    const mitAugust = [...urlaubsEntnahmen, entnahme("2026-08-10", -30000)];
    expect(zyklusKosten(z, mitAugust, "2026-07")).toBe(10000);
    expect(zyklusKosten(z, mitAugust, "2026-08")).toBe(25000); // Rate plus 150 ungedeckt
    expect(zyklusKosten(z, mitAugust, "2026-09")).toBe(0); // die Rate füllt nur das Loch
    expect(zyklusKosten(z, mitAugust, "2026-10")).toBe(5000);
    // Eine Erstattung im überzogenen Topf senkt die Kosten — auch unter null:
    // max(900, 750) − max(800, 950) = −50.
    expect(zyklusKosten(z, [...mitAugust, entnahme("2026-09-03", 20000)], "2026-09")).toBe(-5000);
  });

  it("schliesst mit Rest ab: der Rest wird frei, die Raten bleiben, was sie waren", () => {
    const r = urlaub("abschliessend");
    const a = abschliessen(r, [], [entnahme("2026-05-12", -25000), entnahme("2026-06-02", -20000)], "2026-07-20", "ende");
    expect(a).toMatchObject({ raten: 60000, entnahmen: 45000, rest: 15000, frei: 15000, ungedeckt: 0 });
    expect(a.ruecklage.beendetAm).toBe("2026-07-20");
    expect(a.abschluss).toMatchObject({ ruecklageId: "r-frei", datum: "2026-07-20", zyklusBeginn: "2026-01-01", zyklusRate: 10000 });
  });

  it("schliesst mit Minus ab: das Ungedeckte hat seinen Monat schon gekostet", () => {
    const r = urlaub("abschliessend");
    const weg = [...urlaubsEntnahmen, entnahme("2026-08-10", -30000)];
    const a = abschliessen(r, [], weg, "2026-08-20", "neu");
    expect(a).toMatchObject({ raten: 70000, entnahmen: 95000, rest: 0, frei: 0, ungedeckt: 25000 });
    expect(a.ruecklage.beginn).toBe("2026-08-20");
    expect(a.ruecklage.beendetAm).toBeUndefined();
  });

  it("hält beim Abschliessen keine Rate fest, wenn die Reihe sie trägt, und nimmt auf Wunsch ein neues Ziel", () => {
    const mitReihe: Ruecklage = { id: "r-x", bezeichnung: "Fennel", beginn: "2026-01-01", raten: [{ abMonat: "2026-01", betrag: 4000 }] };
    expect(abschliessen(mitReihe, [], [], "2026-05-02", "neu").abschluss.zyklusRate).toBeUndefined();
    const mitZiel = abschliessen(ziel1200, [], [], "2026-05-02", "neu", 150000);
    expect(mitZiel.ruecklage).toMatchObject({ beginn: "2026-05-02", ziel: 150000, fristMonate: 12 });
    expect(mitZiel.abschluss).toMatchObject({ zyklusZiel: 120000, zyklusFrist: 12 });
  });

  it("rechnet den alten Abschluss mit Kauf wie heute: Ungedecktes im Kaufmonat, gemessen am Abschlusstag", () => {
    const [z] = zyklen({ ...ziel1200, beginn: "2026-07-15" }, [
      { id: "a-k", ruecklageId: "r-ziel", datum: "2026-07-15", zyklusBeginn: "2026-01-01", zyklusZiel: 120000, zyklusFrist: 12, istbuchungId: "kauf" },
    ]);
    const kauf = entnahme("2026-09-03", -80000);
    expect(altabschlussKosten(z, kauf, "2026-06")).toBe(10000);
    expect(altabschlussKosten(z, kauf, "2026-07")).toBe(0);
    expect(altabschlussKosten(z, kauf, "2026-09")).toBe(20000); // 800 über den 600 Angesparten
    // Ohne Geschichte kostet der Zyklus nichts, und der Kauf gilt als gedeckt.
    const [unbekannt] = zyklen({ ...ziel1200, beginn: "2026-07-15" }, [{ id: "a-alt", ruecklageId: "r-ziel", datum: "2026-07-15", istbuchungId: "kauf" }]);
    expect(altabschlussKosten(unbekannt, kauf, "2026-09")).toBe(0);
  });
});

// ------------------------------------------------------------------ Äquivalenz (a)
//
// Seit Migration 81 gibt es das aufbauende Budget nicht mehr; es ist eine Rücklage, die
// weiterläuft. Ihre Kosten müssen trotzdem nach der Regel von davor aufgehen — gegen die
// Abschrift `topfKostenVorher`, die das aufbauende Budget aus seinen eigenen Feldern
// rechnet (Start, Betragsreihe), so wie es bis Paket 3 in `ergebnis.ts` stand.

describe("Äquivalenz: frühere aufbauende Budgets gegen das topfKosten von davor", () => {
  const kategorien: Kategorie[] = [
    { id: "reise", name: "Reise", defaultCharakter: "Aufwand" },
    { id: "flug", name: "Flug", elternId: "reise", defaultCharakter: "Aufwand" },
    { id: "werkstatt", name: "Werkstatt", defaultCharakter: "Aufwand" },
    { id: "markt", name: "Markt", defaultCharakter: "Aufwand" },
  ];
  /** So standen sie vor Migration 81 da. */
  const vorher: AltesBudget[] = [
    // Ein Dach mit eingebettetem monatlichem Budget und einer Betragsänderung.
    { id: "b-reise", kategorieId: "reise", start: "2025-03-01",
      betraege: [{ abMonat: "2025-03", betrag: 10000 }, { abMonat: "2025-09", betrag: 15000 }] },
    // Startet mitten im Monat und mit einer Betragsversion, die vor dem Start liegt.
    { id: "b-werkstatt", kategorieId: "werkstatt", start: "2025-05-17", betraege: [{ abMonat: "2025-02", betrag: 4000 }] },
  ];
  const budgets: Budget[] = [
    { id: "b-flug", kategorieId: "flug", kontoId: "giro", art: "monatlich", start: "2025-01-01", betraege: [{ abMonat: "2025-01", betrag: 5000 }] },
  ];
  const ruecklagen = vorher.map(alsRuecklage);
  const ist: IstBuchung[] = [
    buchung("2025-02-20", -9000, { kategorieId: "reise" }), // vor dem Start: Entnahme, kostet nichts
    buchung("2025-05-03", -25000, { kategorieId: "reise" }),
    buchung("2025-06-11", -70000, { kategorieId: "reise" }), // überzieht
    buchung("2025-07-01", 12000, { kategorieId: "reise" }), // Erstattung im Minus
    buchung("2025-07-15", -8000, { kategorieId: "flug" }), // gehört dem Unterbudget
    buchung("2025-11-30", -30000, { kategorieId: "reise" }),
    buchung("2025-05-17", -3000, { kategorieId: "werkstatt" }), // am Starttag
    buchung("2025-05-16", -1000, { kategorieId: "werkstatt" }), // einen Tag davor
    buchung("2025-08-09", -20000, { kategorieId: "werkstatt" }),
    buchung("2025-08-10", -5000, { kategorieId: "werkstatt", budgetrelevant: false }), // aus den Budgets genommen
    buchung("2025-09-01", -4000, { kategorieId: "markt" }),
  ];
  const kontext = einordnungskontext({ kategorien, budgets, konten: [], vertragJeBuchung: new Map(), ausbuchungen: [], ruecklagen, ruecklagenzuordnungen: [] });
  const einordnungen = einordnen(ist, kontext);
  const entnahmenVon = (id: string): Ruecklagenentnahme[] =>
    einordnungen.filter((x) => x.art === "ruecklage" && x.ruecklageId === id).map((x) => ({ datum: x.buchung.datum, betrag: x.betrag }));

  for (const b of vorher) {
    it(`kostet für ${b.id} jeden Monat dasselbe`, () => {
      const r = alsRuecklage(b);
      const [z] = zyklen(r, []);
      for (const m of monate("2025-01", 18)) {
        const heute = topfKostenVorher(b, entnahmenVon(b.id), m);
        expect(zyklusKosten(z, entnahmenVon(b.id), m), m).toBe(heute);
        expect(ruecklagenKostenIm(r, [], entnahmenVon(b.id), m).kosten, m).toBe(heute);
        // Und über die Ergebnisrechnung selbst, Posten für Posten.
        expect(heutigeKosten(eingabe({ budgets, ruecklagen, ist, kategorien }), m, (p) => p.ruecklageId === b.id), m).toBe(heute);
      }
    });
  }

  it("ordnet wie vorher: das Unterbudget trägt seine Kategorie, nicht budgetrelevant ist ungeplant", () => {
    const art = (id: string) => einordnungen.filter((x) => x.buchung.id === id).map((x) => x.art === "ruecklage" ? `ruecklage:${x.ruecklageId}` : x.art === "laufend" ? `laufend:${x.budgetId}` : x.art);
    expect(art(ist[0].id)).toEqual(["ruecklage:b-reise"]);
    expect(art(ist[4].id)).toEqual(["laufend:b-flug"]);
    expect(art(ist[9].id)).toEqual(["ungeplant"]);
    expect(art(ist[10].id)).toEqual(["ungeplant"]);
  });
});

/** Ein aufbauendes Budget, wie es vor Migration 81 aussah — nur, was seine Regel braucht. */
interface AltesBudget {
  readonly id: string;
  readonly kategorieId: string;
  readonly start: string;
  readonly betraege: readonly { abMonat: string; betrag: number }[];
}

/**
 * Die Regel des aufbauenden Budgets, wie sie bis Paket 3 in `ergebnis.ts` stand — als
 * Abschrift festgehalten, damit die Äquivalenz oben gegen die Rechnung VON DAVOR prüft.
 * Der Rahmen wie damals `budgetRahmen`: aufsummiert ab dem späteren von Start und erster
 * Betragsversion. Nicht ändern: sie ist der Massstab, nicht die Rechnung.
 */
function topfKostenVorher(budget: AltesBudget, entnahmen: readonly Ruecklagenentnahme[], monat: string): number {
  const naechster = (m: string) => toIso(addMonate(parseIso(`${m}-01`), 1)).slice(0, 7);
  const betragIm = (m: string) => {
    let treffer = 0;
    for (const v of budget.betraege) {
      if (v.abMonat > m) break;
      treffer = v.betrag;
    }
    return treffer;
  };
  const erster = budget.start.slice(0, 7) > budget.betraege[0].abMonat ? budget.start.slice(0, 7) : budget.betraege[0].abMonat;
  const rahmen = (bis: string) => {
    let s = 0;
    for (let m = erster; m <= bis; m = naechster(m)) s += betragIm(m);
    return s;
  };
  const monatsende = `${naechster(monat)}-01`;
  const monatsanfang = `${monat}-01`;
  const vormonat = toIso(addMonate(parseIso(monatsanfang), -1)).slice(0, 7);
  const ausgabenBis = (bis: string) =>
    -entnahmen.filter((x) => x.datum >= budget.start && x.datum < bis).reduce((s, x) => s + x.betrag, 0);
  const kostenBis = (m: string, bis: string) => Math.max(rahmen(m), ausgabenBis(bis));
  return kostenBis(monat, monatsende) - kostenBis(vormonat, monatsanfang);
}

describe("eine Rücklage, die weiterläuft, mit Beginn im ersten Betragsmonat", () => {
  it("kostet ab dort die Rate und das Ungedeckte", () => {
    // So überführt Migration 81 ein aufbauendes Budget ohne `start` (nur in einer von
    // Hand geänderten Datei). Vor der Umstellung kosteten seine Ausgaben nie etwas
    // (`datum >= undefined`); jetzt zählen sie ab dem ersten Betragsmonat — die eine
    // benannte Abweichung (Teil B des Entwurfs, Abschnitt 5).
    const r: Ruecklage = { id: "r-ohne", bezeichnung: "Tellwick", beginn: "2025-03-01", kategorieId: "k-o", art: "fortlaufend", raten: [{ abMonat: "2025-03", betrag: 5000 }] };
    const entnahmen = [{ datum: "2025-04-10", betrag: -20000 }];
    expect(ruecklagenKostenIm(r, [], entnahmen, "2025-03").kosten).toBe(5000);
    expect(ruecklagenKostenIm(r, [], entnahmen, "2025-04").kosten).toBe(15000);
  });
});

// ------------------------------------------------------------------ Äquivalenz (b)

describe("Äquivalenz: laufender Zyklus gegen den heutigen Rücklagenposten", () => {
  const ruecklagen: Ruecklage[] = [
    { id: "r-ziel", bezeichnung: "Westerholt", ziel: 100000, fristMonate: 7, beginn: "2025-02-19" },
    { id: "r-frei", bezeichnung: "Kniephof", rate: 4500, beginn: "2025-04-01" },
    { id: "r-spaet", bezeichnung: "Ubbelohde", ziel: 50000, fristMonate: 24, beginn: "2025-11-30" },
  ];

  for (const r of ruecklagen) {
    it(`kostet für ${r.id} jeden Monat dasselbe, Rate wie Kosten`, () => {
      const e = eingabe({ ruecklagen });
      for (const m of monate("2025-01", 20)) {
        const heute = heutigeKosten(e, m, (p) => p.ruecklageId === r.id);
        const neu = ruecklagenKostenIm(r, [], [], m);
        expect(neu.kosten, m).toBe(heute);
        expect(neu.rate, m).toBe(heute);
      }
    });

    it(`steht für ${r.id} an jedem Tag wie heute das Soll`, () => {
      for (const m of monate("2025-01", 20)) {
        for (const tag of ["01", "19", "30"]) {
          const am = m.endsWith("-02") && tag === "30" ? `${m}-28` : `${m}-${tag}`;
          expect(ruecklagenstand(r, [], [], am).stand, am).toBe(sollRuecklage(r, am));
        }
      }
    });
  }
});

// ------------------------------------------------------------------ Äquivalenz (c)

describe("Äquivalenz: abgeschlossener Zyklus mit Kauf gegen das heutige zyklusPosten", () => {
  // Abschluss jeweils am 14.06.2025 nach einem Zyklus ab 01.01.; der Kauf liegt vor, im
  // und nach dem Abschlussmonat. Die Rücklage mit Ziel beginnt danach neu, die freie endet.
  const faelle: { name: string; kaufDatum: string; geschichte: boolean; mitZiel: boolean }[] = [];
  for (const kaufDatum of ["2025-04-22", "2025-06-03", "2025-06-14", "2025-06-30", "2025-08-05"]) {
    for (const geschichte of [true, false]) {
      for (const mitZiel of [true, false]) faelle.push({ name: `${kaufDatum}, ${geschichte ? "mit" : "ohne"} Geschichte, ${mitZiel ? "mit Ziel" : "frei"}`, kaufDatum, geschichte, mitZiel });
    }
  }

  for (const f of faelle) {
    it(`kostet jeden Monat dasselbe: Kauf am ${f.name}`, () => {
      const kauf = buchung(f.kaufDatum, -90000, { kategorieId: "geraet", budgetrelevant: false });
      const r: Ruecklage = f.mitZiel
        ? { id: "r-c", bezeichnung: "Hollwedel", ziel: 120000, fristMonate: 20, beginn: "2025-06-14" }
        : { id: "r-c", bezeichnung: "Hollwedel", rate: 8000, beginn: "2025-01-01", beendetAm: "2025-06-14" };
      const a: Ruecklagenzyklus = {
        id: "a-c", ruecklageId: "r-c", datum: "2025-06-14", istbuchungId: kauf.id, bezeichnung: "Hollwedel",
        ...(f.geschichte
          ? f.mitZiel
            ? { zyklusBeginn: "2025-01-01", zyklusZiel: 120000, zyklusFrist: 20 }
            : { zyklusBeginn: "2025-01-01", zyklusRate: 8000 }
          : {}),
      };
      // Die laufende Rechnung bekommt nur die laufenden Rücklagen (`alle()`), wie in der App.
      const e = eingabe({ ruecklagen: r.beendetAm ? [] : [r], ausbuchungen: [a], ist: [kauf] });
      const [alt] = zyklen(r, [a]);
      const altkauf = { datum: kauf.datum, betrag: kauf.betrag };
      let ungedeckt = 0;
      for (const m of monate("2024-12", 12)) {
        const heute = heutigeKosten(e, m, (p) => p.schluessel === "zyklus:a-c");
        expect(altabschlussKosten(alt, altkauf, m), m).toBe(heute);
        expect(ruecklagenKostenIm(r, [a], [], m, new Map([[kauf.id, altkauf]])).kosten, m).toBe(
          heutigeKosten(e, m, (p) => p.ruecklageId === "r-c"),
        );
        if (m === kauf.datum.slice(0, 7)) ungedeckt = heute - rateIm(alt, m);
      }
      // Damit die Gleichheit nicht an zwei Nullen hängt: mit Geschichte ist der Kauf
      // grösser als das Angesparte, ohne gilt er als gedeckt.
      expect(ungedeckt > 0).toBe(f.geschichte);
    });
  }

  it("zählt einen Kauf, den zwei Ausbuchungen nennen, wie heute in beiden", () => {
    // Ein bekannter Befund, bewusst nachgebildet: heute gilt die Regel je Ausbuchung.
    const kauf = buchung("2025-06-10", -50000, { budgetrelevant: false });
    const r1: Ruecklage = { id: "r-1", bezeichnung: "Ahlwardt", ziel: 24000, fristMonate: 12, beginn: "2025-06-12" };
    const r2: Ruecklage = { id: "r-2", bezeichnung: "Brinkhege", ziel: 12000, fristMonate: 12, beginn: "2025-06-12" };
    const ab = (id: string, rId: string, ziel: number): Ruecklagenzyklus => ({
      id, ruecklageId: rId, datum: "2025-06-12", istbuchungId: kauf.id, zyklusBeginn: "2025-01-01", zyklusZiel: ziel, zyklusFrist: 12,
    });
    const abschluesse = [ab("a-1", "r-1", 24000), ab("a-2", "r-2", 12000)];
    const e = eingabe({ ruecklagen: [r1, r2], ausbuchungen: abschluesse, ist: [kauf] });
    const altkaeufe = new Map([[kauf.id, { datum: kauf.datum, betrag: kauf.betrag }]]);
    for (const r of [r1, r2]) {
      expect(ruecklagenKostenIm(r, abschluesse, [], "2025-06", altkaeufe).kosten).toBe(
        heutigeKosten(e, "2025-06", (p) => p.ruecklageId === r.id),
      );
    }
  });

  it("führt in der Zuständigkeit eine alte Verknüpfung als ausgebucht und eine nur von Hand markierte als ungeplant", () => {
    const traeger = zustaendigkeit([], [], [], [], [{ id: "a-z", ruecklageId: "r-z", datum: "2025-06-14", istbuchungId: "b-verknuepft" }]);
    expect(traeger({ istbuchungId: "b-verknuepft", datum: "2025-06-10", budgetrelevant: false })).toEqual({ art: "ausgebucht", ruecklageIds: ["r-z"] });
    expect(traeger({ istbuchungId: "b-hand", datum: "2025-06-10", budgetrelevant: false })).toEqual({ art: "ungeplant" });
  });
});
