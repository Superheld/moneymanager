// Die Probe der Umstellung auf „eine Rücklage" (ADR-0006, Pakete 3 und 4).
//
// Die Zusage der Umstellung ist eine einzige: **kein vergangener Monat trägt danach eine
// andere Zahl.** Eine Zusage dieser Art lässt sich nicht an Beispielen belegen, die man
// nach dem Umbau aufschreibt — die sagen nur, was der neue Code tut. Deshalb steht die
// Erwartung in `umstellungsprobe.erwartet.json`, und die ist VOR der Umstellung entstanden:
// mit dem Code von `fdfd44c`, auf denselben Beständen, die hier gerechnet werden. Diese
// Datei rechnet sie nach der Umstellung noch einmal und vergleicht jede Zahl.
//
// Was festgehalten ist, je Bestand:
//
//   • die Ergebnisrechnung JEDES Monats eines langen Fensters — jede Zeile, jeder Posten
//     (Plan, Ist, Entnahme, Status), die drei Stufen, die Hochrechnung und die
//     Überleitung;
//   • die Einordnung jedes Anteils jeder Buchung;
//   • Kontobelegung und Deckung an mehreren Stichtagen, dazu der Stand jedes Budgets;
//   • der Monatsausblick.
//
// Die Bestände: der Spielstand (vier Rücklagen und ein aufbauendes Budget an derselben
// Kategorie — der härteste Fall, den die App von selbst erzeugt) und zwei eigens gebaute.
//
// **Seit Paket 4 (Migration 81) kennt der Code kein aufbauendes Budget mehr.** Ein Bestand
// von davor lässt sich deshalb nur so rechnen, wie Migration 81 ihn hinterlässt: das
// aufbauende Budget als Rücklage, die weiterläuft, mit derselben Id. Gerechnet wird je
// Bestand:
//
//   • wie er vor Migration 80 dastand, überführt wie von Migration 81;
//   • wie Migration 80 und danach 81 ihn hinterlassen (die freie Rate in der Reihe,
//     `findet_ab` am Tag der Umstellung);
//   • beim Spielstand zusätzlich mit der ECHTEN Migrations-SQL von 80 und 81 und so, wie
//     ihn der Spielstand heute schreibt.
//
// Alle Läufe müssen dieselben Zahlen tragen — der Tag der Umstellung liegt nach allen
// Buchungen.
//
// **Angepasst ist nur der LESEWEG, nie die Erwartung.** Die Erwartung hält die Form von
// davor fest: Posten eines aufbauenden Budgets mit `budgetId` und ohne Bezeichnung,
// Ansprüche mit der Art `budget`, in der Deckung die Rücklagen über die Kategorie als
// eigene Liste. `inAlterForm` bringt das Ergebnis des neuen Codes in genau diese Form,
// und zwar nur für die Rücklagen, die frühere aufbauende Budgets sind; gerechnet wird
// dabei nichts, was der neue Code nicht selbst rechnet.
//
// Die Erwartung neu schreiben hiesse, die Zusage aufzugeben. Erzeugt wurde sie auf dem
// alten Stand (`PROBE_SCHREIBEN=1` in der Fassung von `fdfd44c`); diese Fassung kann sie
// nicht mehr schreiben.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import {
  budgetStand,
  ergebnisbasis,
  kontobelegung,
  monatsAusblicke,
  monatsErgebnis,
  realerKontostand,
  ruecklagenAnsprueche,
  ruecklagenart,
  ruecklagenDeckung,
  ruecklagenstand,
  type Budget,
  type Zustaendigkeitssicht,
  type Einordnung,
  type ErgebnisPosten,
  type IstBuchung,
  type Kategorie,
  type MonatsErgebnis,
  type Ruecklage,
  type Ruecklagenzyklus,
  type Zahlungskonto,
  type Zahlungsregel,
} from "./core";
import { anspruchsbestand, belegungssicht } from "./application/kontobelegung";
import { MIGRATIONS } from "./adapters/persistence/migrations";
import { seedEinspielen } from "./testwerkzeug/seedDaten";
import { pluginApi } from "./testwerkzeug/harness";
import { sqliteLedgerRepository } from "./adapters/persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { sqliteBudgetRepository } from "./adapters/persistence/sqliteBudgetRepository";
import { sqliteRuecklagenRepository } from "./adapters/persistence/sqliteRuecklagenRepository";
import { sqliteZahlungsregelRepository } from "./adapters/persistence/sqliteZahlungsregelRepository";
import { sqliteVertragszuordnungRepository } from "./adapters/persistence/sqliteVertragZuordnungRepositories";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./adapters/persistence/db", () => ({ getDb: async () => halter.lesen() }));

const ERWARTUNG = new URL("./umstellungsprobe.erwartet.json", import.meta.url);

/** Ein Bestand, wie die Rechnung ihn liest — seit Migration 81. */
interface Bestand {
  readonly regeln: readonly Zahlungsregel[];
  /** Die monatlichen Budgets. */
  readonly budgets: readonly Budget[];
  /** Die laufenden Rücklagen (`RuecklagenRepository.alle()`), beide Sorten. */
  readonly ruecklagen: readonly Ruecklage[];
  /** Die beendeten (`RuecklagenRepository.beendete()`). */
  readonly beendete: readonly Ruecklage[];
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  readonly konten: readonly Zahlungskonto[];
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  readonly heute: string;
  /**
   * In welcher Reihenfolge die Budgets VOR Migration 81 standen, aufbauende eingeschlossen
   * — die Liste der Budgetstände in der Erwartung folgt ihr. Fehlt sie, erst die
   * monatlichen, dann die fortlaufenden Rücklagen (so liest ein Bestand aus der Datenbank
   * sie, weil das aufbauende Budget zuletzt angelegt war).
   */
  readonly budgetreihenfolge?: readonly string[];
}

/** Ein Budget, wie es VOR Migration 81 aussah — mit der zweiten Art. */
type AltBudget = Omit<Budget, "art"> & { readonly art: "monatlich" | "aufbauend" };

/** Ein Bestand von VOR Migration 81. */
type AltBestand = Omit<Bestand, "budgets" | "budgetreihenfolge"> & { readonly budgets: readonly AltBudget[] };

interface Fenster {
  readonly monate: readonly string[];
  readonly stichtage: readonly string[];
}

function monateAb(von: string, anzahl: number): string[] {
  const [j, m] = von.split("-").map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const n = j * 12 + (m - 1) + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

/**
 * Ein Bestand von vor Migration 81 so, wie Migration 81 ihn überführt — dieselben Regeln
 * wie ihre SQL: Rücklage mit der Id des Budgets, `fortlaufend`, `findet_ab` leer,
 * Bezeichnung = Name der Kategorie, Beginn = Start (sonst der erste Betragsmonat), Konto
 * nur, wenn es das Konto gibt, die Betragsreihe als Ratenreihe.
 */
function ueberfuehrt81(alt: AltBestand): Bestand {
  const kategorie = new Map(alt.kategorien.map((k) => [k.id, k]));
  const konten = new Set(alt.konten.map((k) => k.id));
  const fruehere = alt.budgets
    .filter((b) => b.art === "aufbauend")
    .map((b): Ruecklage => ({
      id: b.id,
      bezeichnung: kategorie.get(b.kategorieId)?.name ?? "Rücklage",
      beginn: b.start ?? `${b.betraege[0].abMonat}-01`,
      kategorieId: kategorie.has(b.kategorieId) ? b.kategorieId : undefined,
      kontoId: konten.has(b.kontoId) ? b.kontoId : undefined,
      art: "fortlaufend",
      raten: b.betraege,
    }));
  return {
    ...alt,
    budgets: alt.budgets.filter((b) => b.art === "monatlich").map((b) => ({ ...b, art: "monatlich" as const })),
    ruecklagen: [...fruehere, ...alt.ruecklagen],
    budgetreihenfolge: alt.budgets.map((b) => b.id),
  };
}

/** Die Ids der Rücklagen, die frühere aufbauende Budgets sind: die fortlaufenden. */
function fruehereBudgets(b: Bestand): Set<string> {
  return new Set(b.ruecklagen.filter((r) => ruecklagenart(r) === "fortlaufend").map((r) => r.id));
}

/** Die Einordnung eines Anteils, in einer Form, die vor und nach der Umstellung dasselbe sagt. */
function einordnungKurz(x: Einordnung): string {
  const art = x.art as string;
  const traeger =
    art === "laufend"
      ? `laufend:${x.budgetId}`
      : art === "ruecklage"
        ? `ruecklage:${x.ruecklageId ?? "ausgebucht"}`
        : art;
  return `${x.buchung.id}#${x.anteil}=${traeger}`;
}

/**
 * Ein Posten der Ergebnisrechnung in der Form von vor Migration 81: der eines früheren
 * aufbauenden Budgets trug dessen Id als Schlüssel und als `budgetId`, keine Bezeichnung
 * (die Oberfläche löste die Kategorie auf) und keine `ruecklageId`.
 */
function postenInAlterForm(p: ErgebnisPosten, fruehere: ReadonlySet<string>): ErgebnisPosten {
  if (!p.ruecklageId || !fruehere.has(p.ruecklageId) || !p.schluessel.startsWith("ruecklage:")) return p;
  const { ruecklageId, ...rest } = p;
  return { ...rest, schluessel: ruecklageId, bezeichnung: "", budgetId: ruecklageId };
}

function ergebnisInAlterForm(m: MonatsErgebnis, fruehere: ReadonlySet<string>): MonatsErgebnis {
  return { ...m, zeilen: m.zeilen.map((z) => ({ ...z, posten: z.posten.map((p) => postenInAlterForm(p, fruehere)) })) };
}

/** Alles, was die Probe festhält — Buchungsobjekte als ihre ID, sonst roh. */
function rechnen(b: Bestand, f: Fenster): unknown {
  const fruehere = fruehereBudgets(b);
  const eingabe = {
    regeln: b.regeln,
    budgets: b.budgets,
    ruecklagen: b.ruecklagen,
    beendete: b.beendete,
    ausbuchungen: b.ausbuchungen,
    ruecklagenzuordnungen: [],
    ist: b.ist,
    kategorien: b.kategorien,
    konten: b.konten,
    vertragJeBuchung: b.vertragJeBuchung,
    heute: b.heute,
  };
  const basis = ergebnisbasis(eingabe);
  const sicht: Zustaendigkeitssicht = {
    buchungen: b.ist,
    kategorien: b.kategorien,
    budgets: b.budgets,
    vertragsBuchungen: new Set(b.vertragJeBuchung.keys()),
    ruecklagen: [...b.ruecklagen, ...b.beendete],
    ruecklagenzuordnungen: [],
    ausbuchungen: b.ausbuchungen,
  };
  const bestand = anspruchsbestand(sicht);
  const staende = new Map(b.konten.map((k) => [k.id, realerKontostand(k, [...b.ist])]));
  const jeId = new Map(b.ruecklagen.map((r) => [r.id, r]));
  const budgetJeId = new Map(b.budgets.map((x) => [x.id, x]));
  const reihenfolge = b.budgetreihenfolge ?? [...b.budgets.map((x) => x.id), ...fruehere];

  const roh = {
    ergebnis: f.monate.map((m) => ergebnisInAlterForm(monatsErgebnis(basis, `${m}-01`), fruehere)),
    einordnung: basis.einordnungen.map(einordnungKurz),
    belegung: f.stichtage.map((am) => ({
      am,
      jeKonto: [...belegungssicht({ konten: b.konten, buchungen: [...b.ist], ruecklagen: b.ruecklagen, sicht }, am).jeKonto.values()].map(
        (k) => ({ ...k, posten: k.posten.map((p) => ({ art: fruehere.has(p.id) ? "budget" : "ruecklage", ...p })) }),
      ),
    })),
    deckung: f.stichtage.map((am) => {
      const d = ruecklagenDeckung(b.ruecklagen, am, staende, bestand);
      // Die Rücklagen über die Kategorie standen als eigene Liste da: ihre Posten der
      // Kontobelegung, in deren Reihenfolge. Dieselbe Belegung, nur ausgewählt.
      const ueberKategorie = [...kontobelegung(staende, ruecklagenAnsprueche(b.ruecklagen, am, bestand)).values()].flatMap((k) =>
        k.posten.filter((p) => fruehere.has(p.id)).map((p) => ({ art: "budget", ...p })),
      );
      return {
        am,
        ...d,
        posten: d.posten
          .filter((p) => !fruehere.has(p.ruecklage.id))
          .map((p) => ({ id: p.ruecklage.id, soll: p.soll, tatsaechlich: p.tatsaechlich })),
        ueberKategorie,
      };
    }),
    // Der Stand eines früheren aufbauenden Budgets ist der Stand seiner Rücklage: Raten
    // bis zum Monat (der laufende zählt mit), Entnahmen bis Monatsende — `budgetStand`
    // für das aufbauende Budget rechnete genau das (Teil C des Entwurfs).
    budgetstaende: f.stichtage.flatMap((am) =>
      reihenfolge.map((id) => {
        const budget = budgetJeId.get(id);
        if (budget) return { am, id, ...budgetStand(sicht, budget, am) };
        const r = jeId.get(id) as Ruecklage;
        const s = ruecklagenstand(r, b.ausbuchungen, bestand.entnahmen?.get(id) ?? [], am);
        return { am, id, rahmen: s.raten, verbraucht: s.entnahmen, rest: s.stand };
      }),
    ),
    ausblick: monatsAusblicke(
      {
        regeln: b.regeln,
        budgets: b.budgets,
        ruecklagen: b.ruecklagen,
        ist: b.ist,
        kategorien: b.kategorien,
        vertragsBuchungen: sicht.vertragsBuchungen,
        heute: b.heute,
      },
      4,
    ),
  };
  return JSON.parse(
    JSON.stringify(roh, (schluessel, wert) => (schluessel === "buchung" && wert && typeof wert === "object" ? wert.id : wert)),
  );
}

// ------------------------------------------------------------------ Bestand A
//
// Mehrere Rücklagen und ein aufbauendes Budget an derselben Kategorie, verschachtelte
// Budgets (ein aufbauendes Dach über einem monatlichen, ein monatliches über einem
// aufbauenden), eine Erstattung, eine geteilte Buchung, eine Buchung vor dem Start des
// aufbauenden Budgets, Vertrag, Umbuchung und eine von Hand aus den Budgets genommene
// Ausgabe ohne Ausbuchung.

function konten(): Zahlungskonto[] {
  return [
    { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 },
    { id: "tagesgeld", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 300000 },
    { id: "sparen", bezeichnung: "Sparen", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 120000 },
  ];
}

/** Ein kleiner, fester Würfel — derselbe Bestand bei jedem Lauf. */
function wuerfel(saat: number): () => number {
  let s = saat >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function bestandA(): AltBestand {
  const kategorien: Kategorie[] = [
    { id: "k-wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
    { id: "k-geraete", name: "Geraete", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
    { id: "k-garten", name: "Garten", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
    { id: "k-alltag", name: "Alltag", defaultCharakter: "Aufwand" },
    { id: "k-markt", name: "Markt", elternId: "k-alltag", defaultCharakter: "Aufwand" },
    { id: "k-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
    { id: "k-umbuchen", name: "Umbuchen", defaultCharakter: "Umschichtung" },
  ];
  const budgets: AltBudget[] = [
    { id: "b-wohnen", kategorieId: "k-wohnen", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 20000 }, { abMonat: "2025-03", betrag: 25000 }] },
    { id: "b-geraete", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "aufbauend", start: "2024-02-15", betraege: [{ abMonat: "2024-02", betrag: 8000 }, { abMonat: "2025-01", betrag: 10000 }] },
    { id: "b-alltag", kategorieId: "k-alltag", kontoId: "giro", art: "aufbauend", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 5000 }] },
    { id: "b-markt", kategorieId: "k-markt", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 30000 }] },
  ];
  const ruecklagen: Ruecklage[] = [
    { id: "r-ziel", bezeichnung: "Lindqvist", ziel: 120000, fristMonate: 24, beginn: "2024-03-10", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-frei", bezeichnung: "Moorbeck", rate: 4000, beginn: "2024-05-01", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-garten", bezeichnung: "Hasselrot", rate: 2500, beginn: "2024-01-20", kategorieId: "k-garten", kontoId: "sparen", art: "abschliessend" },
    { id: "r-ohne", bezeichnung: "Querfurt", ziel: 50000, fristMonate: 10, beginn: "2025-01-05", art: "abschliessend" },
  ];
  const zufall = wuerfel(161120);
  const ist: IstBuchung[] = [];
  let n = 0;
  const buchen = (datum: string, betrag: number, kategorieId: string | undefined, mehr: Partial<IstBuchung> = {}) => {
    ist.push({ id: `a${++n}`, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", ...mehr });
  };
  const vertragJeBuchung = new Map<string, string>();
  // Vor dem Start des aufbauenden Budgets an seiner Kategorie: eine Entnahme, die nichts
  // kostet (der bekannte Befund, nachgebildet).
  buchen("2024-01-20", -6400, "k-geraete");
  for (const m of monateAb("2024-01", 26)) {
    const tag = (t: number) => `${m}-${String(t).padStart(2, "0")}`;
    buchen(tag(1), 310000, "k-lohn", { charakter: "Ertrag" });
    buchen(tag(3), -95000, "k-wohnen");
    vertragJeBuchung.set(`a${n}`, "v-miete");
    buchen(tag(5), -Math.round(5000 + zufall() * 20000), "k-wohnen");
    buchen(tag(8), -Math.round(10000 + zufall() * 25000), "k-markt");
    buchen(tag(12), -Math.round(1000 + zufall() * 8000), "k-alltag");
    if (zufall() < 0.45) buchen(tag(14), -Math.round(2000 + zufall() * 30000), "k-geraete");
    if (zufall() < 0.35) buchen(tag(17), -Math.round(1000 + zufall() * 6000), "k-garten");
    // Die Umbuchung aufs Tagesgeld, zwei Beine.
    ist.push({ id: `u${m}a`, datum: tag(20), betrag: -15000, kontoId: "giro", kategorieId: "k-umbuchen", charakter: "Umschichtung", quelle: "manuell", transferId: `t${m}`, gegenkontoId: "tagesgeld" });
    ist.push({ id: `u${m}b`, datum: tag(20), betrag: 15000, kontoId: "tagesgeld", kategorieId: "k-umbuchen", charakter: "Umschichtung", quelle: "manuell", transferId: `t${m}`, gegenkontoId: "giro" });
  }
  // Ein grosser Kauf, der das aufbauende Budget überzieht, und eine Erstattung darauf.
  buchen("2024-09-09", -95000, "k-geraete");
  buchen("2024-10-02", 12000, "k-geraete");
  buchen("2025-04-11", 3500, "k-garten");
  // Eine geteilte Buchung über zwei Budgets.
  buchen("2025-06-21", -35000, undefined, { aufteilungen: [{ kategorieId: "k-geraete", betrag: -30000 }, { kategorieId: "k-markt", betrag: -5000 }] });
  // Von Hand aus den Budgets genommen, ohne dass eine Rücklage ausgebucht wurde: ungeplant.
  buchen("2025-08-13", -42000, "k-wohnen", { budgetrelevant: false });
  buchen("2025-11-28", -18000, "k-geraete", { kontoId: "tagesgeld" });

  const regeln: Zahlungsregel[] = [
    { id: "rg-lohn", bezeichnung: "Lohn", betrag: 310000, rhythmus: "monatlich", startdatum: "2024-01-01", charakter: "Ertrag", kontoId: "giro", vertragId: "v-lohn" } as Zahlungsregel,
    { id: "rg-miete", bezeichnung: "Miete", betrag: -95000, rhythmus: "monatlich", startdatum: "2024-01-03", charakter: "Aufwand", kontoId: "giro", vertragId: "v-miete" } as Zahlungsregel,
  ];
  return {
    regeln,
    budgets,
    ruecklagen,
    beendete: [],
    ausbuchungen: [],
    ist,
    kategorien,
    konten: konten(),
    vertragJeBuchung,
    heute: "2026-02-20",
  };
}

const FENSTER_A: Fenster = {
  monate: monateAb("2023-11", 31),
  stichtage: ["2024-01-01", "2024-03-09", "2024-09-30", "2024-12-31", "2025-06-15", "2026-02-20"],
};

// ------------------------------------------------------------------ Bestand B
//
// Abgeschlossene Zyklen: Kauf vor, im und nach dem Abschlussmonat, mit und ohne
// Geschichte, ein Zyklus ohne Kauf, eine beendete Rücklage, ein Kauf in zwei Ausbuchungen
// (der bekannte Befund: zweimal ungedeckt), ein verknüpfter Kauf, der wieder
// budgetrelevant ist, und ein aufbauendes Budget daneben.

function bestandB(): AltBestand {
  const kategorien: Kategorie[] = [
    { id: "k-technik", name: "Technik", defaultCharakter: "Aufwand" },
    { id: "k-reise", name: "Reise", defaultCharakter: "Aufwand" },
    { id: "k-sonst", name: "Sonst", defaultCharakter: "Aufwand" },
    { id: "k-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
  ];
  const budgets: AltBudget[] = [
    { id: "b-reise", kategorieId: "k-reise", kontoId: "tagesgeld", art: "aufbauend", start: "2024-03-01", betraege: [{ abMonat: "2024-03", betrag: 6000 }] },
    { id: "b-sonst", kategorieId: "k-sonst", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 15000 }] },
  ];
  const ruecklagen: Ruecklage[] = [
    { id: "r-tv", bezeichnung: "Wendhorst", ziel: 90000, fristMonate: 18, beginn: "2025-06-12", kategorieId: "k-technik", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-rad", bezeichnung: "Ilsabek", ziel: 40000, fristMonate: 10, beginn: "2025-09-03", kategorieId: "k-technik", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-doppel", bezeichnung: "Kronsfeld", ziel: 30000, fristMonate: 6, beginn: "2025-04-01", kontoId: "giro", art: "abschliessend" },
    { id: "r-rel", bezeichnung: "Ostendal", rate: 2000, beginn: "2025-03-01", kategorieId: "k-technik", art: "abschliessend" },
    { id: "r-laeuft", bezeichnung: "Brakholm", rate: 3000, beginn: "2024-02-01", kategorieId: "k-sonst", kontoId: "tagesgeld", art: "abschliessend" },
  ];
  const beendete: Ruecklage[] = [
    { id: "r-reise", bezeichnung: "Sandvoss", rate: 5000, beginn: "2024-08-01", beendetAm: "2025-10-20", kategorieId: "k-reise", kontoId: "tagesgeld", art: "abschliessend" },
  ];
  const zyklus = (id: string, r: Ruecklage, datum: string, mehr: Partial<Ruecklagenzyklus>): Ruecklagenzyklus => ({
    id, ruecklageId: r.id, bezeichnung: r.bezeichnung, kategorieId: r.kategorieId, datum, ...mehr,
  });
  const [tv, rad, doppel, rel] = ruecklagen;
  const ausbuchungen: Ruecklagenzyklus[] = [
    // Ein Zyklus mit Geschichte, ohne Kauf.
    zyklus("a-tv0", tv, "2024-01-05", { zyklusBeginn: "2023-03-01", zyklusZiel: 60000, zyklusFrist: 12 }),
    // Kauf VOR dem Abschlussmonat, überzogen.
    zyklus("a-tv1", tv, "2025-06-12", { zyklusBeginn: "2024-01-05", zyklusZiel: 60000, zyklusFrist: 12, istbuchungId: "kauf-tv1" }),
    // Ohne Geschichte (von vor Migration 76), mit Kauf: gilt als gedeckt.
    zyklus("a-rad0", rad, "2024-06-01", { istbuchungId: "kauf-rad0" }),
    // Kauf IM Abschlussmonat.
    zyklus("a-rad1", rad, "2025-09-03", { zyklusBeginn: "2024-06-01", zyklusZiel: 30000, zyklusFrist: 10, istbuchungId: "kauf-rad1" }),
    // Ein Kauf in zwei Ausbuchungen.
    zyklus("a-d1", doppel, "2025-02-10", { zyklusBeginn: "2024-09-01", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: "kauf-d" }),
    zyklus("a-d2", doppel, "2025-04-01", { zyklusBeginn: "2025-02-10", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: "kauf-d" }),
    // Der Kauf ist wieder budgetrelevant: er bleibt bei der Kategorie.
    zyklus("a-rel", rel, "2025-03-01", { zyklusBeginn: "2024-07-01", zyklusRate: 2000, istbuchungId: "kauf-rel" }),
    // Beendet, Kauf NACH dem Abschluss.
    zyklus("a-reise", beendete[0], "2025-10-20", { zyklusBeginn: "2024-08-01", zyklusRate: 5000, istbuchungId: "kauf-reise" }),
  ];
  const zufall = wuerfel(77013);
  const ist: IstBuchung[] = [];
  let n = 0;
  const buchen = (datum: string, betrag: number, kategorieId: string | undefined, mehr: Partial<IstBuchung> = {}) => {
    ist.push({ id: `b${++n}`, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", ...mehr });
  };
  for (const m of monateAb("2023-06", 31)) {
    const tag = (t: number) => `${m}-${String(t).padStart(2, "0")}`;
    buchen(tag(1), 280000, "k-lohn", { charakter: "Ertrag" });
    buchen(tag(6), -Math.round(4000 + zufall() * 15000), "k-sonst");
    if (zufall() < 0.4) buchen(tag(11), -Math.round(3000 + zufall() * 20000), "k-technik");
    if (zufall() < 0.4) buchen(tag(16), -Math.round(3000 + zufall() * 12000), "k-reise");
  }
  const kauf = (id: string, datum: string, betrag: number, kategorieId: string, budgetrelevant = false) =>
    ist.push({ id, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", budgetrelevant });
  kauf("kauf-tv1", "2025-05-28", -80000, "k-technik");
  kauf("kauf-rad0", "2024-05-30", -20000, "k-technik");
  kauf("kauf-rad1", "2025-09-03", -45000, "k-technik");
  kauf("kauf-d", "2025-03-15", -26000, "k-technik");
  kauf("kauf-rel", "2025-02-20", -9000, "k-technik", true);
  kauf("kauf-reise", "2025-11-02", -70000, "k-reise");
  return {
    regeln: [],
    budgets,
    ruecklagen,
    beendete,
    ausbuchungen,
    ist,
    kategorien,
    konten: konten(),
    vertragJeBuchung: new Map(),
    heute: "2026-01-15",
  };
}

const FENSTER_B: Fenster = {
  monate: monateAb("2023-01", 40),
  stichtage: ["2024-01-04", "2024-06-01", "2025-02-28", "2025-06-12", "2025-10-21", "2026-01-15"],
};
// ------------------------------------------------------------------ Bestand C: der Spielstand

const STICHTAG = new Date(2026, 5, 15);
const HEUTE_SEED = "2026-06-15";
const FENSTER_C: Fenster = {
  monate: monateAb("2024-10", 24),
  stichtage: ["2024-12-31", "2025-06-30", "2026-01-31", "2026-06-15"],
};

/**
 * Die Rücklagen, die der Spielstand seit Paket 4 ZUSÄTZLICH trägt — eine allein an ihrer
 * Kategorie, eine zweite an `kat-anschaffungen` (`seedDaten.ts`). Die Erwartung stammt
 * vom Spielstand davor; mit ihnen wäre es ein anderer Bestand, nicht derselbe nach einer
 * Migration. Sie werden deshalb herausgenommen, bevor gerechnet wird.
 */
const NEU_IM_SPIELSTAND = ["rue-5", "rue-6"];

/**
 * Die Fälle des Rücklagen-Umbaus, die der Spielstand seit Paket 5 trägt
 * (`ruecklagenFaelle` in `seedDaten.ts`): Rücklagen, ihre Buchungen, Abschlüsse und
 * Ausbuchungen, ein Budget, ein Konto und die Zuordnungen. Aus demselben Grund wie oben
 * nicht Teil des Bestands, an dem die Erwartung entstand — herausgenommen über ihre Ids,
 * die alle `fall` tragen. Die Zuordnungen gehen ganz: der Spielstand davor hatte keine.
 */
function neueFaelleEntfernen(db: Database): void {
  db.run("DELETE FROM ruecklage_zuordnung");
  db.run("DELETE FROM ruecklage_ausbuchung WHERE ruecklage_id LIKE 'rue-fall-%'");
  db.run("DELETE FROM ruecklage_rate WHERE ruecklage_id LIKE 'rue-fall-%'");
  db.run("DELETE FROM ruecklage WHERE id LIKE 'rue-fall-%'");
  db.run("DELETE FROM budget_betrag WHERE budget_id LIKE 'budget-fall-%'");
  db.run("DELETE FROM budget WHERE id LIKE 'budget-fall-%'");
  db.run("DELETE FROM ist_buchung WHERE id LIKE 'buchung-fall-%'");
  db.run("DELETE FROM kontostand_anker WHERE konto_id LIKE 'konto-fall-%'");
  db.run("DELETE FROM zahlungskonto WHERE id LIKE 'konto-fall-%'");
}

/** Die Rücklage, die im Spielstand das frühere aufbauende Budget ist. */
const FRUEHERES_BUDGET = "budget-anschaffung";

let SQL: SqlJsStatic;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

/**
 * Migrationen NACH dem Umbau, die nur Spalten anlegen, die der Spielstand beschreibt —
 * sie laufen in `alterSpielstand` mit, damit der Spielstand von heute sich auch in ein
 * älteres Schema einspielen lässt. Was sie anlegen, liest keine Rechnung, die hier
 * verglichen wird; eine Migration, die Daten umbaut, gehört NICHT hierher.
 *
 *   • 82 — Kauf und Nutzungsdauer an der Rücklage, nur für die Anzeige des Wertverlusts.
 *   • 83 — Vorsorgeziel und Verrechnungskonto am Depot. Ihr UPDATE trifft hier nichts: sie
 *     läuft vor dem Einspielen, es gibt noch kein Depot. Die Probe rechnet über kein Depot.
 */
const NUR_SCHEMA_DANACH = new Set([82, 83]);

function migrationen(db: Database, filter: (version: number) => boolean): void {
  for (const m of MIGRATIONS.filter((x) => filter(x.version))) for (const sql of m.sql) db.run(sql);
}

/**
 * Der Spielstand, wie er VOR Paket 4 aussah, in einer Datenbank, die bis einschliesslich
 * `bis` migriert ist: die Rücklagen, die seither dazukamen, sind weg, und das frühere
 * aufbauende Budget steht wieder als Budget in `budget` und `budget_betrag` — mit dem
 * Start, der Kategorie, dem Konto und der Reihe, die der Spielstand heute der Rücklage
 * gibt. Daraus macht Migration 81 genau die Rücklage, die der Spielstand heute schreibt.
 *
 * Dazu das Schema ab Migration 83 (Verrechnungskonto und Vorsorgeziel am Depot): der
 * Spielstand von heute schreibt in diese Spalten, und ohne sie liesse er sich nicht
 * einspielen. Die Probe rechnet über kein Depot; was 83 anlegt, berührt ihre Zahlen nicht.
 */
function alterSpielstand(bis: number): Database {
  const db = new SQL.Database();
  migrationen(db, (v) => v <= bis || NUR_SCHEMA_DANACH.has(v));
  seedEinspielen(db, STICHTAG);
  neueFaelleEntfernen(db);
  db.run(
    `INSERT INTO budget (id, kategorie_id, konto_id, art, start)
       SELECT id, kategorie_id, konto_id, 'aufbauend', beginn FROM ruecklage WHERE id = ?`,
    [FRUEHERES_BUDGET],
  );
  db.run(
    "INSERT INTO budget_betrag (budget_id, ab_monat, betrag) SELECT ruecklage_id, ab_monat, betrag FROM ruecklage_rate WHERE ruecklage_id = ?",
    [FRUEHERES_BUDGET],
  );
  for (const id of [FRUEHERES_BUDGET, ...NEU_IM_SPIELSTAND]) {
    db.run("DELETE FROM ruecklage_rate WHERE ruecklage_id = ?", [id]);
    db.run("DELETE FROM ruecklage WHERE id = ?", [id]);
  }
  return db;
}

async function bestandAus(db: Database): Promise<Bestand> {
  // Auch hier und nicht nur in `alterSpielstand`: der Spielstand, „wie er heute
  // geschrieben wird", kommt ohne den Umweg dorthin.
  neueFaelleEntfernen(db);
  halter.setzen(pluginApi(db));
  const [regeln, budgets, ruecklagen, beendete, ausbuchungen, ist, kategorien, kontenListe, zuordnungen] = await Promise.all([
    sqliteZahlungsregelRepository.alle(),
    sqliteBudgetRepository.alle(),
    sqliteRuecklagenRepository.alle(),
    sqliteRuecklagenRepository.beendete(),
    sqliteRuecklagenRepository.ausbuchungen(),
    sqliteLedgerRepository.alle(),
    sqliteKategorieRepository.alle(),
    sqliteZahlungskontoRepository.alle(),
    sqliteVertragszuordnungRepository.alle(),
  ]);
  const vertragJeBuchung = new Map<string, string>();
  for (const z of zuordnungen) if (z.vertragId) vertragJeBuchung.set(z.istbuchungId, z.vertragId);
  const neu = new Set(NEU_IM_SPIELSTAND);
  return {
    regeln,
    budgets,
    ruecklagen: ruecklagen.filter((r) => !neu.has(r.id)),
    beendete,
    ausbuchungen,
    ist,
    kategorien,
    konten: kontenListe,
    vertragJeBuchung,
    heute: HEUTE_SEED,
  };
}

// ------------------------------------------------------------------ der Vergleich

/**
 * Ein Bestand so, wie Migration 80 ihn hinterlässt: die freie Rate in der Reihe, `rate`
 * leer, und eine laufende Rücklage von Hand mit Kategorie findet ab dem Tag der Umstellung.
 */
function migriert80(b: AltBestand, umstellung: string): AltBestand {
  const umstellen = (r: Ruecklage, beendet: boolean): Ruecklage => {
    const mitZiel = (r.ziel ?? 0) > 0 && (r.fristMonate ?? 0) > 0;
    const frei = !mitZiel && (r.rate ?? 0) > 0;
    return {
      ...r,
      rate: frei ? undefined : r.rate,
      raten: frei ? [{ abMonat: r.beginn.slice(0, 7), betrag: r.rate as number }] : r.raten,
      findetAb: !beendet && r.kategorieId && (r.art ?? "abschliessend") === "abschliessend" && !r.findetAb ? umstellung : r.findetAb,
    };
  };
  return { ...b, ruecklagen: b.ruecklagen.map((r) => umstellen(r, false)), beendete: b.beendete.map((r) => umstellen(r, true)) };
}

type Erwartung = Record<string, unknown>;
const erwartung: Erwartung = JSON.parse(readFileSync(ERWARTUNG, "utf8"));

describe("Probe der Umstellung: vergangene Monate tragen dieselben Zahlen", () => {
  const faelle: [string, () => AltBestand, Fenster, string][] = [
    ["A", bestandA, FENSTER_A, "2026-02-20"],
    ["B", bestandB, FENSTER_B, "2026-01-15"],
  ];
  for (const [name, bauen, fenster, umstellung] of faelle) {
    it(`Bestand ${name}, wie er vor Migration 80 dastand — überführt wie von Migration 81`, () => {
      expect(rechnen(ueberfuehrt81(bauen()), fenster)).toEqual(erwartung[name]);
    });
    it(`Bestand ${name}, wie Migration 80 und 81 ihn hinterlassen`, () => {
      expect(rechnen(ueberfuehrt81(migriert80(bauen(), umstellung)), fenster)).toEqual(erwartung[name]);
    });
  }

  it("Spielstand von vor Migration 80, mit Migration 81 überführt", async () => {
    const db = alterSpielstand(79);
    migrationen(db, (v) => v === 81);
    expect(rechnen(await bestandAus(db), FENSTER_C)).toEqual(erwartung.C);
  });

  it("Spielstand nach Migration 80 und 81", async () => {
    const db = alterSpielstand(79);
    migrationen(db, (v) => v === 80 || v === 81);
    const b = await bestandAus(db);
    // Der Tag der Umstellung ist der echte heutige; er liegt nach jeder Buchung des
    // Spielstands. Ein Fundfenster bekommen nur die abschliessenden; das frühere Budget
    // findet „ohne Anfang".
    const abschliessend = b.ruecklagen.filter((r) => ruecklagenart(r) === "abschliessend");
    expect(abschliessend.every((r) => !!r.findetAb && r.findetAb > HEUTE_SEED)).toBe(true);
    expect(b.ruecklagen.find((r) => r.id === FRUEHERES_BUDGET)).toMatchObject({ art: "fortlaufend", findetAb: undefined });
    expect(b.budgets.map((x) => x.id)).not.toContain(FRUEHERES_BUDGET);
    expect(rechnen(b, FENSTER_C)).toEqual(erwartung.C);
  });

  it("Spielstand, wie er heute geschrieben wird", async () => {
    const db = new SQL.Database();
    migrationen(db, () => true);
    seedEinspielen(db, STICHTAG);
    expect(rechnen(await bestandAus(db), FENSTER_C)).toEqual(erwartung.C);
  });
});
